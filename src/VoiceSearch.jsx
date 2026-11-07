import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
export default function VoiceSearch({ onResult }) {
  const engine = useRef(null);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState('');
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  useEffect(() => () => { const r=engine.current; engine.current=null; r?.abort(); }, []);
  function start() {
    if (engine.current) { engine.current.stop(); return; }
    window.speechSynthesis?.cancel();
    const r = new Recognition(); engine.current = r;
    r.lang='zh-TW'; r.continuous=false; r.interimResults=false;
    r.onstart=()=>{if(engine.current===r){setListening(true);setMessage('正在聽，請說出地點名稱。');}};
    r.onresult=e=>{if(engine.current!==r)return; const text=e.results[e.resultIndex]?.[0]?.transcript?.trim(); if(text){onResult(text);setMessage(`聽到「${text}」，請從搜尋結果選擇地點。`);}};
    r.onerror=e=>{if(engine.current!==r)return;setMessage(e.error==='not-allowed'||e.error==='service-not-allowed'?'麥克風尚未開放。也可以使用鍵盤的語音輸入，或直接輸入地點。':e.error==='no-speech'?'這次沒聽清楚，準備好後可以再說一次。':'語音暫時無法使用，可以改用鍵盤語音或文字搜尋。');};
    r.onend=()=>{if(engine.current===r){engine.current=null;setListening(false);setMessage(v=>v==='正在聽，請說出地點名稱。'?'已停止聆聽，可以再試一次。':v);}};
    try{r.start();}catch{engine.current=null;setListening(false);setMessage('語音暫時無法啟動，請稍後再試。');}
  }
  return <div className="voice-search">
    {Recognition?<button className="secondary" onClick={start} aria-pressed={listening}>{listening?<Square size={18} aria-hidden="true"/>:<Mic size={18} aria-hidden="true"/>}{listening?'停止聆聽':'說出地點'}</button>:<p>這個瀏覽器尚不支援語音搜尋，可使用鍵盤上的麥克風輸入。</p>}
    <p className="quiet-note">按下後才會使用麥克風；辨識可能由瀏覽器的線上語音服務處理。本服務不儲存錄音。</p>
    <p role="status" aria-live="polite">{message}</p>
  </div>;
}
