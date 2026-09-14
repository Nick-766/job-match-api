#!/usr/bin/env bash
# Seeds dummy data and calls every endpoint of the Job Match API.
# Usage:  bash scripts/smoke.sh [BASE_URL]      (default http://localhost:3000)
# Needs: curl, node (for pretty-printing). Run from Git Bash / WSL / macOS / Linux.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
JSON='content-type: application/json'

# --- helpers -----------------------------------------------------------------
pp()   { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.stringify(JSON.parse(d),null,2))}catch{console.log(d)}})'; }
id()   { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).id))'; }
step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
call() { # call METHOD PATH [BODY]  -> pretty-printed body + status line
  local method=$1 path=$2 body=${3:-} out code
  printf '\033[2m%s %s\033[0m\n' "$method" "$path"
  if [ -n "$body" ]; then
    out=$(curl -s -w '\n%{http_code}' -X "$method" "$BASE$path" -H "$JSON" -d "$body")
  else
    out=$(curl -s -w '\n%{http_code}' -X "$method" "$BASE$path")
  fi
  code=${out##*$'\n'}
  printf '%s' "${out%$'\n'*}" | pp
  printf '[HTTP %s]\n' "$code"
}
post_id() { curl -s -X POST "$BASE$1" -H "$JSON" -d "$2" | id; }

# --- 1. index + health -------------------------------------------------------
step "GET /  (endpoint index)"
call GET /
step "GET /health"
call GET /health

# --- 2. candidates -----------------------------------------------------------
step "POST /candidates  (5 dummy candidates)"
ASHA=$(post_id /candidates '{"name":"Asha Verma","skills":["TypeScript","Node.js","PostgreSQL"],"yearsOfExperience":3,"location":"Bangalore","expectedSalary":1200000}')
RAVI=$(post_id /candidates '{"name":"Ravi Kumar","skills":["TypeScript","Node.js","Docker","AWS"],"yearsOfExperience":7,"location":"Pune","expectedSalary":2500000}')
MEERA=$(post_id /candidates '{"name":"Meera Nair","skills":["Python","Django","PostgreSQL"],"yearsOfExperience":5,"location":"Mumbai","expectedSalary":1500000}')
JUNIOR=$(post_id /candidates '{"name":"Dev Junior","skills":["TypeScript","Node.js"],"yearsOfExperience":1,"location":"Pune","expectedSalary":800000}')
FRESHER=$(post_id /candidates '{"name":"Nikhil Fresher","skills":["JavaScript","React"],"yearsOfExperience":0,"location":"Delhi","expectedSalary":500000}')
echo "ASHA    = $ASHA"
echo "RAVI    = $RAVI"
echo "MEERA   = $MEERA"
echo "JUNIOR  = $JUNIOR"
echo "FRESHER = $FRESHER"

step "GET /candidates/:id"
call GET "/candidates/$ASHA"

# --- 3. jobs -----------------------------------------------------------------
step "POST /jobs  (6 dummy jobs)"
BACKEND=$(post_id /jobs '{"title":"Backend Engineer","requiredSkills":[{"name":"TypeScript","priority":"must-have"},{"name":"Node.js","priority":"must-have"},{"name":"Docker","priority":"nice-to-have"}],"minYearsExperience":2,"location":"Pune","salaryRange":{"min":1000000,"max":1500000},"remoteAllowed":true}')
LOCAL=$(post_id /jobs '{"title":"Local TS Engineer","requiredSkills":[{"name":"TypeScript","priority":"must-have"},{"name":"Node.js","priority":"must-have"},{"name":"Docker","priority":"nice-to-have"}],"minYearsExperience":2,"location":"Bangalore","salaryRange":{"min":1000000,"max":1500000},"remoteAllowed":false}')
RUST=$(post_id /jobs '{"title":"Rust Developer","requiredSkills":[{"name":"Rust","priority":"must-have"}],"minYearsExperience":0,"location":"Bangalore","salaryRange":{"min":2000000,"max":3000000},"remoteAllowed":true}')
STAFF=$(post_id /jobs '{"title":"Staff Engineer","requiredSkills":[{"name":"TypeScript","priority":"must-have"},{"name":"AWS","priority":"nice-to-have"}],"minYearsExperience":6,"location":"Mumbai","salaryRange":{"min":600000,"max":900000},"remoteAllowed":false}')
PYTHON=$(post_id /jobs '{"title":"Python Developer","requiredSkills":[{"name":"Python","priority":"must-have"},{"name":"Django","priority":"nice-to-have"},{"name":"PostgreSQL","priority":"nice-to-have"}],"minYearsExperience":3,"location":"Mumbai","salaryRange":{"min":1400000,"max":2000000},"remoteAllowed":false}')
INTERN=$(post_id /jobs '{"title":"Intern (any stack)","requiredSkills":[],"minYearsExperience":0,"location":"Delhi","salaryRange":{"min":300000,"max":600000},"remoteAllowed":true}')
echo "BACKEND = $BACKEND"
echo "LOCAL   = $LOCAL"
echo "RUST    = $RUST"
echo "STAFF   = $STAFF"
echo "PYTHON  = $PYTHON"
echo "INTERN  = $INTERN"

step "GET /jobs/:id"
call GET "/jobs/$BACKEND"

# --- 4. recommendations for a candidate --------------------------------------
step "GET /candidates/:id/recommendations   (Asha - Rust job must be absent)"
call GET "/candidates/$ASHA/recommendations"

step "GET /candidates/:id/recommendations?limit=2"
call GET "/candidates/$ASHA/recommendations?limit=2"

step "GET /candidates/:id/recommendations?salaryWeight=50   (custom weights)"
call GET "/candidates/$ASHA/recommendations?salaryWeight=50"

step "GET /candidates/:id/recommendations   (Fresher - only jobs with no must-haves)"
call GET "/candidates/$FRESHER/recommendations"

# --- 5. reverse view ---------------------------------------------------------
step "GET /jobs/:id/recommendations   (best candidates for Backend Engineer)"
call GET "/jobs/$BACKEND/recommendations?limit=5"

step "GET /jobs/:id/recommendations   (Python job - only Meera qualifies)"
call GET "/jobs/$PYTHON/recommendations"

# --- 6. error cases ----------------------------------------------------------
step "400 - invalid candidate body"
call POST /candidates '{"name":"","skills":"nope","yearsOfExperience":-1}'

step "400 - inverted salary range + bad priority"
call POST /jobs '{"title":"Bad","requiredSkills":[{"name":"Go","priority":"optional"}],"minYearsExperience":0,"location":"Pune","salaryRange":{"min":10,"max":5},"remoteAllowed":false}'

step "400 - malformed JSON"
call POST /candidates '{oops'

step "400 - invalid limit"
call GET "/candidates/$ASHA/recommendations?limit=0"
call GET "/candidates/$ASHA/recommendations?limit=abc"

step "400 - all-zero weights"
call GET "/candidates/$ASHA/recommendations?skillsWeight=0&experienceWeight=0&locationWeight=0&salaryWeight=0"

step "404 - unknown ids / route"
call GET /candidates/does-not-exist
call GET /candidates/does-not-exist/recommendations
call GET /jobs/does-not-exist
call GET /jobs/does-not-exist/recommendations
call GET /nothing-here

printf '\n\033[1;32mDone.\033[0m\n'
