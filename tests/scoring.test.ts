import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  missingMustHaveSkills,
  normalizeWeights,
  rankCandidatesForJob,
  rankJobsForCandidate,
  resolveWeights,
  scoreExperience,
  scoreLocation,
  scoreMatch,
  scoreSalary,
  scoreSkills,
} from '../src/scoring';
import { makeCandidate, makeJob } from './helpers';

describe('must-have filter', () => {
  it('lists missing must-have skills', () => {
    const candidate = makeCandidate({ skills: ['TypeScript'] });
    const job = makeJob();
    expect(missingMustHaveSkills(candidate, job)).toEqual(['node.js']);
  });

  it('excludes a job when any must-have skill is missing, no matter how good the rest is', () => {
    const candidate = makeCandidate({ skills: ['TypeScript', 'PostgreSQL', 'Docker'] });
    const job = makeJob(); // requires Node.js
    expect(scoreMatch(candidate, job)).toBeNull();
    expect(rankJobsForCandidate(candidate, [job])).toEqual([]);
  });

  it('matches skills case-insensitively and ignores whitespace', () => {
    const candidate = makeCandidate({ skills: ['  typescript ', 'NODE.JS'] });
    expect(missingMustHaveSkills(candidate, makeJob())).toEqual([]);
  });

  it('treats a skill listed as both must-have and nice-to-have as must-have', () => {
    const job = makeJob({
      requiredSkills: [
        { name: 'Go', priority: 'nice-to-have' },
        { name: 'Go', priority: 'must-have' },
      ],
    });
    expect(missingMustHaveSkills(makeCandidate({ skills: [] }), job)).toEqual(['go']);
  });
});

describe('skills dimension', () => {
  it('scores full marks when all must-have and nice-to-have skills match', () => {
    const candidate = makeCandidate({ skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Docker'] });
    expect(scoreSkills(candidate, makeJob()).ratio).toBe(1);
  });

  it('gives partial credit for nice-to-haves (must-haves weigh double)', () => {
    // 2 must-have (x2 = 4) + 2 nice-to-have = 6 points possible; candidate has 4 + 1 = 5
    const candidate = makeCandidate({ skills: ['TypeScript', 'Node.js', 'PostgreSQL'] });
    const result = scoreSkills(candidate, makeJob());
    expect(result.ratio).toBeCloseTo(5 / 6);
    expect(result.detail).toBe('2/2 must-have, 1/2 nice-to-have');
  });

  it('does not gate the candidate when no nice-to-haves match', () => {
    const candidate = makeCandidate({ skills: ['TypeScript', 'Node.js'] });
    const job = makeJob();
    expect(scoreSkills(candidate, job).ratio).toBeCloseTo(4 / 6);
    expect(scoreMatch(candidate, job)).not.toBeNull();
  });

  it('scores full marks for a job with no skill requirements', () => {
    const result = scoreSkills(makeCandidate({ skills: [] }), makeJob({ requiredSkills: [] }));
    expect(result.ratio).toBe(1);
    expect(result.detail).toBe('no skills required');
  });

  it('scores zero on skills when a job has only nice-to-haves and none match, but still recommends it', () => {
    const job = makeJob({ requiredSkills: [{ name: 'Rust', priority: 'nice-to-have' }] });
    const candidate = makeCandidate();
    expect(scoreSkills(candidate, job).ratio).toBe(0);
    expect(scoreMatch(candidate, job)).not.toBeNull();
  });
});

describe('experience dimension', () => {
  it('scores full marks at or above the minimum', () => {
    expect(scoreExperience(makeCandidate({ yearsOfExperience: 2 }), makeJob({ minYearsExperience: 2 })).ratio).toBe(1);
    expect(scoreExperience(makeCandidate({ yearsOfExperience: 10 }), makeJob({ minYearsExperience: 2 })).ratio).toBe(1);
  });

  it('gives no bonus for exceeding the minimum', () => {
    const job = makeJob({ minYearsExperience: 3 });
    const exact = scoreExperience(makeCandidate({ yearsOfExperience: 3 }), job).ratio;
    const senior = scoreExperience(makeCandidate({ yearsOfExperience: 12 }), job).ratio;
    expect(senior).toBe(exact);
  });

  it('penalises proportionally below the minimum instead of excluding', () => {
    const job = makeJob({ minYearsExperience: 5 });
    expect(scoreExperience(makeCandidate({ yearsOfExperience: 4 }), job).ratio).toBeCloseTo(0.8);
    expect(scoreExperience(makeCandidate({ yearsOfExperience: 1 }), job).ratio).toBeCloseTo(0.2);
    expect(scoreExperience(makeCandidate({ yearsOfExperience: 0 }), job).ratio).toBe(0);
    expect(scoreMatch(makeCandidate({ yearsOfExperience: 0 }), job)).not.toBeNull();
  });

  it('scores full marks when the job has no minimum', () => {
    expect(scoreExperience(makeCandidate({ yearsOfExperience: 0 }), makeJob({ minYearsExperience: 0 })).ratio).toBe(1);
  });
});

describe('location dimension', () => {
  it('ranks exact match > remote allowed > mismatch', () => {
    const candidate = makeCandidate({ location: 'Pune' });
    const exact = scoreLocation(candidate, makeJob({ location: 'pune ', remoteAllowed: false })).ratio;
    const remote = scoreLocation(candidate, makeJob({ location: 'Bangalore', remoteAllowed: true })).ratio;
    const mismatch = scoreLocation(candidate, makeJob({ location: 'Bangalore', remoteAllowed: false })).ratio;

    expect(exact).toBe(1);
    expect(mismatch).toBe(0);
    expect(exact).toBeGreaterThan(remote);
    expect(remote).toBeGreaterThan(mismatch);
  });

  it('prefers the exact match even when the job is also remote', () => {
    const candidate = makeCandidate({ location: 'Pune' });
    expect(scoreLocation(candidate, makeJob({ location: 'Pune', remoteAllowed: true })).ratio).toBe(1);
  });
});

describe('salary dimension', () => {
  const job = makeJob({ salaryRange: { min: 1_000_000, max: 1_500_000 } });

  it('scores highest when the whole range is at or above the expectation', () => {
    expect(scoreSalary(makeCandidate({ expectedSalary: 800_000 }), job).ratio).toBe(1);
    expect(scoreSalary(makeCandidate({ expectedSalary: 1_000_000 }), job).ratio).toBe(1);
  });

  it('decreases linearly as the expectation moves up through the range', () => {
    const low = scoreSalary(makeCandidate({ expectedSalary: 1_100_000 }), job).ratio;
    const mid = scoreSalary(makeCandidate({ expectedSalary: 1_250_000 }), job).ratio;
    const top = scoreSalary(makeCandidate({ expectedSalary: 1_500_000 }), job).ratio;

    expect(low).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(top);
    expect(mid).toBeCloseTo(0.7); // halfway between 1.0 and 0.4
    expect(top).toBeCloseTo(0.4);
  });

  it('gives a small decaying score inside the 10% grace band above max', () => {
    const slightlyOver = scoreSalary(makeCandidate({ expectedSalary: 1_575_000 }), job).ratio; // +5%
    expect(slightlyOver).toBeCloseTo(0.2);
    expect(scoreSalary(makeCandidate({ expectedSalary: 1_650_000 }), job).ratio).toBeCloseTo(0); // +10% exactly
  });

  it('scores zero when the expectation is well above the max (no overlap)', () => {
    const result = scoreSalary(makeCandidate({ expectedSalary: 2_000_000 }), job);
    expect(result.ratio).toBe(0);
    expect(result.detail).toContain('exceeds');
  });

  it('still recommends a job with no salary overlap, just with a low score', () => {
    const match = scoreMatch(makeCandidate({ expectedSalary: 2_000_000 }), job);
    expect(match).not.toBeNull();
    expect(match!.breakdown.salary.score).toBe(0);
  });

  it('handles a zero-width range', () => {
    const fixed = makeJob({ salaryRange: { min: 500_000, max: 500_000 } });
    expect(scoreSalary(makeCandidate({ expectedSalary: 500_000 }), fixed).ratio).toBe(1);
    expect(scoreSalary(makeCandidate({ expectedSalary: 600_000 }), fixed).ratio).toBe(0);
  });
});

describe('composite score', () => {
  it('produces 100 for a perfect match', () => {
    const candidate = makeCandidate({
      skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Docker'],
      yearsOfExperience: 5,
      location: 'Bangalore',
      expectedSalary: 900_000,
    });
    const match = scoreMatch(candidate, makeJob())!;
    expect(match.score).toBe(100);
    expect(match.breakdown).toEqual({
      skills: { score: 50, max: 50, detail: '2/2 must-have, 2/2 nice-to-have' },
      experience: { score: 20, max: 20, detail: '5 yrs meets minimum of 2' },
      location: { score: 15, max: 15, detail: 'exact match (Bangalore)' },
      salary: { score: 15, max: 15, detail: 'expected 900000 is at/below range 1000000-1500000' },
    });
  });

  it('sums the weighted dimensions and never exceeds 100', () => {
    // skills 5/6 * 50 = 41.7, experience 20, location remote 10, salary at 1.2M -> 0.76 * 15 = 11.4
    const candidate = makeCandidate({ location: 'Pune', expectedSalary: 1_200_000 });
    const match = scoreMatch(candidate, makeJob({ location: 'Bangalore', remoteAllowed: true }))!;

    expect(match.breakdown.skills.score).toBe(41.7);
    expect(match.breakdown.experience.score).toBe(20);
    expect(match.breakdown.location.score).toBe(10);
    expect(match.breakdown.salary.score).toBe(11.4);
    expect(match.score).toBe(83.1);
    expect(match.score).toBeLessThanOrEqual(100);
  });

  it('respects custom weights and reports them as max values', () => {
    const weights = resolveWeights({ skills: 70, experience: 10, location: 10, salary: 10 });
    const candidate = makeCandidate({ skills: ['TypeScript', 'Node.js'] });
    const match = scoreMatch(candidate, makeJob(), weights)!;
    expect(match.breakdown.skills.max).toBe(70);
    expect(match.breakdown.skills.score).toBeCloseTo((4 / 6) * 70, 0);
  });
});

describe('weights', () => {
  it('defaults sum to 100', () => {
    const { skills, experience, location, salary } = DEFAULT_WEIGHTS;
    expect(skills + experience + location + salary).toBe(100);
  });

  it('normalises arbitrary relative weights to 100', () => {
    const w = normalizeWeights({ skills: 3, experience: 1, location: 1, salary: 1 });
    expect(w.skills).toBe(50);
    expect(w.experience + w.location + w.salary).toBeCloseTo(50);
  });

  it('merges partial overrides onto defaults', () => {
    const w = resolveWeights({ salary: 0 });
    expect(w.salary).toBe(0);
    expect(w.skills + w.experience + w.location).toBeCloseTo(100);
  });

  it('rejects all-zero weights', () => {
    expect(() => normalizeWeights({ skills: 0, experience: 0, location: 0, salary: 0 })).toThrow();
  });
});

describe('ranking', () => {
  it('orders jobs by score descending and applies the limit', () => {
    const candidate = makeCandidate({ location: 'Pune', expectedSalary: 1_200_000 });
    const perfect = makeJob({ title: 'Perfect', location: 'Pune', salaryRange: { min: 1_300_000, max: 1_600_000 } });
    const remote = makeJob({ title: 'Remote', location: 'Bangalore', remoteAllowed: true });
    const farAway = makeJob({ title: 'Far', location: 'Bangalore', remoteAllowed: false });
    const blocked = makeJob({ title: 'Blocked', requiredSkills: [{ name: 'Rust', priority: 'must-have' }] });

    const ranked = rankJobsForCandidate(candidate, [blocked, farAway, remote, perfect]);
    expect(ranked.map((r) => r.job.title)).toEqual(['Perfect', 'Remote', 'Far']);

    const top2 = rankJobsForCandidate(candidate, [blocked, farAway, remote, perfect], DEFAULT_WEIGHTS, 2);
    expect(top2.map((r) => r.job.title)).toEqual(['Perfect', 'Remote']);
  });

  it('ranks candidates for a job in the reverse view', () => {
    const job = makeJob({ minYearsExperience: 4 });
    const junior = makeCandidate({ name: 'Junior', yearsOfExperience: 1 });
    const senior = makeCandidate({ name: 'Senior', yearsOfExperience: 6 });
    const unqualified = makeCandidate({ name: 'Unqualified', skills: ['Python'] });

    const ranked = rankCandidatesForJob(job, [unqualified, junior, senior]);
    expect(ranked.map((r) => r.candidate.name)).toEqual(['Senior', 'Junior']);
  });

  it('is deterministic for equal scores', () => {
    const candidate = makeCandidate();
    const a = makeJob({ id: 'b-job' });
    const b = makeJob({ id: 'a-job' });
    expect(rankJobsForCandidate(candidate, [a, b]).map((r) => r.job.id)).toEqual(['a-job', 'b-job']);
    expect(rankJobsForCandidate(candidate, [b, a]).map((r) => r.job.id)).toEqual(['a-job', 'b-job']);
  });
});
