import test from 'node:test';
import assert from 'node:assert/strict';
import { matchStationLandmark } from '../src/search-station.mjs';
const station = {id:'w20-1',kind:'20',name:'芝山(R17)',lat:25.1028,lon:121.5287};
const landmark = {sourceId:'taipei-landmark',kind:'place',name:'芝山站',lat:25.10279,lon:121.52873};
test('exact nearby station landmark uses the official station record for exit selection', () => {
  assert.equal(matchStationLandmark(landmark,[station]),station);
});
test('similar names, distant locations and other sources are not promoted into stations', () => {
  for (const point of [
    {...landmark,name:'芝山站停車場'}, {...landmark,name:'芝山公園'},
    {...landmark,lat:25.2}, {...landmark,sourceId:'osm'}, {...landmark,lat:null},
  ]) assert.equal(matchStationLandmark(point,[station]),point);
});
