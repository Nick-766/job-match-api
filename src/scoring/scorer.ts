/**
 * Composite scorer + ranking helpers.
 */
import type { Candidate, Job } from '../types';
import { DEFAULT_WEIGHTS, type Weights } from './weights';
import {
  missingMustHaveSkills,
  scoreExperience,
  scoreLocation,
  scoreSalary,
  scoreSkills,
  type DimensionResult,
} from './dimensions';

export interface DimensionScore {
  score: number;
  max: number;
  detail: string;
}

export interface Breakdown {
  skills: DimensionScore;
  experience: DimensionScore;
  location: DimensionScore;
  salary: DimensionScore;
}

export interface MatchResult {
  score: number;
  breakdown: Breakdown;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

function weigh(result: DimensionResult, weight: number): DimensionScore {
  return { score: round1(result.ratio * weight), max: round1(weight), detail: result.detail };
}

/**
 * Scores a candidate against a job. Returns `null` when the job requires a
 * must-have skill the candidate lacks - such jobs must never be recommended.
 */
export function scoreMatch(candidate: Candidate, job: Job, weights: Weights = DEFAULT_WEIGHTS): MatchResult | null {
  if (missingMustHaveSkills(candidate, job).length > 0) {
    return null;
  }

  const breakdown: Breakdown = {
    skills: weigh(scoreSkills(candidate, job), weights.skills),
    experience: weigh(scoreExperience(candidate, job), weights.experience),
    location: weigh(scoreLocation(candidate, job), weights.location),
    salary: weigh(scoreSalary(candidate, job), weights.salary),
  };

  const score = round1(
    breakdown.skills.score + breakdown.experience.score + breakdown.location.score + breakdown.salary.score,
  );

  return { score, breakdown };
}

type Ranked = MatchResult & { id: string };

/**
 * Deterministic ordering: total score, then skills, then experience, then id
 * as a final stable tiebreak.
 */
function compareMatches(a: Ranked, b: Ranked): number {
  return (
    b.score - a.score ||
    b.breakdown.skills.score - a.breakdown.skills.score ||
    b.breakdown.experience.score - a.breakdown.experience.score ||
    a.id.localeCompare(b.id)
  );
}

export interface JobRecommendation extends MatchResult {
  job: Job;
}

export interface CandidateRecommendation extends MatchResult {
  candidate: Candidate;
}

/** Ranked jobs for a candidate (must-have filter applied). */
export function rankJobsForCandidate(
  candidate: Candidate,
  jobs: Job[],
  weights: Weights = DEFAULT_WEIGHTS,
  limit = Infinity,
): JobRecommendation[] {
  const scored: (JobRecommendation & { id: string })[] = [];
  for (const job of jobs) {
    const match = scoreMatch(candidate, job, weights);
    if (match) scored.push({ ...match, job, id: job.id });
  }
  return scored
    .sort(compareMatches)
    .slice(0, limit)
    .map(({ id: _id, ...rest }) => rest);
}

/** Reverse view: ranked candidates for a job. */
export function rankCandidatesForJob(
  job: Job,
  candidates: Candidate[],
  weights: Weights = DEFAULT_WEIGHTS,
  limit = Infinity,
): CandidateRecommendation[] {
  const scored: (CandidateRecommendation & { id: string })[] = [];
  for (const candidate of candidates) {
    const match = scoreMatch(candidate, job, weights);
    if (match) scored.push({ ...match, candidate, id: candidate.id });
  }
  return scored
    .sort(compareMatches)
    .slice(0, limit)
    .map(({ id: _id, ...rest }) => rest);
}
