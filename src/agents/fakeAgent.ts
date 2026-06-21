import type { ModelClient, StructuredGenerationInput } from "./modelClient";

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") {
    return "No live business data was provided.";
  }

  const keys = Object.keys(input as Record<string, unknown>);
  return keys.length > 0
    ? `Received placeholder input keys: ${keys.join(", ")}.`
    : "Received an empty placeholder input object.";
}

export function createFakeAgentClient(): ModelClient {
  return {
    name: "fake_agent",
    model: "fake-local-structured-v1",
    async generateStructured(input: StructuredGenerationInput) {
      if (input.promptModuleName === "granola_transcript_prompt") {
        const output = {
          status: "processed",
          summary: `Granola transcript processed in fake agent mode. ${summarizeInput(input.input)}`,
          decisions: [],
          actionItems: [],
          risks: [],
          contextNotes: [
            "Fake mode recorded a durable meeting summary fallback without calling live OpenAI."
          ],
          updatesMade: [],
          followUps: [],
          confidence: 0.42
        };

        return {
          output: input.outputSchema.parse(output),
          rawText: JSON.stringify(output)
        };
      }

      const baseOutput = {
        status: "ok",
        summary: `${input.workflowType} completed in fake agent mode. ${summarizeInput(input.input)}`,
        observations: [
          "This is infrastructure-only output.",
          "No live external connectors were called."
        ],
        recommendations: [
          "Wire real data sources in a later phase.",
          "Keep sensitive actions approval-gated."
        ],
        riskLevel: "unknown",
        confidence: 0.42
      };

      return {
        output: input.outputSchema.parse(baseOutput),
        rawText: JSON.stringify(baseOutput)
      };
    }
  };
}
