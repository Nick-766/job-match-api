# Job Match API

A small, transparent, rule-based job recommendation API. Given a candidate, it ranks
jobs by how well they fit on **skills, experience, location and salary**, and explains
every score with a per-dimension breakdown. It also does the reverse: best-fit
candidates for a job.

No ML, no black box - every number in the response can be traced back to a rule in
[`src/scoring/dimensions.ts`](src/scoring/dimensions.ts).

---

## Contents

- [Running locally](#running-locally)
- [Running with Docker (API + Postgres)](#running-with-docker-api--postgres)
- [API](#api)
- [Scoring formula and weighting rationale](#scoring-formula-and-weighting-rationale) - the important part
- [Configurable weights](#configurable-weights)
- [Project structure](#project-structure)
- [Tests](#tests)
- [Assumptions](#assumptions)
- [What I'd do with more time](#what-id-do-with-more-time)
- [Use of AI tools](#use-of-ai-tools)

---

## Running locally

Requires Node.js 20+.

```bash
npm install
npm run dev          # starts on http://localhost:3000 with hot reload (in-memory storage)
```

Or build and run the compiled output:

```bash
npm run build
npm start
```

Environment variables (see [`.env.example`](.env.example)):

| Variable       | Default | Purpose                                                              |
| -------------- | ------- | -------------------------------------------------------------------- |
| `PORT`         | `3000`  | HTTP port                                                            |
| `DATABASE_URL` | unset   | When set, persists to Postgres. When unset, uses an in-memory store. |

Without `DATABASE_URL` the API keeps everything in memory - the fastest way to try it
out, and what the test-suite uses.

### Quick walkthrough

```bash
# 1. Create a candidate
curl -s -X POST localhost:3000/candidates -H 'content-type: application/json' -d '{
  "name": "Asha",
  "skills": ["TypeScript", "Node.js", "PostgreSQL"],
  "yearsOfExperience": 3,
  "location": "Bangalore",
  "expectedSalary": 1200000
}'
# -> { "id": "<candidateId>", ... }

# 2. Create a couple of jobs
curl -s -X POST localhost:3000/jobs -H 'content-type: application/json' -d '{
  "title": "Backend Engineer",
  "requiredSkills": [
    { "name": "TypeScript", "priority": "must-have" },
    { "name": "Node.js",    "priority": "must-have" },
    { "name": "Docker",     "priority": "nice-to-have" }
  ],
  "minYearsExperience": 2,
  "location": "Pune",
  "salaryRange": { "min": 1000000, "max": 1500000 },
  "remoteAllowed": true
}'

curl -s -X POST localhost:3000/jobs -H 'content-type: application/json' -d '{
  "title": "Rust Developer",
  "requiredSkills": [{ "name": "Rust", "priority": "must-have" }],
  "minYearsExperience": 0,
  "location": "Bangalore",
  "salaryRange": { "min": 2000000, "max": 3000000 },
  "remoteAllowed": true
}'

# 3. Get recommendations (the Rust job will not appear - must-have filter)
curl -s "localhost:3000/candidates/<candidateId>/recommendations?limit=5"
```

Example response:

```json
{
  "candidateId": "18e9f63e-...",
  "weights": { "skills": 50, "experience": 20, "location": 15, "salary": 15 },
  "count": 1,
  "recommendations": [
    {
      "jobId": "f5041375-...",
      "title": "Backend Engineer",
      "location": "Pune",
      "remoteAllowed": true,
      "salaryRange": { "min": 1000000, "max": 1500000 },
      "score": 81.4,
      "breakdown": {
        "skills":     { "score": 40,   "max": 50, "detail": "2/2 must-have, 0/1 nice-to-have" },
        "experience": { "score": 20,   "max": 20, "detail": "3 yrs meets minimum of 2" },
        "location":   { "score": 10,   "max": 15, "detail": "remote allowed" },
        "salary":     { "score": 11.4, "max": 15, "detail": "expected 1200000 within range 1000000-1500000" }
      }
    }
  ]
}
```

---

## Running with Docker (API + Postgres)

```bash
docker compose up --build
```

This starts `postgres:16` and the API (multi-stage build, production deps only). The API
waits for the database health-check, creates its tables on startup, and listens on
`http://localhost:3000`. Data persists in the `pgdata` volume across restarts.

```bash
docker compose down        # stop
docker compose down -v     # stop and drop the database volume
```

---

## API

| Method | Path                                    | Description                                              |
| ------ | --------------------------------------- | -------------------------------------------------------- |
| `POST` | `/candidates`                           | Create a candidate profile                               |
| `GET`  | `/candidates/:id`                       | Fetch a candidate                                        |
| `GET`  | `/candidates/:id/recommendations`       | Ranked jobs for a candidate                              |
| `POST` | `/jobs`                                 | Create a job posting                                     |
| `GET`  | `/jobs/:id`                             | Fetch a job                                              |
| `GET`  | `/jobs/:id/recommendations`             | **Bonus** - ranked candidates for a job (reverse view)   |
| `GET`  | `/health`                               | Liveness check                                           |
| `GET`  | `/`                                     | Endpoint index (handy in a browser)                      |

### Request bodies

**Candidate**

```json
{
  "name": "string",
  "skills": ["string"],
  "yearsOfExperience": 0,
  "location": "string",
  "expectedSalary": 0
}
```

**Job**

```json
{
  "title": "string",
  "requiredSkills": [{ "name": "string", "priority": "must-have" | "nice-to-have" }],
  "minYearsExperience": 0,
  "location": "string",
  "salaryRange": { "min": 0, "max": 0 },
  "remoteAllowed": true
}
```

All numbers must be `>= 0` and `salaryRange.max >= salaryRange.min`. Validation failures
return `400` with a field-level `details` array; unknown ids return `404`.

### Query parameters (both recommendation endpoints)

| Param              | Default | Notes                                    |
| ------------------ | ------- | ---------------------------------------- |
| `limit`            | `10`    | Top-N results, `1..100`                  |
| `skillsWeight`     | `50`    | See [Configurable weights](#configurable-weights) |
| `experienceWeight` | `20`    |                                          |
| `locationWeight`   | `15`    |                                          |
| `salaryWeight`     | `15`    |                                          |

---

## Scoring formula and weighting rationale

### Overview

```
if candidate is missing ANY must-have skill  ->  job is excluded (never returned)

score = skills_ratio     * 50
      + experience_ratio * 20
      + location_ratio   * 15
      + salary_ratio     * 15            (each ratio is in [0, 1]; total is 0-100)
```

Each dimension is computed as a **ratio in `[0, 1]`** by a small pure function, then
multiplied by its weight. Keeping the ratio and the weight separate is what makes the
weights configurable without touching the dimension logic, and it means the `breakdown`
in the response (`score / max`) is exactly the weighted contribution.

### Default weights and why

| Dimension  | Weight | Reasoning                                                                                                                                                                                                                                                                                                                |
| ---------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Skills     |     50 | Skills are the strongest predictor of whether someone can actually do the job, and they are the one thing neither side can negotiate away in an interview. Half the score goes here so that a strong skill match reliably outranks a job that only wins on logistics.                                                     |
| Experience |     20 | Years of experience is a useful but noisy proxy for capability. It deserves real weight (a big gap should hurt) but not enough to override a strong skill match.                                                                                                                                                         |
| Location   |     15 | Matters a lot to some people and not at all to others, and remote work has blunted it further. It should reorder otherwise-similar jobs, not dominate.                                                                                                                                                                  |
| Salary     |     15 | Almost always negotiable within a band, so it should nudge the ranking rather than decide it. A total salary miss still costs 15 points, which is enough to drop a job below an otherwise-equal one that pays.                                                                                                              |

The 50/20/15/15 split intentionally means: **a job can only score above ~70 if the skills
match is strong**, and the three "fit" dimensions together (50 points) can distinguish
between skill-equivalent jobs but never rescue a poor skill match.

### Skills (0-50)

**Must-have skills are a hard filter.** If the candidate lacks even one, `scoreMatch`
returns `null` and the job never appears - regardless of how good everything else is.
This is the only exclusion rule in the system.

Once the filter passes, the ratio rewards nice-to-haves with must-haves counting double:

```
skills_ratio = (2 * mustHaves + matchedNiceToHaves) / (2 * mustHaves + niceToHaves)
```

- All must-haves are matched by definition (the filter already ran), so the numerator's
  first term is always full; nice-to-haves add on top without ever gating.
- Weighting must-haves 2x means a job with 3 must-haves and 2 nice-to-haves gives a
  candidate who matches only the must-haves `6/8 = 75%` of skill points - a solid score
  that reflects "you can do this job", while leaving room for candidates who also bring
  the extras.
- A job with **no** required skills scores full marks (nothing to fail).
- Matching is case-insensitive and whitespace-trimmed (`"node.js"` == `" Node.js "`).
- If a skill is listed under both priorities, must-have wins.

### Experience (0-20)

```
experience_ratio = 1                       if years >= minYearsExperience (or min is 0)
                 = years / minYears        otherwise   (4 of 5 years -> 0.8)
```

**Why penalise rather than exclude?** `minYearsExperience` is almost always a heuristic
written by a recruiter, not a hard legal requirement. A candidate with 4 years against a
"5 years" bar who matches every skill is exactly the kind of person a hiring manager wants
to see, and a ranked list already pushes them below fully-qualified candidates without
hiding them. Excluding them would silently reduce recall for the sake of a rule everyone
knows is soft. The proportional penalty is deliberately linear so it is easy to reason
about: "you are 80% of the way there, you get 80% of the points."

**Why no bonus above the minimum?** Exceeding the bar does not make someone a *better
fit* for the role - it often means they are over-qualified. Capping at 1.0 keeps a
12-year veteran and a 3-year engineer level on this dimension for a "2+ years" job, and
lets skills decide.

### Location (0-15)

```
exact match (case-insensitive)  -> 1.0    (15 pts)
remoteAllowed = true            -> 2/3    (10 pts)
mismatch, not remote            -> 0      (0 pts)
```

Remote gets most - but not all - of the points because "remote allowed" often still comes
with time-zone, occasional-travel or hybrid expectations; a job in the candidate's own
city is a strictly safer bet. An exact match wins even if the job is also remote.

### Salary (0-15)

The rule is "score by overlap between expectation and range". I model that as a
piecewise-linear function of where the expectation sits relative to the band:

```
expected <= min                  -> 1.0                  whole range is at/above expectation
min < expected <= max            -> 1.0 -> 0.4 linear    met, but higher in the band
max < expected <= max * 1.10     -> 0.4 -> 0.0 linear    negotiation grace band
expected > max * 1.10            -> 0                    no realistic overlap
```

- **Highest when the whole range is above the expectation** (the brief's "comfortably
  above"). No extra credit for paying wildly more - the job already fully satisfies the
  candidate on this axis.
- **Within the range**, a lower position is better: a job whose *minimum* meets the
  expectation is a safer bet than one where the candidate needs the *top* of the band.
  It floors at 0.4 at `max` because the job can still meet the number.
- **Just above max** (up to 10%) still earns a small, decaying score. Offers routinely
  stretch a few percent for the right person, so a hard zero at `max + 1` felt wrong.
  Beyond 10% it is "near zero" as the brief asks - it is exactly zero.

### Worked example

Candidate: skills `[TypeScript, Node.js, PostgreSQL]`, 3 yrs, Bangalore, expects 1,200,000.
Job: must-have `[TypeScript, Node.js]`, nice-to-have `[Docker]`, min 2 yrs, Pune, remote OK, 1,000,000-1,500,000.

| Dimension  | Ratio                                             | x Weight | Points   |
| ---------- | ------------------------------------------------- | -------: | -------- |
| Skills     | `(2*2 + 0) / (2*2 + 1) = 0.8`                     |       50 | **40.0** |
| Experience | 3 >= 2 -> `1.0`                                   |       20 | **20.0** |
| Location   | Bangalore != Pune, remote -> `0.667`              |       15 | **10.0** |
| Salary     | 1.2M is 40% into the band -> `1 - 0.6*0.4 = 0.76` |       15 | **11.4** |
| **Total**  |                                                   |          | **81.4** |

### Ranking and ties

Results are sorted by total score, then skills score, then experience score, then id, so
the order is fully deterministic. Components are rounded to one decimal place and the
total is the sum of the rounded components, so the breakdown always adds up.

---

## Configurable weights

The four weights can be overridden per request. They are treated as **relative** and
normalised to sum to 100, so you can pass any non-negative numbers:

```bash
# Salary-first ranking
curl "localhost:3000/candidates/<id>/recommendations?salaryWeight=50"
# -> weights become { skills: 40, experience: 16, location: 12, salary: 32 }

# Equal weights
curl "localhost:3000/candidates/<id>/recommendations?skillsWeight=1&experienceWeight=1&locationWeight=1&salaryWeight=1"
# -> { skills: 25, experience: 25, location: 25, salary: 25 }
```

Unspecified weights keep their defaults; the resolved weights are echoed in the response
and appear as each dimension's `max`. All-zero weights return `400`. The defaults live in
[`src/scoring/weights.ts`](src/scoring/weights.ts). The must-have filter is not a weight
and cannot be turned off.

---

## Project structure

```
src/
  types.ts                 domain model (Candidate, Job, RequiredSkill)
  validation.ts            zod schemas for bodies and query params
  scoring/
    weights.ts             default weights + normalisation
    dimensions.ts          one pure function per dimension -> { ratio, detail }
    scorer.ts              must-have filter, weighted composite, ranking helpers
  storage/
    store.ts               Store interface
    memory.ts              Map-backed store (default, used by tests)
    postgres.ts            pg-backed store (docker-compose)
  app.ts                   Express app factory (routes + error handling)
  server.ts                entrypoint; picks a store from DATABASE_URL
tests/
  scoring.test.ts          scoring engine unit tests (the important ones)
  api.test.ts              HTTP integration tests via supertest
Dockerfile, docker-compose.yml
```

The scoring engine has no dependency on Express or the database: it is plain functions
over plain objects, which is why it is trivial to unit-test and to reuse for the reverse
view.

---

## Tests

```bash
npm test
```

47 tests, split into:

- **`tests/scoring.test.ts` (31)** - the must-have hard filter (including case/whitespace
  normalisation and a skill listed under both priorities), each dimension's boundaries
  (exactly at min years, zero-width salary range, the 10% grace band, exact-vs-remote
  location), the composite score summing to 100, weight normalisation, ranking order,
  `limit`, and the reverse view. Both edge cases named in the brief - *candidate missing a
  must-have skill* and *job with no salary overlap* - are covered explicitly.
- **`tests/api.test.ts` (16)** - request validation, 400/404 responses, `limit`, weight
  overrides, empty results, and both recommendation endpoints end-to-end against the
  in-memory store.

---

## Assumptions

- **Skill matching is exact after normalisation.** `"JS"` and `"JavaScript"` are
  different skills. Synonym/alias handling is out of scope for a rule-based scorer of
  this size (see below).
- **Location is a free-text string** compared case-insensitively. `"Bengaluru"` and
  `"Bangalore"` do not match. There is no geo distance or "same country" tier.
- **Salaries are annual numbers in one currency.** No currency conversion.
- **Years of experience can be fractional** (e.g. `2.5`).
- **A job with no required skills matches everyone on skills.** This felt more useful than
  scoring it zero; the other dimensions still differentiate.
- **Candidates and jobs are immutable once created.** The brief only asks for create
  endpoints; there is no update/delete.
- **Scale is small.** Recommendations load every job (or candidate) and score in memory.
  That is O(jobs) per request, which is fine for thousands of rows but not millions.
- **Non-UUID ids are treated as "not found"** rather than a 400, so both stores behave
  identically.

## What I'd do with more time

- **Pre-filter must-haves in SQL** for the Postgres store (`required_skills @> ...` /
  a normalised `job_skills` join table with a GIN index) so the hard filter does not
  require loading every job. The rest of the scoring can stay in application code.
- **Skill normalisation / aliases** (`js` -> `javascript`, `postgres` -> `postgresql`)
  via a small curated synonym map, still fully explainable.
- **Location tiers** - same city > same country + remote > remote > mismatch - and
  optionally a candidate-side `openToRelocation` / `remoteOnly` preference.
- **Pagination** (`offset`/cursor) alongside `limit`, and `GET /jobs`, `GET /candidates`
  list endpoints.
- **Update/delete endpoints** and optimistic concurrency.
- **Proper migrations** (e.g. `node-pg-migrate`) instead of `CREATE TABLE IF NOT EXISTS`
  at startup, plus a Postgres-backed integration test run in CI via a service container.
- **Explain endpoint** - `GET /candidates/:id/jobs/:jobId/score` to show why a specific
  job was excluded (which must-have skills are missing). Right now excluded jobs are
  simply absent.
- **Request logging, rate limiting and OpenAPI docs.**

## Use of AI tools

I used **Claude Code (Anthropic)** for this assignment. It generated the project
scaffold, the scoring functions, the storage layer, the tests and the first draft of this
README from the assignment brief, working in small commits that I reviewed as we went.
Every piece was run locally before being kept: the full test-suite, the dev server with
curl, and the Docker Compose stack against a real Postgres.

Where the AI's output was edited, or an alternative it raised was rejected:

- **All-zero weights** were first surfaced as a `500`. I changed this to a `400` with an
  explicit `Invalid weights` message, since it is a client error, and updated the test.
- **Nice-to-have scoring.** One option on the table was a fixed split (e.g. 70% of skill
  points for passing the must-have filter, 30% scaled by nice-to-haves). I went with the
  single `(2*must + nice) / (2*must + total)` ratio instead, because a job with no
  nice-to-haves should not be capped at 70%, and one formula is easier to explain.
- **Salary above max.** The simplest reading of the brief is a hard zero above `max`. I
  chose the 10% decaying grace band because real offers stretch, and the brief said
  "near zero", not zero. It is one constant (`SALARY_GRACE`) if a reviewer disagrees.
- **Experience bonus above the minimum** was considered and rejected - seniority beyond
  the bar is not "more fit" and would bias the ranking toward over-qualified candidates.
- **Weights.** The 50/20/15/15 split and the reasoning in the table above are my own
  choice; the brief's example breakdown (`40/50, 20/20, 0/15, 10/15`) uses the same
  maxima, which I took as a sensible starting point.
