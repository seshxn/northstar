import { describe, test } from "vitest";

describe.skipIf(process.env.NORTHSTAR_LIVE !== "1")("SPEC 17.8 Jira live profile", () => {
  test("is gated by NORTHSTAR_LIVE and external credentials", () => {});
});
