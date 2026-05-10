import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WorkspaceManager } from "../../src/workspace/manager.js";
import { renderBranchName } from "../../src/workspace/git.js";

describe("SPEC 17.2 workspace lifecycle", () => {
  test("sanitizes issue identifiers, creates contained workspaces, and runs create hook once", async () => {
    const root = await mkdtemp(join(tmpdir(), "northstar-workspaces-"));
    const manager = new WorkspaceManager({
      root,
      hooks: { after_create: 'printf "$NORTHSTAR_ISSUE_IDENTIFIER" > hook.txt', timeout_ms: 2000 }
    });

    const first = await manager.createForIssue({ id: "1", identifier: "SYM/1 risky", title: "x" });
    const second = await manager.createForIssue({ id: "1", identifier: "SYM/1 risky", title: "x" });

    expect(first.createdNow).toBe(true);
    expect(second.createdNow).toBe(false);
    expect(first.path.startsWith(root)).toBe(true);
    expect(first.workspaceKey).toBe("SYM_1_risky");
    expect(await readFile(join(first.path, "hook.txt"), "utf8")).toBe("SYM/1 risky");
  });

  test("rejects symlink escapes from the workspace root", async () => {
    const root = await mkdtemp(join(tmpdir(), "northstar-root-"));
    const outside = await mkdtemp(join(tmpdir(), "northstar-outside-"));
    await symlink(outside, join(root, "ESCAPE"));
    const manager = new WorkspaceManager({ root });

    await expect(manager.createForIdentifier("ESCAPE/nested")).rejects.toThrow(/outside|escape/i);
  });

  test("runs before_remove before deleting a workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "northstar-remove-"));
    const marker = join(root, "removed.txt");
    const manager = new WorkspaceManager({
      root,
      hooks: { before_remove: `printf "$NORTHSTAR_WORKSPACE" > ${marker}`, timeout_ms: 2000 }
    });

    const workspace = await manager.createForIdentifier("SYM-9");
    await manager.remove(workspace.path);

    expect(await readFile(marker, "utf8")).toBe(workspace.path);
  });

  test("renders safe branch names for git workspace strategies", () => {
    expect(renderBranchName("northstar/{{ issue.identifier | downcase }}-{{ issue.title | slug }}", {
      identifier: "SYM-42",
      title: "Add PR flow!"
    })).toBe("northstar/sym-42-add-pr-flow");
  });
});
