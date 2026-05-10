import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BoardSnapshot } from "../board/snapshot.js";
import type { GitHubPullRequestMetadata } from "../github/pr.js";
import type { OrchestratorState } from "../orchestrator/state.js";
import { snapshotState } from "./snapshot.js";

let dashboardCache: string | null = null;
let dashboardCachePath: string | null = null;

export const createHttpServer = (opts: {
  authToken?: string;
  getState: () => OrchestratorState;
  getBoardSnapshot?: () => Promise<BoardSnapshot>;
  getSettings?: () => SettingsSnapshot;
  refresh: () => Promise<void>;
  stopIssue?: (identifier: string) => Promise<boolean>;
  retryIssue?: (identifier: string) => Promise<boolean>;
  approveIssue?: (identifier: string) => Promise<boolean>;
  feedbackIssue?: (identifier: string, message: string) => Promise<boolean>;
  rejectIssue?: (identifier: string, message?: string) => Promise<boolean>;
  moveIssue?: (identifier: string, state: string) => Promise<boolean>;
  commentIssue?: (identifier: string, body: string) => Promise<boolean>;
  scanDependencies?: () => Promise<void>;
  updateSettings?: (patch: SettingsPatch) => void;
  createPullRequest?: (
    identifier: string,
    input: {
      head?: string;
      title?: string;
      body?: string;
      base?: string;
      draft?: boolean;
      labels?: string[];
      reviewers?: string[];
    }
  ) => Promise<GitHubPullRequestMetadata | null>;
}) => {
  const app = Fastify({ logger: false });
  app.addHook("preHandler", async (request, reply) => {
    if (!opts.authToken || request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;
    const authorization = request.headers.authorization ?? "";
    if (authorization === `Bearer ${opts.authToken}`) return;
    return reply.code(401).send({ error: "unauthorized" });
  });
  app.get("/", async (_request, reply) => reply.type("text/html").send(await loadDashboardHtml()));
  app.get<{ Params: { "*": string } }>("/assets/*", async (request, reply) => {
    try {
      const assetPath = join(process.cwd(), "web/dist/assets", request.params["*"]);
      return reply.type(contentType(assetPath)).send(await readFile(assetPath));
    } catch {
      return reply.code(404).send({ error: "not_found" });
    }
  });
  app.get("/api/v1/state", async () => snapshotState(opts.getState()));
  app.get("/api/v1/settings", async (_request, reply) => {
    if (!opts.getSettings) return reply.code(404).send({ error: "settings_not_configured" });
    return opts.getSettings();
  });
  app.get("/api/v1/board", async (_request, reply) => {
    if (!opts.getBoardSnapshot) return reply.code(404).send({ error: "board_not_configured" });
    return opts.getBoardSnapshot();
  });
  app.get<{ Params: { identifier: string } }>("/api/v1/:identifier", async (request, reply) => {
    const snapshot = snapshotState(opts.getState());
    const identifier = decodeURIComponent(request.params.identifier);
    const running = snapshot.running.find((entry) => entry.issue === identifier || entry.issueId === identifier);
    if (running) return running;
    const awaiting = snapshot.awaitingReview.find((entry) => entry.issue === identifier || entry.issueId === identifier);
    if (awaiting) return awaiting;
    if (snapshot.completed.includes(identifier)) return { identifier, status: "completed" };
    return reply.code(404).send({ error: "not_found" });
  });
  app.get<{ Params: { identifier: string } }>("/api/v1/issues/:identifier", async (request, reply) => {
    const snapshot = snapshotState(opts.getState());
    const identifier = decodeURIComponent(request.params.identifier);
    const running = snapshot.running.find((entry) => entry.issue === identifier || entry.issueId === identifier);
    if (running) return running;
    const awaiting = snapshot.awaitingReview.find((entry) => entry.issue === identifier || entry.issueId === identifier);
    if (awaiting) return awaiting;
    const result = snapshot.results.find((entry) => entry.issue === identifier || entry.issueId === identifier);
    if (result) return result;
    if (snapshot.completed.includes(identifier)) return { identifier, status: "completed" };
    return reply.code(404).send({ error: "not_found" });
  });
  app.post("/api/v1/refresh", async (_request, reply) => {
    await opts.refresh();
    return reply.code(202).send({ ok: true });
  });
  app.post<{ Params: { identifier: string } }>("/api/v1/:identifier/stop", async (request, reply) => {
    const ok = await opts.stopIssue?.(decodeURIComponent(request.params.identifier));
    return ok ? reply.code(202).send({ ok: true }) : reply.code(404).send({ error: "not_found" });
  });
  app.post<{ Params: { identifier: string } }>("/api/v1/:identifier/retry", async (request, reply) => {
    const ok = await opts.retryIssue?.(decodeURIComponent(request.params.identifier));
    if (!ok) return reply.code(404).send({ error: "not_found" });
    await opts.refresh();
    return reply.code(202).send({ ok: true });
  });
  app.post<{ Params: { identifier: string } }>("/api/v1/:identifier/approve", async (request, reply) => {
    const ok = await opts.approveIssue?.(decodeURIComponent(request.params.identifier));
    if (!ok) return reply.code(404).send({ error: "not_found" });
    await opts.refresh();
    return reply.code(202).send({ ok: true });
  });
  app.post<{ Params: { identifier: string } }>("/api/v1/issues/:identifier/plan/approve", async (request, reply) => {
    const ok = await opts.approveIssue?.(decodeURIComponent(request.params.identifier));
    if (!ok) return reply.code(404).send({ error: "not_found" });
    await opts.refresh();
    return reply.code(202).send({ ok: true });
  });
  app.post<{ Params: { identifier: string }; Body: { message?: unknown } }>("/api/v1/:identifier/feedback", async (request, reply) => {
    const message = typeof request.body?.message === "string" ? request.body.message : "";
    if (message.trim() === "") return reply.code(400).send({ error: "message_required" });
    const ok = await opts.feedbackIssue?.(decodeURIComponent(request.params.identifier), message);
    if (!ok) return reply.code(404).send({ error: "not_found" });
    await opts.refresh();
    return reply.code(202).send({ ok: true });
  });
  app.post<{ Params: { identifier: string }; Body: { message?: unknown } }>(
    "/api/v1/issues/:identifier/plan/feedback",
    async (request, reply) => {
      const message = typeof request.body?.message === "string" ? request.body.message : "";
      if (message.trim() === "") return reply.code(400).send({ error: "message_required" });
      const ok = await opts.feedbackIssue?.(decodeURIComponent(request.params.identifier), message);
      if (!ok) return reply.code(404).send({ error: "not_found" });
      await opts.refresh();
      return reply.code(202).send({ ok: true });
    }
  );
  app.post<{ Params: { identifier: string }; Body: { message?: unknown } }>("/api/v1/issues/:identifier/reject", async (request, reply) => {
    const message = typeof request.body?.message === "string" ? request.body.message : undefined;
    const ok = await opts.rejectIssue?.(decodeURIComponent(request.params.identifier), message);
    if (!ok) return reply.code(404).send({ error: "not_found" });
    await opts.refresh();
    return reply.code(202).send({ ok: true });
  });
  app.post<{ Params: { identifier: string }; Body: { state?: unknown } }>("/api/v1/issues/:identifier/move", async (request, reply) => {
    const state = typeof request.body?.state === "string" ? request.body.state.trim() : "";
    if (!state) return reply.code(400).send({ error: "state_required" });
    const ok = await opts.moveIssue?.(decodeURIComponent(request.params.identifier), state);
    if (!ok) return reply.code(404).send({ error: "not_found" });
    await opts.refresh();
    return reply.code(202).send({ ok: true });
  });
  app.post<{ Params: { identifier: string }; Body: { body?: unknown } }>("/api/v1/issues/:identifier/comment", async (request, reply) => {
    const body = typeof request.body?.body === "string" ? request.body.body.trim() : "";
    if (!body) return reply.code(400).send({ error: "body_required" });
    const ok = await opts.commentIssue?.(decodeURIComponent(request.params.identifier), body);
    if (!ok) return reply.code(404).send({ error: "not_found" });
    return reply.code(202).send({ ok: true });
  });
  app.post("/api/v1/dependencies/scan", async (_request, reply) => {
    await opts.scanDependencies?.();
    return reply.code(202).send({ ok: true });
  });
  app.post<{ Body: { runtime?: unknown; tracker?: unknown } }>("/api/v1/settings", async (request, reply) => {
    const patch: SettingsPatch = {};
    const runtime = request.body?.runtime;
    if (runtime && typeof runtime === "object") {
      const r = runtime as Record<string, unknown>;
      patch.runtime = {};
      if (typeof r.executionModel === "string") patch.runtime.executionModel = r.executionModel;
      if (typeof r.planningModel === "string") patch.runtime.planningModel = r.planningModel;
    }
    const tracker = request.body?.tracker;
    if (tracker && typeof tracker === "object") {
      const t = tracker as Record<string, unknown>;
      patch.tracker = {};
      if (typeof t.jql === "string") patch.tracker.jql = t.jql;
      if (Array.isArray(t.backlog_states) && t.backlog_states.every((s) => typeof s === "string")) {
        patch.tracker.backlog_states = t.backlog_states as string[];
      }
    }
    opts.updateSettings?.(patch);
    return reply.code(200).send({ ok: true });
  });
  app.post<{
    Params: { identifier: string };
    Body: { head?: unknown; title?: unknown; body?: unknown; base?: unknown; draft?: unknown; labels?: unknown; reviewers?: unknown };
  }>("/api/v1/issues/:identifier/pr/create", async (request, reply) => {
    const head = typeof request.body?.head === "string" ? request.body.head.trim() : undefined;
    const pr = await opts.createPullRequest?.(decodeURIComponent(request.params.identifier), {
      ...(head ? { head } : {}),
      title: typeof request.body?.title === "string" ? request.body.title : undefined,
      body: typeof request.body?.body === "string" ? request.body.body : undefined,
      base: typeof request.body?.base === "string" ? request.body.base : undefined,
      draft: typeof request.body?.draft === "boolean" ? request.body.draft : undefined,
      labels: Array.isArray(request.body?.labels)
        ? request.body.labels.filter((label): label is string => typeof label === "string")
        : undefined,
      reviewers: Array.isArray(request.body?.reviewers)
        ? request.body.reviewers.filter((reviewer): reviewer is string => typeof reviewer === "string")
        : undefined
    });
    if (!pr) return reply.code(404).send({ error: "not_found" });
    await opts.refresh();
    return reply.code(202).send({ ok: true, pr });
  });
  return app;
};

export interface SettingsSnapshot {
  runtime: {
    kind: string;
    executionModel: string | null;
    planningModel: string | null;
    capabilities: {
      localShell: boolean;
      filesystemEdits: boolean;
      northstarTools: boolean;
      tokenTelemetry: boolean;
      multiTurnSession: boolean;
      stop: boolean;
      planningModel: boolean;
    };
  };
  tracker: {
    kind: string;
    jql: string | null;
    project_key: string | null;
    active_states: string[];
    backlog_states: string[];
  };
}

export interface SettingsPatch {
  runtime?: {
    executionModel?: string;
    planningModel?: string;
  };
  tracker?: {
    jql?: string;
    backlog_states?: string[];
  };
}

const loadDashboardHtml = async (): Promise<string> => {
  const dashboardPath = join(process.cwd(), "web/dist/index.html");
  if (dashboardCache && dashboardCachePath === dashboardPath) return dashboardCache;
  try {
    dashboardCache = await readFile(dashboardPath, "utf8");
    dashboardCachePath = dashboardPath;
    return dashboardCache;
  } catch {
    dashboardCache = null;
    dashboardCachePath = null;
    return missingDashboardBuildHtml();
  }
};

const missingDashboardBuildHtml = (): string =>
  [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    "<title>Northstar</title>",
    "<style>",
    "body{margin:0;background:#09090b;color:#fafafa;font-family:Inter,ui-sans-serif,system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}",
    "main{border:1px solid #27272a;border-radius:12px;padding:24px;max-width:460px;background:#111113}",
    "h1{font-size:20px;margin:0 0 8px}p{color:#a1a1aa;line-height:1.5;margin:0}code{color:#fafafa}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>Northstar dashboard build missing</h1>",
    "<p>Run <code>npm run build:web</code> or <code>npm run build</code>, then restart Northstar.</p>",
    "</main>",
    "</body>",
    "</html>"
  ].join("");

const contentType = (path: string): string => {
  if (path.endsWith(".js")) return "text/javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
};
