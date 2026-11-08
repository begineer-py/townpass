import {useEffect,useRef,useState} from 'react';
import {Mic,Square} from 'lucide-react';
import {createVoiceRecognition} from './voice-recognition.mjs';

export default function VoiceSearch({onResult,onStatus=()=>{}}){
 const [state,setState]=useState({status:'idle'}),engine=useRef(null),callbacks=useRef(null);
 callbacks.current={onResult,onStatus};
 useEffect(()=>{
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const controller=createVoiceRecognition({Recognition,onState:s=>{setState(s);callbacks.current.onStatus(s.message);},onResult:text=>callbacks.current.onResult(text)});
  engine.current=controller;return ()=>{engine.current=null;controller.dispose();};
 },[]);
 const active=['starting','listening','processing','stopping'].includes(state.status);
 return <button type="button" className={`voice-button${active?' listening':''}`} onClick={()=>{window.speechSynthesis?.cancel();engine.current?.start();}} aria-pressed={active} aria-label={active?'停止語音輸入':'用語音輸入地點'}>
  {active?<Square size={18} aria-hidden="true"/>:<Mic size={20} aria-hidden="true"/>}
 </button>;
}
