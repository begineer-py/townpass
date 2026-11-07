import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('integrated data package is reproducible, verifies content, and rejects missing shards', () => {
  const base = mkdtempSync(join(tmpdir(), 'townpass-package-'));
  try {
    const input=join(base,'data'), output=join(base,'out.zip');
    mkdirSync(join(input,'addresses'),{recursive:true});
    for (const name of ['graph','facilities','sources','official-paths','metro','places'])
      writeFileSync(join(input,`${name}.json.gz`), `fixture-${name}`);
    writeFileSync(join(input,'address-index.json'),JSON.stringify([{file:'0123456789abcd'}]));
    writeFileSync(join(input,'addresses','0123456789abcd.json'),'[]');
    const run = (...args) => spawnSync('python',['scripts/package-integrated-data.py', ...args],{encoding:'utf8'});
    const a=run('--input',input,'--output',output);
    assert.equal(a.status,0,a.stderr);
    const first=JSON.parse(a.stdout);
    assert.equal(first.files,8);
    const b=run('--input',input,'--output',output);
    assert.equal(b.status,0,b.stderr);
    assert.equal(JSON.parse(b.stdout).sha256, first.sha256);
    assert.equal(run('--verify','--output',output).status,0);
    const modify=spawnSync('python',['-c','import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],"a") as z: z.writestr("extra", "bad")',output],{encoding:'utf8'});
    assert.equal(modify.status,0,modify.stderr);
    assert.notEqual(run('--verify','--output',output).status,0);
    rmSync(join(input,'addresses','0123456789abcd.json'));
    assert.notEqual(run('--input',input,'--output',output).status,0);
  } finally { rmSync(base,{recursive:true,force:true}); }
});
