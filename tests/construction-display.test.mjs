import test from 'node:test';
import assert from 'node:assert/strict';
import {groupConstructionNotices} from '../src/construction-display.mjs';

test('groups matching project notices before applying the display limit', () => {
  const base = {address:'施工', start:'2026/01/01', end:'2026/12/31', impact:'clear', plan:''};
  const records = Array.from({length: 8}, (_, i) => ({...base, id:`project-${i}`}));
  records.push({...base, id:'other-1', address:'另一工程'});
  const result = groupConstructionNotices(records, 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].count, 8);
  assert.equal(result[1].address, '另一工程');
  assert.equal(records.length, 9);
});

test('keeps differing impact or dates visible', () => {
  const base = {id:'project-1', address:'施工', start:'a', end:'b', impact:'clear'};
  assert.equal(groupConstructionNotices([base, {...base,id:'project-2',impact:'blocked'}, {...base,id:'project-3',end:'c'}]).length, 3);
});
