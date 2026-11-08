import {formatDistance} from './data.js';
import {ChevronRight} from 'lucide-react';

export default function RouteChoice({number,distance,summary,selected,disabled,onClick}){
 return <button type="button" className="route-alternative route-choice" aria-pressed={selected} disabled={disabled} onClick={onClick}>
  <span className="route-choice__heading"><strong>路線 {number} · {Number.isFinite(distance)?formatDistance(distance):'距離未提供'}</strong><span className="route-choice__end">{selected&&<b className="route-choice__selected">已選</b>}<span className="route-choice__arrow" aria-hidden="true"><ChevronRight size={20}/></span></span></span>
  <span className="route-choice__line route-choice__strength"><b>優點</b><span>{summary.strength}</span></span>
  <span className="route-choice__line route-choice__concern"><b>留意</b><span>{summary.concern}</span></span>
 </button>;
}
