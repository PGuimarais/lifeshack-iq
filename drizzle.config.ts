import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./data/iq.sqlite"
  }
});
