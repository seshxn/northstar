import { Liquid } from "liquidjs";

const engine = new Liquid({ strictVariables: true, strictFilters: true });

export async function renderPrompt(template: string, context: Record<string, unknown>): Promise<string> {
  return engine.parseAndRender(template, context);
}
