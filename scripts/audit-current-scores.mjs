import fs from 'node:fs';

const file = process.argv[2] || 'reports/current-conditions-test-20261108.json';
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const completed = report.rows.filter(row => row.complete);
const result = { pairs: report.rows.length, complete: completed.length, partial: report.rows.filter(row => row.partial && !row.complete).length, multiple: 0, candidates: 0, scoresCorrect: 0, rankedCorrect: 0, highestSelected: 0, conditionsAvailable: 0, withConditions: 0, failures: [] };
for (const row of completed) {
  const list = row.candidates || [];
  if (list.length > 1) result.multiple++;
  if (list.length && list.every((candidate, i) => !i || list[i - 1].score >= candidate.score)) result.rankedCorrect++;
  if (list.length && row.selected?.score === list[0].score) result.highestSelected++;
  const shortest = Math.min(...list.map(candidate => candidate.metrics.distanceMetres));
  for (const candidate of list) {
    result.candidates++;
    const m = candidate.metrics, d = m.distanceMetres;
    const count = m.officialConditionCount;
    if (count != null) result.conditionsAvailable++;
    if (count > 0) result.withConditions++;
    const raw = 40*m.explicitSidewalkMetres/d - 25*m.sharedMetres/d - 12*m.unknownMetres/d - 10*m.roughMetres/d - 15*m.estimatedMetres/d - 20*Math.max(0, d-shortest)/shortest - (count == null ? 0 : Math.min(20, 2*count));
    const expected = 100/(1+Math.exp(-raw/20));
    if (Number.isFinite(expected) && Math.abs(expected-candidate.score) < 1e-7) result.scoresCorrect++;
    else result.failures.push({start: row.start, end: row.end, id: candidate.id, expected, actual: candidate.score});
  }
}
console.log(JSON.stringify(result, null, 2));
if (result.scoresCorrect !== result.candidates || result.rankedCorrect !== result.complete || result.highestSelected !== result.complete) process.exitCode = 1;
