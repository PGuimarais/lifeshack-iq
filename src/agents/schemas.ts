import { z } from "zod";

export const workflowAgentOutputSchema = z.object({
  status: z.enum(["ok", "needs_attention", "blocked"]).default("ok"),
  summary: z.string(),
  observations: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  riskLevel: z.enum(["low", "medium", "high", "unknown"]).default("unknown"),
  confidence: z.number().min(0).max(1).default(0.5)
});

export type WorkflowAgentOutput = z.infer<typeof workflowAgentOutputSchema>;

export const metaInterpreterOutputSchema = z.object({
  status: z.enum(["proposed", "needs_clarification"]).default("proposed"),
  summary: z.string(),
  targetType: z.enum(["config", "prompt", "instruction", "unknown"]).default("unknown"),
  riskLevel: z.enum(["low", "medium", "high", "unknown"]).default("unknown"),
  proposedDiff: z.record(z.string(), z.unknown()).nullable().default(null)
});

export type MetaInterpreterOutput = z.infer<typeof metaInterpreterOutputSchema>;
