export type JiraRequest = (path: string, init?: RequestInit) => Promise<unknown>;

export class JiraClient {
  constructor(private readonly opts: { endpoint: string; email: string; apiToken: string }) {}

  async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(new URL(path, this.opts.endpoint), {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${this.opts.email}:${this.opts.apiToken}`).toString("base64")}`,
        ...(init.headers as Record<string, string> | undefined)
      }
    });
    if (!response.ok) throw new Error(`Jira request failed with HTTP ${response.status}`);
    return response.json();
  }
}
