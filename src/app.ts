import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { HttpError, NotFoundError } from './errors';
import { rankCandidatesForJob, rankJobsForCandidate, resolveWeights } from './scoring';
import type { Store } from './storage/store';
import { candidateSchema, jobSchema, recommendationQuerySchema, type RecommendationQuery } from './validation';

/** Parse with a zod schema, converting failures into a 400. */
function parse<S extends ZodTypeAny>(schema: S, data: unknown, what: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, `Invalid ${what}`, formatZodError(result.error));
  }
  return result.data;
}

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

function weightsFromQuery(query: RecommendationQuery) {
  try {
    return resolveWeights({
      skills: query.skillsWeight,
      experience: query.experienceWeight,
      location: query.locationWeight,
      salary: query.salaryWeight,
    });
  } catch (err) {
    throw new HttpError(400, 'Invalid weights', [{ path: 'weights', message: (err as Error).message }]);
  }
}

/**
 * Builds the Express app around a Store. Keeping this a factory makes it easy
 * to spin up an app against an in-memory store in tests.
 */
export function createApp(store: Store) {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // ---- Candidates ---------------------------------------------------------

  app.post('/candidates', async (req, res) => {
    const input = parse(candidateSchema, req.body, 'candidate');
    const candidate = await store.createCandidate(input);
    res.status(201).json(candidate);
  });

  app.get('/candidates/:id', async (req, res) => {
    const candidate = await store.getCandidate(req.params.id);
    if (!candidate) throw new NotFoundError('Candidate', req.params.id);
    res.json(candidate);
  });

  app.get('/candidates/:id/recommendations', async (req, res) => {
    const candidate = await store.getCandidate(req.params.id);
    if (!candidate) throw new NotFoundError('Candidate', req.params.id);

    const query = parse(recommendationQuerySchema, req.query, 'query');
    const weights = weightsFromQuery(query);
    const jobs = await store.listJobs();
    const recommendations = rankJobsForCandidate(candidate, jobs, weights, query.limit);

    res.json({
      candidateId: candidate.id,
      weights,
      count: recommendations.length,
      recommendations: recommendations.map(({ job, score, breakdown }) => ({
        jobId: job.id,
        title: job.title,
        location: job.location,
        remoteAllowed: job.remoteAllowed,
        salaryRange: job.salaryRange,
        score,
        breakdown,
      })),
    });
  });

  // ---- Jobs ---------------------------------------------------------------

  app.post('/jobs', async (req, res) => {
    const input = parse(jobSchema, req.body, 'job');
    const job = await store.createJob(input);
    res.status(201).json(job);
  });

  app.get('/jobs/:id', async (req, res) => {
    const job = await store.getJob(req.params.id);
    if (!job) throw new NotFoundError('Job', req.params.id);
    res.json(job);
  });

  /** Bonus: reverse view - best-fit candidates for a job. */
  app.get('/jobs/:id/recommendations', async (req, res) => {
    const job = await store.getJob(req.params.id);
    if (!job) throw new NotFoundError('Job', req.params.id);

    const query = parse(recommendationQuerySchema, req.query, 'query');
    const weights = weightsFromQuery(query);
    const candidates = await store.listCandidates();
    const recommendations = rankCandidatesForJob(job, candidates, weights, query.limit);

    res.json({
      jobId: job.id,
      weights,
      count: recommendations.length,
      recommendations: recommendations.map(({ candidate, score, breakdown }) => ({
        candidateId: candidate.id,
        name: candidate.name,
        location: candidate.location,
        yearsOfExperience: candidate.yearsOfExperience,
        expectedSalary: candidate.expectedSalary,
        score,
        breakdown,
      })),
    });
  });

  // ---- Fallbacks ----------------------------------------------------------

  app.use((req, _res, next) => {
    next(new HttpError(404, `Route ${req.method} ${req.path} not found`));
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    // Malformed JSON body from express.json()
    if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
      res.status(400).json({ error: 'Malformed JSON body' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
