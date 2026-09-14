/**
 * Generates job-match-api.postman_collection.json (Postman v2.1) with dummy data,
 * id-capturing scripts and assertions for every endpoint.
 *   node postman/generate.js
 */
const fs = require('fs');
const path = require('path');

const raw = (text) => ({ mode: 'raw', raw: text, options: { raw: { language: 'json' } } });
const url = (p, query) => {
  const u = { raw: '{{baseUrl}}' + p + (query ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : ''), host: ['{{baseUrl}}'], path: p.split('/').filter(Boolean) };
  if (query) u.query = query;
  return u;
};
const req = (name, method, p, { body, query, tests } = {}) => ({
  name,
  request: {
    method,
    header: body !== undefined ? [{ key: 'Content-Type', value: 'application/json' }] : [],
    ...(body !== undefined ? { body: raw(typeof body === 'string' ? body : JSON.stringify(body, null, 2)) } : {}),
    url: url(p, query),
  },
  ...(tests ? { event: [{ listen: 'test', script: { type: 'text/javascript', exec: tests } }] } : {}),
});

const status = (code) => `pm.test("status ${code}", () => pm.response.to.have.status(${code}));`;
const saveId = (v, label) => [
  status(201),
  'const b = pm.response.json();',
  'pm.test("has id", () => pm.expect(b.id).to.be.a("string"));',
  `pm.collectionVariables.set("${v}", b.id);`,
  `console.log("${label} id =", b.id);`,
];

const tsMust = [
  { name: 'TypeScript', priority: 'must-have' },
  { name: 'Node.js', priority: 'must-have' },
  { name: 'Docker', priority: 'nice-to-have' },
];

const candidates = [
  ['asha', 'Asha Verma', { name: 'Asha Verma', skills: ['TypeScript', 'Node.js', 'PostgreSQL'], yearsOfExperience: 3, location: 'Bangalore', expectedSalary: 1200000 }],
  ['ravi', 'Ravi Kumar', { name: 'Ravi Kumar', skills: ['TypeScript', 'Node.js', 'Docker', 'AWS'], yearsOfExperience: 7, location: 'Pune', expectedSalary: 2500000 }],
  ['meera', 'Meera Nair', { name: 'Meera Nair', skills: ['Python', 'Django', 'PostgreSQL'], yearsOfExperience: 5, location: 'Mumbai', expectedSalary: 1500000 }],
  ['junior', 'Dev Junior', { name: 'Dev Junior', skills: ['TypeScript', 'Node.js'], yearsOfExperience: 1, location: 'Pune', expectedSalary: 800000 }],
  ['fresher', 'Nikhil Fresher', { name: 'Nikhil Fresher', skills: ['JavaScript', 'React'], yearsOfExperience: 0, location: 'Delhi', expectedSalary: 500000 }],
];

const jobs = [
  ['backend', 'Backend Engineer', { title: 'Backend Engineer', requiredSkills: tsMust, minYearsExperience: 2, location: 'Pune', salaryRange: { min: 1000000, max: 1500000 }, remoteAllowed: true }],
  ['local', 'Local TS Engineer', { title: 'Local TS Engineer', requiredSkills: tsMust, minYearsExperience: 2, location: 'Bangalore', salaryRange: { min: 1000000, max: 1500000 }, remoteAllowed: false }],
  ['rust', 'Rust Developer', { title: 'Rust Developer', requiredSkills: [{ name: 'Rust', priority: 'must-have' }], minYearsExperience: 0, location: 'Bangalore', salaryRange: { min: 2000000, max: 3000000 }, remoteAllowed: true }],
  ['staff', 'Staff Engineer', { title: 'Staff Engineer', requiredSkills: [{ name: 'TypeScript', priority: 'must-have' }, { name: 'AWS', priority: 'nice-to-have' }], minYearsExperience: 6, location: 'Mumbai', salaryRange: { min: 600000, max: 900000 }, remoteAllowed: false }],
  ['python', 'Python Developer', { title: 'Python Developer', requiredSkills: [{ name: 'Python', priority: 'must-have' }, { name: 'Django', priority: 'nice-to-have' }, { name: 'PostgreSQL', priority: 'nice-to-have' }], minYearsExperience: 3, location: 'Mumbai', salaryRange: { min: 1400000, max: 2000000 }, remoteAllowed: false }],
  ['intern', 'Intern (any stack)', { title: 'Intern (any stack)', requiredSkills: [], minYearsExperience: 0, location: 'Delhi', salaryRange: { min: 300000, max: 600000 }, remoteAllowed: true }],
];

const recTests = (extra = []) => [
  status(200),
  'const b = pm.response.json();',
  'pm.test("has weights, count and recommendations", () => {',
  '  pm.expect(b.weights).to.have.all.keys("skills", "experience", "location", "salary");',
  '  pm.expect(b.count).to.equal(b.recommendations.length);',
  '});',
  'pm.test("scores are 0-100 and sorted descending", () => {',
  '  let prev = 101;',
  '  for (const r of b.recommendations) { pm.expect(r.score).to.be.within(0, 100); pm.expect(r.score).to.be.at.most(prev); prev = r.score; }',
  '});',
  'pm.test("every result has a 4-part breakdown", () => {',
  '  for (const r of b.recommendations) pm.expect(r.breakdown).to.have.all.keys("skills", "experience", "location", "salary");',
  '});',
  ...extra,
];

const collection = {
  info: {
    name: 'Job Match API',
    description:
      'Rule-based job recommendation API.\n\n' +
      'Run the folders top to bottom (or use the Collection Runner on the whole collection) - the "Seed" requests store ids in collection variables that later requests use.\n\n' +
      'Set `baseUrl` (default http://localhost:3000). Start the API with `npm run dev` or `docker compose up`.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000' },
    ...candidates.map(([k]) => ({ key: `${k}Id`, value: '' })),
    ...jobs.map(([k]) => ({ key: `${k}JobId`, value: '' })),
  ],
  item: [
    {
      name: '0. Health & index',
      item: [
        req('GET / (endpoint index)', 'GET', '/', { tests: [status(200), 'pm.test("lists endpoints", () => pm.expect(pm.response.json().endpoints).to.be.an("object"));'] }),
        req('GET /health', 'GET', '/health', { tests: [status(200), 'pm.test("status ok", () => pm.expect(pm.response.json().status).to.equal("ok"));'] }),
      ],
    },
    {
      name: '1. Seed candidates (POST /candidates)',
      item: candidates.map(([k, label, body]) => req(`Create ${label}`, 'POST', '/candidates', { body, tests: saveId(`${k}Id`, label) })),
    },
    {
      name: '2. Seed jobs (POST /jobs)',
      item: jobs.map(([k, label, body]) => req(`Create ${label}`, 'POST', '/jobs', { body, tests: saveId(`${k}JobId`, label) })),
    },
    {
      name: '3. Fetch by id',
      item: [
        req('GET /candidates/:id', 'GET', '/candidates/{{ashaId}}', { tests: [status(200), 'pm.test("returns Asha", () => pm.expect(pm.response.json().name).to.equal("Asha Verma"));'] }),
        req('GET /jobs/:id', 'GET', '/jobs/{{backendJobId}}', { tests: [status(200), 'pm.test("returns Backend Engineer", () => pm.expect(pm.response.json().title).to.equal("Backend Engineer"));'] }),
      ],
    },
    {
      name: '4. Recommendations for a candidate',
      item: [
        req('Asha - default weights', 'GET', '/candidates/{{ashaId}}/recommendations', {
          tests: recTests([
            'pm.test("Rust job is excluded (must-have filter)", () => pm.expect(b.recommendations.map(r => r.jobId)).to.not.include(pm.collectionVariables.get("rustJobId")));',
            'pm.test("Local TS Engineer ranks first with 86.4", () => { pm.expect(b.recommendations[0].title).to.equal("Local TS Engineer"); pm.expect(b.recommendations[0].score).to.equal(86.4); });',
            'pm.test("default weights are 50/20/15/15", () => pm.expect(b.weights).to.eql({ skills: 50, experience: 20, location: 15, salary: 15 }));',
          ]),
        }),
        req('Asha - limit=2', 'GET', '/candidates/{{ashaId}}/recommendations', {
          query: [{ key: 'limit', value: '2' }],
          tests: recTests(['pm.test("returns at most 2", () => pm.expect(b.recommendations.length).to.be.at.most(2));']),
        }),
        req('Asha - salaryWeight=50 (custom weights)', 'GET', '/candidates/{{ashaId}}/recommendations', {
          query: [{ key: 'salaryWeight', value: '50' }],
          tests: recTests([
            'pm.test("weights are re-normalised to 100", () => { const w = b.weights; pm.expect(Math.round(w.skills + w.experience + w.location + w.salary)).to.equal(100); pm.expect(w.salary).to.equal(37); });',
          ]),
        }),
        req('Asha - equal weights', 'GET', '/candidates/{{ashaId}}/recommendations', {
          query: [
            { key: 'skillsWeight', value: '1' },
            { key: 'experienceWeight', value: '1' },
            { key: 'locationWeight', value: '1' },
            { key: 'salaryWeight', value: '1' },
          ],
          tests: recTests(['pm.test("weights are 25 each", () => pm.expect(b.weights).to.eql({ skills: 25, experience: 25, location: 25, salary: 25 }));']),
        }),
        req('Fresher - only jobs with no must-haves', 'GET', '/candidates/{{fresherId}}/recommendations', {
          tests: recTests(['pm.test("only the Intern job", () => { pm.expect(b.count).to.equal(1); pm.expect(b.recommendations[0].title).to.equal("Intern (any stack)"); });']),
        }),
        req('Ravi - salary above every range', 'GET', '/candidates/{{raviId}}/recommendations', {
          tests: recTests(['pm.test("salary dimension is 0 on every job", () => { for (const r of b.recommendations) pm.expect(r.breakdown.salary.score).to.equal(0); });']),
        }),
      ],
    },
    {
      name: '5. Reverse view (GET /jobs/:id/recommendations)',
      item: [
        req('Backend Engineer - best candidates', 'GET', '/jobs/{{backendJobId}}/recommendations', {
          query: [{ key: 'limit', value: '5' }],
          tests: recTests([
            'pm.test("Ravi > Asha > Junior; Meera and Fresher excluded", () => pm.expect(b.recommendations.map(r => r.name)).to.eql(["Ravi Kumar", "Asha Verma", "Dev Junior"]));',
            'pm.test("Junior is penalised on experience, not excluded", () => pm.expect(b.recommendations[2].breakdown.experience.score).to.equal(10));',
          ]),
        }),
        req('Python Developer - only Meera qualifies', 'GET', '/jobs/{{pythonJobId}}/recommendations', {
          tests: recTests(['pm.test("only Meera", () => { pm.expect(b.count).to.equal(1); pm.expect(b.recommendations[0].name).to.equal("Meera Nair"); });']),
        }),
        req('Rust Developer - nobody qualifies', 'GET', '/jobs/{{rustJobId}}/recommendations', {
          tests: recTests(['pm.test("empty list", () => pm.expect(b.count).to.equal(0));']),
        }),
      ],
    },
    {
      name: '6. Error cases',
      item: [
        req('400 - invalid candidate body', 'POST', '/candidates', {
          body: { name: '', skills: 'not-a-list', yearsOfExperience: -1 },
          tests: [status(400), 'pm.test("field-level details", () => { const d = pm.response.json().details.map(x => x.path); pm.expect(d).to.include.members(["name", "skills", "yearsOfExperience", "location", "expectedSalary"]); });'],
        }),
        req('400 - inverted salary range + bad priority', 'POST', '/jobs', {
          body: { title: 'Bad Job', requiredSkills: [{ name: 'Go', priority: 'optional' }], minYearsExperience: 0, location: 'Pune', salaryRange: { min: 10, max: 5 }, remoteAllowed: false },
          tests: [status(400), 'pm.test("reports both problems", () => { const d = pm.response.json().details.map(x => x.path); pm.expect(d).to.include("salaryRange.max"); pm.expect(d).to.include("requiredSkills.0.priority"); });'],
        }),
        req('400 - malformed JSON', 'POST', '/candidates', {
          body: '{oops',
          tests: [status(400), 'pm.test("malformed JSON message", () => pm.expect(pm.response.json().error).to.equal("Malformed JSON body"));'],
        }),
        req('400 - limit=0', 'GET', '/candidates/{{ashaId}}/recommendations', { query: [{ key: 'limit', value: '0' }], tests: [status(400)] }),
        req('400 - limit=abc', 'GET', '/candidates/{{ashaId}}/recommendations', { query: [{ key: 'limit', value: 'abc' }], tests: [status(400)] }),
        req('400 - all-zero weights', 'GET', '/candidates/{{ashaId}}/recommendations', {
          query: [
            { key: 'skillsWeight', value: '0' },
            { key: 'experienceWeight', value: '0' },
            { key: 'locationWeight', value: '0' },
            { key: 'salaryWeight', value: '0' },
          ],
          tests: [status(400), 'pm.test("Invalid weights", () => pm.expect(pm.response.json().error).to.equal("Invalid weights"));'],
        }),
        req('404 - unknown candidate', 'GET', '/candidates/does-not-exist', { tests: [status(404)] }),
        req('404 - unknown candidate recommendations', 'GET', '/candidates/does-not-exist/recommendations', { tests: [status(404)] }),
        req('404 - unknown job', 'GET', '/jobs/does-not-exist', { tests: [status(404)] }),
        req('404 - unknown job recommendations', 'GET', '/jobs/does-not-exist/recommendations', { tests: [status(404)] }),
        req('404 - unknown route', 'GET', '/nothing-here', { tests: [status(404)] }),
      ],
    },
  ],
};

const environment = {
  name: 'Job Match API - local',
  values: [{ key: 'baseUrl', value: 'http://localhost:3000', enabled: true }],
  _postman_variable_scope: 'environment',
};

fs.writeFileSync(path.join(__dirname, 'job-match-api.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'local.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n');
console.log('folders:', collection.item.length, 'requests:', collection.item.reduce((n, f) => n + f.item.length, 0));
