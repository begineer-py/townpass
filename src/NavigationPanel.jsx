import {ArrowLeft,ArrowUp,CornerUpLeft,CornerUpRight,RotateCcw,Navigation,AlertTriangle,LoaderCircle,X} from 'lucide-react';
import {formatDistance} from './data.js';
import {estimatedWalkingMinutes} from './navigation-progress.mjs';
import './navigation-panel.css';

export function NavigationPrompt({progress,followState}){
 const turn=progress?.next?.step?.turn,Icon=turn==='左轉'?CornerUpLeft:turn==='右轉'?CornerUpRight:turn==='迴轉'?RotateCcw:ArrowUp;
 const status=followState?.message||(followState?.status==='replanning'?'正在重新規劃路線':followState?.status==='uncertain'?'定位不穩定，等待更新':'');
 return <div className="navigation-prompt" role="status"><Icon size={30} aria-hidden="true"/><div>
  <strong>{!progress?(followState?.status==='replanning'?'重新規劃中':status?'定位待更新':'正在定位…'):progress.arrived?'已抵達目的地':turn||'直行'}</strong>
  <span>{!progress?(status||'等待目前位置'):progress.arrived?'':progress.next?`${formatDistance(progress.next.distanceMetres)}後 · ${progress.next.step.name||'下一路段'}`:'沿路線前往目的地'}</span>
 </div></div>;
}
export default function NavigationPanel({stage,route,end,progress,followState,onBack,onStart,onEnd,reportOpen,onReport,constructionWorks=[],onAvoidConstruction,constructionDetourState,onCancelDetour}){
 const preview=stage==='preview',remaining=preview?(route?.distanceMetres??route?.distance):progress?.remainingMetres;
 const minutes=estimatedWalkingMinutes(remaining),arrival=minutes==null?null:new Date(Date.now()+minutes*60000).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'});
 return <section className="navigation-panel" aria-label={preview?'路線預覽':'導航中'}>
  <div className="navigation-panel__heading"><div><small>{preview?'路線預覽':'前往'}</small><h2>{end?.name||'目的地'}</h2></div><button type="button" className="navigation-icon-button" onClick={preview?onBack:onEnd} aria-label={preview?'返回路線選擇':'結束導航'}>{preview?<ArrowLeft size={22}/>:<X size={22}/>}</button></div>
  <div className="navigation-panel__metrics"><strong>{progress?.arrived&&!preview?'已抵達':minutes==null?'定位中':`約 ${minutes} 分鐘`}</strong>{Number.isFinite(remaining)&&!progress?.arrived&&<span>{formatDistance(remaining)}{arrival&&` · 約 ${arrival} 抵達`}</span>}</div>
  {!preview && followState?.message && <p className="navigation-panel__status" role="status">{followState.message}</p>}
  {!preview && !followState?.active && <p className="navigation-panel__status" role="status">定位未啟用，請重新開始導航。</p>}
  {reportOpen && <p className="navigation-panel__status" role="status">示意功能，未送出通報。</p>}
  {constructionDetourState?.status==='loading'&&<p className="navigation-panel__status" role="status"><LoaderCircle className="spin" size={18} aria-hidden="true"/> 正在尋找繞路… <button type="button" onClick={onCancelDetour}>取消</button></p>}
  {constructionDetourState?.status==='error'&&<p className="navigation-panel__status" role="status">{constructionDetourState.message}</p>}
  {preview&&route?.viaName&&<p className="navigation-panel__status">順路停靠的路線暫不支援導航。</p>}
  <div className="navigation-panel__actions">{preview?<><button type="button" className="navigation-secondary" onClick={onBack}>返回</button><button type="button" className="primary" disabled={!!route?.viaName||constructionDetourState?.status==='loading'} onClick={onStart}><Navigation size={19} aria-hidden="true"/>開始導航</button></>:<><button type="button" className="navigation-secondary" onClick={onReport}><AlertTriangle size={18} aria-hidden="true"/>通報 1999</button><button type="button" className="navigation-end" onClick={onEnd}>結束</button></>}</div>
  {constructionWorks.map(w=><button key={w.id} type="button" className="construction-avoid" disabled={constructionDetourState?.status==='loading'} onClick={()=>onAvoidConstruction(w.ids)}>繞過施工：{w.address}</button>)}
  {!preview&&!followState?.active&&<button type="button" className="navigation-retry" onClick={onStart}>重新開始導航</button>}
 </section>;
}
