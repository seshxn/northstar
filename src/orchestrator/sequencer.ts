import type { Issue } from "../tracker/issue.js";

export interface DependencyResult {
  issueId: string;
  blockedBy: string[];
}

export const analyzeDependencies = async (issues: Issue[], opts: { model?: string; apiKey?: string }): Promise<DependencyResult[]> => {
  if (issues.length < 2 || !opts.apiKey) return [];

  const model = opts.model ?? "claude-haiku-4-5-20251001";
  const summaries = issues.map((issue) => ({
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description?.slice(0, 200) ?? null,
    state: issue.state
  }));

  const prompt = [
    "Analyze these software issues and identify implicit dependencies — where one issue likely cannot be started until another is complete.",
    "",
    "Issues:",
    JSON.stringify(summaries, null, 2),
    "",
    "Return a JSON array. Each element has `issueId` (the id field) and `blockedBy` (array of identifier strings like 'PROJ-1' that block it).",
    "Only include items with actual blockers. Return [] if no dependencies detected.",
    "Respond with ONLY the JSON array, no other text."
  ].join("\n");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) return [];
    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((block) => block.type === "text")?.text ?? "";
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return normalizeDependencyResults(
      issues,
      parsed.filter(
      (item): item is DependencyResult =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).issueId === "string" &&
        Array.isArray((item as Record<string, unknown>).blockedBy)
      )
    );
  } catch {
    return [];
  }
};

export const normalizeDependencyResults = (issues: Issue[], results: DependencyResult[]): DependencyResult[] => {
  const idByIdOrIdentifier = new Map<string, Issue>();
  for (const issue of issues) {
    idByIdOrIdentifier.set(issue.id, issue);
    idByIdOrIdentifier.set(issue.identifier, issue);
  }
  return results.flatMap((result) => {
    const issue = idByIdOrIdentifier.get(result.issueId);
    if (!issue) return [];
    const blockedBy = result.blockedBy
      .map((blocker) => idByIdOrIdentifier.get(String(blocker)))
      .filter((blocker): blocker is Issue => blocker !== undefined && blocker.id !== issue.id)
      .map((blocker) => blocker.identifier);
    return blockedBy.length > 0 ? [{ issueId: issue.id, blockedBy: [...new Set(blockedBy)] }] : [];
  });
};
