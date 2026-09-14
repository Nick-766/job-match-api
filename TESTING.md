# Testing Guide

Quick reference for running the Job Match API and exercising every endpoint by hand.
For the scoring formula and design rationale see [README.md](README.md).

---

## 1. Run the project

### Option A - local, in-memory storage (fastest)

```bash
npm install
npm run dev              # http://localhost:3000, hot reload
```

### Option B - compiled build

```bash
npm run build
npm start
```

### Option C - Docker (API + Postgres)

```bash
docker compose up --build        # API on http://localhost:3000, Postgres on 5432
docker compose down -v           # stop and drop the database volume
```

### Automated tests

```bash
npm test                 # 47 tests: scoring unit tests + API integration tests
npm run test:watch       # watch mode
npm run typecheck        # tsc --noEmit
```

### Postman collection

Import both files from [`postman/`](postman/) into Postman (**File → Import**):

| File                                          | What it is                                                     |
| --------------------------------------------- | -------------------------------------------------------------- |
| `postman/job-match-api.postman_collection.json` | 35 requests in 7 folders, with dummy data and 93 assertions    |
| `postman/local.postman_environment.json`        | `baseUrl = http://localhost:3000`                              |

Then select the **"Job Match API - local"** environment and either run requests one by one
(top to bottom) or right-click the collection → **Run collection**. The "Seed" folders
store every created id in collection variables (`ashaId`, `backendJobId`, ...), so the
recommendation and error requests need no manual editing.

| Folder                        | Covers                                                             |
| ----------------------------- | ------------------------------------------------------------------ |
| 0. Health & index             | `GET /`, `GET /health`                                             |
| 1. Seed candidates            | `POST /candidates` × 5                                             |
| 2. Seed jobs                  | `POST /jobs` × 6                                                   |
| 3. Fetch by id                | `GET /candidates/:id`, `GET /jobs/:id`                             |
| 4. Recommendations            | default weights, `limit`, custom weights, must-have filter, salary |
| 5. Reverse view               | `GET /jobs/:id/recommendations` incl. empty result                 |
| 6. Error cases                | every 400 and 404 path                                             |

Run it headless from the terminal with Newman (server must be running):

```bash
npx newman run postman/job-match-api.postman_collection.json -e postman/local.postman_environment.json
```

To regenerate the collection after editing `postman/generate.js`: `node postman/generate.js`.

### One-shot smoke test (seeds dummy data + calls every endpoint)

With the server running, either script creates 5 candidates and 6 jobs, then hits all
8 endpoints plus every 400/404 case, pretty-printing each response:

```bash
bash scripts/smoke.sh                       # Git Bash / WSL / macOS / Linux
bash scripts/smoke.sh http://localhost:4000 # custom base URL
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1              # Windows
powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1 -Base http://localhost:4000
```

The dummy data is chosen so each business rule is visible in the output:

| Record                  | Purpose                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| Asha (TS/Node/PG, 3y)   | Main candidate - matches most TS jobs                            |
| Ravi (TS/Node/Docker/AWS, 7y, wants 2.5M) | Perfect skills, salary too high -> 0 on salary |
| Meera (Python/Django)   | Only candidate who passes the Python job's must-have             |
| Dev Junior (1y)         | Below min experience -> penalised, not excluded                  |
| Nikhil Fresher (JS/React) | Only qualifies for the no-skills Intern job                    |
| Backend Engineer        | Remote job (location = 10/15)                                    |
| Local TS Engineer       | Same city as Asha (location = 15/15) - ranks first               |
| Rust Developer          | Must-have Asha lacks -> never appears for her                    |
| Staff Engineer          | 6y min + low salary -> appears with a low score                  |
| Python Developer        | Must-have Python                                                 |
| Intern (any stack)      | No required skills -> full skills marks for everyone             |

The in-memory store resets when the server restarts; running a script twice on the same
server simply adds a second copy of the data.

> **Windows note:** in PowerShell, `curl` is an alias for `Invoke-WebRequest`. Use
> `curl.exe` or run the commands below from Git Bash / WSL. A PowerShell-native
> version of the walkthrough is in [section 4](#4-powershell-walkthrough).

---

## 2. Endpoint reference

| # | Method | Path                                  | Purpose                                    | Success |
|---|--------|---------------------------------------|--------------------------------------------|---------|
| 1 | `GET`  | `/`                                   | Endpoint index                             | `200`   |
| 2 | `GET`  | `/health`                             | Liveness check                             | `200`   |
| 3 | `POST` | `/candidates`                         | Create a candidate                         | `201`   |
| 4 | `GET`  | `/candidates/:id`                     | Fetch a candidate                          | `200`   |
| 5 | `GET`  | `/candidates/:id/recommendations`     | Ranked jobs for a candidate                | `200`   |
| 6 | `POST` | `/jobs`                               | Create a job                               | `201`   |
| 7 | `GET`  | `/jobs/:id`                           | Fetch a job                                | `200`   |
| 8 | `GET`  | `/jobs/:id/recommendations`           | Ranked candidates for a job (reverse view) | `200`   |

**Query params for #5 and #8**

| Param              | Default | Range   | Notes                                               |
|--------------------|---------|---------|-----------------------------------------------------|
| `limit`            | `10`    | `1-100` | Top-N results                                       |
| `skillsWeight`     | `50`    | `>= 0`  | Relative weight; all four are normalised to sum 100 |
| `experienceWeight` | `20`    | `>= 0`  |                                                     |
| `locationWeight`   | `15`    | `>= 0`  |                                                     |
| `salaryWeight`     | `15`    | `>= 0`  |                                                     |

**Error responses**

| Status | When                                          | Body                                     |
|--------|-----------------------------------------------|------------------------------------------|
| `400`  | Invalid body / query / weights, malformed JSON | `{ "error": "...", "details": [...] }`   |
| `404`  | Unknown candidate / job id, unknown route      | `{ "error": "Candidate 'x' not found" }` |

---

## 3. Walkthrough (bash / Git Bash / WSL)

Set the base URL once:

```bash
BASE=http://localhost:3000
```

### 3.1 Index and health

```bash
curl -s $BASE/
curl -s $BASE/health
# -> {"status":"ok"}
```

### 3.2 Create a candidate

```bash
curl -s -X POST $BASE/candidates -H 'content-type: application/json' -d '{
  "name": "Asha",
  "skills": ["TypeScript", "Node.js", "PostgreSQL"],
  "yearsOfExperience": 3,
  "location": "Bangalore",
  "expectedSalary": 1200000
}'
# -> 201 {"id":"<CANDIDATE_ID>","name":"Asha",...}
```

Copy the returned id:

```bash
CANDIDATE_ID=<paste id here>
```

### 3.3 Fetch the candidate

```bash
curl -s $BASE/candidates/$CANDIDATE_ID
```

### 3.4 Create jobs

**Job A - remote, strong match (expected score 81.4)**

```bash
curl -s -X POST $BASE/jobs -H 'content-type: application/json' -d '{
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
```

**Job B - same city, not remote (expected score 86.4, ranks first)**

```bash
curl -s -X POST $BASE/jobs -H 'content-type: application/json' -d '{
  "title": "Local TS Engineer",
  "requiredSkills": [
    { "name": "TypeScript", "priority": "must-have" },
    { "name": "Node.js",    "priority": "must-have" },
    { "name": "Docker",     "priority": "nice-to-have" }
  ],
  "minYearsExperience": 2,
  "location": "Bangalore",
  "salaryRange": { "min": 1000000, "max": 1500000 },
  "remoteAllowed": false
}'
```

**Job C - missing must-have skill (must NEVER appear for Asha)**

```bash
curl -s -X POST $BASE/jobs -H 'content-type: application/json' -d '{
  "title": "Rust Developer",
  "requiredSkills": [{ "name": "Rust", "priority": "must-have" }],
  "minYearsExperience": 0,
  "location": "Bangalore",
  "salaryRange": { "min": 2000000, "max": 3000000 },
  "remoteAllowed": true
}'
```

**Job D - under-experienced + no salary overlap (appears, but scores low)**

```bash
curl -s -X POST $BASE/jobs -H 'content-type: application/json' -d '{
  "title": "Staff Engineer",
  "requiredSkills": [{ "name": "TypeScript", "priority": "must-have" }],
  "minYearsExperience": 6,
  "location": "Mumbai",
  "salaryRange": { "min": 600000, "max": 900000 },
  "remoteAllowed": false
}'
```

Save one job id for the reverse view:

```bash
JOB_ID=<paste id of Job A here>
```

### 3.5 Fetch a job

```bash
curl -s $BASE/jobs/$JOB_ID
```

### 3.6 Recommendations for the candidate

```bash
curl -s "$BASE/candidates/$CANDIDATE_ID/recommendations"
```

Expected order: **Local TS Engineer (86.4)** > **Backend Engineer (81.4)** > **Staff Engineer (60)**.
Rust Developer is absent (must-have filter).

```json
{
  "candidateId": "...",
  "weights": { "skills": 50, "experience": 20, "location": 15, "salary": 15 },
  "count": 3,
  "recommendations": [
    {
      "jobId": "...",
      "title": "Local TS Engineer",
      "location": "Bangalore",
      "remoteAllowed": false,
      "salaryRange": { "min": 1000000, "max": 1500000 },
      "score": 86.4,
      "breakdown": {
        "skills":     { "score": 40,   "max": 50, "detail": "2/2 must-have, 0/1 nice-to-have" },
        "experience": { "score": 20,   "max": 20, "detail": "3 yrs meets minimum of 2" },
        "location":   { "score": 15,   "max": 15, "detail": "exact match (Bangalore)" },
        "salary":     { "score": 11.4, "max": 15, "detail": "expected 1200000 within range 1000000-1500000" }
      }
    }
  ]
}
```

**Top-N with `limit`**

```bash
curl -s "$BASE/candidates/$CANDIDATE_ID/recommendations?limit=1"
# -> count: 1
```

**Custom weights (relative, normalised to 100)**

```bash
# Salary-first
curl -s "$BASE/candidates/$CANDIDATE_ID/recommendations?salaryWeight=50"
# -> weights: { skills: 40, experience: 16, location: 12, salary: 32 }

# Equal weights
curl -s "$BASE/candidates/$CANDIDATE_ID/recommendations?skillsWeight=1&experienceWeight=1&locationWeight=1&salaryWeight=1"
# -> weights: { skills: 25, experience: 25, location: 25, salary: 25 }
```

### 3.7 Reverse view - best candidates for a job

Add a couple more candidates first:

```bash
curl -s -X POST $BASE/candidates -H 'content-type: application/json' -d '{
  "name": "Junior Dev", "skills": ["TypeScript", "Node.js"],
  "yearsOfExperience": 1, "location": "Pune", "expectedSalary": 800000
}'

curl -s -X POST $BASE/candidates -H 'content-type: application/json' -d '{
  "name": "Pythonista", "skills": ["Python", "Django"],
  "yearsOfExperience": 5, "location": "Pune", "expectedSalary": 1000000
}'
```

```bash
curl -s "$BASE/jobs/$JOB_ID/recommendations?limit=5"
```

Expected: **Junior Dev (80)** and **Asha (81.4)** both appear, Asha first; **Pythonista** is
excluded (missing TypeScript / Node.js). Weights and `limit` work exactly as on the
candidate endpoint.

### 3.8 Error cases

```bash
# 400 - invalid candidate body (field-level details)
curl -s -X POST $BASE/candidates -H 'content-type: application/json' \
  -d '{"name":"","skills":"nope","yearsOfExperience":-1}'

# 400 - inverted salary range + bad priority
curl -s -X POST $BASE/jobs -H 'content-type: application/json' -d '{
  "title": "Bad Job",
  "requiredSkills": [{ "name": "Go", "priority": "optional" }],
  "minYearsExperience": 0, "location": "Pune",
  "salaryRange": { "min": 10, "max": 5 }, "remoteAllowed": false
}'

# 400 - malformed JSON
curl -s -X POST $BASE/candidates -H 'content-type: application/json' -d '{oops'

# 400 - invalid limit
curl -s "$BASE/candidates/$CANDIDATE_ID/recommendations?limit=0"
curl -s "$BASE/candidates/$CANDIDATE_ID/recommendations?limit=abc"

# 400 - all-zero weights
curl -s "$BASE/candidates/$CANDIDATE_ID/recommendations?skillsWeight=0&experienceWeight=0&locationWeight=0&salaryWeight=0"

# 404 - unknown ids / route
curl -s $BASE/candidates/does-not-exist
curl -s $BASE/candidates/does-not-exist/recommendations
curl -s $BASE/jobs/does-not-exist/recommendations
curl -s $BASE/nothing-here
```

---

## 4. PowerShell walkthrough

Same flow using `Invoke-RestMethod` (no quoting headaches):

```powershell
$BASE = "http://localhost:3000"

# Health
Invoke-RestMethod "$BASE/health"

# Create candidate
$candidate = Invoke-RestMethod -Method Post -Uri "$BASE/candidates" -ContentType "application/json" -Body (@{
  name = "Asha"
  skills = @("TypeScript", "Node.js", "PostgreSQL")
  yearsOfExperience = 3
  location = "Bangalore"
  expectedSalary = 1200000
} | ConvertTo-Json)

# Create job
$job = Invoke-RestMethod -Method Post -Uri "$BASE/jobs" -ContentType "application/json" -Body (@{
  title = "Backend Engineer"
  requiredSkills = @(
    @{ name = "TypeScript"; priority = "must-have" },
    @{ name = "Node.js";    priority = "must-have" },
    @{ name = "Docker";     priority = "nice-to-have" }
  )
  minYearsExperience = 2
  location = "Pune"
  salaryRange = @{ min = 1000000; max = 1500000 }
  remoteAllowed = $true
} | ConvertTo-Json -Depth 5)

# Fetch
Invoke-RestMethod "$BASE/candidates/$($candidate.id)"
Invoke-RestMethod "$BASE/jobs/$($job.id)"

# Recommendations (pretty-print the JSON)
Invoke-RestMethod "$BASE/candidates/$($candidate.id)/recommendations?limit=5" | ConvertTo-Json -Depth 6
Invoke-RestMethod "$BASE/candidates/$($candidate.id)/recommendations?salaryWeight=50" | ConvertTo-Json -Depth 6

# Reverse view
Invoke-RestMethod "$BASE/jobs/$($job.id)/recommendations" | ConvertTo-Json -Depth 6
```

---

## 5. Checklist

Use this to confirm every requirement from the brief by hand:

- [ ] `POST /candidates` returns `201` with an `id`
- [ ] `POST /jobs` returns `201` with an `id`
- [ ] `GET /candidates/:id/recommendations` returns jobs sorted by `score` descending
- [ ] Every result has `score` in `0-100` and a 4-part `breakdown` with `score/max/detail`
- [ ] A job with a must-have skill the candidate lacks never appears
- [ ] A job with only unmatched nice-to-haves still appears (lower skills score)
- [ ] A candidate below `minYearsExperience` still appears with reduced experience points
- [ ] Exact location scores 15, remote scores 10, mismatch scores 0
- [ ] Salary far above job max scores 0 on salary; job min >= expectation scores 15
- [ ] `?limit=N` caps the list
- [ ] `?skillsWeight=...` etc. change `weights` in the response and each `max`
- [ ] `GET /jobs/:id/recommendations` returns ranked candidates
- [ ] Invalid input -> `400`, unknown id -> `404`
- [ ] `npm test` passes (47 tests)
- [ ] `docker compose up --build` starts API + Postgres
