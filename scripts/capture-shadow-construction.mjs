// Capture public construction information for the temporary offline audit.
import fs from 'node:fs';
import {normalizeConstruction,constructionFresh,workActive} from '../src/construction.mjs';
const response=await fetch('https://tpnco.blob.core.windows.net/blobfs/Todaywork.json',{signal:AbortSignal.timeout(20000),cache:'no-store'});
if(!response.ok)throw Error(`CONSTRUCTION_HTTP_${response.status}`);
const snapshot=normalizeConstruction(await response.json(),response.headers.get('last-modified'));
if(!constructionFresh(snapshot))throw Error('CONSTRUCTION_UNAVAILABLE');
const now=Date.now();snapshot.works=snapshot.works.filter(work=>workActive(work,now)&&work.impact!=='clear');
const file='data/processed/shadow-construction-snapshot.json';fs.mkdirSync('data/processed',{recursive:true});fs.writeFileSync(file,JSON.stringify(snapshot));
console.log(JSON.stringify({file,fetchedAt:snapshot.fetchedAt,sourceUpdatedAt:snapshot.sourceUpdatedAt,active:snapshot.works.length,unmapped:snapshot.works.filter(work=>!work.geometries.length).length}));
