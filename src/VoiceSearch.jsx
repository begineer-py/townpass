import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
// 搜尋框旁的麥克風按鈕。畫面上只有圖示；狀態只給螢幕報讀器唸。
// 隱私說明（辨識可能由瀏覽器的線上語音服務處理）放在「關於服務」。
export default function VoiceSearch({ onResult }) {
  const engine = useRef(null);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState('');
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  useEffect(() => () => { const r=engine.current; engine.current=null; r?.abort(); }, []);
  if (!Recognition) return null;
  function start() {
    if (engine.current) { engine.current.stop(); return; }
    window.speechSynthesis?.cancel();
    const r = new Recognition(); engine.current = r;
    r.lang='zh-TW'; r.continuous=false; r.interimResults=false;
    r.onstart=()=>{if(engine.current===r){setListening(true);setMessage('正在聽，請說出地點名稱。');}};
    r.onresult=e=>{if(engine.current!==r)return; const text=e.results[e.resultIndex]?.[0]?.transcript?.trim(); if(text){onResult(text);setMessage(`聽到「${text}」，請從搜尋結果選擇地點。`);}};
    r.onerror=e=>{if(engine.current!==r)return;setMessage(e.error==='not-allowed'||e.error==='service-not-allowed'?'麥克風尚未開放，可以直接輸入地點。':e.error==='no-speech'?'這次沒聽清楚，可以再說一次。':'語音暫時無法使用，可以改用文字搜尋。');};
    r.onend=()=>{if(engine.current===r){engine.current=null;setListening(false);setMessage(v=>v==='正在聽，請說出地點名稱。'?'已停止聆聽。':v);}};
    try{r.start();}catch{engine.current=null;setListening(false);setMessage('語音暫時無法啟動，請稍後再試。');}
  }
  return <>
    <button type="button" className={`voice-button${listening ? ' listening' : ''}`} onClick={start} aria-pressed={listening} aria-label={listening ? '停止語音輸入' : '用語音輸入地點'}>
      {listening ? <Square size={18} aria-hidden="true"/> : <Mic size={20} aria-hidden="true"/>}
    </button>
    <span className="sr-only" role="status" aria-live="polite">{message}</span>
  </>;
}
