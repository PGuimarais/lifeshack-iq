import pino from "pino";

export const logger = pino({
  name: process.env.IQ_APP_NAME ?? "LifeShack IQ",
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "SLACK_BOT_TOKEN",
      "SLACK_APP_TOKEN",
      "SLACK_SIGNING_SECRET",
      "OPENAI_API_KEY",
      "STRIPE_SECRET_KEY",
      "POSTHOG_API_KEY",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
      "IQ_INTERNAL_OPS_TOKEN",
      "*.botToken",
      "*.appToken",
      "*.signingSecret",
      "*.openAiApiKey",
      "*.stripeSecretKey",
      "*.posthogApiKey",
      "*.apiKey",
      "*.secretKey",
      "*.accessKeyId",
      "*.secretAccessKey",
      "*.sessionToken",
      "*.internalOpsToken",
      "*.authorization",
      "*.Authorization",
      "*.headers.authorization",
      "*.headers.Authorization"
    ],
    censor: "[redacted]"
  }
});
