import { randomUUID } from 'node:crypto';
import type { Candidate, Job, NewCandidate, NewJob } from '../types';
import type { Store } from './store';

/** Simple Map-backed store. Insertion order is preserved for listing. */
export class InMemoryStore implements Store {
  private candidates = new Map<string, Candidate>();
  private jobs = new Map<string, Job>();

  async createCandidate(input: NewCandidate): Promise<Candidate> {
    const candidate: Candidate = { id: randomUUID(), ...input };
    this.candidates.set(candidate.id, candidate);
    return candidate;
  }

  async getCandidate(id: string): Promise<Candidate | null> {
    return this.candidates.get(id) ?? null;
  }

  async listCandidates(): Promise<Candidate[]> {
    return [...this.candidates.values()];
  }

  async createJob(input: NewJob): Promise<Job> {
    const job: Job = { id: randomUUID(), ...input };
    this.jobs.set(job.id, job);
    return job;
  }

  async getJob(id: string): Promise<Job | null> {
    return this.jobs.get(id) ?? null;
  }

  async listJobs(): Promise<Job[]> {
    return [...this.jobs.values()];
  }

  async init(): Promise<void> {}
  async close(): Promise<void> {}
}
