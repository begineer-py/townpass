import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("service worker cache version changes when sidewalk index or tile changes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hhz-sw-"));
  const script = fileURLToPath(new URL("../scripts/build_sw.mjs", import.meta.url));
  const data = path.join(tmp, "dist", "data");
  const tiles = path.join(data, "sidewalk-tiles");
  try {
    fs.mkdirSync(tiles, {recursive:true});
    fs.mkdirSync(path.join(tmp, "dist", "assets"));
    fs.writeFileSync(path.join(data, "graph.json.gz"), "graph");
    fs.writeFileSync(path.join(tiles, "index.json"), "index-1");
    fs.writeFileSync(path.join(tiles, "tile.json.gz"), "tile-1");
    const build = () => {
      execFileSync(process.execPath, [script], {cwd:tmp});
      return fs.readFileSync(path.join(tmp, "dist", "sw.js"), "utf8").match(/CACHE='([^']+)'/)[1];
    };
    const first = build();
    fs.writeFileSync(path.join(tiles, "tile.json.gz"), "tile-2");
    const second = build();
    assert.notEqual(second, first);
    fs.writeFileSync(path.join(tiles, "index.json"), "index-2");
    const third = build();
    assert.notEqual(third, second);
    const facilities = path.join(data, "facility-tiles");
    fs.mkdirSync(facilities);
    fs.writeFileSync(path.join(facilities, "index.json"), "facility-1");
    const fourth = build();
    assert.notEqual(fourth, third);
    fs.writeFileSync(path.join(facilities, "tile.json.gz"), "facility-tile-1");
    assert.notEqual(build(), fourth);
  } finally {
    fs.rmSync(tmp, {recursive:true, force:true});
  }
});
