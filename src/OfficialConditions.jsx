import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle} from 'lucide-react';

// Request individual public record IDs only; do not send the route coordinates.
export default function OfficialConditions({conditions,onAvoid,avoiding}){
 const [expanded,setExpanded]=useState(false),[details,setDetails]=useState({}),[requested,setRequested]=useState([]);
 const points=conditions?.points||[],visible=expanded?points:points.slice(0,5);
 const ids=useMemo(()=>[...new Set([...visible.filter(p=>p.type==='missing_noCurbSlope').slice(0,40).map(p=>p.id),...requested])],[conditions,expanded,requested]);
 useEffect(()=>{
  setExpanded(false);setDetails({});setRequested([]);
 },[conditions]);
 useEffect(()=>{
  const controller=new AbortController();let cursor=0;
  async function worker(){while(cursor<ids.length){
   const id=ids[cursor++];
   try{const query=new URLSearchParams({type:'missing_noCurbSlope',id});const r=await fetch(`./api/official-condition-detail?${query}`,{signal:controller.signal});
    if(!r.ok)throw Error('detail');const data=await r.json();if(!controller.signal.aborted)setDetails(old=>({...old,[id]:data}));
   }catch{if(!controller.signal.aborted)setDetails(old=>({...old,[id]:{cause:null,error:true}}));}
  }}
  void Promise.all(Array.from({length:Math.min(4,ids.length)},worker));
  return ()=>controller.abort();
 },[ids]);
 if(conditions?.status==='unavailable')return <p className="quiet-note" role="note">官方不利通行資料暫時無法讀取，不能確認沿途是否有相關紀錄。</p>;
 if(conditions?.status!=='available'||!points.length)return null;
 return <section className="notice" aria-label="附近不利通行紀錄">
  <AlertTriangle aria-hidden="true"/><div>
   <p>路線 10 公尺內有 {points.length} 筆官方紀錄，地圖已標示。距離不代表同一側或仍存在。</p>
   <ul>{visible.map(p=>{const detail=details[p.id];return <li key={`${p.type}:${p.id}`}>
    <span>{p.type==='missing_noCurbSlope'?'淨寬不足':'行穿線未設路緣斜坡'}，距路線約 {Math.round(p.distanceMetres)} 公尺{p.type==='missing_noCurbSlope'?`；原因：${detail?(detail.error?'暫時無法取得':detail.cause||'未提供'):ids.includes(p.id)?'查詢中':'未查詢'}`:''}{detail?.activity?`；活動區域分類：${detail.activity}`:''}。</span>{' '}
    {p.type==='missing_noCurbSlope'&&!ids.includes(p.id)&&<><button type="button" className="text-button" onClick={()=>setRequested(old=>[...old,p.id])}>查詢原因</button>{' '}</>}
    <button type="button" className="secondary" disabled={avoiding} onClick={()=>onAvoid(p)}>嘗試繞過</button>
   </li>;})}</ul>
   {!expanded&&points.length>5&&<button type="button" className="text-button" onClick={()=>setExpanded(true)}>顯示其餘 {points.length-5} 筆</button>}
   {expanded&&points.filter(p=>p.type==='missing_noCurbSlope').length>40&&<p>詳細原因先自動查詢 40 筆；其餘可逐筆查詢。</p>}
  </div>
 </section>;
}
