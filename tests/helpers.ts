import type { Candidate, Job } from '../src/types';

let seq = 0;

export function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  seq += 1;
  return {
    id: `cand-${seq}`,
    name: 'Test Candidate',
    skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
    yearsOfExperience: 3,
    location: 'Bangalore',
    expectedSalary: 1_200_000,
    ...overrides,
  };
}

export function makeJob(overrides: Partial<Job> = {}): Job {
  seq += 1;
  return {
    id: `job-${seq}`,
    title: 'Backend Engineer',
    requiredSkills: [
      { name: 'TypeScript', priority: 'must-have' },
      { name: 'Node.js', priority: 'must-have' },
      { name: 'PostgreSQL', priority: 'nice-to-have' },
      { name: 'Docker', priority: 'nice-to-have' },
    ],
    minYearsExperience: 2,
    location: 'Bangalore',
    salaryRange: { min: 1_000_000, max: 1_500_000 },
    remoteAllowed: false,
    ...overrides,
  };
}
