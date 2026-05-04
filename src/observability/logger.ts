import pino from "pino";

export const secretKeys = [
  "LINEAR_API_KEY",
  "JIRA_API_TOKEN",
  "ANTHROPIC_API_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "GOOGLE_API_KEY",
  "GITHUB_TOKEN",
  "SLACK_BOT_TOKEN",
  "CONFLUENCE_API_TOKEN",
  "api_key",
  "api_token",
  "token"
];

export function createLogger() {
  return pino({
    redact: {
      paths: secretKeys.map((key) => `*.${key}`),
      censor: "[REDACTED]"
    }
  });
}
