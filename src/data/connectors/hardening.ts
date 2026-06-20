import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  ConnectorHealth,
  ConnectorResult,
  ConnectorStatus,
  DataConnector,
  DataSourceKind
} from "./types";

export type HardenedConnectorOptions<TData> = {
  name: string;
  kind: DataSourceKind;
  mode: "manual" | "export" | "live" | "stub";
  requiredForProduction?: boolean;
  timeoutMs?: number;
  retries?: number;
  fallbackData: TData;
  disabledMessage?: string;
  isEnabled: () => boolean;
  read: () => Promise<TData>;
  smokeTest?: () => Promise<void>;
};

const secretPatterns = [
  /sk-[a-zA-Z0-9_-]+/g,
  /sk_live_[a-zA-Z0-9_]+/g,
  /sk_test_[a-zA-Z0-9_]+/g,
  /xoxb-[a-zA-Z0-9-]+/g,
  /xapp-[a-zA-Z0-9-]+/g,
  /ph[a-zA-Z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /(api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*["']?[^"',\s}]+/gi
];

export function nowIso(): string {
  return new Date().toISOString();
}

export function redactSecrets(value: unknown): string {
  let text = value instanceof Error ? value.message : String(value);

  for (const pattern of secretPatterns) {
    text = text.replace(pattern, (match) => {
      const label = match.includes(":") || match.includes("=")
        ? match.split(/[:=]/)[0]
        : "secret";
      return `${label}=[redacted]`;
    });
  }

  return text;
}

export function hasUsableValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && !normalized.includes("your-") && normalized !== "changeme";
}

export function readJsonFile<TData>(path: string): TData {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as TData;
}

export function fileExists(path: string | undefined): boolean {
  return Boolean(path && existsSync(resolve(path)));
}

async function withTimeout<T>(
  promiseFactory: () => Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promiseFactory(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function retry<T>(
  operation: () => Promise<T>,
  input: { retries: number; timeoutMs: number; operationName: string }
): Promise<{ value: T; attempts: number; durationMs: number }> {
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= input.retries + 1; attempt += 1) {
    try {
      const value = await withTimeout(operation, input.timeoutMs, input.operationName);
      return {
        value,
        attempts: attempt,
        durationMs: Date.now() - startedAt
      };
    } catch (error) {
      lastError = error;

      if (attempt <= input.retries) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(250 * attempt, 1000)));
      }
    }
  }

  throw lastError;
}

function health(input: {
  name: string;
  status: ConnectorStatus;
  mode: ConnectorHealth["mode"];
  startedAt: number;
  attempts?: number;
  message?: string;
  fallbackUsed?: boolean;
}): ConnectorHealth {
  return {
    name: input.name,
    status: input.status,
    checkedAt: nowIso(),
    mode: input.mode,
    attempts: input.attempts,
    durationMs: Date.now() - input.startedAt,
    message: input.message ? redactSecrets(input.message) : undefined,
    fallbackUsed: input.fallbackUsed
  };
}

export function createHardenedConnector<TData>(
  options: HardenedConnectorOptions<TData>
): DataConnector<TData> {
  const timeoutMs = Number(process.env.IQ_CONNECTOR_TIMEOUT_MS ?? options.timeoutMs ?? 5000);
  const retries = Number(process.env.IQ_CONNECTOR_RETRIES ?? options.retries ?? 1);

  async function runHealth(): Promise<ConnectorHealth> {
    const startedAt = Date.now();

    if (!options.isEnabled()) {
      return health({
        name: options.name,
        status: "disabled",
        mode: options.mode,
        startedAt,
        message: options.disabledMessage ?? `${options.name} is not configured.`
      });
    }

    try {
      const result = await retry(
        async () => {
          if (options.smokeTest) {
            await options.smokeTest();
            return true;
          }

          await options.read();
          return true;
        },
        { retries, timeoutMs, operationName: `${options.name} health` }
      );

      return health({
        name: options.name,
        status: "ok",
        mode: options.mode,
        startedAt,
        attempts: result.attempts,
        message: `${options.name} healthy.`
      });
    } catch (error) {
      return health({
        name: options.name,
        status: "error",
        mode: options.mode,
        startedAt,
        attempts: retries + 1,
        message: redactSecrets(error),
        fallbackUsed: true
      });
    }
  }

  return {
    name: options.name,
    kind: options.kind,
    requiredForProduction: options.requiredForProduction,
    async health() {
      return runHealth();
    },
    async smokeTest() {
      return runHealth();
    },
    async fetch(): Promise<ConnectorResult<TData>> {
      const startedAt = Date.now();

      if (!options.isEnabled()) {
        const disabled = health({
          name: options.name,
          status: "disabled",
          mode: options.mode,
          startedAt,
          fallbackUsed: true,
          message: options.disabledMessage ?? `${options.name} is not configured.`
        });

        return {
          source: options.name,
          kind: options.kind,
          fetchedAt: nowIso(),
          data: options.fallbackData,
          health: disabled,
          fallbackUsed: true
        };
      }

      try {
        const result = await retry(options.read, {
          retries,
          timeoutMs,
          operationName: `${options.name} fetch`
        });

        return {
          source: options.name,
          kind: options.kind,
          fetchedAt: nowIso(),
          data: result.value,
          health: health({
            name: options.name,
            status: "ok",
            mode: options.mode,
            startedAt,
            attempts: result.attempts,
            message: `${options.name} fetched.`
          }),
          fallbackUsed: false
        };
      } catch (error) {
        return {
          source: options.name,
          kind: options.kind,
          fetchedAt: nowIso(),
          data: options.fallbackData,
          health: health({
            name: options.name,
            status: "degraded",
            mode: options.mode,
            startedAt,
            attempts: retries + 1,
            fallbackUsed: true,
            message: redactSecrets(error)
          }),
          fallbackUsed: true
        };
      }
    }
  };
}
