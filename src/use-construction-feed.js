import {useCallback,useEffect,useRef,useState} from 'react';
import {fetchConstruction} from './construction-client.mjs';
import {createConstructionFeed} from './construction-feed.mjs';

export function useConstructionFeed(enabled){
 const [state,setState]=useState({status:'idle',snapshot:null});
 const feedRef=useRef(null);
 const retry=useCallback(()=>{void feedRef.current?.refresh();},[]);
 useEffect(()=>{
  if(!enabled){setState({status:'idle',snapshot:null});return;}
  const feed=createConstructionFeed({fetchSnapshot:fetchConstruction,onState:setState});feedRef.current=feed;
  const refresh=()=>{if(document.visibilityState!=='hidden')void feed.refresh();};
  feed.start();window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
  return ()=>{window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);feed.stop();if(feedRef.current===feed)feedRef.current=null;};
 },[enabled]);
 return {...state,retry};
}
