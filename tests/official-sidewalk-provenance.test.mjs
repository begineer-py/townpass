import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeDisplayLines,parseSidewalkProvenance,sourceMetadata} from '../src/official-sidewalk-provenance.mjs';
import {decodeSidewalks} from '../src/official-sidewalks.mjs';

test('preserves source IDs, branch order and unrounded coordinate tokens',()=>{
 const payload={code:'101',data:[{qgs_fid:'42',STAsText:'MULTILINESTRING ((306702.04900 2771290.067700, 306704.9381 2771290.3954), (306710 2771300, 306712 2771302))'},{qgs_fid:'99',STAsText:'MULTILINESTRING ((306800 2771400, 306801 2771401))'}]};
 assert.deepEqual(parseSidewalkProvenance(payload),[
  {sourceId:'42',partIndex:0,coordinates:[['306702.04900','2771290.067700'],['306704.9381','2771290.3954']]},
  {sourceId:'42',partIndex:1,coordinates:[['306710','2771300'],['306712','2771302']]},
  {sourceId:'99',partIndex:0,coordinates:[['306800','2771400'],['306801','2771401']]},
 ]);
});
test('display loader retains sidecar source and branch order',()=>{
 const parts=parseSidewalkProvenance({code:'101',data:[{qgs_fid:'7',STAsText:'MULTILINESTRING ((306702 2771290,306704 2771291),(306710 2771300,306711 2771301))'}]});
 const lines=encodeDisplayLines(parts,([x,y])=>[x/2500,y/110000]);
 const decoded=decodeSidewalks({scale:1e6,lines});
 assert.equal(decoded.length,2);assert.deepEqual(parts.map(p=>[p.sourceId,p.partIndex]),[['7',0],['7',1]]);
 assert.equal(decoded[0].latLngs[0][1],122.6808);assert.equal(decoded[1].latLngs[0][1],122.684);
});
test('rejects missing or duplicate IDs, invalid parts and malformed coordinates',()=>{
 const line='MULTILINESTRING ((306702 2771290,306704 2771292))';
 for(const data of [[{STAsText:line}],[{qgs_fid:'1',STAsText:line},{qgs_fid:'1',STAsText:line}],[{qgs_fid:'2',STAsText:'MULTILINESTRING ((306702 2771290), (306704 2771292,306705 2771293))'}],[{qgs_fid:'2',STAsText:'MULTILINESTRING ((306702 BAD,306704 2771292))'}],[{qgs_fid:'2',STAsText:'MULTILINESTRING ((306702 2771290) garbage (306704 2771292))'}]])assert.throws(()=>parseSidewalkProvenance({code:'101',data}));
});
test('local input is not represented as an official verified fetch',()=>{
 const local=sourceMetadata({expectedSource:'https://example.test/api',sourceSha256:'abc',capturedAt:'2026-11-07T12:00:00Z',localInput:true});
 assert.equal(local.source,null);assert.equal(local.sourceVerified,false);assert.equal(local.sourceKind,'local-input');assert.equal(local.capturedAt,null);assert.equal(local.expectedSource,'https://example.test/api');assert.equal(local.sourceSha256,'abc');
 const live=sourceMetadata({expectedSource:'https://example.test/api',sourceSha256:'abc',capturedAt:'2026-11-07T12:00:00Z',localInput:false});
 assert.equal(live.source,'https://example.test/api');assert.equal(live.sourceVerified,true);assert.equal(live.capturedAt,'2026-11-07T12:00:00Z');
});
