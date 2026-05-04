import { homedir } from "node:os";

export interface ResolveOpts {
  env?: Record<string, string | undefined>;
  homeDir?: string;
}

export function resolveEnvValue(value: unknown, opts: ResolveOpts = {}): unknown {
  if (typeof value !== "string") return value;
  const env = opts.env ?? process.env;
  const match = value.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  if (match) return env[match[1]] ?? undefined;
  return value;
}

export function resolvePathValue(value: unknown, fallback: string, opts: ResolveOpts = {}): string {
  const resolved = resolveEnvValue(value, opts);
  const home = opts.homeDir ?? homedir();
  if (typeof resolved !== "string" || resolved.trim() === "") return fallback;
  if (resolved === "~") return home;
  if (resolved.startsWith("~/")) return `${home}${resolved.slice(1)}`;
  return resolved;
}

export function deepResolveEnv<T>(value: T, opts: ResolveOpts = {}): T {
  if (Array.isArray(value)) return value.map((item) => deepResolveEnv(item, opts)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, deepResolveEnv(nested, opts)])) as T;
  }
  return resolveEnvValue(value, opts) as T;
}
