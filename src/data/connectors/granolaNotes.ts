import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DataConnector } from "./types";

export type GranolaNotesSnapshot = {
  files: Array<{
    file: string;
    text: string;
  }>;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function createGranolaNotesConnector(): DataConnector<GranolaNotesSnapshot> {
  const notesDir = process.env.IQ_GRANOLA_NOTES_DIR;

  return {
    name: "granola_notes",
    kind: "granola_notes",
    async health() {
      if (!notesDir) {
        return {
          name: this.name,
          status: "disabled",
          checkedAt: nowIso(),
          message: "Set IQ_GRANOLA_NOTES_DIR to load local Granola notes."
        };
      }

      return {
        name: this.name,
        status: existsSync(resolve(notesDir)) ? "ok" : "error",
        checkedAt: nowIso(),
        message: resolve(notesDir)
      };
    },
    async fetch() {
      const health = await this.health();
      const files =
        health.status === "ok" && notesDir
          ? readdirSync(resolve(notesDir))
              .filter((file) => file.endsWith(".md") || file.endsWith(".txt"))
              .slice(0, 20)
              .map((file) => ({
                file,
                text: readFileSync(resolve(notesDir, file), "utf8")
              }))
          : [];

      return {
        source: this.name,
        kind: this.kind,
        fetchedAt: nowIso(),
        data: { files },
        health
      };
    }
  };
}
