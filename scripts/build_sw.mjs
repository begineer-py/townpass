import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root = path.resolve("dist");
const files = fs
  .readdirSync(path.join(root, "assets"))
  .filter((f) => /\.(js|css)$/.test(f))
  .map((f) => "./assets/" + f);
const hash = crypto.createHash("sha256").update(files.join("|"));
for (const name of fs
  .readdirSync(path.join(root, "data"))
  .filter((n) => n.endsWith(".gz")))
  hash.update(fs.readFileSync(path.join(root, "data", name)));
for (const directory of ["sidewalk-tiles", "facility-tiles"]) {
  const tiles = path.join(root, "data", directory);
  if (!fs.existsSync(tiles)) continue;
  for (const name of fs.readdirSync(tiles).sort()) {
    hash.update(directory + "/" + name);
    hash.update(fs.readFileSync(path.join(tiles, name)));
  }
}
const version = hash.digest("hex").slice(0, 12);
const code = `const CACHE='hhz-${version}',SHELL=${JSON.stringify(["./", "./index.html", ...files])};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hhz-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
 if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match('./index.html')));return;}
 if(u.pathname.includes('/data/')||u.pathname.includes('/assets/')||u.pathname.includes('/metro-icons/'))e.respondWith(caches.open(CACHE).then(async c=>{const cached=await c.match(e.request);if(cached)return cached;const r=await fetch(e.request);if(r.ok){await c.put(e.request,r.clone());for(const [part,limit] of [['/addresses/',40],['/sidewalk-tiles/',80],['/facility-tiles/',80]])if(u.pathname.includes(part)&&!u.pathname.endsWith('/index.json')){const ks=(await c.keys()).filter(k=>k.url.includes(part)&&!k.url.endsWith('/index.json'));if(ks.length>limit)await c.delete(ks[0]);}}return r;}));
});`;
fs.writeFileSync(path.join(root, "sw.js"), code);
console.log("Offline shell generated:", version);
