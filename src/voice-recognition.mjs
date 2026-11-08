const messages={'not-allowed':'麥克風權限未開啟，請在瀏覽器設定允許後重試。','service-not-allowed':'語音辨識服務無法使用，請使用鍵盤輸入。','audio-capture':'找不到可用的麥克風，請檢查裝置後重試。','no-speech':'沒有聽到聲音，請再試一次。','network':'語音服務無法連線，請檢查網路後重試。','aborted':'已停止語音輸入。'};
// Audio capture belongs to the browser and starts only on the user's action.
export function createVoiceRecognition({Recognition,onState=()=>{},onResult=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,timeoutMs=20000,startTimeoutMs=60000,resultTimeoutMs=8000}){
 let current=null,timer=null,disposed=false,stopped=false;
 const notify=(status,message='')=>{if(!disposed)onState({status,message});};
 function clear(){clearTimer(timer);timer=null;}
 function finish(session,status,message,abort=false){
  if(current!==session)return;current=null;clear();
  session.onstart=session.onspeechend=session.onresult=session.onerror=session.onend=null;
  if(abort)try{session.abort();}catch{}
  notify(status,message);
 }
 function arm(session,ms){clear();timer=setTimer(()=>finish(session,'error','語音輸入等候逾時，請再試一次。',true),ms);}
 function start(){
  if(disposed)return;
  if(current){stopped=true;notify('stopping','正在停止聆聽…');try{current.stop();}catch{finish(current,'idle','已停止語音輸入。',true);}return;}
  if(!Recognition){notify('error','此瀏覽器不支援語音辨識，請使用鍵盤的語音輸入。');return;}
  let session;try{session=new Recognition();}catch{notify('error','無法啟動語音輸入，請稍後重試。');return;}
  current=session;stopped=false;session.lang='zh-TW';session.continuous=false;session.interimResults=false;let received=false,speechEnded=false;
  session.onstart=()=>{if(current===session){arm(session,timeoutMs);notify('listening','正在聆聽，請說出地點。');}};
  session.onspeechend=()=>{
   if(current!==session||speechEnded||stopped)return;speechEnded=true;arm(session,resultTimeoutMs);notify('processing','正在辨識…');
   try{session.stop();}catch{/* Some browsers already stopped; wait for result or end. */}
  };
  session.onresult=e=>{
   if(current!==session)return;let text='';const results=e?.results;
   for(let i=Math.max(0,Number(e?.resultIndex)||0);i<(results?.length||0);i++)if(results[i]?.isFinal!==false)text+=(results[i]?.[0]?.transcript||'');
   text=text.trim().replace(/[。！？!?，,、；;：:\s]+$/u,'');if(text){received=true;onResult(text);finish(session,'idle','',true);}
  };
  session.onerror=e=>{if(current===session)finish(session,'error',messages[e?.error]||'語音輸入暫時無法使用，請重試或使用鍵盤輸入。',true);};
  session.onend=()=>{if(current===session)finish(session,'idle',received?'':stopped?'已停止語音輸入。':'沒有聽到地點，請再試一次。');};
  arm(session,startTimeoutMs);
  notify('starting','正在啟動語音輸入…');
  try{session.start();}catch{finish(session,'error','無法啟動語音輸入，請稍後重試。',true);}
 }
 function dispose(){disposed=true;const session=current;current=null;clear();if(session){session.onstart=session.onspeechend=session.onresult=session.onerror=session.onend=null;try{session.abort();}catch{}}}
 return {start,dispose};
}
