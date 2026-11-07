import { REFERENCE_NOTICE, REFERENCE_STYLES, referenceMetric, referenceRouteDistance, referenceRouteLines } from './reference-route-presentation.mjs';
import './ReferenceRouteResult.css';

export default function ReferenceRouteResult({status,route,candidates=[],selected,onSelect,start,end,message,onClose,comparisonStatus}) {
 if(!status||status==='idle')return null;
 const choices=Array.isArray(candidates)?candidates.filter(candidate=>candidate?.id&&referenceRouteLines(candidate.route,{start,end}).length):[];
 const displayed=choices.find(candidate=>candidate.id===selected)?.route||route;
 const lines=status==='ready'?referenceRouteLines(displayed,{start,end}):[];
 return <section className="reference-route-result" aria-label="人行路線" role="status">
  <div className="reference-route-result__heading"><strong>人行路線</strong><button type="button" onClick={onClose}>關閉</button></div>
  {status==='loading'?<p>正在尋找路線…</p>:lines.length?<>
    <p>{REFERENCE_NOTICE}</p>
    {choices.map((candidate,index)=><button className="route-alternative" type="button" key={candidate.id} aria-pressed={selected===candidate.id} onClick={()=>onSelect(candidate)}><strong>路線 {index+1} · {referenceRouteDistance(candidate.route)||'距離未提供'} · {Number.isFinite(candidate.score)?`分數 ${candidate.score.toFixed(1)}`:'分數未提供'}</strong><span>一般人行道 {referenceMetric(candidate.coverage?.generalSidewalkMetres)}</span><span>資料未知 {referenceMetric(candidate.coverage?.unknownMetres)} · 起終點銜接 {referenceMetric(candidate.coverage?.estimatedApproachMetres)}</span></button>)}
    {comparisonStatus && comparisonStatus!=='complete' && <p>部分比較未完成。</p>}
    <div className="reference-route-result__legend" aria-label="線條說明">{[...new Set(lines.map(line=>line.kind))].map(kind=>{const style=REFERENCE_STYLES[kind];return <span key={kind}><svg width="42" height="14" aria-hidden="true"><line x1="1" y1="7" x2="41" y2="7" stroke={style.color} strokeWidth="5" strokeDasharray={style.dashArray}/></svg>{style.label}</span>;})}</div>
  </>:<p>{message||'暫時找不到路線。'}</p>}
 </section>;
}
