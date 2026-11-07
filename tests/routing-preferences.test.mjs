import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRoutingPreferences} from '../src/routing-preferences.mjs';
import {edgeAllowed} from '../src/routing.mjs';

test('retired saved slope options cannot block unknown or steep routes',()=>{
 const old={mode:'gentle',maxSlope:5,knownOnly:true,minWidth:.9,largeText:true};
 const prefs=normalizeRoutingPreferences(old);
 const evidence={schemaVersion:2,coverage:1,maxUncoveredMetres:0,roadCrossingVerified:true,crossingCoverage:0};
 assert.deepEqual(prefs,{...old,mode:'balanced',maxSlope:1000000,knownOnly:false});
 assert.equal(edgeAllowed({highway:'footway',width:1,slope:null},prefs,evidence),true);
 assert.equal(edgeAllowed({highway:'footway',width:1,slope:12},prefs,evidence),true);
 assert.equal(edgeAllowed({highway:'footway',width:.6,slope:null},prefs,evidence),false);
 assert.equal(old.knownOnly,true);
});
test('keeps non-slope preferences including fewer crossings',()=>{
 const prefs=normalizeRoutingPreferences({mode:'crossings',minWidth:1.2,knownOnly:true});
 assert.equal(prefs.mode,'crossings');assert.equal(prefs.minWidth,1.2);assert.equal(prefs.knownOnly,false);
});
