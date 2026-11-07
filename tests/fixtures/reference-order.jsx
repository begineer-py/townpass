import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useReferenceComparison} from '../../src/use-reference-comparison.js';
import {ROUTING_POLICY} from '../../src/routing.mjs';

function Test(){
 const [start,setStart]=useState({lat:25,lon:121.5}),[end,setEnd]=useState({lat:25.001,lon:121.5}),[route,setRoute]=useState(null),[referenceState,setReferenceState]=useState({status:'idle'});
 const prefs=useRef({}).current,avoidPoints=useRef([]).current,referenceSnapshot=useRef(null),referenceAutoAttempt=useRef(null),request=useRef(1),manualRouteSelection=useRef(false),followSession=useRef(null),events=useRef([]);
 const referenceSearch=useRef({cancel(){events.current.push('cancel');}});
 const findReferenceRoute=()=>{events.current.push('start');referenceAutoAttempt.current=request.current;setReferenceState({status:'loading'});};
 useReferenceComparison({start,end,prefs,avoidPoints,tab:'plan',graphReady:true,routing:false,routeError:'',route,referenceState,referenceSearch,referenceSnapshot,setReferenceState,referenceAutoAttempt,request,manualRouteSelection,followSession,findReferenceRoute});
 return <main><button onClick={()=>{setStart({...start});setEnd({...end});setRoute({id:'baseline',policyVersion:ROUTING_POLICY,geometryVerification:'pedestrian-network-v1',tierSegments:[{sharedRoad:true,distance:10}]});}}>收到已解析起終點</button>
 <button onClick={()=>{setRoute({id:'improved'});setReferenceState({status:'ready'});}}>完成比較</button><p role="status">{referenceState.status} / {route?.id||'none'}</p><p aria-label="事件">{events.current.join(',')}</p></main>;
}
createRoot(document.getElementById('root')).render(<Test/>);
