import type { Issue } from "./issue.js";

export interface Tracker {
  fetchCandidateIssues(): Promise<Issue[]>;
  fetchIssuesByStates(states: string[]): Promise<Issue[]>;
  fetchIssueStatesByIds(ids: string[]): Promise<Issue[]>;
  createComment?(issueId: string, body: string): Promise<void>;
  updateIssueState?(issueId: string, stateName: string): Promise<void>;
}
