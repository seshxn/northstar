import type { Issue } from "./issue.js";

export interface TrackerComment {
  id: string;
  body: string;
  created_at: string;
  author?: string;
}

export interface Tracker {
  fetchCandidateIssues(): Promise<Issue[]>;
  fetchIssuesByStates(states: string[]): Promise<Issue[]>;
  fetchIssueStatesByIds(ids: string[]): Promise<Issue[]>;
  createComment?(issueId: string, body: string): Promise<TrackerComment | void>;
  fetchComments?(issueId: string): Promise<TrackerComment[]>;
  updateIssueState?(issueId: string, stateName: string): Promise<void>;
  updateIssueDescription?(issueId: string, description: string): Promise<void>;
}
