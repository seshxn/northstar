import Fastify from "fastify";
import type { OrchestratorState } from "../orchestrator/state.js";
import { snapshotState } from "./snapshot.js";

export function createHttpServer(opts: { getState: () => OrchestratorState; refresh: () => Promise<void> }) {
  const app = Fastify({ logger: false });
  app.get("/", async () => "<!doctype html><title>Northstar</title><h1>Northstar</h1>");
  app.get("/api/v1/state", async () => snapshotState(opts.getState()));
  app.get<{ Params: { identifier: string } }>("/api/v1/:identifier", async (request, reply) => {
    const snapshot = snapshotState(opts.getState());
    const identifier = decodeURIComponent(request.params.identifier);
    const running = snapshot.running.find((entry) => entry.issue === identifier || entry.issueId === identifier);
    if (running) return running;
    if (snapshot.completed.includes(identifier)) return { identifier, status: "completed" };
    return reply.code(404).send({ error: "not_found" });
  });
  app.post("/api/v1/refresh", async (_request, reply) => {
    await opts.refresh();
    return reply.code(202).send({ ok: true });
  });
  return app;
}
