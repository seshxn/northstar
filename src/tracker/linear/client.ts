export type GraphqlRequest = (query: string, variables: Record<string, unknown>) => Promise<unknown>;

export class LinearClient {
  constructor(private readonly opts: { endpoint: string; apiKey?: string }) {}

  async graphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
    if (!this.opts.apiKey) throw new Error("missing Linear API token");
    const response = await fetch(this.opts.endpoint, {
      method: "POST",
      headers: { authorization: this.opts.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ query, variables })
    });
    if (!response.ok) throw new Error(`Linear request failed with HTTP ${response.status}`);
    return response.json();
  }
}
