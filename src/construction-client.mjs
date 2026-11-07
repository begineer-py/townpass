import {constructionFresh} from './construction.mjs';
export async function fetchConstruction(signal){
 try{const r=await fetch('./api/construction',{signal,cache:'no-store'});if(!r.ok)return {error:'CONSTRUCTION_UNAVAILABLE'};const snapshot=await r.json();return constructionFresh(snapshot)?snapshot:{error:'CONSTRUCTION_UNAVAILABLE'};}
 catch{return {error:'CONSTRUCTION_UNAVAILABLE'};}
}
