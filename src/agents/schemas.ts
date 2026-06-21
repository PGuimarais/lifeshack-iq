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

export const granolaTranscriptOutputSchema = z.object({
  status: z.enum(["processed", "needs_review"]).default("processed"),
  summary: z.string(),
  decisions: z.array(z.string()).default([]),
  actionItems: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  contextNotes: z.array(z.string()).default([]),
  updatesMade: z.array(z.string()).default([]),
  followUps: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5)
});

export type GranolaTranscriptOutput = z.infer<typeof granolaTranscriptOutputSchema>;

export const checkinReplyOutputSchema = z.object({
  status: z.enum(["processed", "needs_review"]).default("processed"),
  summary: z.string(),
  progressUpdates: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  actionItems: z.array(z.string()).default([]),
  goalOrInitiativeUpdates: z.array(z.string()).default([]),
  approvalsNeeded: z.array(z.string()).default([]),
  updatesMade: z.array(z.string()).default([]),
  followUps: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5)
});

export type CheckinReplyOutput = z.infer<typeof checkinReplyOutputSchema>;
