import { describe, expect, test } from "vitest";
import { validateConfig } from "../../src/config/validate.js";
import type { NorthstarConfig } from "../../src/workflow/schema.js";
import { parseWorkflowConfig } from "../../src/workflow/schema.js";

function githubConfig(overrides: Record<string, unknown> = {}): NorthstarConfig {
  return parseWorkflowConfig({
    tracker: {
      kind: "github",
      token: "ghp_token",
      repo: "org/repo",
      labels: [],
      active_states: ["open"],
      terminal_states: ["closed"],
      ...overrides
    }
  });
}

describe("validateConfig — github tracker", () => {
  test("passes when token and repo are present", () => {
    expect(validateConfig(githubConfig()).warnings).toEqual([]);
  });

  test("throws when token is missing", () => {
    expect(() => validateConfig(githubConfig({ token: undefined }))).toThrow(/token/i);
  });

  test("throws when token is empty string", () => {
    expect(() => validateConfig(githubConfig({ token: "" }))).toThrow(/token/i);
  });

  test("throws when repo is missing", () => {
    expect(() => validateConfig(githubConfig({ repo: undefined }))).toThrow(/repo/i);
  });

  test("throws when repo is empty string", () => {
    expect(() => validateConfig(githubConfig({ repo: "" }))).toThrow(/repo/i);
  });

  test("warns when board start columns do not match explicit dispatch states", () => {
    const config = parseWorkflowConfig({
      tracker: {
        kind: "github",
        token: "ghp_token",
        repo: "org/repo",
        active_states: ["open"],
        terminal_states: ["closed"]
      },
      dispatch: {
        mode: "tracker_states",
        states: ["Ready"]
      },
      board: {
        columns: [
          {
            id: "open",
            title: "Open",
            tracker_states: ["open"],
            starts_agent: true
          }
        ]
      }
    });

    expect(validateConfig(config).warnings.join("\n")).toMatch(/starts_agent/i);
  });

  test("warns when integration tools are enabled for process runtimes", () => {
    const config = parseWorkflowConfig({
      tracker: {
        kind: "github",
        token: "ghp_token",
        repo: "org/repo"
      },
      runtime: {
        kind: "claude_code"
      },
      integrations: {
        github: { enabled: true, token: "ghp_token" }
      }
    });

    expect(validateConfig(config).warnings.join("\n")).toMatch(/integration tools/i);
  });

  test("throws when remote dashboard binding has no auth token", () => {
    const config = parseWorkflowConfig({
      tracker: {
        kind: "github",
        token: "ghp_token",
        repo: "org/repo"
      },
      server: {
        port: 7331,
        host: "0.0.0.0"
      }
    });

    expect(() => validateConfig(config)).toThrow(/auth_token/i);
  });

  test("allows explicit unauthenticated remote dashboard binding", () => {
    const config = parseWorkflowConfig({
      tracker: {
        kind: "github",
        token: "ghp_token",
        repo: "org/repo"
      },
      server: {
        port: 7331,
        host: "0.0.0.0",
        allow_unauthenticated_remote: true
      }
    });

    expect(validateConfig(config).warnings).toEqual([]);
  });
});
