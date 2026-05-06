import { describe, expect, test } from "vitest";
import { validateConfig } from "../../src/config/validate.js";
import type { NorthstarConfig } from "../../src/workflow/schema.js";

function githubConfig(overrides: Record<string, unknown> = {}): NorthstarConfig {
  return {
    tracker: {
      kind: "github",
      token: "ghp_token",
      repo: "org/repo",
      labels: [],
      active_states: ["open"],
      terminal_states: ["closed"],
      ...overrides
    }
  } as unknown as NorthstarConfig;
}

describe("validateConfig — github tracker", () => {
  test("passes when token and repo are present", () => {
    expect(() => validateConfig(githubConfig())).not.toThrow();
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
});
