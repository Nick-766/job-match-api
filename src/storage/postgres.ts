import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { Candidate, Job, NewCandidate, NewJob, RequiredSkill } from '../types';
import type { Store } from './store';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS candidates (
    id                  UUID PRIMARY KEY,
    name                TEXT NOT NULL,
    skills              JSONB NOT NULL DEFAULT '[]',
    years_of_experience NUMERIC NOT NULL,
    location            TEXT NOT NULL,
    expected_salary     NUMERIC NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id                   UUID PRIMARY KEY,
    title                TEXT NOT NULL,
    required_skills      JSONB NOT NULL DEFAULT '[]',
    min_years_experience NUMERIC NOT NULL,
    location             TEXT NOT NULL,
    salary_min           NUMERIC NOT NULL,
    salary_max           NUMERIC NOT NULL,
    remote_allowed       BOOLEAN NOT NULL DEFAULT false,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

interface CandidateRow {
  id: string;
  name: string;
  skills: string[];
  years_of_experience: string;
  location: string;
  expected_salary: string;
}

interface JobRow {
  id: string;
  title: string;
  required_skills: RequiredSkill[];
  min_years_experience: string;
  location: string;
  salary_min: string;
  salary_max: string;
  remote_allowed: boolean;
}

// NUMERIC comes back as a string from pg to avoid precision loss; our values fit in a JS number.
const toCandidate = (r: CandidateRow): Candidate => ({
  id: r.id,
  name: r.name,
  skills: r.skills,
  yearsOfExperience: Number(r.years_of_experience),
  location: r.location,
  expectedSalary: Number(r.expected_salary),
});

const toJob = (r: JobRow): Job => ({
  id: r.id,
  title: r.title,
  requiredSkills: r.required_skills,
  minYearsExperience: Number(r.min_years_experience),
  location: r.location,
  salaryRange: { min: Number(r.salary_min), max: Number(r.salary_max) },
  remoteAllowed: r.remote_allowed,
});

/**
 * Postgres-backed store. Scoring still happens in the application layer: the
 * whole job/candidate table is loaded and ranked in memory, which is fine for
 * the scale of this exercise (see README for how this would change at scale).
 */
export class PostgresStore implements Store {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createCandidate(input: NewCandidate): Promise<Candidate> {
    const id = randomUUID();
    const { rows } = await this.pool.query<CandidateRow>(
      `INSERT INTO candidates (id, name, skills, years_of_experience, location, expected_salary)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)
       RETURNING *`,
      [id, input.name, JSON.stringify(input.skills), input.yearsOfExperience, input.location, input.expectedSalary],
    );
    return toCandidate(rows[0]);
  }

  async getCandidate(id: string): Promise<Candidate | null> {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query<CandidateRow>('SELECT * FROM candidates WHERE id = $1', [id]);
    return rows[0] ? toCandidate(rows[0]) : null;
  }

  async listCandidates(): Promise<Candidate[]> {
    const { rows } = await this.pool.query<CandidateRow>('SELECT * FROM candidates ORDER BY created_at, id');
    return rows.map(toCandidate);
  }

  async createJob(input: NewJob): Promise<Job> {
    const id = randomUUID();
    const { rows } = await this.pool.query<JobRow>(
      `INSERT INTO jobs (id, title, required_skills, min_years_experience, location, salary_min, salary_max, remote_allowed)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        input.title,
        JSON.stringify(input.requiredSkills),
        input.minYearsExperience,
        input.location,
        input.salaryRange.min,
        input.salaryRange.max,
        input.remoteAllowed,
      ],
    );
    return toJob(rows[0]);
  }

  async getJob(id: string): Promise<Job | null> {
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query<JobRow>('SELECT * FROM jobs WHERE id = $1', [id]);
    return rows[0] ? toJob(rows[0]) : null;
  }

  async listJobs(): Promise<Job[]> {
    const { rows } = await this.pool.query<JobRow>('SELECT * FROM jobs ORDER BY created_at, id');
    return rows.map(toJob);
  }
}

/** Postgres raises an error for a non-UUID in a UUID column; treat those as "not found" instead. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: string): boolean => UUID_RE.test(s);
