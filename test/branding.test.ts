import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

describe("Northstar branding", () => {
  test("does not retain old product-name references in the package", () => {
    const root = join(import.meta.dirname, "..");
    const oldNamePattern = new RegExp(["sym", "phony"].join(""), "i");
    const offenders = scan(root)
      .filter((path) => !path.includes("node_modules"))
      .filter((path) => !path.includes(`${join("dist")}`))
      .filter((path) => oldNamePattern.test(readFileSync(path, "utf8")))
      .map((path) => relative(root, path));

    expect(offenders).toEqual([]);
  });
});

function scan(path: string): string[] {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) return [];
  return readdirSync(path).flatMap((entry) => scan(join(path, entry)));
}
