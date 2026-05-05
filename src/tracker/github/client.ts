export type GitHubRequest = (path: string, init?: RequestInit) => Promise<unknown>;

export class GitHubClient {
  private readonly baseUrl: string;

  constructor(private readonly opts: { token?: string; baseUrl?: string }) {
    this.baseUrl = opts.baseUrl ?? "https://api.github.com";
  }

  async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(init.headers as Record<string, string> | undefined)
    };
    if (this.opts.token) headers.authorization = `Bearer ${this.opts.token}`;
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) throw new Error(`GitHub request failed with HTTP ${response.status}`);
    if (response.status === 204) return null;
    return response.json();
  }
}
