const HOOKS=new Set(['userinfo','location','launch_map','phone_call','agree1999']);
export function sendToTownPass(name,data=null,timeout=15000){
 return new Promise(resolve=>{
  const bridge=globalThis.window?.flutterObject;
  if(!HOOKS.has(name)||!bridge?.postMessage)return resolve(null);
  let settled=false,timer,old,usingProperty=false;
  function done(value){if(settled)return;settled=true;clearTimeout(timer);try{if(usingProperty&&bridge.onmessage===handler)bridge.onmessage=old;else bridge.removeEventListener?.('message',handler);}catch{}resolve(value);}
  function handler(event){try{const p=typeof event.data==='string'?JSON.parse(event.data):event.data;if(p?.name===name)done(p.data??null);}catch{}}
  timer=setTimeout(()=>done(null),timeout);
  try{if(typeof bridge.addEventListener==='function')bridge.addEventListener('message',handler);else{old=bridge.onmessage;usingProperty=true;bridge.onmessage=handler;}bridge.postMessage(JSON.stringify({name,data}));}catch{done(null);}
 });
}
