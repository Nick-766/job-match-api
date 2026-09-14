import type { Candidate, Job, NewCandidate, NewJob } from '../types';

/**
 * Persistence boundary. The API only depends on this interface, so the
 * in-memory implementation (default / tests) and Postgres (docker-compose)
 * are interchangeable.
 */
export interface Store {
  createCandidate(input: NewCandidate): Promise<Candidate>;
  getCandidate(id: string): Promise<Candidate | null>;
  listCandidates(): Promise<Candidate[]>;

  createJob(input: NewJob): Promise<Job>;
  getJob(id: string): Promise<Job | null>;
  listJobs(): Promise<Job[]>;

  /** Prepare the backend (create tables, etc.). Safe to call repeatedly. */
  init(): Promise<void>;
  close(): Promise<void>;
}
