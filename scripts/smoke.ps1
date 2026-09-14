# Seeds dummy data and calls every endpoint of the Job Match API.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1 [-Base http://localhost:3000]
param([string]$Base = "http://localhost:3000")

$ErrorActionPreference = "Stop"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Show($obj) { $obj | ConvertTo-Json -Depth 8 }
function Call($Method, $Path, $Body = $null) {
  Write-Host "$Method $Path" -ForegroundColor DarkGray
  try {
    if ($null -ne $Body) {
      $r = Invoke-WebRequest -Method $Method -Uri "$Base$Path" -ContentType "application/json" -Body $Body -UseBasicParsing
    } else {
      $r = Invoke-WebRequest -Method $Method -Uri "$Base$Path" -UseBasicParsing
    }
    Write-Host "[HTTP $($r.StatusCode)]"
    try { Show ($r.Content | ConvertFrom-Json) } catch { $r.Content }
  } catch {
    $resp = $_.Exception.Response
    $code = [int]$resp.StatusCode
    $body = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd()
    Write-Host "[HTTP $code]" -ForegroundColor Yellow
    try { Show ($body | ConvertFrom-Json) } catch { $body }
  }
}
function PostId($Path, $Obj) {
  (Invoke-RestMethod -Method Post -Uri "$Base$Path" -ContentType "application/json" -Body ($Obj | ConvertTo-Json -Depth 5)).id
}

# --- 1. index + health -------------------------------------------------------
Step "GET /  (endpoint index)";  Call GET "/"
Step "GET /health";              Call GET "/health"

# --- 2. candidates -----------------------------------------------------------
Step "POST /candidates  (5 dummy candidates)"
$ASHA    = PostId "/candidates" @{ name="Asha Verma";     skills=@("TypeScript","Node.js","PostgreSQL");   yearsOfExperience=3; location="Bangalore"; expectedSalary=1200000 }
$RAVI    = PostId "/candidates" @{ name="Ravi Kumar";     skills=@("TypeScript","Node.js","Docker","AWS"); yearsOfExperience=7; location="Pune";      expectedSalary=2500000 }
$MEERA   = PostId "/candidates" @{ name="Meera Nair";     skills=@("Python","Django","PostgreSQL");        yearsOfExperience=5; location="Mumbai";    expectedSalary=1500000 }
$JUNIOR  = PostId "/candidates" @{ name="Dev Junior";     skills=@("TypeScript","Node.js");                yearsOfExperience=1; location="Pune";      expectedSalary=800000 }
$FRESHER = PostId "/candidates" @{ name="Nikhil Fresher"; skills=@("JavaScript","React");                  yearsOfExperience=0; location="Delhi";     expectedSalary=500000 }
"ASHA    = $ASHA"; "RAVI    = $RAVI"; "MEERA   = $MEERA"; "JUNIOR  = $JUNIOR"; "FRESHER = $FRESHER"

Step "GET /candidates/:id"; Call GET "/candidates/$ASHA"

# --- 3. jobs -----------------------------------------------------------------
Step "POST /jobs  (6 dummy jobs)"
$tsMust = @(@{name="TypeScript";priority="must-have"}, @{name="Node.js";priority="must-have"}, @{name="Docker";priority="nice-to-have"})
$BACKEND = PostId "/jobs" @{ title="Backend Engineer";   requiredSkills=$tsMust; minYearsExperience=2; location="Pune";      salaryRange=@{min=1000000;max=1500000}; remoteAllowed=$true }
$LOCAL   = PostId "/jobs" @{ title="Local TS Engineer";  requiredSkills=$tsMust; minYearsExperience=2; location="Bangalore"; salaryRange=@{min=1000000;max=1500000}; remoteAllowed=$false }
$RUST    = PostId "/jobs" @{ title="Rust Developer";     requiredSkills=@(@{name="Rust";priority="must-have"}); minYearsExperience=0; location="Bangalore"; salaryRange=@{min=2000000;max=3000000}; remoteAllowed=$true }
$STAFF   = PostId "/jobs" @{ title="Staff Engineer";     requiredSkills=@(@{name="TypeScript";priority="must-have"}, @{name="AWS";priority="nice-to-have"}); minYearsExperience=6; location="Mumbai"; salaryRange=@{min=600000;max=900000}; remoteAllowed=$false }
$PYTHON  = PostId "/jobs" @{ title="Python Developer";   requiredSkills=@(@{name="Python";priority="must-have"}, @{name="Django";priority="nice-to-have"}, @{name="PostgreSQL";priority="nice-to-have"}); minYearsExperience=3; location="Mumbai"; salaryRange=@{min=1400000;max=2000000}; remoteAllowed=$false }
$INTERN  = PostId "/jobs" @{ title="Intern (any stack)"; requiredSkills=@(); minYearsExperience=0; location="Delhi"; salaryRange=@{min=300000;max=600000}; remoteAllowed=$true }
"BACKEND = $BACKEND"; "LOCAL   = $LOCAL"; "RUST    = $RUST"; "STAFF   = $STAFF"; "PYTHON  = $PYTHON"; "INTERN  = $INTERN"

Step "GET /jobs/:id"; Call GET "/jobs/$BACKEND"

# --- 4. recommendations for a candidate --------------------------------------
Step "GET /candidates/:id/recommendations   (Asha - Rust job must be absent)"
Call GET "/candidates/$ASHA/recommendations"
Step "GET /candidates/:id/recommendations?limit=2"
Call GET "/candidates/$ASHA/recommendations?limit=2"
Step "GET /candidates/:id/recommendations?salaryWeight=50   (custom weights)"
Call GET "/candidates/$ASHA/recommendations?salaryWeight=50"
Step "GET /candidates/:id/recommendations   (Fresher - only jobs with no must-haves)"
Call GET "/candidates/$FRESHER/recommendations"

# --- 5. reverse view ---------------------------------------------------------
Step "GET /jobs/:id/recommendations   (best candidates for Backend Engineer)"
Call GET "/jobs/$BACKEND/recommendations?limit=5"
Step "GET /jobs/:id/recommendations   (Python job - only Meera qualifies)"
Call GET "/jobs/$PYTHON/recommendations"

# --- 6. error cases ----------------------------------------------------------
Step "400 - invalid candidate body"
Call POST "/candidates" '{"name":"","skills":"nope","yearsOfExperience":-1}'
Step "400 - inverted salary range + bad priority"
Call POST "/jobs" '{"title":"Bad","requiredSkills":[{"name":"Go","priority":"optional"}],"minYearsExperience":0,"location":"Pune","salaryRange":{"min":10,"max":5},"remoteAllowed":false}'
Step "400 - malformed JSON"
Call POST "/candidates" '{oops'
Step "400 - invalid limit"
Call GET "/candidates/$ASHA/recommendations?limit=0"
Call GET "/candidates/$ASHA/recommendations?limit=abc"
Step "400 - all-zero weights"
Call GET "/candidates/$ASHA/recommendations?skillsWeight=0&experienceWeight=0&locationWeight=0&salaryWeight=0"
Step "404 - unknown ids / route"
Call GET "/candidates/does-not-exist"
Call GET "/candidates/does-not-exist/recommendations"
Call GET "/jobs/does-not-exist"
Call GET "/jobs/does-not-exist/recommendations"
Call GET "/nothing-here"

Write-Host "`nDone." -ForegroundColor Green
