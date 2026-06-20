import type { CriticalIssueFinding } from "../rules/types";

export function formatCurrency(cents: number | undefined): string {
  if (typeof cents !== "number") {
    return "unknown";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(cents / 100);
}

export function formatPercent(value: number | undefined): string {
  if (typeof value !== "number") {
    return "unknown";
  }

  return `${Math.round(value * 100)}%`;
}

export function severityIcon(severity: CriticalIssueFinding["severity"]): string {
  if (severity === "critical") {
    return "[critical]";
  }

  if (severity === "medium") {
    return "[watch]";
  }

  return "[low]";
}

export function bullet(text: string): string {
  return `- ${text}`;
}

export function section(title: string, lines: string[]): string {
  return [`*${title}*`, ...(lines.length ? lines : ["- No data."])].join("\n");
}
