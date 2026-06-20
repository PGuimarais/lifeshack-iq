import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional()
);

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  IQ_APP_NAME: z.string().default("LifeShack IQ"),
  IQ_RUNTIME_MODE: z.literal("local").default("local"),
  IQ_TIMEZONE: z.string().default("America/Los_Angeles"),
  IQ_AGENT_MODE: z.enum(["fake", "openai", "real"]).default("fake"),
  IQ_OPENAI_MODEL: z.string().default("gpt-5.5"),
  IQ_OPENAI_REASONING_EFFORT: z.string().default("low"),
  IQ_OPENAI_VERBOSITY: z.string().default("low"),
  DATABASE_PATH: z.string().default("./data/iq.sqlite"),
  SLACK_BOT_TOKEN: optionalString,
  SLACK_APP_TOKEN: optionalString,
  SLACK_SIGNING_SECRET: optionalString,
  OPENAI_API_KEY: optionalString,
  S3_BACKUP_BUCKET: optionalString,
  AWS_PROFILE: optionalString,
  POSTHOG_API_KEY: optionalString,
  STRIPE_SECRET_KEY: optionalString
});

export type AppConfig = {
  nodeEnv: string;
  appName: string;
  runtimeMode: "local";
  timezone: string;
  databasePath: string;
  agent: {
    mode: "fake" | "openai" | "real";
    model: string;
    reasoningEffort: string;
    verbosity: string;
  };
  slack: {
    botToken?: string;
    appToken?: string;
    signingSecret?: string;
    configured: boolean;
  };
  integrations: {
    openAiConfigured: boolean;
    s3BackupsConfigured: boolean;
    awsProfileConfigured: boolean;
    posthogConfigured: boolean;
    stripeConfigured: boolean;
  };
};

function hasUsableSecret(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return !normalized.includes("your-") && normalized !== "changeme";
}

export function loadConfig(): AppConfig {
  dotenv.config({ quiet: true });

  const parsed = envSchema.parse(process.env);
  const isTest = parsed.NODE_ENV === "test";
  const slackConfigured = Boolean(
    !isTest &&
      hasUsableSecret(parsed.SLACK_BOT_TOKEN) &&
      hasUsableSecret(parsed.SLACK_APP_TOKEN) &&
      hasUsableSecret(parsed.SLACK_SIGNING_SECRET)
  );

  return {
    nodeEnv: parsed.NODE_ENV,
    appName: parsed.IQ_APP_NAME,
    runtimeMode: parsed.IQ_RUNTIME_MODE,
    timezone: parsed.IQ_TIMEZONE,
    databasePath: parsed.DATABASE_PATH,
    agent: {
      mode: parsed.IQ_AGENT_MODE,
      model: parsed.IQ_OPENAI_MODEL,
      reasoningEffort: parsed.IQ_OPENAI_REASONING_EFFORT,
      verbosity: parsed.IQ_OPENAI_VERBOSITY
    },
    slack: {
      botToken: parsed.SLACK_BOT_TOKEN,
      appToken: parsed.SLACK_APP_TOKEN,
      signingSecret: parsed.SLACK_SIGNING_SECRET,
      configured: slackConfigured
    },
    integrations: {
      openAiConfigured: hasUsableSecret(parsed.OPENAI_API_KEY),
      s3BackupsConfigured: Boolean(parsed.S3_BACKUP_BUCKET),
      awsProfileConfigured: Boolean(parsed.AWS_PROFILE),
      posthogConfigured: Boolean(parsed.POSTHOG_API_KEY),
      stripeConfigured: Boolean(parsed.STRIPE_SECRET_KEY)
    }
  };
}
