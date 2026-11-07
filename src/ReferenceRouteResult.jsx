import { REFERENCE_NOTICE, REFERENCE_STYLES, referenceRouteLines } from './reference-route-presentation.mjs';
import {TPColors} from './tp-colors.mjs';
import {describeRouteChoices} from './route-summary.mjs';
import RouteChoice from './RouteChoice.jsx';
import './ReferenceRouteResult.css';

export default function ReferenceRouteResult({status,route,candidates=[],selected,onSelect,start,end,message,onClose,comparisonStatus,showCandidates=true,showLegend=true,showSelectedNotice=true,showIssueIcons=true}) {
 if(!status||status==='idle')return null;
 const choices=Array.isArray(candidates)?candidates.filter(candidate=>candidate?.id&&referenceRouteLines(candidate.route,{start,end}).length):[];
 const summaries=describeRouteChoices(choices.map(candidate=>({candidate,source:'reference'})));
 const displayed=choices.find(candidate=>candidate.id===selected)?.route||route;
 const lines=status==='ready'?referenceRouteLines(displayed,{start,end}):[];
 if(status==='ready'&&lines.length&&!showCandidates&&!showSelectedNotice&&!showLegend&&(!comparisonStatus||comparisonStatus==='complete'))return null;
 return <section className={`reference-route-result${showCandidates?'':' reference-route-result--compact'}`} aria-label="替代路線" role="status">
  {(showCandidates||status!=='ready')&&<div className="reference-route-result__heading"><strong>{showCandidates?'替代路線':'路線資料'}</strong><button type="button" onClick={onClose}>關閉</button></div>}
  {status==='loading'?<p>正在尋找路線…</p>:lines.length?<>
    {showCandidates && summaries.some(summary=>summary.hasUnknown && !summary.concern.includes('資料不足')) && <p className="route-choice__note">部分路況資料不足</p>}
    {showCandidates && choices.map((candidate,index)=><RouteChoice key={candidate.id} number={index+1} distance={candidate.route.distanceMetres} summary={summaries[index]} selected={selected===candidate.id} onClick={()=>onSelect(candidate)}/>)}
    {comparisonStatus && comparisonStatus!=='complete' && <p>部分比較未完成。</p>}
    {(showSelectedNotice||showLegend) && <details className="route-disclosure"><summary>線條與路況說明</summary>
      {showSelectedNotice && <p>{REFERENCE_NOTICE}</p>}
      {showSelectedNotice && displayed?.segments?.some(segment=>segment.approximateCrossing===true) && <p>過街邊界未確認</p>}
      {showLegend && <div className="reference-route-result__legend" aria-label="線條說明">{[...new Set(lines.map(line=>line.kind))].map(kind=>{const style=REFERENCE_STYLES[kind];return <span key={kind}><svg width="42" height="14" aria-hidden="true"><line x1="1" y1="7" x2="41" y2="7" stroke={style.color} strokeWidth="5" strokeDasharray={style.dashArray}/></svg>{style.label}</span>;})}{displayed?.officialConditions?.status==='available'&&displayed.officialConditions.points?.length>0&&<span>{showIssueIcons && <i className="route-issue-legend" aria-hidden="true">!</i>}<svg width="42" height="14" aria-hidden="true"><line x1="1" y1="7" x2="41" y2="7" stroke={TPColors.red600} strokeWidth="4" strokeDasharray="3 4"/></svg>附近通行紀錄</span>}</div>}
    </details>}
  </>:<p>{message||'暫時找不到路線。'}</p>}
 </section>;
}
