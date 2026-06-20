export type SafetyInvariantViolation = {
  path: string;
  message: string;
};

const requiredSafetyFlags = [
  "refunds_require_approval",
  "customer_emails_require_approval",
  "production_changes_require_approval",
  "destructive_aws_actions_require_approval"
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function checkSafetyInvariants(
  namespace: string,
  key: string,
  value: unknown
): SafetyInvariantViolation[] {
  const violations: SafetyInvariantViolation[] = [];

  if (namespace === "meta" && key === "safety") {
    const safety = asRecord(value);

    for (const flag of requiredSafetyFlags) {
      if (safety[flag] !== true) {
        violations.push({
          path: `meta.safety.${flag}`,
          message: "This safety approval invariant must remain true."
        });
      }
    }
  }

  if (namespace === "meta" && key === "workflow") {
    const workflow = asRecord(value);

    if (workflow.runtime !== undefined && workflow.runtime !== "local") {
      violations.push({
        path: "meta.workflow.runtime",
        message: "LifeShack IQ must remain in local runtime mode for these phases."
      });
    }
  }

  return violations;
}

export function assertSafetyInvariants(namespace: string, key: string, value: unknown): void {
  const violations = checkSafetyInvariants(namespace, key, value);

  if (violations.length > 0) {
    throw new Error(
      `Safety invariant violation: ${violations
        .map((violation) => `${violation.path} - ${violation.message}`)
        .join("; ")}`
    );
  }
}
