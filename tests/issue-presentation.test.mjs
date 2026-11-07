import test from 'node:test';
import assert from 'node:assert/strict';
import { groupVisibleIssues, hitIssueGroup, issueGroupLabel, routeIssueLabel } from '../src/issue-presentation.mjs';

test('screen groups retain all records and communicate the displayed point is representative', () => {
  const points=[{kind:2,x:1,y:1},{kind:0,x:2,y:1},{kind:2,x:3,y:1},{kind:3,x:100,y:1}];
  const groups=groupVisibleIssues(points,p=>p,50);
  assert.deepEqual(groups.map(g=>g.length),[3,1]);
  assert.equal(groups[0][0].kind,0);
  assert.match(issueGroupLabel(groups[0]),/活動區域高/);
  assert.match(issueGroupLabel(groups[0]),/活動區域低.*2筆/);
  assert.match(issueGroupLabel(groups[0]),/其中一筆位置/);
  assert.match(issueGroupLabel(groups[1]),/行穿線未設置路緣斜坡/);
});

test('hit testing selects the closest marker and leaves blank map space alone', () => {
  const groups=[{x:10,y:10},{x:20,y:10}];
  assert.equal(hitIssueGroup(groups,{x:18,y:10},12),groups[1]);
  assert.equal(hitIssueGroup(groups,{x:50,y:50},12),null);
});

test('route issue labels use recorded activity class and do not invent one', () => {
  assert.match(routeIssueLabel({label:'官方記錄：淨寬不足',activity:'活動區域分類-高'}),/活動區域分類：高/);
  assert.match(routeIssueLabel({label:'官方記錄：淨寬不足',activity:null}),/活動區域分類：未提供/);
  assert.match(routeIssueLabel({label:'官方記錄：淨寬不足'}),/實際關係未確認/);
});
