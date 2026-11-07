import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('public facility cleaning preserves source records and avoids false merges',()=>{
 const result=spawnSync('python',['tests/test_facility_cleaning.py'],{encoding:'utf8',env:{...process.env,PYTHONUTF8:'1'}});
 assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
});
