import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { deepResolveEnv, resolvePathValue, type ResolveOpts } from "../config/env.js";

const stringArray = z.array(z.string()).default([]);
const lowerStringArray = z
  .array(z.string())
  .default([])
  .transform((values) => values.map((value) => value.toLowerCase()));

const linearTrackerSchema = z.object({
  kind: z.literal("linear").default("linear"),
  endpoint: z.string().default("https://api.linear.app/graphql"),
  api_key: z.string().optional(),
  project_slug: z.string().optional(),
  assignee: z.string().optional(),
  active_states: z.array(z.string()).default(["Todo", "In Progress"]),
  terminal_states: z.array(z.string()).default(["Closed", "Cancelled", "Canceled", "Duplicate", "Done"])
});

const jiraTrackerSchema = z.object({
  kind: z.literal("jira"),
  endpoint: z.string(),
  email: z.string(),
  api_token: z.string(),
  project_key: z.string(),
  jql: z.string().optional(),
  active_states: z.array(z.string()).default(["To Do", "In Progress"]),
  terminal_states: z.array(z.string()).default(["Done", "Cancelled", "Won't Do"])
});

const githubTrackerSchema = z.object({
  kind: z.literal("github"),
  token: z.string().optional(),
  repo: z.string(),
  labels: stringArray.default([]),
  active_states: z.array(z.string()).default(["open"]),
  terminal_states: z.array(z.string()).default(["closed"])
});

const runtimeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("codex_app_server"),
    command: z.string().default("codex app-server"),
    approval_policy: z.unknown().optional(),
    thread_sandbox: z.string().default("workspace-write"),
    turn_sandbox_policy: z.record(z.unknown()).optional(),
    turn_timeout_ms: z.number().int().positive().default(3_600_000),
    read_timeout_ms: z.number().int().positive().default(5_000),
    stall_timeout_ms: z.number().int().nonnegative().default(300_000)
  }),
  z.object({
    kind: z.literal("claude_code"),
    model: z.string().default("claude-opus-4-7"),
    planning_model: z.string().optional(),
    api_key: z.string().optional(),
    max_turns: z.number().int().positive().default(50),
    allowed_tools: stringArray.optional(),
    disallowed_tools: stringArray.optional(),
    approval_policy: z.enum(["auto", "prompt", "reject"]).default("auto")
  }),
  z.object({
    kind: z.literal("bedrock_anthropic"),
    model_id: z.string(),
    planning_model: z.string().optional(),
    region: z.string().default("us-west-2"),
    max_tokens: z.number().int().positive().default(8192),
    aws_profile: z.string().optional(),
    builtin_tools: stringArray.default(["bash", "read", "write", "edit"])
  }),
  z.object({
    kind: z.literal("gemini"),
    model: z.string().default("gemini-2.5-pro"),
    planning_model: z.string().optional(),
    api_key: z.string().optional(),
    max_tokens: z.number().int().positive().default(8192),
    builtin_tools: stringArray.default(["bash", "read", "write", "edit"])
  })
]);

const integrationSchema = z
  .object({
    linear_graphql: z.object({ enabled: z.boolean().default(true) }).optional(),
    github: z.object({ enabled: z.boolean().default(false), token: z.string().optional(), default_repo: z.string().optional() }).optional(),
    jira_tools: z
      .object({
        enabled: z.boolean().default(false),
        base_url: z.string().optional(),
        email: z.string().optional(),
        api_token: z.string().optional()
      })
      .optional(),
    slack: z
      .object({ enabled: z.boolean().default(false), token: z.string().optional(), default_channel: z.string().optional() })
      .optional(),
    confluence: z
      .object({
        enabled: z.boolean().default(false),
        base_url: z.string().optional(),
        email: z.string().optional(),
        api_token: z.string().optional(),
        default_space: z.string().optional()
      })
      .optional()
  })
  .default({});

const skillsSchema = z
  .object({
    enabled: z.boolean().default(false),
    mode: z.enum(["prompt_injection"]).default("prompt_injection"),
    default_sequence: stringArray.default([]),
    label_sequences: z.record(stringArray).default({})
  })
  .default({});

const policySchema = z
  .object({
    allowed_tools: stringArray.default([]),
    disallowed_tools: stringArray.default([]),
    allowed_tools_by_label: z.record(stringArray).default({}),
    disallowed_tools_by_label: z.record(stringArray).default({})
  })
  .default({});

const feedbackSchema = z
  .object({
    comments_enabled: z.boolean().default(true),
    transitions: z
      .object({
        started_state: z.string().optional(),
        completed_state: z.string().optional(),
        failed_state: z.string().optional()
      })
      .default({})
  })
  .default({});

const qualityGatesSchema = z
  .object({
    enabled: z.boolean().default(false),
    mode: z.enum(["sequential"]).default("sequential"),
    default_sequence: stringArray.default([]),
    label_sequences: z.record(stringArray).default({})
  })
  .default({});

const approvalGatesSchema = z
  .object({
    enabled: z.boolean().default(false),
    labels: lowerStringArray,
    awaiting_state: z.string().optional(),
    approval_trigger: z.string().default("/approve"),
    rejection_trigger: z.string().default("/reject"),
    revision_trigger: z.string().default("/revise"),
    approvers: z.array(z.string()).default([])
  })
  .default({});

const boardRuntimeStateSchema = z.enum([
  "planning",
  "awaiting_review",
  "implementation",
  "execution",
  "retrying",
  "completed",
  "failed",
  "stalled"
]);

const boardColumnSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  tracker_states: z.array(z.string()).default([]),
  runtime_states: z.array(boardRuntimeStateSchema).default([]),
  starts_agent: z.boolean().default(false),
  accepts_manual_moves: z.boolean().optional()
});

const boardSchema = z
  .object({
    columns: z.array(boardColumnSchema).default([])
  })
  .default({});

const dispatchSchema = z
  .object({
    mode: z.enum(["tracker_states", "board_start_columns"]).default("tracker_states"),
    states: stringArray.default([]),
    require_unblocked: z.boolean().default(true),
    require_ready_label: z.boolean().default(false),
    ready_labels: lowerStringArray,
    blocked_labels: lowerStringArray
  })
  .default({});

const pullRequestSchema = z
  .object({
    enabled: z.boolean().default(false),
    provider: z.literal("github").default("github"),
    repo: z.string().optional(),
    token: z.string().optional(),
    base_branch: z.string().default("main"),
    draft: z.boolean().default(true),
    labels: stringArray.default([]),
    labels_by_issue_label: z.record(stringArray).default({}),
    reviewers: stringArray.default([]),
    title_template: z.string().default("{{ issue.identifier }}: {{ issue.title }}"),
    body_template: z.string().default("")
  })
  .default({});

const storageSchema = z
  .object({
    kind: z.enum(["memory", "json"]).default("memory"),
    path: z.string().optional(),
    retention_days: z.number().int().positive().default(30)
  })
  .default({});

const sequencingSchema = z
  .object({
    enabled: z.boolean().default(false),
    mode: z.enum(["advisory", "block_dispatch"]).default("advisory"),
    scan_on_refresh: z.boolean().default(false),
    write_tracker_relationships: z.boolean().default(false)
  })
  .default({});

const workflowSchema = z.object({
  tracker: z.union([linearTrackerSchema, jiraTrackerSchema, githubTrackerSchema]).default({ kind: "linear" }),
  runtime: runtimeSchema.default({ kind: "codex_app_server" }),
  polling: z.object({ interval_ms: z.number().int().positive().default(30_000) }).default({}),
  workspace: z
    .object({
      root: z.string().optional(),
      strategy: z.enum(["directory", "git_worktree", "clone"]).default("directory"),
      repo: z.string().optional(),
      base_branch: z.string().default("main"),
      branch_template: z.string().default("northstar/{{ issue.identifier | downcase }}"),
      reuse_existing: z.boolean().default(true),
      cleanup: z.object({ remove_after_pr_merge: z.boolean().default(false) }).default({})
    })
    .default({}),
  worker: z.object({ ssh_hosts: stringArray, max_concurrent_agents_per_host: z.number().int().positive().optional() }).default({}),
  agent: z
    .object({
      max_concurrent_agents: z.number().int().positive().default(10),
      max_turns: z.number().int().positive().default(20),
      max_retry_backoff_ms: z.number().int().positive().default(300_000),
      max_concurrent_agents_by_state: z.record(z.number().int().positive()).default({})
    })
    .default({}),
  hooks: z
    .object({
      after_create: z.string().optional(),
      before_run: z.string().optional(),
      after_run: z.string().optional(),
      before_remove: z.string().optional(),
      timeout_ms: z.number().int().positive().default(60_000)
    })
    .default({}),
  observability: z
    .object({
      dashboard_enabled: z.boolean().default(true),
      refresh_ms: z.number().int().positive().default(1000),
      render_interval_ms: z.number().int().positive().default(16)
  })
    .default({}),
  server: z
    .object({
      port: z.number().int().nonnegative().optional(),
      host: z.string().default("127.0.0.1"),
      auth_token: z.string().optional(),
      allow_unauthenticated_remote: z.boolean().default(false)
    })
    .default({}),
  board: boardSchema,
  dispatch: dispatchSchema,
  pull_request: pullRequestSchema,
  storage: storageSchema,
  sequencing: sequencingSchema,
  skills: skillsSchema,
  quality_gates: qualityGatesSchema,
  approval_gates: approvalGatesSchema,
  policy: policySchema,
  feedback: feedbackSchema,
  integrations: integrationSchema
});

export type NorthstarConfig = z.infer<typeof workflowSchema>;
export type RuntimeConfig = NorthstarConfig["runtime"];
export type TrackerConfig = NorthstarConfig["tracker"];

export const parseWorkflowConfig = (input: Record<string, unknown>, opts: ResolveOpts = {}): NorthstarConfig => {
  const normalized = normalizeLegacyCodex(deepResolveEnv(input, opts));
  const parsed = workflowSchema.parse(normalized);
  return {
    ...parsed,
    workspace: {
      ...parsed.workspace,
      root: resolvePathValue(parsed.workspace.root, join(tmpdir(), "northstar_workspaces"), {
        env: opts.env,
        homeDir: opts.homeDir ?? homedir()
      }),
      repo: parsed.workspace.repo ? resolvePathValue(parsed.workspace.repo, parsed.workspace.repo, {
        env: opts.env,
        homeDir: opts.homeDir ?? homedir()
      }) : undefined
    },
    storage: {
      ...parsed.storage,
      path: resolvePathValue(parsed.storage.path, join(opts.homeDir ?? homedir(), ".northstar", "state.json"), {
        env: opts.env,
        homeDir: opts.homeDir ?? homedir()
      })
    },
    agent: {
      ...parsed.agent,
      max_concurrent_agents_by_state: Object.fromEntries(
        Object.entries(parsed.agent.max_concurrent_agents_by_state).map(([state, limit]) => [state.toLowerCase(), limit])
      )
    }
  };
};

const normalizeLegacyCodex = (input: Record<string, unknown>): Record<string, unknown> => {
  if (input.runtime || !input.codex || typeof input.codex !== "object") return input;
  const { codex: legacy, ...rest } = input;
  return { ...rest, runtime: { kind: "codex_app_server", ...(legacy as Record<string, unknown>) } };
};
