import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import VoiceSearch from '../../src/VoiceSearch.jsx';
class MockRecognition{
 start(){this.onstart?.();queueMicrotask(()=>{this.onresult?.({resultIndex:0,results:[Object.assign([{transcript:'臺北車站'}],{isFinal:true})]});this.onend?.();});}
 stop(){this.onend?.();} abort(){}
}
window.SpeechRecognition=MockRecognition;
function Fixture(){const [query,setQuery]=useState(''),[message,setMessage]=useState('');return <main><input aria-label="搜尋地點" value={query} onChange={e=>setQuery(e.target.value)}/><VoiceSearch onResult={setQuery} onStatus={setMessage}/><p role="status">{message}</p></main>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
