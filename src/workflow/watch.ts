import chokidar from "chokidar";
import { loadWorkflowFile, type WorkflowDefinition } from "./loader.js";

export function watchWorkflow(path: string, onReload: (workflow: WorkflowDefinition) => void | Promise<void>) {
  const watcher = chokidar.watch(path, { ignoreInitial: true });
  watcher.on("change", async () => onReload(await loadWorkflowFile(path)));
  return watcher;
}
