/**
 * Scoring weights. Each dimension produces a ratio in [0, 1] which is then
 * multiplied by its weight; the weights always sum to 100 so the final score
 * is a 0–100 number.
 */
export interface Weights {
  skills: number;
  experience: number;
  location: number;
  salary: number;
}

export const DEFAULT_WEIGHTS: Readonly<Weights> = Object.freeze({
  skills: 50,
  experience: 20,
  location: 15,
  salary: 15,
});

const DIMENSIONS = ['skills', 'experience', 'location', 'salary'] as const;

/**
 * Scale a set of weights so they sum to exactly 100. This lets callers pass
 * relative weights (e.g. 3/1/1/1) without worrying about the total.
 */
export function normalizeWeights(weights: Weights): Weights {
  const total = DIMENSIONS.reduce((sum, key) => sum + weights[key], 0);
  if (!(total > 0)) {
    throw new Error('At least one weight must be greater than zero');
  }
  const out = {} as Weights;
  for (const key of DIMENSIONS) {
    out[key] = (weights[key] / total) * 100;
  }
  return out;
}

/**
 * Merge partial overrides (e.g. from query params) onto the defaults and
 * normalise the result. Negative weights are rejected upstream by validation.
 */
export function resolveWeights(overrides: Partial<Weights> = {}): Weights {
  const merged: Weights = { ...DEFAULT_WEIGHTS };
  for (const key of DIMENSIONS) {
    const value = overrides[key];
    if (value !== undefined) merged[key] = value;
  }
  return normalizeWeights(merged);
}
