import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { InMemoryStore } from '../src/storage/memory';

const candidateBody = {
  name: 'Asha',
  skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
  yearsOfExperience: 3,
  location: 'Bangalore',
  expectedSalary: 1_200_000,
};

const jobBody = {
  title: 'Backend Engineer',
  requiredSkills: [
    { name: 'TypeScript', priority: 'must-have' },
    { name: 'Node.js', priority: 'must-have' },
    { name: 'Docker', priority: 'nice-to-have' },
  ],
  minYearsExperience: 2,
  location: 'Pune',
  salaryRange: { min: 1_000_000, max: 1_500_000 },
  remoteAllowed: true,
};

describe('API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp(new InMemoryStore());
  });

  describe('POST /candidates', () => {
    it('creates a candidate and returns it with an id', async () => {
      const res = await request(app).post('/candidates').send(candidateBody);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject(candidateBody);
      expect(typeof res.body.id).toBe('string');

      const fetched = await request(app).get(`/candidates/${res.body.id}`);
      expect(fetched.status).toBe(200);
      expect(fetched.body).toEqual(res.body);
    });

    it('rejects invalid payloads with field-level details', async () => {
      const res = await request(app)
        .post('/candidates')
        .send({ name: '', skills: 'not-a-list', yearsOfExperience: -1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid candidate');
      const paths = res.body.details.map((d: { path: string }) => d.path);
      expect(paths).toEqual(expect.arrayContaining(['name', 'skills', 'yearsOfExperience', 'location', 'expectedSalary']));
    });

    it('rejects malformed JSON', async () => {
      const res = await request(app).post('/candidates').set('content-type', 'application/json').send('{oops');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /jobs', () => {
    it('creates a job', async () => {
      const res = await request(app).post('/jobs').send(jobBody);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject(jobBody);
    });

    it('rejects an inverted salary range and unknown skill priority', async () => {
      const res = await request(app)
        .post('/jobs')
        .send({
          ...jobBody,
          salaryRange: { min: 10, max: 5 },
          requiredSkills: [{ name: 'Go', priority: 'optional' }],
        });
      expect(res.status).toBe(400);
      const paths = res.body.details.map((d: { path: string }) => d.path);
      expect(paths).toContain('salaryRange.max');
      expect(paths).toContain('requiredSkills.0.priority');
    });
  });

  describe('GET /candidates/:id/recommendations', () => {
    async function seed() {
      const candidate = (await request(app).post('/candidates').send(candidateBody)).body;
      const backend = (await request(app).post('/jobs').send(jobBody)).body;
      const rust = (
        await request(app)
          .post('/jobs')
          .send({ ...jobBody, title: 'Rust Dev', requiredSkills: [{ name: 'Rust', priority: 'must-have' }] })
      ).body;
      const local = (
        await request(app)
          .post('/jobs')
          .send({ ...jobBody, title: 'Local TS', location: 'Bangalore', remoteAllowed: false })
      ).body;
      return { candidate, backend, rust, local };
    }

    it('returns ranked jobs with score and breakdown, excluding must-have misses', async () => {
      const { candidate, rust } = await seed();
      const res = await request(app).get(`/candidates/${candidate.id}/recommendations`);

      expect(res.status).toBe(200);
      expect(res.body.candidateId).toBe(candidate.id);
      expect(res.body.weights).toEqual({ skills: 50, experience: 20, location: 15, salary: 15 });
      expect(res.body.count).toBe(2);
      expect(res.body.recommendations.map((r: { title: string }) => r.title)).toEqual(['Local TS', 'Backend Engineer']);
      expect(res.body.recommendations.some((r: { jobId: string }) => r.jobId === rust.id)).toBe(false);

      const top = res.body.recommendations[0];
      expect(top.score).toBeGreaterThan(0);
      expect(top.score).toBeLessThanOrEqual(100);
      expect(Object.keys(top.breakdown)).toEqual(['skills', 'experience', 'location', 'salary']);
      expect(top.breakdown.location).toEqual({ score: 15, max: 15, detail: 'exact match (Bangalore)' });
    });

    it('honours ?limit', async () => {
      const { candidate } = await seed();
      const res = await request(app).get(`/candidates/${candidate.id}/recommendations?limit=1`);
      expect(res.body.count).toBe(1);
      expect(res.body.recommendations).toHaveLength(1);
    });

    it('validates ?limit', async () => {
      const { candidate } = await seed();
      expect((await request(app).get(`/candidates/${candidate.id}/recommendations?limit=0`)).status).toBe(400);
      expect((await request(app).get(`/candidates/${candidate.id}/recommendations?limit=abc`)).status).toBe(400);
    });

    it('accepts weight overrides and normalises them to 100', async () => {
      const { candidate } = await seed();
      const res = await request(app).get(
        `/candidates/${candidate.id}/recommendations?skillsWeight=1&experienceWeight=1&locationWeight=1&salaryWeight=1`,
      );
      expect(res.status).toBe(200);
      expect(res.body.weights).toEqual({ skills: 25, experience: 25, location: 25, salary: 25 });
      expect(res.body.recommendations[0].breakdown.skills.max).toBe(25);
    });

    it('rejects all-zero weights', async () => {
      const { candidate } = await seed();
      const res = await request(app).get(
        `/candidates/${candidate.id}/recommendations?skillsWeight=0&experienceWeight=0&locationWeight=0&salaryWeight=0`,
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid weights');
    });

    it('404s for an unknown candidate', async () => {
      const res = await request(app).get('/candidates/does-not-exist/recommendations');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('does-not-exist');
    });

    it('returns an empty list when nothing qualifies', async () => {
      const candidate = (await request(app).post('/candidates').send({ ...candidateBody, skills: [] })).body;
      await request(app).post('/jobs').send(jobBody);
      const res = await request(app).get(`/candidates/${candidate.id}/recommendations`);
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.recommendations).toEqual([]);
    });
  });

  describe('GET /jobs/:id/recommendations (reverse view)', () => {
    it('returns ranked candidates for a job', async () => {
      const job = (await request(app).post('/jobs').send(jobBody)).body;
      await request(app).post('/candidates').send({ ...candidateBody, name: 'Junior', yearsOfExperience: 1 });
      await request(app).post('/candidates').send({ ...candidateBody, name: 'Senior', yearsOfExperience: 5 });
      await request(app).post('/candidates').send({ ...candidateBody, name: 'Pythonista', skills: ['Python'] });

      const res = await request(app).get(`/jobs/${job.id}/recommendations?limit=10`);
      expect(res.status).toBe(200);
      expect(res.body.jobId).toBe(job.id);
      expect(res.body.recommendations.map((r: { name: string }) => r.name)).toEqual(['Senior', 'Junior']);
      expect(res.body.recommendations[1].breakdown.experience.score).toBe(10);
    });

    it('404s for an unknown job', async () => {
      expect((await request(app).get('/jobs/nope/recommendations')).status).toBe(404);
    });
  });

  it('serves an endpoint index at the root', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Job Match API');
    expect(Object.keys(res.body.endpoints)).toContain('GET /candidates/:id/recommendations?limit=10');
  });

  it('404s for unknown routes', async () => {
    const res = await request(app).get('/nothing-here');
    expect(res.status).toBe(404);
  });
});
