import { Liquid } from "liquidjs";

const engine = new Liquid({ strictVariables: true, strictFilters: true });

export const renderPrompt = async (template: string, context: Record<string, unknown>): Promise<string> =>
  engine.parseAndRender(template, context);
