/**
 * Per-dimension scorers. Each returns a `ratio` in [0, 1] (later multiplied by
 * the dimension's weight) and a short `detail` string for the breakdown so the
 * result is explainable to a human.
 */
import type { Candidate, Job } from '../types';

export interface DimensionResult {
  ratio: number;
  detail: string;
}

/** Skill names are compared case-insensitively and ignoring surrounding whitespace. */
export const normalizeSkill = (s: string): string => s.trim().toLowerCase();

const normalizeLocation = (s: string): string => s.trim().toLowerCase();

/** A must-have skill counts this many times more than a nice-to-have. */
export const MUST_HAVE_WEIGHT = 2;

/** Remote-allowed jobs get this fraction of the location points (exact match = 1). */
export const REMOTE_LOCATION_RATIO = 2 / 3;

/** Fraction of salary points left when the candidate expects exactly the job's max. */
export const SALARY_AT_MAX_RATIO = 0.4;

/** Expectations up to this fraction above the job's max still earn a small, decaying score. */
export const SALARY_GRACE = 0.1;

/**
 * Splits a job's required skills into distinct must-have / nice-to-have sets.
 * If a skill is listed under both priorities, must-have wins.
 */
export function splitRequiredSkills(job: Job): { mustHave: Set<string>; niceToHave: Set<string> } {
  const mustHave = new Set<string>();
  const niceToHave = new Set<string>();
  for (const skill of job.requiredSkills) {
    const name = normalizeSkill(skill.name);
    if (skill.priority === 'must-have') mustHave.add(name);
    else niceToHave.add(name);
  }
  for (const name of mustHave) niceToHave.delete(name);
  return { mustHave, niceToHave };
}

/** Must-have skills the candidate lacks. Non-empty => job is filtered out. */
export function missingMustHaveSkills(candidate: Candidate, job: Job): string[] {
  const have = new Set(candidate.skills.map(normalizeSkill));
  const { mustHave } = splitRequiredSkills(job);
  return [...mustHave].filter((s) => !have.has(s));
}

/**
 * Skills: assumes the must-have filter has already passed, so every must-have
 * is matched. Score = (2 * mustHaves + matchedNiceToHaves) / (2 * mustHaves + niceToHaves).
 * Nice-to-haves therefore boost the score but never gate the candidate.
 * A job with no required skills scores full marks (nothing to fail).
 */
export function scoreSkills(candidate: Candidate, job: Job): DimensionResult {
  const have = new Set(candidate.skills.map(normalizeSkill));
  const { mustHave, niceToHave } = splitRequiredSkills(job);

  const matchedMust = [...mustHave].filter((s) => have.has(s)).length;
  const matchedNice = [...niceToHave].filter((s) => have.has(s)).length;

  const denominator = MUST_HAVE_WEIGHT * mustHave.size + niceToHave.size;
  const ratio = denominator === 0 ? 1 : (MUST_HAVE_WEIGHT * matchedMust + matchedNice) / denominator;

  const detail =
    denominator === 0
      ? 'no skills required'
      : `${matchedMust}/${mustHave.size} must-have, ${matchedNice}/${niceToHave.size} nice-to-have`;

  return { ratio, detail };
}

/**
 * Experience: meeting the minimum earns full points. Below the minimum the
 * candidate is penalised proportionally (4 of 5 years => 80%), not excluded.
 * Exceeding the minimum earns no bonus - seniority beyond the bar is not "more fit".
 */
export function scoreExperience(candidate: Candidate, job: Job): DimensionResult {
  const required = job.minYearsExperience;
  const years = candidate.yearsOfExperience;

  if (required <= 0 || years >= required) {
    return { ratio: 1, detail: `${years} yrs meets minimum of ${required}` };
  }
  const ratio = Math.max(0, years / required);
  return {
    ratio,
    detail: `${years} of ${required} yrs required (${Math.round(ratio * 100)}%)`,
  };
}

/**
 * Location: exact match > remote allowed > mismatch.
 */
export function scoreLocation(candidate: Candidate, job: Job): DimensionResult {
  if (normalizeLocation(candidate.location) === normalizeLocation(job.location)) {
    return { ratio: 1, detail: `exact match (${job.location})` };
  }
  if (job.remoteAllowed) {
    return { ratio: REMOTE_LOCATION_RATIO, detail: 'remote allowed' };
  }
  return { ratio: 0, detail: `mismatch (${candidate.location} vs ${job.location}, not remote)` };
}

/**
 * Salary: piecewise-linear on where the candidate's expectation sits relative
 * to the job's range.
 *   expected <= min                 -> 1.0  (whole range is at/above expectation)
 *   min < expected <= max           -> 1.0 -> 0.4 linearly (met, but higher in the band)
 *   max < expected <= max * 1.1     -> 0.4 -> 0.0 linearly (negotiation grace band)
 *   expected > max * 1.1            -> 0.0
 */
export function scoreSalary(candidate: Candidate, job: Job): DimensionResult {
  const expected = candidate.expectedSalary;
  const { min, max } = job.salaryRange;
  const range = `${min}-${max}`;

  if (expected <= min) {
    return { ratio: 1, detail: `expected ${expected} is at/below range ${range}` };
  }
  if (expected <= max) {
    const position = (expected - min) / (max - min); // 0 at min, 1 at max
    const ratio = 1 - (1 - SALARY_AT_MAX_RATIO) * position;
    return { ratio, detail: `expected ${expected} within range ${range}` };
  }
  const graceCeiling = max * (1 + SALARY_GRACE);
  if (expected <= graceCeiling) {
    const overshoot = (expected - max) / (graceCeiling - max); // 0 at max, 1 at ceiling
    const ratio = SALARY_AT_MAX_RATIO * (1 - overshoot);
    return { ratio, detail: `expected ${expected} slightly above range ${range}` };
  }
  return { ratio: 0, detail: `expected ${expected} exceeds range ${range}` };
}
