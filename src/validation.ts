import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1, 'must not be empty');

export const candidateSchema = z.object({
  name: nonEmptyString,
  skills: z.array(nonEmptyString).default([]),
  yearsOfExperience: z.number().min(0, 'must be >= 0'),
  location: nonEmptyString,
  expectedSalary: z.number().min(0, 'must be >= 0'),
});

export const requiredSkillSchema = z.object({
  name: nonEmptyString,
  priority: z.enum(['must-have', 'nice-to-have']),
});

export const jobSchema = z.object({
  title: nonEmptyString,
  requiredSkills: z.array(requiredSkillSchema).default([]),
  minYearsExperience: z.number().min(0, 'must be >= 0'),
  location: nonEmptyString,
  salaryRange: z
    .object({
      min: z.number().min(0, 'must be >= 0'),
      max: z.number().min(0, 'must be >= 0'),
    })
    .refine((r) => r.max >= r.min, { message: 'max must be >= min', path: ['max'] }),
  remoteAllowed: z.boolean(),
});

/** Query params accepted by both recommendation endpoints. */
export const recommendationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  skillsWeight: z.coerce.number().min(0).optional(),
  experienceWeight: z.coerce.number().min(0).optional(),
  locationWeight: z.coerce.number().min(0).optional(),
  salaryWeight: z.coerce.number().min(0).optional(),
});

export type CandidateInput = z.infer<typeof candidateSchema>;
export type JobInput = z.infer<typeof jobSchema>;
export type RecommendationQuery = z.infer<typeof recommendationQuerySchema>;
