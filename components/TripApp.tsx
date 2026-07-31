'use client';

import {useEffect,useMemo,useState} from 'react';
import {buildAssistantState,estimatedItemDuration,findNearbyPlaces,findSuggestionCandidates,inferItemType,isFixedItem,placeOpenStatus} from '@/lib/assistant';
import {checkItineraryHours} from '@/lib/place-hours';
import {areaOptions,suggestedAreaNames,suggestPlaceArea} from '@/lib/place-areas';
import {analyzeDayRoute,boardPlace,buildGoogleMapsDayRoute,dayRouteStops,placeArea,routeOrderChanged,suggestDayOrder} from '@/lib/board-planner';
import {deleteReservationAttachment,listReservationAttachments,saveReservationAttachment} from '@/lib/attachments';
import type {ReservationAttachment} from '@/lib/attachments';
import type {ItineraryHoursCheck} from '@/lib/place-hours';
import type {AssistantLocation,AssistantState,SuggestedPlace} from '@/lib/assistant';
import type {ItineraryItem,Place,TripState,Weekday} from '@/lib/types';

const tabs=['Today','Assistant','Nearby','Board','Itinerary','Reservations','Food','Places','Hours','Checklist'] as const;
type Tab=(typeof tabs)[number];
const navGroups=[
 {label:'Today',tabs:['Today','Assistant'] as Tab[]},
 {label:'Plan',tabs:['Board','Itinerary','Reservations'] as Tab[]},
 {label:'Explore',tabs:['Nearby','Places','Hours'] as Tab[]},
 {label:'Food',tabs:['Food'] as Tab[]},
 {label:'Checklist',tabs:['Checklist'] as Tab[]}
] as const;
type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};

type EditableKey='time'|'title'|'details'|'destination'|'routeText'|'keyInfo'|'userNotes'|'optional'|'fixed'|'type'|'estimatedDuration'|'travelMinutes'|'prepBuffer'|'placeId';
type EditableValue=string|boolean|number|undefined;
const localStateKey='trip-state';
const pendingSyncKey='trip-state-pending-sync';
const offlineReadyKey='trip-offline-ready-v2';
const boardHiddenDaysKey='trip-board-hidden-days-v1';

function readLocalState(){
 try{
  const value=localStorage.getItem(localStateKey);
  return value?JSON.parse(value) as TripState:null;
 }catch{return null;}
}

async function pushCloudState(next:TripState){
 const response=await fetch('/api/state',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(next)});
 if(!response.ok)return false;
 const result=await response.json();
 return Boolean(result.cloud);
}

function activeDayIndex(days:TripState['days']){
 const today=new Date();
 const local=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
 const exact=days.findIndex(day=>day.date===local);
 if(exact>=0)return exact;
 const future=days.findIndex(day=>day.date>local);
 return future>=0?future:days.length-1;
}

function placeMatchesDay(place:Place,city:string,date:string){
 if(place.recommendedDates?.length)return place.recommendedDates.includes(date);
 if(city.includes('Toronto'))return place.region==='Toronto';
 if(city.includes('Buffalo')||city.includes('Niagara'))return place.region==='Niagara & Buffalo';
 return true;
}

function timeValue(value:string){
 const match=value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
 if(!match)return 9999;
 let hour=Number(match[1]);
 const minute=Number(match[2]??0);
 const suffix=match[3]?.toUpperCase();
 if(suffix==='PM'&&hour<12)hour+=12;
 if(suffix==='AM'&&hour===12)hour=0;
 return hour*60+minute;
}

function sortItems(items:ItineraryItem[]){return [...items].sort((a,b)=>timeValue(a.time)-timeValue(b.time));}
function mapsUrl(destination:string){return destination.trim()?`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination.trim())}&travelmode=transit`:'';}

export default function TripApp(){
 const [state,setState]=useState<TripState|null>(null);
 const [tab,setTab]=useState<Tab>('Today');
 const [cloud,setCloud]=useState(false);
 const [query,setQuery]=useState('');
 const [region,setRegion]=useState('All');
 const [area,setArea]=useState('All');
 const [category,setCategory]=useState('All');
 const [priority,setPriority]=useState('All');
 const [showVisited,setShowVisited]=useState(true);
 const [now,setNow]=useState(()=>new Date());
 const [online,setOnline]=useState(()=>typeof navigator==='undefined'||navigator.onLine);
 const [pendingSync,setPendingSync]=useState(false);
 const [offlineReady,setOfflineReady]=useState(false);
 const [offlineDownloading,setOfflineDownloading]=useState(false);
 const [offlineMessage,setOfflineMessage]=useState('');
 const [installPrompt,setInstallPrompt]=useState<InstallPromptEvent|null>(null);
 const [boardUndo,setBoardUndo]=useState<TripState|null>(null);
 const [liveLocation,setLiveLocation]=useState<AssistantLocation|null>(null);
 const [locationStatus,setLocationStatus]=useState<'idle'|'requesting'|'active'|'error'>('idle');
 const [locationMessage,setLocationMessage]=useState('');

 useEffect(()=>{
  let active=true;
  const local=readLocalState();
  const hasPending=localStorage.getItem(pendingSyncKey)==='true';
  setPendingSync(hasPending);
  setOfflineReady(localStorage.getItem(offlineReadyKey)==='true');
  void fetch('/api/state').then(async response=>{
   if(!response.ok)throw new Error('Trip state unavailable');
   const result=await response.json();
   if(!active)return;
   const selected=hasPending&&local?local:result.state;
   setState(selected);
   setCloud(Boolean(result.cloud));
   localStorage.setItem(localStateKey,JSON.stringify(selected));
   if(hasPending&&local&&navigator.onLine){
    const synced=await pushCloudState(local);
    if(active&&synced){
     localStorage.removeItem(pendingSyncKey);
     setPendingSync(false);
     setCloud(true);
    }
   }
  }).catch(()=>{
   if(active&&local)setState(local);
  });
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  if(!('serviceWorker'in navigator))return;
  void navigator.serviceWorker.register('/sw.js');
  const handleMessage=(event:MessageEvent<{type?:string;message?:string}>)=>{
   if(event.data?.type==='TRIP_CACHED'){
    localStorage.setItem(offlineReadyKey,'true');
    setOfflineReady(true);
    setOfflineDownloading(false);
    setOfflineMessage('Offline copy updated.');
   }
   if(event.data?.type==='TRIP_CACHE_FAILED'){
    setOfflineDownloading(false);
    setOfflineMessage(event.data.message??'Offline download failed. Please try again.');
   }
  };
  navigator.serviceWorker.addEventListener('message',handleMessage);
  return()=>navigator.serviceWorker.removeEventListener('message',handleMessage);
 },[]);
 useEffect(()=>{
  const handleOnline=async()=>{
   setOnline(true);
   const local=readLocalState();
   if(localStorage.getItem(pendingSyncKey)==='true'&&local){
    try{
     const synced=await pushCloudState(local);
     if(synced){
      localStorage.removeItem(pendingSyncKey);
      setPendingSync(false);
      setCloud(true);
     }
    }catch{}
   }
  };
  const handleOffline=()=>setOnline(false);
  const handleInstall=(event:Event)=>{
   event.preventDefault();
   setInstallPrompt(event as InstallPromptEvent);
  };
  window.addEventListener('online',handleOnline);
  window.addEventListener('offline',handleOffline);
  window.addEventListener('beforeinstallprompt',handleInstall);
  return()=>{
   window.removeEventListener('online',handleOnline);
   window.removeEventListener('offline',handleOffline);
   window.removeEventListener('beforeinstallprompt',handleInstall);
  };
 },[]);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60000);return()=>window.clearInterval(timer);},[]);
 async function persist(next:TripState){
  setState(next);
  localStorage.setItem(localStateKey,JSON.stringify(next));
  localStorage.setItem(pendingSyncKey,'true');
  setPendingSync(true);
  if(!navigator.onLine)return;
  try{
   const synced=await pushCloudState(next);
   if(synced){
    localStorage.removeItem(pendingSyncKey);
    setPendingSync(false);
    setCloud(true);
   }
  }catch{}
 }
 async function downloadOffline(){
  if(!('serviceWorker'in navigator))return;
  setOfflineDownloading(true);
  setOfflineMessage('');
  const registration=await navigator.serviceWorker.ready;
  await registration.update();
  registration.active?.postMessage({type:'CACHE_TRIP'});
 }
 async function installApp(){
  if(!installPrompt)return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  setInstallPrompt(null);
 }
 function requestLocation(){
  if(!navigator.geolocation){
   setLocationStatus('error');
   setLocationMessage('Location is not available in this browser.');
   return;
  }
  setLocationStatus('requesting');
  setLocationMessage('');
  navigator.geolocation.getCurrentPosition(position=>{
   setLiveLocation({latitude:position.coords.latitude,longitude:position.coords.longitude,label:'your current location'});
   setLocationStatus('active');
  },error=>{
   setLocationStatus('error');
   setLocationMessage(error.code===error.PERMISSION_DENIED?'Location permission was not granted. You can continue using itinerary-based suggestions.':'Your location could not be determined. Try again when you have a stronger signal.');
  },{enableHighAccuracy:false,timeout:12000,maximumAge:300000});
 }
 function stopUsingLocation(){
  setLiveLocation(null);
  setLocationStatus('idle');
  setLocationMessage('');
 }
 function toggleDay(di:number,ii:number){if(!state)return;const next=structuredClone(state);next.days[di].items[ii].done=!next.days[di].items[ii].done;void persist(next);}
 function editItem(di:number,ii:number,key:EditableKey,value:EditableValue){if(!state)return;const next=structuredClone(state);const item=next.days[di].items[ii];if(key==='optional'||key==='fixed')item[key]=Boolean(value);else if(key==='estimatedDuration'||key==='travelMinutes'||key==='prepBuffer'){if(value===undefined||value==='')delete item[key];else item[key]=Math.max(0,Number(value));}else if(key==='type')item.type=String(value) as ItineraryItem['type'];else item[key]=String(value);if(key==='destination')item.mapUrl=mapsUrl(String(value));setState(next);localStorage.setItem('trip-state',JSON.stringify(next));}
 function saveEdits(di?:number){const latest=readLocalState()??state;if(!latest)return;const next=structuredClone(latest);if(di!==undefined)next.days[di].items=sortItems(next.days[di].items);void persist(next);}
 function addItem(di:number){if(!state)return;const next=structuredClone(state);next.days[di].items.push({id:`custom-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,time:'12:00 PM',title:'New stop',details:'',destination:'',routeText:'',keyInfo:'',userNotes:'',done:false,optional:false,fixed:false,type:'activity',estimatedDuration:60,travelMinutes:20,prepBuffer:15});next.days[di].items=sortItems(next.days[di].items);void persist(next);}
 function addPlaceToItinerary(place:Place,di:number){
  if(!state)return;
  const next=structuredClone(state);
  const category=`${place.category} ${place.tags.join(' ')}`.toLowerCase();
  const type:ItineraryItem['type']=/restaurant|food|bakery|coffee|dessert|candy|bar/.test(category)?'food':/hotel/.test(category)?'hotel':/transit|station|airport/.test(category)?'travel':'activity';
  const destination=place.formattedAddress||place.name;
  next.days[di].items.push({
   id:`place-stop-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
   time:'Flexible',
   title:place.name,
   details:place.notes,
   destination,
   mapUrl:mapsUrl(destination),
   routeText:'Open transit directions from your current location.',
   keyInfo:'',
   userNotes:'',
   done:false,
   optional:false,
   fixed:false,
   type,
   estimatedDuration:place.estimatedDuration??60,
   travelMinutes:20,
   prepBuffer:15,
   placeId:place.id
  });
  void persist(next);
 }
 function deleteItem(di:number,ii:number){if(!state||!window.confirm(`Delete “${state.days[di].items[ii].title}”?`))return;const next=structuredClone(state);next.days[di].items.splice(ii,1);void persist(next);}
 function moveItem(di:number,ii:number,target:number){if(!state||target===di)return;const next=structuredClone(state);const [item]=next.days[di].items.splice(ii,1);next.days[target].items.push(item);next.days[target].items=sortItems(next.days[target].items);void persist(next);}
 function reorderItem(di:number,ii:number,direction:-1|1){if(!state)return;const target=ii+direction;if(target<0||target>=state.days[di].items.length)return;const next=structuredClone(state);[next.days[di].items[ii],next.days[di].items[target]]=[next.days[di].items[target],next.days[di].items[ii]];void persist(next);}
 function moveBoardItem(fromDay:number,fromIndex:number,toDay:number,toIndex:number){
  if(!state)return;
  const next=structuredClone(state);
  const [item]=next.days[fromDay].items.splice(fromIndex,1);
  const adjustedIndex=fromDay===toDay&&fromIndex<toIndex?toIndex-1:toIndex;
  next.days[toDay].items.splice(Math.max(0,Math.min(adjustedIndex,next.days[toDay].items.length)),0,item);
  setBoardUndo(structuredClone(state));
  void persist(next);
 }
 function duplicateBoardItem(di:number,ii:number){
  if(!state)return;
  const next=structuredClone(state);
  const copy=structuredClone(next.days[di].items[ii]);
  copy.id=`copy-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  copy.title=`${copy.title} (copy)`;
  copy.done=false;
  next.days[di].items.splice(ii+1,0,copy);
  setBoardUndo(structuredClone(state));
  void persist(next);
 }
 function addBoardItem(di:number){
  if(!state)return;
  setBoardUndo(structuredClone(state));
  addItem(di);
 }
 function addBoardPlace(place:Place,di:number){
  if(!state)return;
  setBoardUndo(structuredClone(state));
  addPlaceToItinerary(place,di);
 }
 function optimizeBoardDay(di:number){
  if(!state)return;
  const next=structuredClone(state);
  const optimized=suggestDayOrder(next.days[di],next.places);
  if(optimized.every((item,index)=>item.id===next.days[di].items[index]?.id))return;
  setBoardUndo(structuredClone(state));
  next.days[di].items=optimized;
  void persist(next);
 }
 function undoBoardChange(){
  if(!boardUndo||!state)return;
  const previous=structuredClone(boardUndo);
  setBoardUndo(structuredClone(state));
  void persist(previous);
 }
 function toggleList(key:'foods'|'packing',index:number){if(!state)return;const next=structuredClone(state);next[key][index].done=!next[key][index].done;void persist(next);}
 function toggleVisited(id:string){if(!state)return;const next=structuredClone(state);const place=next.places.find(p=>p.id===id);if(place)place.visited=!place.visited;void persist(next);}
 function editPlace(id:string,changes:Partial<Place>){
  if(!state)return;
  const next=structuredClone(state);
  const place=next.places.find(candidate=>candidate.id===id);
  if(!place)return;
  Object.assign(place,changes);
  setState(next);
  localStorage.setItem(localStateKey,JSON.stringify(next));
 }
 function replacePlace(updated:Place){
  if(!state)return;
  const next=structuredClone(state);
  const index=next.places.findIndex(place=>place.id===updated.id);
  if(index<0)return;
  next.places[index]=updated;
  setState(next);
  localStorage.setItem(localStateKey,JSON.stringify(next));
 }
 function replacePlaces(updated:Place[]){
  if(!state)return;
  const next=structuredClone(state);
  const byId=new Map(updated.map(place=>[place.id,place]));
  next.places=next.places.map(place=>byId.get(place.id)??place);
  setState(next);
  localStorage.setItem(localStateKey,JSON.stringify(next));
 }
 function assignSuggestedAreas(){
  if(!state)return;
  const next=structuredClone(state);
  let changed=0;
  next.places.forEach(place=>{
   if(place.area)return;
   const suggestion=suggestPlaceArea(place);
   if(!suggestion)return;
   place.area=suggestion;
   changed+=1;
  });
  if(changed)void persist(next);
 }
 function editPlaceHours(id:string,day:Weekday,changes:{open?:string;close?:string;closed?:boolean}){
  if(!state)return;
  const next=structuredClone(state);
  const place=next.places.find(candidate=>candidate.id===id);
  if(!place)return;
  place.weeklyHours??={};
  const current=place.weeklyHours[day]??{open:'09:00',close:'17:00',closed:false};
  place.weeklyHours[day]={...current,...changes};
  setState(next);
  localStorage.setItem(localStateKey,JSON.stringify(next));
 }
 function savePlaceChanges(){const latest=readLocalState()??state;if(latest)void persist(structuredClone(latest));}
 function addPlace(){
  if(!state)return;
  const next=structuredClone(state);
  next.places.unshift({id:`place-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name:'New place',region:'Toronto',category:'Attraction',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'possible',visited:false,estimatedDuration:60});
  void persist(next);
  setQuery('New place');
  setRegion('All');
  setArea('All');
  setCategory('All');
  setPriority('All');
 }
 function duplicatePlace(id:string){
  if(!state)return;
  const next=structuredClone(state);
  const index=next.places.findIndex(place=>place.id===id);
  if(index<0)return;
  const copy=structuredClone(next.places[index]);
  copy.id=`place-copy-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  copy.name=`${copy.name} (copy)`;
  copy.visited=false;
  next.places.splice(index+1,0,copy);
  void persist(next);
 }
 function deletePlace(id:string){
  if(!state)return;
  const place=state.places.find(candidate=>candidate.id===id);
  if(!place||!window.confirm(`Delete “${place.name}”?`))return;
  const next=structuredClone(state);
  next.places=next.places.filter(candidate=>candidate.id!==id);
  void persist(next);
 }

 const currentDayIndex=useMemo(()=>(state?activeDayIndex(state.days):0),[state]);
 const currentDay=state?.days[currentDayIndex];
 const nextStepIndex=currentDay?.items.findIndex(item=>!item.done)??-1;
 const nextStep=nextStepIndex>=0?currentDay?.items[nextStepIndex]:undefined;
 const availableAreas=useMemo(()=>areaOptions(state?.places??[]),[state]);
 const unassignedAreaCount=state?.places.filter(place=>!place.area).length??0;
 const suggestibleAreaCount=state?.places.filter(place=>!place.area&&Boolean(suggestPlaceArea(place))).length??0;
 const filtered=useMemo(()=>{if(!state)return[];const needle=query.trim().toLowerCase();return state.places.filter(place=>(region==='All'||place.region===region)&&(area==='All'||(area==='Unassigned'?!place.area:place.area===area))&&(category==='All'||place.category===category)&&(priority==='All'||place.priority===priority)&&(showVisited||!place.visited)&&(!needle||`${place.name} ${place.area??''} ${place.notes} ${place.tags.join(' ')}`.toLowerCase().includes(needle)));},[state,query,region,area,category,priority,showVisited]);
 const nearbySuggestions=useMemo(()=>{if(!state||!currentDay)return[];const rank={must:0,possible:1,backup:2};return state.places.filter(place=>placeMatchesDay(place,currentDay.city,currentDay.date)&&!place.visited).sort((a,b)=>rank[a.priority]-rank[b.priority]).slice(0,6);},[state,currentDay]);
 const assistant=useMemo(()=>state?buildAssistantState(state,now,liveLocation??undefined):null,[state,now,liveLocation]);
 const reservations=useMemo(()=>state?state.days.flatMap(day=>day.items.flatMap(item=>isFixedItem(item)?[{day,item}]:[])):[],[state]);
 const activeNavGroup=navGroups.find(group=>group.tabs.includes(tab))??navGroups[0];

 if(!state)return <main className="shell"><div className="card">Loading trip…</div></main>;
 const completedToday=currentDay?.items.filter(i=>i.done).length??0;
 const totalToday=currentDay?.items.length??0;
 const tripProgress=state.days.flatMap(day=>day.items);
 const completedTrip=tripProgress.filter(i=>i.done).length;
 const itineraryHoursIssues=state.days.flatMap(day=>day.items.map(item=>checkItineraryHours(item,day.date,state.places))).filter((check):check is ItineraryHoursCheck=>Boolean(check&&(check.status==='closed'||check.status==='closesSoon')));

 const syncLabel=!online?'● Offline · changes save here':pendingSync?'○ Waiting to sync':cloud?'● Shared sync':'○ Device only';
 return <>
  <header className="hero"><div className="heroInner"><div><div className="eyebrow">TRIP HUB</div><h1>Toronto · Niagara · Buffalo</h1><p>September 24–October 1, 2026</p></div><div className="headerActions"><span className={`sync ${online&&cloud&&!pendingSync?'online':''} ${!online?'offline':''}`}>{syncLabel}</span><button className="btn ghost" onClick={downloadOffline} disabled={offlineDownloading}>{offlineDownloading?'Downloading…':offlineReady?'✓ Offline ready':'Download for offline'}</button>{installPrompt&&<button className="btn ghost" onClick={installApp}>Install app</button>}{offlineMessage&&<span className="offlineMessage" role="status">{offlineMessage}</span>}</div></div></header>
  <main className="shell">
   <nav className="tabs mainTabs" aria-label="Trip sections">{navGroups.map(group=><button key={group.label} className={activeNavGroup.label===group.label?'active':''} onClick={()=>setTab(group.tabs[0])}>{group.label}</button>)}</nav>
   {activeNavGroup.tabs.length>1&&<nav className="subTabs" aria-label={`${activeNavGroup.label} views`}>{activeNavGroup.tabs.map(item=><button key={item} className={tab===item?'active':''} onClick={()=>setTab(item)}>{item==='Places'?'Saved Places':item}</button>)}</nav>}
   {tab==='Today'&&currentDay&&<section>
    <div className="todayHero card"><div><div className="eyebrow">TODAY</div><h2>{currentDay.label} · {currentDay.city}</h2><p className="muted">Recommendations below are selected for this specific itinerary day.</p></div><div className="progressRing" aria-label={`${completedToday} of ${totalToday} complete`}><strong>{completedToday}/{totalToday}</strong><span>done</span></div></div>
    {nextStep?<div className="card" style={{marginTop:'16px'}}><div className="eyebrow">NEXT STEP</div><div className="between" style={{alignItems:'flex-start',gap:'16px',marginTop:'6px'}}><div><h2 style={{marginBottom:'4px'}}>{nextStep.title}</h2><div className="muted">{nextStep.time}</div>{nextStep.details&&<p>{nextStep.details}</p>}{nextStep.routeText&&<p className="muted small">🚌 {nextStep.routeText}</p>}{(nextStep.keyInfo||nextStep.confirmationNumber)&&<div style={{marginTop:'12px'}}><strong>Key Info</strong><p style={{whiteSpace:'pre-wrap',marginTop:'4px'}}>{nextStep.keyInfo??nextStep.confirmationNumber}</p></div>}</div><span className="chip">{nextStepIndex+1} of {currentDay.items.length}</span></div><div className="placeActions" style={{marginTop:'14px'}}>{nextStep.mapUrl&&<a className="btn primary" href={nextStep.mapUrl} target="_blank" rel="noreferrer">Open transit directions</a>}<button className="btn" onClick={()=>toggleDay(currentDayIndex,nextStepIndex)}>Mark complete</button></div></div>:<div className="card" style={{marginTop:'16px'}}><div className="eyebrow">NEXT STEP</div><h2 style={{marginTop:'6px'}}>You’re done for today</h2><p className="muted">Every itinerary item for this day is complete.</p></div>}
    <div className="statGrid"><div className="stat"><span>Trip progress</span><strong>{completedTrip}/{tripProgress.length}</strong></div><div className="stat"><span>Saved places</span><strong>{state.places.length}</strong></div><div className="stat"><span>Foods remaining</span><strong>{state.foods.filter(i=>!i.done).length}</strong></div></div>
    <h2 className="sectionTitle">Today’s plan</h2>
    {currentDay.items.map((item,index)=>{const hoursCheck=checkItineraryHours(item,currentDay.date,state.places);return <div className={`card timelineItem ${item.done?'done':''}`} key={item.id}><input aria-label={`Mark ${item.title} complete`} type="checkbox" checked={item.done} onChange={()=>toggleDay(currentDayIndex,index)}/><div className="timeBadge">{item.time}</div><ItineraryDetails item={item} dayIndex={currentDayIndex} itemIndex={index} hoursCheck={hoursCheck} onEdit={editItem} onSave={()=>saveEdits(currentDayIndex)} onShowPlace={place=>{setQuery(place.name);setRegion(place.region);setArea('All');setCategory('All');setPriority('All');setTab('Places');}}/></div>;})}
    <div className="between sectionHeading"><h2 className="sectionTitle">Recommended for this day</h2><button className="textButton" onClick={()=>{setRegion(currentDay.city.includes('Toronto')?'Toronto':'Niagara & Buffalo');setArea('All');setTab('Places');}}>See all</button></div>
    <div className="grid compactGrid">{nearbySuggestions.map(place=><PlaceCard key={place.id} place={place} onToggle={()=>toggleVisited(place.id)}/>)}</div>
   </section>}
   {tab==='Assistant'&&assistant&&<AssistantView assistant={assistant} tripState={state} now={now} liveLocation={liveLocation} locationStatus={locationStatus} locationMessage={locationMessage} onRequestLocation={requestLocation} onStopLocation={stopUsingLocation} onComplete={item=>{
    const day=state.days[assistant.currentDayIndex];
    const itemIndex=day?.items.findIndex(candidate=>candidate.id===item.id)??-1;
    if(itemIndex>=0)toggleDay(assistant.currentDayIndex,itemIndex);
   }} onVisited={toggleVisited} onShowPlaces={place=>{
    setQuery(place.name);
    setRegion(place.region);
    setArea('All');
    setCategory('All');
    setPriority('All');
    setTab('Places');
   }} onExploreNearby={()=>setTab('Nearby')}/>}
   {tab==='Nearby'&&currentDay&&<NearbyExplorer state={state} currentDayIndex={currentDayIndex} now={now} liveLocation={liveLocation} locationStatus={locationStatus} locationMessage={locationMessage} onRequestLocation={requestLocation} onStopLocation={stopUsingLocation} onVisited={toggleVisited} onAddToItinerary={addPlaceToItinerary} onShowPlace={place=>{
    setQuery(place.name);
    setRegion(place.region);
    setArea('All');
    setCategory('All');
    setPriority('All');
    setTab('Places');
   }}/>}
   {tab==='Board'&&<TripBoard days={state.days} places={state.places} canUndo={Boolean(boardUndo)} onUndo={undoBoardChange} onMove={moveBoardItem} onDuplicate={duplicateBoardItem} onAdd={addBoardItem} onAddPlace={addBoardPlace} onOptimize={optimizeBoardDay} onToggle={toggleDay} onOpenItem={itemId=>{
    setTab('Itinerary');
    window.setTimeout(()=>document.getElementById(`itinerary-${itemId}`)?.scrollIntoView({behavior:'smooth',block:'center'}),0);
   }}/>}
   {tab==='Itinerary'&&<section><div className="pageIntro"><div><div className="eyebrow">FULL SCHEDULE</div><h2>Edit the trip without touching code</h2></div><div className="placeActions">{itineraryHoursIssues.length>0&&<span className="chip hoursIssueCount">{itineraryHoursIssues.length} hours notice{itineraryHoursIssues.length===1?'':'s'}</span>}<span className="chip">{completedTrip}/{tripProgress.length} complete</span></div></div>{state.days.map((day,di)=><article className="card dayCard" key={day.date}><div className="between dayHeader"><div><div className="eyebrow">{day.date}</div><h2>{day.label} · {day.city}</h2></div><div className="placeActions"><span className="chip">{day.items.filter(i=>i.done).length}/{day.items.length}</span><button className="btn primary" onClick={()=>addItem(di)}>+ Add stop</button></div></div>{day.items.map((item,ii)=>{const hoursCheck=checkItineraryHours(item,day.date,state.places);return <div id={`itinerary-${item.id}`} className={`itineraryRow ${item.done?'done':''}`} key={item.id}><input aria-label={`Mark ${item.title} complete`} type="checkbox" checked={item.done} onChange={()=>toggleDay(di,ii)}/><div style={{minWidth:0,flex:1}}><ItineraryEditor item={item} dayIndex={di} itemIndex={ii} days={state.days} places={state.places} hoursCheck={hoursCheck} onEdit={editItem} onSave={()=>saveEdits(di)} onMove={moveItem} onReorder={reorderItem} onDelete={deleteItem} onShowPlace={place=>{setQuery(place.name);setRegion(place.region);setArea('All');setCategory('All');setPriority('All');setTab('Places');}}/></div></div>;})}</article>)}</section>}
   {tab==='Reservations'&&<ReservationsView reservations={reservations} onShowItem={itemId=>{
    setTab('Itinerary');
    window.setTimeout(()=>document.getElementById(`itinerary-${itemId}`)?.scrollIntoView({behavior:'smooth',block:'center'}),0);
   }}/>}
   {tab==='Food'&&<section><div className="pageIntro"><div><div className="eyebrow">LOCAL FLAVORS</div><h2>Eat the trip</h2></div><span className="chip">{state.foods.filter(i=>i.done).length}/{state.foods.length} tried</span></div>{['Try','Bring home'].map(group=><div key={group} className="listGroup"><h2 className="sectionTitle">{group}</h2><div className="grid">{state.foods.map((food,index)=>food.category===group&&<label className={`card checkCard ${food.done?'done':''}`} key={food.id}><input type="checkbox" checked={food.done} onChange={()=>toggleList('foods',index)}/><div><h3>{food.title}</h3>{food.notes&&<p className="muted small">{food.notes}</p>}</div></label>)}</div></div>)}</section>}
   {tab==='Places'&&<section><div className="pageIntro"><div><div className="eyebrow">SAVED SPOTS</div><h2>Find and manage places</h2><p className="muted">Organize saved spots by region and neighborhood so nearby suggestions stay geographically sensible.</p></div><div className="placeActions"><span className="chip">{filtered.length} shown</span>{unassignedAreaCount>0&&<button className="btn" onClick={()=>setArea('Unassigned')}>{unassignedAreaCount} unassigned</button>}{suggestibleAreaCount>0&&<button className="btn" onClick={assignSuggestedAreas}>Suggest {suggestibleAreaCount} areas</button>}<button className="btn primary" onClick={addPlace}>+ Add place</button></div></div><div className="filterPanel card"><input className="field searchField" placeholder="Search restaurants, neighborhoods, museums, notes…" value={query} onChange={e=>setQuery(e.target.value)}/><div className="filterGrid placeFilters"><select className="field" aria-label="Filter by region" value={region} onChange={e=>setRegion(e.target.value)}><option>All</option><option>Toronto</option><option>Niagara & Buffalo</option></select><select className="field" aria-label="Filter by area" value={area} onChange={e=>setArea(e.target.value)}><option>All</option><option>Unassigned</option>{availableAreas.map(value=><option value={value} key={value}>{value}</option>)}</select><select className="field" aria-label="Filter by category" value={category} onChange={e=>setCategory(e.target.value)}><option>All</option>{[...new Set(state.places.map(p=>p.category))].sort().map(v=><option key={v}>{v}</option>)}</select><select className="field" aria-label="Filter by priority" value={priority} onChange={e=>setPriority(e.target.value)}><option>All</option><option value="must">Must do</option><option value="possible">Possible</option><option value="backup">Backup</option></select></div><label className="toggleLine"><input type="checkbox" checked={showVisited} onChange={e=>setShowVisited(e.target.checked)}/> Show visited places</label></div><div className="grid placeGrid">{filtered.map(place=><PlaceCard key={place.id} place={place} onToggle={()=>toggleVisited(place.id)} onEdit={changes=>editPlace(place.id,changes)} onEditHours={(day,changes)=>editPlaceHours(place.id,day,changes)} onSave={savePlaceChanges} onGoogleUpdate={replacePlace} onDuplicate={()=>duplicatePlace(place.id)} onDelete={()=>deletePlace(place.id)} tripDates={state.days}/>)}</div>{filtered.length===0&&<div className="empty card">No saved places match those filters.</div>}</section>}
   {tab==='Hours'&&<HoursManager places={state.places} days={state.days} onUpdated={replacePlaces} onIgnoreHours={(place,ignoreHours)=>{editPlace(place.id,{ignoreHours});window.setTimeout(savePlaceChanges,0);}} onOpenPlace={place=>{
    setQuery(place.name);
    setRegion(place.region);
    setArea('All');
    setCategory('All');
    setPriority('All');
    setTab('Places');
   }}/>}
   {tab==='Checklist'&&<section><div className="pageIntro"><div><div className="eyebrow">PACK SMART</div><h2>Nothing important left behind</h2></div><span className="chip">{state.packing.filter(i=>i.done).length}/{state.packing.length} packed</span></div>{[...new Set(state.packing.map(i=>i.category))].map(group=><div key={group} className="listGroup"><h2 className="sectionTitle">{group}</h2><div className="grid">{state.packing.map((item,index)=>item.category===group&&<label className={`card checkCard ${item.done?'done':''}`} key={item.id}><input type="checkbox" checked={item.done} onChange={()=>toggleList('packing',index)}/><div>{item.title}</div></label>)}</div></div>)}</section>}
  </main>
 </>;
}

type DragPosition={dayIndex:number;itemIndex:number};

function TripBoard({days,places,canUndo,onUndo,onMove,onDuplicate,onAdd,onAddPlace,onOptimize,onToggle,onOpenItem}:{days:TripState['days'];places:Place[];canUndo:boolean;onUndo:()=>void;onMove:(fromDay:number,fromIndex:number,toDay:number,toIndex:number)=>void;onDuplicate:(dayIndex:number,itemIndex:number)=>void;onAdd:(dayIndex:number)=>void;onAddPlace:(place:Place,dayIndex:number)=>void;onOptimize:(dayIndex:number)=>void;onToggle:(dayIndex:number,itemIndex:number)=>void;onOpenItem:(itemId:string)=>void}){
 const [dragging,setDragging]=useState<DragPosition|null>(null);
 const [draggingPlaceId,setDraggingPlaceId]=useState<string|null>(null);
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());
 const [hiddenDays,setHiddenDays]=useState<Set<string>>(()=>new Set());
 const [drawerOpen,setDrawerOpen]=useState(true);
 const [routeDayIndex,setRouteDayIndex]=useState<number|null>(null);
 const [targetDayIndex,setTargetDayIndex]=useState(0);
 const [placeQuery,setPlaceQuery]=useState('');
 const [placeAreaFilter,setPlaceAreaFilter]=useState('All');
 const [placeCategoryFilter,setPlaceCategoryFilter]=useState('All');
 const [placePriorityFilter,setPlacePriorityFilter]=useState('All');
 const [placeHoursFilter,setPlaceHoursFilter]=useState<'All'|'Known'|'Missing'|'Ignored'>('All');
 useEffect(()=>{
  try{
   const saved=JSON.parse(localStorage.getItem(boardHiddenDaysKey)??'[]') as string[];
   setHiddenDays(new Set(saved.filter(date=>days.some(day=>day.date===date))));
  }catch{}
 },[days]);
 function saveHiddenDays(next:Set<string>){
  setHiddenDays(next);
  try{localStorage.setItem(boardHiddenDaysKey,JSON.stringify([...next]));}catch{}
 }
 function toggleDayVisibility(date:string){
  const next=new Set(hiddenDays);
  if(next.has(date))next.delete(date);else next.add(date);
  saveHiddenDays(next);
 }
 function dropAt(event:React.DragEvent,toDay:number,toIndex:number){
  event.preventDefault();
  if(draggingPlaceId){
   const place=places.find(candidate=>candidate.id===draggingPlaceId);
   if(place)onAddPlace(place,toDay);
  }else if(dragging)onMove(dragging.dayIndex,dragging.itemIndex,toDay,toIndex);
  setDragging(null);
  setDraggingPlaceId(null);
 }
 function toggleCollapsed(date:string){
  setCollapsed(current=>{
   const next=new Set(current);
   if(next.has(date))next.delete(date);else next.add(date);
   return next;
  });
 }
 const targetDay=days[targetDayIndex]??days[0];
 const targetRegion=targetDay?.city.includes('Toronto')?'Toronto':'Niagara & Buffalo';
 const scheduledPlaceIds=new Set(
  days.flatMap(day=>day.items.map(item=>boardPlace(item,places)?.id).filter((id):id is string=>Boolean(id)))
 );
 const drawerAreas=areaOptions(places.filter(place=>place.region===targetRegion));
 const drawerPlaces=places.filter(place=>{
  if(place.region!==targetRegion||place.visited||scheduledPlaceIds.has(place.id))return false;
  const text=`${place.name} ${place.notes} ${place.tags.join(' ')}`.toLowerCase();
  if(placeQuery&&!text.includes(placeQuery.trim().toLowerCase()))return false;
  if(placeAreaFilter!=='All'&&(place.area??suggestPlaceArea(place))!==placeAreaFilter)return false;
  if(placeCategoryFilter!=='All'&&place.category!==placeCategoryFilter)return false;
  if(placePriorityFilter!=='All'&&place.priority!==placePriorityFilter)return false;
  const hasHours=Boolean(Object.keys(place.weeklyHours??{}).length);
  if(placeHoursFilter==='Known'&&(!hasHours||place.ignoreHours))return false;
  if(placeHoursFilter==='Missing'&&(hasHours||place.ignoreHours))return false;
  if(placeHoursFilter==='Ignored'&&!place.ignoreHours)return false;
  return true;
 }).sort((a,b)=>{
  const rank={must:0,possible:1,backup:2};
  return rank[a.priority]-rank[b.priority]||(placeArea(a)??'Unassigned').localeCompare(placeArea(b)??'Unassigned')||a.name.localeCompare(b.name);
 });
 const groupedDrawerPlaces=[...new Set(drawerPlaces.map(place=>placeArea(place)??'Unassigned'))].map(areaName=>({areaName,places:drawerPlaces.filter(place=>(placeArea(place)??'Unassigned')===areaName)}));
 return <section className="boardBreakout">
  <div className="pageIntro boardIntro"><div><div className="eyebrow">TRIP BOARD</div><h2>Build the whole trip at a glance</h2><p className="muted">Drag saved places into a day, keep fixed plans anchored, and use route hints to reduce backtracking.</p></div><div className="placeActions"><button className="btn" onClick={()=>setDrawerOpen(value=>!value)}>{drawerOpen?'Hide':'Show'} place drawer</button><button className="btn" onClick={onUndo} disabled={!canUndo}>↶ Undo</button><span className="chip">{days.length-hiddenDays.size} of {days.length} days shown</span></div></div>
  <div className={`boardPlannerLayout ${drawerOpen?'drawerOpen':''}`}>
   {drawerOpen&&<aside className="boardPlaceDrawer card">
    <div className="between"><div><div className="eyebrow">UNSCHEDULED IDEAS</div><h3>Saved places</h3></div><span className="chip">{drawerPlaces.length}</span></div>
    <p className="muted small">Drag a card onto any visible day, or use Add to place it at the end of the selected day.</p>
    <label>Planning day<select className="field" value={targetDayIndex} onChange={event=>{setTargetDayIndex(Number(event.target.value));setPlaceAreaFilter('All');}}>{days.map((day,index)=><option value={index} key={day.date}>{day.label} · {day.city}</option>)}</select></label>
    <input className="field" value={placeQuery} onChange={event=>setPlaceQuery(event.target.value)} placeholder="Search saved places…" aria-label="Search unscheduled places"/>
    <div className="boardDrawerFilters">
     <select className="field" aria-label="Filter drawer by neighborhood" value={placeAreaFilter} onChange={event=>setPlaceAreaFilter(event.target.value)}><option>All</option>{drawerAreas.map(value=><option value={value} key={value}>{value}</option>)}</select>
     <select className="field" aria-label="Filter drawer by category" value={placeCategoryFilter} onChange={event=>setPlaceCategoryFilter(event.target.value)}><option>All</option>{[...new Set(places.filter(place=>place.region===targetRegion).map(place=>place.category))].sort().map(value=><option value={value} key={value}>{value}</option>)}</select>
     <select className="field" aria-label="Filter drawer by priority" value={placePriorityFilter} onChange={event=>setPlacePriorityFilter(event.target.value)}><option>All</option><option value="must">Must do</option><option value="possible">Possible</option><option value="backup">Backup</option></select>
     <select className="field" aria-label="Filter drawer by saved hours" value={placeHoursFilter} onChange={event=>setPlaceHoursFilter(event.target.value as typeof placeHoursFilter)}><option>All</option><option>Known</option><option>Missing</option><option>Ignored</option></select>
    </div>
    <div className="boardPlaceGroups">
     {groupedDrawerPlaces.map(group=><section className="boardPlaceGroup" key={group.areaName}><h4>{group.areaName.split(' — ').at(-1)} <span>{group.places.length}</span></h4>{group.places.map(place=>{const hasHours=Boolean(Object.keys(place.weeklyHours??{}).length);return <article className={`boardPlaceIdea priority-border-${place.priority} ${draggingPlaceId===place.id?'dragging':''}`} draggable onDragStart={event=>{setDraggingPlaceId(place.id);setDragging(null);event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('text/plain',place.id);}} onDragEnd={()=>setDraggingPlaceId(null)} key={place.id}>
      <div className="between"><strong>{place.name}</strong><span className={`priority priority-${place.priority}`}>{place.priority==='must'?'Must':place.priority}</span></div>
      <div className="boardIdeaMeta"><span>{place.category}</span><span>{place.estimatedDuration??60} min</span><span>{place.ignoreHours?'Hours ignored':hasHours?'Hours saved':'Hours missing'}</span></div>
      <button className="btn" onClick={()=>onAddPlace(place,targetDayIndex)}>Add to {targetDay.label}</button>
     </article>;})}</section>)}
     {!drawerPlaces.length&&<div className="empty boardDrawerEmpty">No unscheduled places match these filters.</div>}
    </div>
   </aside>}
   <div className="boardPlannerMain">
   <div className="boardDayFilters card">
     <div className="between"><div><strong>Days shown</strong><p className="muted small">This view preference stays on this device and does not change the itinerary.</p></div><div className="placeActions"><button className="textButton" onClick={()=>saveHiddenDays(new Set())}>Show all</button><button className="textButton" onClick={()=>saveHiddenDays(new Set(days.map(day=>day.date)))}>Hide all</button></div></div>
     <div className="boardDayChoices">
      {days.map(day=><label className={`boardDayChoice ${hiddenDays.has(day.date)?'hidden':''}`} key={day.date}><input type="checkbox" checked={!hiddenDays.has(day.date)} onChange={()=>toggleDayVisibility(day.date)}/><span><strong>{day.label}</strong><small>{day.city}</small></span></label>)}
     </div>
    </div>
    {routeDayIndex!==null&&days[routeDayIndex]&&<DayRoutePanel day={days[routeDayIndex]} places={places} onApply={()=>onOptimize(routeDayIndex)} onClose={()=>setRouteDayIndex(null)}/>}
    {hiddenDays.size===days.length&&<div className="empty card boardEmpty"><strong>All days are hidden.</strong><span>Select a day above or choose Show all to bring the board back.</span></div>}
    <div className="tripBoard" aria-label="Trip itinerary board">
     {days.map((day,di)=>({day,di})).filter(({day})=>!hiddenDays.has(day.date)).map(({day,di})=>{
      const isCollapsed=collapsed.has(day.date);
      const route=analyzeDayRoute(day,places);
      return <article className={`boardColumn ${isCollapsed?'collapsed':''} ${draggingPlaceId?'acceptingPlace':''}`} key={day.date} onDragOver={event=>event.preventDefault()} onDrop={event=>dropAt(event,di,day.items.length)}>
       <header className="boardColumnHeader"><button className="boardCollapse" onClick={()=>toggleCollapsed(day.date)} aria-expanded={!isCollapsed} aria-label={`${isCollapsed?'Expand':'Collapse'} ${day.label}`}>{isCollapsed?'▸':'▾'}</button><div><div className="eyebrow">{day.date}</div><h3>{day.label}</h3><p>{day.city}</p></div><span className="chip neutral">{day.items.length}</span></header>
       {!isCollapsed&&<>
        <div className="boardRouteSummary"><div><strong>{route.linkedStops} routed stops</strong><span>{route.totalTravelMinutes?`≈ ${route.totalTravelMinutes} min transit · ${route.totalDistanceKm.toFixed(1)} km`:'Add linked places for travel estimates'}</span></div><div className="boardRouteActions"><button className="textButton" onClick={()=>setRouteDayIndex(di)}>View route</button><button className="textButton" onClick={()=>onOptimize(di)} disabled={!route.canOptimize}>Suggest order</button></div></div>
        {route.warnings.length>0&&<div className="boardRouteWarnings">{route.warnings.slice(0,2).map(warning=><span key={warning}>⚠ {warning}</span>)}</div>}
        <div className="boardCards">
         {day.items.map((item,ii)=>{const boardType=inferItemType(item);const linkedPlace=boardPlace(item,places);const linkedArea=placeArea(linkedPlace);const segment=route.segments.get(item.id);return <div className="boardCardStack" key={item.id}>
          {segment&&<div className={`boardRouteGap route-${segment.kind}`}>↳ {segment.label}</div>}
          <article className={`boardCard board-${boardType} ${item.done?'complete':''} ${dragging?.dayIndex===di&&dragging.itemIndex===ii?'dragging':''}`} draggable onDragStart={event=>{setDragging({dayIndex:di,itemIndex:ii});setDraggingPlaceId(null);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);}} onDragEnd={()=>setDragging(null)} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.stopPropagation();dropAt(event,di,ii);}}>
           <div className="boardCardTop"><button className="dragHandle" aria-label={`Drag ${item.title}`} title="Drag to move">⋮⋮</button><span className="boardTime">{item.time}</span><label className="boardCheck"><input aria-label={`Mark ${item.title} complete`} type="checkbox" checked={item.done} onChange={()=>onToggle(di,ii)}/></label></div>
           <button className="boardCardTitle" onClick={()=>onOpenItem(item.id)}>{item.title}</button>
           {item.destination&&<p className="boardDestination">{item.destination}</p>}
           <div className="boardBadges"><span className={`boardType type-${boardType}`}>{boardType}</span><span className={`chip ${isFixedItem(item)?'':'neutral'}`}>{isFixedItem(item)?'Fixed':'Flexible'}</span>{linkedArea&&<span className="chip boardArea">{linkedArea.split(' — ').at(-1)}</span>}{item.optional&&<span className="chip neutral">Optional</span>}</div>
           <div className="boardCardActions"><button onClick={()=>ii>0&&onMove(di,ii,di,ii-1)} disabled={ii===0} aria-label={`Move ${item.title} up`}>↑</button><button onClick={()=>ii<day.items.length-1&&onMove(di,ii,di,ii+2)} disabled={ii===day.items.length-1} aria-label={`Move ${item.title} down`}>↓</button><select aria-label={`Move ${item.title} to another day`} value={di} onChange={event=>onMove(di,ii,Number(event.target.value),days[Number(event.target.value)].items.length)}>{days.map((target,targetIndex)=><option value={targetIndex} key={target.date}>{target.label}</option>)}</select><button onClick={()=>onDuplicate(di,ii)} aria-label={`Duplicate ${item.title}`}>⧉</button></div>
          </article>
         </div>;})}
         <button className="boardAdd" onClick={()=>onAdd(di)}>+ Add stop</button>
        </div>
       </>}
      </article>;
     })}
    </div>
   </div>
  </div>
 </section>;
}

function DayRoutePanel({day,places,onApply,onClose}:{day:TripState['days'][number];places:Place[];onApply:()=>void;onClose:()=>void}){
 const currentStops=dayRouteStops(day,places);
 const suggestedDay={...day,items:suggestDayOrder(day,places)};
 const suggestedStops=dayRouteStops(suggestedDay,places);
 const currentRoute=analyzeDayRoute(day,places);
 const suggestedRoute=analyzeDayRoute(suggestedDay,places);
 const changed=routeOrderChanged(day,places);
 const missing=currentStops.filter(stop=>stop.locationQuality==='missing');
 const textOnly=currentStops.filter(stop=>stop.locationQuality==='text');
 function routeButtons(routeDay:TripState['days'][number]){
  const transit=buildGoogleMapsDayRoute(routeDay,places,'transit');
  const walking=buildGoogleMapsDayRoute(routeDay,places,'walking');
  return <div className="placeActions routeMapActions">{transit&&<a className="btn primary" href={transit} target="_blank" rel="noreferrer">Open transit route</a>}{walking&&<a className="btn" href={walking} target="_blank" rel="noreferrer">Open walking route</a>}</div>;
 }
 function stopList(stops:ReturnType<typeof dayRouteStops>){
  return <ol className="dayRouteStops">{stops.map((stop,index)=><li className={`dayRouteStop location-${stop.locationQuality}`} key={stop.item.id}><span className="routeStopNumber">{index+1}</span><div><div className="between"><strong>{stop.item.title}</strong><span className="boardTime">{stop.item.time}</span></div><p>{stop.place?.formattedAddress||stop.item.destination||stop.place?.name||'Add a destination to include this stop in Maps.'}</p><div className="boardBadges"><span className={`chip ${isFixedItem(stop.item)?'':'neutral'}`}>{isFixedItem(stop.item)?'Fixed':'Flexible'}</span>{stop.area&&<span className="chip boardArea">{stop.area.split(' — ').at(-1)}</span>}<span className={`chip routeQuality quality-${stop.locationQuality}`}>{stop.locationQuality==='linked'?'Saved place':stop.locationQuality==='text'?'Text location':'Location missing'}</span></div></div></li>)}</ol>;
 }
 return <section className="card dayRoutePanel">
  <div className="between dayRouteHeader"><div><div className="eyebrow">DAY ROUTE</div><h3>{day.label} · {day.city}</h3><p className="muted small">Review the current order, compare the suggested route, then choose whether to apply it.</p></div><button className="btn" onClick={onClose}>Close</button></div>
  {(missing.length>0||textOnly.length>0)&&<div className="dayRouteNotice">{missing.length>0&&<span>⚠ {missing.length} stop{missing.length===1?'':'s'} need a destination.</span>}{textOnly.length>0&&<span>ℹ {textOnly.length} stop{textOnly.length===1?' uses':'s use'} text-only locations instead of saved places.</span>}</div>}
  <div className="dayRouteCompare">
   <article className="dayRouteOption"><div className="between"><div><div className="eyebrow">CURRENT ORDER</div><strong>{currentRoute.totalTravelMinutes?`≈ ${currentRoute.totalTravelMinutes} min travel`:'Travel estimate unavailable'}</strong></div><span className="chip neutral">{currentRoute.linkedStops} linked</span></div>{stopList(currentStops)}{routeButtons(day)}</article>
   <article className={`dayRouteOption suggested ${changed?'changed':'same'}`}><div className="between"><div><div className="eyebrow">SUGGESTED ORDER</div><strong>{suggestedRoute.totalTravelMinutes?`≈ ${suggestedRoute.totalTravelMinutes} min travel`:'Travel estimate unavailable'}</strong></div><span className="chip">{changed?'Alternative':'Already efficient'}</span></div>{stopList(suggestedStops)}{routeButtons(suggestedDay)}<button className="btn primary routeApply" onClick={onApply} disabled={!changed}>Apply suggested order</button><p className="muted routeFinePrint">Fixed plans stay anchored. Only flexible stops are rearranged.</p></article>
  </div>
 </section>;
}

type ReservationEntry={
 day:TripState['days'][number];
 item:ItineraryItem;
};

const reservationGroupOrder=['Flights','Hotels','Transportation','Tickets & events','Dining','Reservations'];

function reservationGroup(item:ItineraryItem){
 const type=inferItemType(item);
 const text=`${item.title} ${item.details??''}`.toLowerCase();
 if(type==='hotel')return 'Hotels';
 if(type==='travel'&&/flight|airport|airline|boarding/.test(text))return 'Flights';
 if(type==='travel')return 'Transportation';
 if(/game|ticket|kickoff|museum|tour|tower|aquarium|escape room/.test(text))return 'Tickets & events';
 if(type==='food')return 'Dining';
 return 'Reservations';
}

function ReservationsView({reservations,onShowItem}:{reservations:ReservationEntry[];onShowItem:(itemId:string)=>void}){
 const groups=reservationGroupOrder.map(name=>({name,items:reservations.filter(entry=>reservationGroup(entry.item)===name)})).filter(group=>group.items.length>0);
 return <section>
  <div className="pageIntro"><div><div className="eyebrow">FIXED PLANS</div><h2>Reservations and confirmations</h2><p className="muted">This view updates automatically from fixed itinerary items.</p></div><span className="chip">{reservations.length} fixed plans</span></div>
  {groups.map(group=><div className="reservationGroup" key={group.name}>
   <h2 className="sectionTitle">{group.name}</h2>
   <div className="grid reservationGrid">{group.items.map(({day,item})=>{
    const keyInfo=item.keyInfo??item.confirmationNumber;
    return <article className="card reservationCard" key={item.id}>
     <div className="between reservationTop"><div><div className="eyebrow">{day.label} · {day.city}</div><h3>{item.title}</h3></div><span className="timeBadge">{item.time}</span></div>
     <div className="reservationMeta"><span className="chip neutral">{inferItemType(item)}</span>{item.estimatedDuration&&<span className="chip neutral">{item.estimatedDuration} min</span>}</div>
     {item.details&&<p className="muted small">{item.details}</p>}
     {item.destination&&<div className="reservationSection"><strong>Destination</strong><p>{item.destination}</p></div>}
     {keyInfo&&<div className="reservationSection keyInfo"><strong>Key Info</strong><p>{keyInfo}</p></div>}
     {item.userNotes&&<div className="reservationSection"><strong>Notes</strong><p>{item.userNotes}</p></div>}
     {item.routeText&&<p className="muted small reservationRoute">🚌 {item.routeText}</p>}
     <ReservationAttachments item={item}/>
     <div className="placeActions reservationActions">{item.mapUrl&&<a className="btn primary" href={item.mapUrl} target="_blank" rel="noreferrer">Open directions</a>}<button className="btn" onClick={()=>onShowItem(item.id)}>View in itinerary</button></div>
    </article>;
   })}</div>
  </div>)}
  {reservations.length===0&&<div className="card empty">Mark an itinerary item as a fixed plan to see it here.</div>}
 </section>;
}

type AttachmentWithUrl=ReservationAttachment&{url:string};

function ReservationAttachments({item}:{item:ItineraryItem}){
 const [attachments,setAttachments]=useState<AttachmentWithUrl[]>([]);
 const [revision,setRevision]=useState(0);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  let active=true;
  const urls:string[]=[];
  void listReservationAttachments(item.id).then(records=>{
   if(!active)return;
   const next=records.map(record=>{const url=URL.createObjectURL(record.file);urls.push(url);return {...record,url};});
   setAttachments(next);
  }).catch(()=>{if(active)setMessage('Attachments are unavailable in this browser.');});
  return()=>{active=false;urls.forEach(url=>URL.revokeObjectURL(url));};
 },[item.id,revision]);
 async function addFiles(files:FileList|null){
  if(!files?.length)return;
  setBusy(true);
  setMessage('');
  try{
   const existing=await listReservationAttachments(item.id);
   const incoming=[...files].slice(0,Math.max(0,8-existing.length));
   if(!incoming.length)throw new Error('This reservation already has the maximum of 8 files.');
   const oversized=incoming.find(file=>file.size>10*1024*1024);
   if(oversized)throw new Error(`${oversized.name} is larger than the 10 MB limit.`);
   await Promise.all(incoming.map(file=>saveReservationAttachment(item.id,file)));
   setRevision(value=>value+1);
   setMessage(`${incoming.length} file${incoming.length===1?'':'s'} saved on this device.`);
  }catch(error){setMessage(error instanceof Error?error.message:'The files could not be saved.');}
  finally{setBusy(false);}
 }
 async function removeAttachment(attachment:AttachmentWithUrl){
  if(!window.confirm(`Remove “${attachment.name}” from this device?`))return;
  try{
   await deleteReservationAttachment(attachment.id);
   setRevision(value=>value+1);
   setMessage('File removed from this device.');
  }catch{setMessage('The file could not be removed.');}
 }
 return <div className="reservationAttachments">
  <div className="between"><div><strong>Files</strong><p>Saved only on this device and available offline.</p></div><label className={`btn attachmentUpload ${busy?'disabled':''}`}>{busy?'Saving…':'Add file'}<input type="file" accept="image/*,application/pdf" multiple disabled={busy} onChange={event=>{void addFiles(event.target.files);event.currentTarget.value='';}}/></label></div>
  {attachments.length>0&&<div className="attachmentList">{attachments.map(attachment=><div className="attachmentRow" key={attachment.id}><div><strong>{attachment.name}</strong><span>{formatFileSize(attachment.size)}</span></div><div className="placeActions"><a className="textLink" href={attachment.url} target="_blank" rel="noreferrer">Open</a><a className="textLink" href={attachment.url} download={attachment.name}>Download</a><button className="textButton dangerText" onClick={()=>void removeAttachment(attachment)}>Remove</button></div></div>)}</div>}
  {message&&<p className="attachmentMessage" role="status">{message}</p>}
 </div>;
}

function formatFileSize(bytes:number){
 if(bytes<1024)return `${bytes} B`;
 if(bytes<1024*1024)return `${Math.round(bytes/1024)} KB`;
 return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}

function ItineraryEditor({item,dayIndex,itemIndex,days,places,hoursCheck,onEdit,onSave,onMove,onReorder,onDelete,onShowPlace}:{item:ItineraryItem;dayIndex:number;itemIndex:number;days:TripState['days'];places:Place[];hoursCheck?:ItineraryHoursCheck;onEdit:(di:number,ii:number,key:EditableKey,value:EditableValue)=>void;onSave:()=>void;onMove:(di:number,ii:number,target:number)=>void;onReorder:(di:number,ii:number,direction:-1|1)=>void;onDelete:(di:number,ii:number)=>void;onShowPlace:(place:Place)=>void}){
 const [open,setOpen]=useState(false);
 const [saved,setSaved]=useState(false);
 const inferredDuration=estimatedItemDuration(item);
 const fixed=isFixedItem(item);
 const itemType=inferItemType(item);
 function save(){
  onSave();
  setSaved(true);
  window.setTimeout(()=>setSaved(false),1800);
 }
 return <div className="timelineCopy">
  <div className="between itinerarySummary">
   <div>
    <div className="titleRow"><h3>{item.title}</h3><span className={`chip ${fixed?'':'neutral'}`}>{fixed?'Fixed':'Flexible'}</span><span className="chip neutral">{itemType}</span>{item.optional&&<span className="chip neutral">Optional</span>}{hoursCheck&&<span className={`itineraryHoursBadge check-${hoursCheck.status}`}>{hoursCheck.label}</span>}</div>
    <div className="muted small">{item.time}{item.destination?` · ${item.destination}`:''}{` · ${inferredDuration} min`}</div>
    {item.details&&<p className="muted small">{item.details}</p>}
    {hoursCheck&&hoursCheck.status!=='open'&&<div className={`itineraryHoursNotice check-${hoursCheck.status}`}><div><strong>{hoursCheck.place.name}</strong><p>{hoursCheck.message}</p></div><button className="textButton" onClick={()=>onShowPlace(hoursCheck.place)}>Review place</button></div>}
   </div>
   <button className="btn" onClick={()=>setOpen(value=>!value)}>{open?'Close':'Edit'}</button>
  </div>
  {open&&<div className="itineraryEditPanel">
   <div className="editPrimaryFields">
    <label className="small">Time<input className="field" value={item.time} onChange={event=>onEdit(dayIndex,itemIndex,'time',event.target.value)} onBlur={save}/></label>
    <label className="small">Title<input className="field" value={item.title} onChange={event=>onEdit(dayIndex,itemIndex,'title',event.target.value)} onBlur={save}/></label>
   </div>
   <div className="scheduleFields">
    <label className="small">Planning status<select className="field" value={fixed?'fixed':'flexible'} onChange={event=>{onEdit(dayIndex,itemIndex,'fixed',event.target.value==='fixed');save();}}><option value="fixed">Fixed plan</option><option value="flexible">Flexible idea</option></select></label>
    <label className="small">Activity type<select className="field" value={itemType} onChange={event=>{onEdit(dayIndex,itemIndex,'type',event.target.value);save();}}><option value="reservation">Reservation</option><option value="activity">Activity</option><option value="food">Food</option><option value="travel">Travel</option><option value="hotel">Hotel</option></select></label>
    <label className="small">Duration (minutes)<input className="field" type="number" min="0" step="5" value={item.estimatedDuration??''} placeholder={String(inferredDuration)} onChange={event=>onEdit(dayIndex,itemIndex,'estimatedDuration',event.target.value===''?undefined:Number(event.target.value))} onBlur={save}/></label>
    <label className="small">Travel time (minutes)<input className="field" type="number" min="0" step="5" value={item.travelMinutes??''} placeholder="20" onChange={event=>onEdit(dayIndex,itemIndex,'travelMinutes',event.target.value===''?undefined:Number(event.target.value))} onBlur={save}/></label>
    <label className="small">Preparation buffer<input className="field" type="number" min="0" step="5" value={item.prepBuffer??''} placeholder="15" onChange={event=>onEdit(dayIndex,itemIndex,'prepBuffer',event.target.value===''?undefined:Number(event.target.value))} onBlur={save}/></label>
   </div>
   <p className="muted small planningHint">Travel time and preparation buffer determine the Assistant’s suggested leave time for fixed plans.</p>
   <label className="small">Description<textarea className="field" rows={2} value={item.details??''} onChange={event=>onEdit(dayIndex,itemIndex,'details',event.target.value)} onBlur={save}/></label>
   <label className="small">Destination<input className="field" value={item.destination??''} placeholder="St. Lawrence Market" onChange={event=>onEdit(dayIndex,itemIndex,'destination',event.target.value)} onBlur={save}/></label>
   <label className="small">Saved place for hours<select className="field" value={item.placeId??''} onChange={event=>{onEdit(dayIndex,itemIndex,'placeId',event.target.value);window.setTimeout(save,0);}}><option value="">{hoursCheck&&!item.placeId?`Auto-matched: ${hoursCheck.place.name}`:'No saved place linked'}</option>{['Toronto','Niagara & Buffalo'].map(placeRegion=><optgroup label={placeRegion} key={placeRegion}>{places.filter(place=>place.region===placeRegion).sort((a,b)=>a.name.localeCompare(b.name)).map(place=><option value={place.id} key={place.id}>{place.name}</option>)}</optgroup>)}</select><span className="muted small">Linking a place makes schedule checks precise; clear it to use name matching.</span></label>
   <label className="small">Transit instructions<textarea className="field" rows={2} value={item.routeText??''} onChange={event=>onEdit(dayIndex,itemIndex,'routeText',event.target.value)} onBlur={save}/></label>
   <div className="filterGrid">
    <label className="small">Key Info<textarea className="field" rows={3} value={item.keyInfo??item.confirmationNumber??''} onChange={event=>onEdit(dayIndex,itemIndex,'keyInfo',event.target.value)} onBlur={save}/></label>
    <label className="small">Notes<textarea className="field" rows={3} value={item.userNotes??''} onChange={event=>onEdit(dayIndex,itemIndex,'userNotes',event.target.value)} onBlur={save}/></label>
   </div>
   <label className="toggleLine"><input type="checkbox" checked={Boolean(item.optional)} onChange={event=>{onEdit(dayIndex,itemIndex,'optional',event.target.checked);save();}}/> Optional stop</label>
   <div className="editorFooter">
    <div className="placeActions">
     <button className="btn" disabled={itemIndex===0} onClick={()=>onReorder(dayIndex,itemIndex,-1)}>↑ Move up</button>
     <button className="btn" disabled={itemIndex===days[dayIndex].items.length-1} onClick={()=>onReorder(dayIndex,itemIndex,1)}>↓ Move down</button>
     <select className="field" value={dayIndex} onChange={event=>onMove(dayIndex,itemIndex,Number(event.target.value))} aria-label="Move to another day">{days.map((day,index)=><option key={day.date} value={index}>{index===dayIndex?'Move to day…':`${day.label} · ${day.city}`}</option>)}</select>
     <button className="btn" onClick={()=>onDelete(dayIndex,itemIndex)}>Delete</button>
    </div>
    <div className="saveArea"><span className={`saveStatus ${saved?'visible':''}`} role="status">Saved</span><button className="btn primary" onClick={save}>Save changes</button></div>
   </div>
   <p className="muted small autoSaveNote">Changes also save automatically when you leave a field.</p>
   {item.mapUrl&&<a className="textLink" href={item.mapUrl} target="_blank" rel="noreferrer">Preview transit directions ↗</a>}
  </div>}
 </div>;
}

function ItineraryDetails({item,dayIndex,itemIndex,hoursCheck,onEdit,onSave,onShowPlace}:{item:ItineraryItem;dayIndex:number;itemIndex:number;hoursCheck?:ItineraryHoursCheck;onEdit:(di:number,ii:number,key:EditableKey,value:EditableValue)=>void;onSave:()=>void;onShowPlace:(place:Place)=>void}){
 const keyInfo=item.keyInfo??item.confirmationNumber??'';
 return <div className="timelineCopy"><div className="titleRow"><h3>{item.title}</h3>{item.optional&&<span className="chip neutral">Optional</span>}{hoursCheck&&<span className={`itineraryHoursBadge check-${hoursCheck.status}`}>{hoursCheck.label}</span>}</div>{item.details&&<p className="muted small">{item.details}</p>}{hoursCheck&&hoursCheck.status!=='open'&&<div className={`itineraryHoursNotice compact check-${hoursCheck.status}`}><div><strong>{hoursCheck.place.name}</strong><p>{hoursCheck.message}</p></div><button className="textButton" onClick={()=>onShowPlace(hoursCheck.place)}>Review</button></div>}<details style={{marginTop:'10px'}}><summary className="textLink" style={{cursor:'pointer'}}>Trip details</summary><div style={{paddingTop:'10px'}}>{item.routeText&&<p className="muted small">🚌 {item.routeText}</p>}{item.mapUrl&&<a className="textLink" href={item.mapUrl} target="_blank" rel="noreferrer">Transit from current location ↗</a>}<div className="filterGrid" style={{marginTop:'12px'}}><label className="small">Key Info<textarea className="field" rows={3} value={keyInfo} placeholder="Confirmation, seat, terminal, ticket details…" onChange={e=>onEdit(dayIndex,itemIndex,'keyInfo',e.target.value)} onBlur={onSave}/></label><label className="small">Notes<textarea className="field" rows={3} value={item.userNotes??''} placeholder="Add reminders or details" onChange={e=>onEdit(dayIndex,itemIndex,'userNotes',e.target.value)} onBlur={onSave}/></label></div></div></details></div>;
}

function formatClock(value:Date){
 return value.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
}

function statusLabel(status:AssistantState['status']){
 if(status==='beforeTrip')return 'Trip preview';
 if(status==='activity')return 'Right now';
 if(status==='leaveSoon')return 'Leave soon';
 if(status==='leaveNow')return 'Ready when you are';
 if(status==='explore')return 'Room to explore';
 if(status==='finished')return 'Open time';
 return 'Plenty of flexibility';
}

function AssistantView({assistant,tripState,now,liveLocation,locationStatus,locationMessage,onRequestLocation,onStopLocation,onComplete,onVisited,onShowPlaces,onExploreNearby}:{assistant:AssistantState;tripState:TripState;now:Date;liveLocation:AssistantLocation|null;locationStatus:'idle'|'requesting'|'active'|'error';locationMessage:string;onRequestLocation:()=>void;onStopLocation:()=>void;onComplete:(item:ItineraryItem)=>void;onVisited:(id:string)=>void;onShowPlaces:(place:Place)=>void;onExploreNearby:()=>void}){
 const [extraMinutes,setExtraMinutes]=useState<number|null>(null);
 const actionItem=assistant.currentActivity??assistant.nextReservation??assistant.nextItem;
 const fixedItem=assistant.nextReservation;
 const extraSuggestions=useMemo(()=>assistant.currentDay&&extraMinutes?findSuggestionCandidates(tripState,assistant.currentDay,extraMinutes,6,{anchor:assistant.suggestionAnchor,location:liveLocation??undefined,now}):[],[assistant.currentDay,assistant.suggestionAnchor,extraMinutes,liveLocation,now,tripState]);
 const displayedSuggestions:SuggestedPlace[]=extraMinutes?extraSuggestions:assistant.suggestions;
 return <section className="assistantPage">
  <div className={`card assistantHero assistant-${assistant.status}`}>
   <div className="assistantStatus"><span className="assistantPulse"/>{statusLabel(assistant.status)}</div>
   <div className="eyebrow">{assistant.currentDay?`${assistant.currentDay.label} · ${assistant.currentDay.city}`:'SMART TRIP ASSISTANT'}</div>
   <h2>{assistant.headline}</h2>
   <p>{assistant.subheadline}</p>
   {assistant.notices.map((notice,index)=><div className={`assistantNotice notice-${notice.type}`} key={`${notice.type}-${index}`}>{notice.message}</div>)}
   <div className="locationControl">
    <div><strong>{liveLocation?'Using your current location':'Nearby suggestions'}</strong><span>{liveLocation?'Your coordinates stay in this browser session and are not saved.':'Use your location for more accurate nearby ideas, or keep itinerary-based ranking.'}</span>{locationMessage&&<span className="locationError" role="status">{locationMessage}</span>}</div>
   <div className="placeActions">{liveLocation&&<button className="btn" onClick={onStopLocation}>Stop using location</button>}<button className="btn" onClick={onRequestLocation} disabled={locationStatus==='requesting'}>{locationStatus==='requesting'?'Finding you…':liveLocation?'Refresh location':'Use my current location'}</button></div>
   </div>
   <button className="btn primary assistantNearbyButton" onClick={onExploreNearby}>Explore everything nearby</button>
   <div className="extraTimeControl">
    <button className="btn" onClick={()=>setExtraMinutes(value=>value?null:60)}>{extraMinutes?'Close extra-time ideas':'I’ve got extra time'}</button>
    {extraMinutes&&<div className="timeChoices" aria-label="Available free time">
     {[30,60,90,120].map(minutes=><button className={extraMinutes===minutes?'active':''} key={minutes} onClick={()=>setExtraMinutes(minutes)}>{minutes<120?`${minutes} min`:'2 hours'}</button>)}
    </div>}
   </div>
  </div>

  {actionItem&&<div className="card assistantAction">
   <div>
    <div className="eyebrow">{assistant.currentActivity?'CURRENT ACTIVITY':fixedItem?'WHAT YOU NEED NEXT':'NEXT IDEA'}</div>
    <h2>{actionItem.title}</h2>
    <div className="muted">{actionItem.time}{actionItem.destination?` · ${actionItem.destination}`:''}</div>
    {actionItem.details&&<p>{actionItem.details}</p>}
    {actionItem.routeText&&<p className="muted small">🚌 {actionItem.routeText}</p>}
    {(actionItem.keyInfo||actionItem.confirmationNumber)&&<div className="keyInfo"><strong>Key Info</strong><p>{actionItem.keyInfo??actionItem.confirmationNumber}</p></div>}
   </div>
   <div className="assistantButtons">
    {actionItem.mapUrl&&<a className="btn primary" href={actionItem.mapUrl} target="_blank" rel="noreferrer">Open transit directions</a>}
    {!actionItem.done&&<button className="btn" onClick={()=>onComplete(actionItem)}>Mark complete</button>}
   </div>
  </div>}

  {assistant.leaveBy&&fixedItem&&<div className="card leaveCard">
   <div><div className="eyebrow">SUGGESTED DEPARTURE</div><strong className="leaveTime">{formatClock(assistant.leaveBy)}</strong><p className="muted">A relaxed estimate with the 15-minute preparation buffer included.</p></div>
   <div className="reservationSummary"><span>Next fixed plan</span><strong>{fixedItem.title}</strong><small>{fixedItem.time}</small></div>
  </div>}

  {displayedSuggestions.length>0&&<section>
   <div className="pageIntro assistantIntro"><div><div className="eyebrow">{extraMinutes?'EXTRA-TIME IDEAS':'GREAT OPTIONS RIGHT NOW'}</div><h2>{extraMinutes?`Good options for about ${extraMinutes} minutes`:'Options that fit your available time'}</h2><p className="muted">These are varied options from your saved places, not obligations. Pick whatever sounds good.</p></div><span className="chip">About {extraMinutes??assistant.availableMinutes} min free</span></div>
   <div className="grid assistantGrid">{displayedSuggestions.map(suggestion=><article className="card suggestionCard" key={suggestion.place.id}>
    <div className="between"><span className={`priority priority-${suggestion.place.priority}`}>{suggestion.place.priority==='must'?'Must do':suggestion.place.priority}</span><span className="duration">{suggestion.estimatedDuration} min</span></div>
    <h3>{suggestion.place.name}</h3>
    <div className="muted small">{suggestion.place.category} · {suggestion.place.area??suggestion.place.region}{suggestion.distanceKm!==undefined?` · ${suggestion.distanceKm<1?`${Math.max(50,Math.round(suggestion.distanceKm*1000/50)*50)} m`:`${suggestion.distanceKm.toFixed(1)} km`} away`:''}</div>
    {suggestion.place.notes&&<p>{suggestion.place.notes}</p>}
    <div className="whyBox"><strong>Why this fits</strong><ul>{suggestion.reasons.slice(0,3).map(reason=><li key={reason}>{reason}</li>)}</ul></div>
    <div className="placeActions"><a className="btn primary" href={suggestion.place.mapUrl} target="_blank" rel="noreferrer">Directions</a><button className="btn" onClick={()=>onShowPlaces(suggestion.place)}>View details</button><button className="textButton" onClick={()=>onVisited(suggestion.place.id)}>Mark visited</button></div>
   </article>)}</div>
  </section>}

  {extraMinutes&&displayedSuggestions.length===0&&<div className="card assistantEmpty"><div className="assistantEmptyIcon">✦</div><h2>No saved places fit that window yet.</h2><p className="muted">Try a longer time window or browse all saved places.</p></div>}
  {!extraMinutes&&assistant.suggestions.length===0&&!actionItem&&<div className="card assistantEmpty"><div className="assistantEmptyIcon">✦</div><h2>Nothing you need to do right now.</h2><p className="muted">Enjoy the open time. Your itinerary and saved places are still available whenever you want them.</p></div>}
 </section>;
}

function NearbyExplorer({state,currentDayIndex,now,liveLocation,locationStatus,locationMessage,onRequestLocation,onStopLocation,onVisited,onAddToItinerary,onShowPlace}:{state:TripState;currentDayIndex:number;now:Date;liveLocation:AssistantLocation|null;locationStatus:'idle'|'requesting'|'active'|'error';locationMessage:string;onRequestLocation:()=>void;onStopLocation:()=>void;onVisited:(id:string)=>void;onAddToItinerary:(place:Place,dayIndex:number)=>void;onShowPlace:(place:Place)=>void}){
 const defaultRegion=state.days[currentDayIndex]?.city.includes('Toronto')?'Toronto':'Niagara & Buffalo';
 const [selectedRegion,setSelectedRegion]=useState(defaultRegion);
 const [selectedArea,setSelectedArea]=useState('All');
 const [selectedCategory,setSelectedCategory]=useState('All');
 const [selectedPriority,setSelectedPriority]=useState<'All'|Place['priority']>('All');
 const [availableMinutes,setAvailableMinutes]=useState(60);
 const [maxDistanceKm,setMaxDistanceKm]=useState(2);
 const [openNowOnly,setOpenNowOnly]=useState(true);
 const [includeVisited,setIncludeVisited]=useState(false);
 const [nearbyQuery,setNearbyQuery]=useState('');
 const [targetDayIndex,setTargetDayIndex]=useState(currentDayIndex);
 const [addedMessage,setAddedMessage]=useState('');
 const day=state.days[targetDayIndex]??state.days[currentDayIndex];
 const areaChoices=useMemo(()=>areaOptions(state.places.filter(place=>selectedRegion==='All'||place.region===selectedRegion)),[selectedRegion,state.places]);
 const results=useMemo(()=>findNearbyPlaces(state,day,now,liveLocation??undefined,{
  query:nearbyQuery,
  region:selectedRegion,
  area:selectedArea,
  category:selectedCategory,
  priority:selectedPriority,
  availableMinutes,
  maxDistanceKm:liveLocation?maxDistanceKm:undefined,
  openNowOnly,
  includeVisited
 },60),[availableMinutes,day,includeVisited,liveLocation,maxDistanceKm,nearbyQuery,now,openNowOnly,selectedArea,selectedCategory,selectedPriority,selectedRegion,state]);
 function add(place:Place){
  onAddToItinerary(place,targetDayIndex);
  setAddedMessage(`${place.name} was added to ${state.days[targetDayIndex].label} as a flexible stop.`);
 }
 return <section className="nearbyPage">
  <div className="pageIntro"><div><div className="eyebrow">NEARBY EXPLORER</div><h2>What sounds good nearby?</h2><p className="muted">Browse possibilities without committing to them. Closed places and options that do not fit your available time can stay out of the way.</p></div><span className="chip">{results.length} option{results.length===1?'':'s'}</span></div>
  <div className="card nearbyControls">
   <div className="nearbyLocationPanel">
    <div><strong>{liveLocation?'Using your current location':'Choose an area or use your location'}</strong><p className="muted small">{liveLocation?'Results with saved coordinates are sorted by distance. Your location is not saved.':'Neighborhood mode works even when a place does not have coordinates yet.'}</p>{locationMessage&&<span className="locationError" role="status">{locationMessage}</span>}</div>
    <div className="placeActions">{liveLocation&&<button className="btn" onClick={onStopLocation}>Use neighborhood instead</button>}<button className="btn primary" onClick={onRequestLocation} disabled={locationStatus==='requesting'}>{locationStatus==='requesting'?'Finding you…':liveLocation?'Refresh location':'Use my current location'}</button></div>
   </div>
   <div className="nearbyFilterGrid">
    <label>Search<input className="field" value={nearbyQuery} onChange={event=>setNearbyQuery(event.target.value)} placeholder="Coffee, museum, poutine…"/></label>
    <label>Region<select className="field" value={selectedRegion} onChange={event=>{setSelectedRegion(event.target.value);setSelectedArea('All');}}><option>All</option><option>Toronto</option><option>Niagara & Buffalo</option></select></label>
    <label>Neighborhood<select className="field" value={selectedArea} onChange={event=>setSelectedArea(event.target.value)}><option>All</option>{areaChoices.map(value=><option value={value} key={value}>{value}</option>)}</select></label>
    <label>Category<select className="field" value={selectedCategory} onChange={event=>setSelectedCategory(event.target.value)}><option>All</option>{[...new Set(state.places.map(place=>place.category))].sort().map(value=><option value={value} key={value}>{value}</option>)}</select></label>
    <label>Priority<select className="field" value={selectedPriority} onChange={event=>setSelectedPriority(event.target.value as typeof selectedPriority)}><option>All</option><option value="must">Must do</option><option value="possible">Possible</option><option value="backup">Backup</option></select></label>
    <label>Time available<select className="field" value={availableMinutes} onChange={event=>setAvailableMinutes(Number(event.target.value))}><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={90}>90 minutes</option><option value={120}>2 hours</option><option value={240}>Half day</option></select></label>
    {liveLocation&&<label>Maximum distance<select className="field" value={maxDistanceKm} onChange={event=>setMaxDistanceKm(Number(event.target.value))}><option value={0.5}>500 m</option><option value={1}>1 km</option><option value={2}>2 km</option><option value={5}>5 km</option><option value={15}>15 km</option></select></label>}
    <label>Add results to<select className="field" value={targetDayIndex} onChange={event=>setTargetDayIndex(Number(event.target.value))}>{state.days.map((tripDay,index)=><option value={index} key={tripDay.date}>{tripDay.label} · {tripDay.city}</option>)}</select></label>
   </div>
   <div className="nearbyToggles"><label className="toggleLine"><input type="checkbox" checked={openNowOnly} onChange={event=>setOpenNowOnly(event.target.checked)}/> Open now or hours not required</label><label className="toggleLine"><input type="checkbox" checked={includeVisited} onChange={event=>setIncludeVisited(event.target.checked)}/> Include visited places</label></div>
   {addedMessage&&<div className="nearbyAdded" role="status"><span>✓</span>{addedMessage}<button className="textButton" onClick={()=>setAddedMessage('')}>Dismiss</button></div>}
  </div>
  <div className="grid nearbyGrid">
   {results.map(suggestion=>{const open=placeOpenStatus(suggestion.place,now);const directions=mapsUrl(suggestion.place.formattedAddress||suggestion.place.name);const displayArea=suggestion.place.area??suggestPlaceArea(suggestion.place);return <article className={`card nearbyCard ${suggestion.place.visited?'visited':''}`} key={suggestion.place.id}>
    <div className="between"><span className={`priority priority-${suggestion.place.priority}`}>{suggestion.place.priority==='must'?'Must do':suggestion.place.priority}</span><span className={`hoursStatus hours-${open.status==='ignored'?'unknown':open.status}`}>{open.status==='open'?'Open now':open.status==='closed'?'Closed now':open.status==='ignored'?'Hours not needed':'Hours unknown'}</span></div>
    <h3>{suggestion.place.name}</h3>
    <div className="placeLocationMeta"><span className="chip neutral">{suggestion.place.category}</span>{displayArea&&<span className="areaBadge">{displayArea.split(' — ').at(-1)}</span>}</div>
    <p className="nearbyFacts"><strong>{suggestion.estimatedDuration} min</strong>{suggestion.distanceKm!==undefined&&<span>{suggestion.distanceKm<1?`${Math.max(50,Math.round(suggestion.distanceKm*1000/50)*50)} m away`:`${suggestion.distanceKm.toFixed(1)} km away`}</span>}{suggestion.walkingMinutes!==undefined&&<span>≈ {suggestion.walkingMinutes} min walk</span>}</p>
    {suggestion.place.notes&&<p className="muted small">{suggestion.place.notes}</p>}
    <div className="whyBox"><strong>Why it fits</strong><ul>{suggestion.reasons.slice(0,3).map(reason=><li key={reason}>{reason}</li>)}</ul></div>
    <div className="nearbyCardActions"><a className="btn" href={directions} target="_blank" rel="noreferrer">Transit directions</a><button className="btn primary" onClick={()=>add(suggestion.place)}>Add to {state.days[targetDayIndex].label}</button><button className="textButton" onClick={()=>onShowPlace(suggestion.place)}>Details</button><button className="textButton" onClick={()=>onVisited(suggestion.place.id)}>{suggestion.place.visited?'Mark unvisited':'Mark visited'}</button></div>
   </article>;})}
  </div>
  {!results.length&&<div className="card assistantEmpty"><div className="assistantEmptyIcon">⌖</div><h2>No saved places match this combination.</h2><p className="muted">Try a larger area, a longer time window, or turn off “Open now.”</p></div>}
 </section>;
}

const placeWeekdays:[Weekday,string][]=[['monday','Mon'],['tuesday','Tue'],['wednesday','Wed'],['thursday','Thu'],['friday','Fri'],['saturday','Sat'],['sunday','Sun']];

type HoursFilter='all'|'missing'|'stale'|'google'|'manual'|'ignored';
type RefreshResult={placeId:string;name:string;ok:boolean;matchedName?:string;matchWarning?:string;error?:string};

function hoursAgeDays(place:Place){
 if(!place.hoursVerifiedAt)return undefined;
 const verified=new Date(place.hoursVerifiedAt).getTime();
 if(!Number.isFinite(verified))return undefined;
 return Math.max(0,Math.floor((Date.now()-verified)/86400000));
}

function hoursFilterStatus(place:Place):Exclude<HoursFilter,'all'>{
 if(place.ignoreHours)return 'ignored';
 if(!Object.keys(place.weeklyHours??{}).length)return 'missing';
 const age=hoursAgeDays(place);
 if(age===undefined||age>=30)return 'stale';
 return place.hoursSource==='google'?'google':'manual';
}

function hoursStatusCopy(place:Place){
 const status=hoursFilterStatus(place);
 if(status==='missing')return 'Hours missing';
 if(status==='stale')return `Stale${hoursAgeDays(place)!==undefined?` · ${hoursAgeDays(place)} days old`:''}`;
 if(status==='google')return `Google updated · ${hoursAgeDays(place)??0} days ago`;
 if(status==='ignored')return 'Hours ignored';
 return `Manual hours · ${hoursAgeDays(place)??0} days ago`;
}

function HoursManager({places,days,onUpdated,onIgnoreHours,onOpenPlace}:{places:Place[];days:TripState['days'];onUpdated:(places:Place[])=>void;onIgnoreHours:(place:Place,ignoreHours:boolean)=>void;onOpenPlace:(place:Place)=>void}){
 const [query,setQuery]=useState('');
 const [regionFilter,setRegionFilter]=useState('All');
 const [categoryFilter,setCategoryFilter]=useState('All');
 const [priorityFilter,setPriorityFilter]=useState('All');
 const [dayFilter,setDayFilter]=useState('All');
 const [statusFilter,setStatusFilter]=useState<HoursFilter>('all');
 const [selected,setSelected]=useState<Set<string>>(()=>new Set());
 const [refreshing,setRefreshing]=useState(false);
 const [results,setResults]=useState<RefreshResult[]>([]);
 const categories=useMemo(()=>[...new Set(places.map(place=>place.category))].sort(),[places]);
 const counts=useMemo(()=>places.reduce((total,place)=>{
  total[hoursFilterStatus(place)]++;
  return total;
 },{missing:0,stale:0,google:0,manual:0,ignored:0}),[places]);
 const visible=useMemo(()=>{
  const needle=query.trim().toLowerCase();
  return places.filter(place=>{
   const status=hoursFilterStatus(place);
   return (!needle||`${place.name} ${place.formattedAddress??''} ${place.notes}`.toLowerCase().includes(needle))
    &&(regionFilter==='All'||place.region===regionFilter)
    &&(categoryFilter==='All'||place.category===categoryFilter)
    &&(priorityFilter==='All'||place.priority===priorityFilter)
    &&(dayFilter==='All'||place.recommendedDates?.includes(dayFilter))
    &&(statusFilter==='all'||status===statusFilter);
  }).sort((a,b)=>{
   const order={missing:0,stale:1,manual:2,google:3,ignored:4};
   return order[hoursFilterStatus(a)]-order[hoursFilterStatus(b)]||a.name.localeCompare(b.name);
  });
 },[categoryFilter,dayFilter,places,priorityFilter,query,regionFilter,statusFilter]);

 function toggleSelected(id:string){
  setSelected(current=>{
   const next=new Set(current);
   if(next.has(id))next.delete(id);
   else if(next.size<10)next.add(id);
   return next;
  });
 }
 function selectVisible(){
  setSelected(new Set(visible.slice(0,10).map(place=>place.id)));
 }
 function toggleIgnored(place:Place){
  if(!place.ignoreHours)setSelected(current=>{const next=new Set(current);next.delete(place.id);return next;});
  onIgnoreHours(place,!place.ignoreHours);
 }
 async function refresh(ids:string[]){
  if(!ids.length)return;
  if(ids.length>1&&!window.confirm(`Refresh ${ids.length} places from Google? This will use ${ids.length} Places requests.`))return;
  const storedSecret=sessionStorage.getItem('places-refresh-secret');
  const secret=storedSecret||window.prompt('Enter the Places refresh password');
  if(!secret)return;
  sessionStorage.setItem('places-refresh-secret',secret);
  setRefreshing(true);
  setResults([]);
  try{
   const response=await fetch('/api/places/refresh',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({placeIds:ids,secret})});
   const result=await response.json() as {places?:Place[];results?:RefreshResult[];error?:string};
   if(!response.ok)throw new Error(result.error||'Unable to refresh these places.');
   if(result.places?.length)onUpdated(result.places);
   setResults(result.results??[]);
   setSelected(new Set());
  }catch(error){
   if(error instanceof Error&&error.message.includes('password'))sessionStorage.removeItem('places-refresh-secret');
   setResults([{placeId:'batch',name:'Batch refresh',ok:false,error:error instanceof Error?error.message:'Unable to refresh these places.'}]);
  }finally{setRefreshing(false);}
 }

 return <section className="hoursManager">
  <div className="pageIntro"><div><div className="eyebrow">OPENING HOURS</div><h2>Keep recommendations current</h2><p className="muted">Refresh only the places you care about. Batches are capped at 10 Google requests.</p></div><div className="placeActions"><span className="chip">{places.filter(place=>Number.isFinite(place.latitude)&&Number.isFinite(place.longitude)).length}/{places.length} locations</span><span className="chip">{places.length} places</span></div></div>
  <div className="hoursStats">
   <button className={statusFilter==='missing'?'active':''} onClick={()=>setStatusFilter(statusFilter==='missing'?'all':'missing')}><span>Missing</span><strong>{counts.missing}</strong></button>
   <button className={statusFilter==='stale'?'active':''} onClick={()=>setStatusFilter(statusFilter==='stale'?'all':'stale')}><span>Stale (30+ days)</span><strong>{counts.stale}</strong></button>
   <button className={statusFilter==='google'?'active':''} onClick={()=>setStatusFilter(statusFilter==='google'?'all':'google')}><span>Google updated</span><strong>{counts.google}</strong></button>
   <button className={statusFilter==='manual'?'active':''} onClick={()=>setStatusFilter(statusFilter==='manual'?'all':'manual')}><span>Manual</span><strong>{counts.manual}</strong></button>
   <button className={statusFilter==='ignored'?'active':''} onClick={()=>setStatusFilter(statusFilter==='ignored'?'all':'ignored')}><span>Ignored</span><strong>{counts.ignored}</strong></button>
  </div>
  <div className="card hoursToolbar">
   <input className="field searchField" placeholder="Search places or addresses…" value={query} onChange={event=>setQuery(event.target.value)}/>
   <div className="hoursFilters">
    <select className="field" value={regionFilter} onChange={event=>setRegionFilter(event.target.value)}><option>All</option><option>Toronto</option><option>Niagara & Buffalo</option></select>
    <select className="field" value={categoryFilter} onChange={event=>setCategoryFilter(event.target.value)}><option>All</option>{categories.map(value=><option key={value}>{value}</option>)}</select>
    <select className="field" value={priorityFilter} onChange={event=>setPriorityFilter(event.target.value)}><option>All</option><option value="must">Must do</option><option value="possible">Possible</option><option value="backup">Backup</option></select>
    <select className="field" value={dayFilter} onChange={event=>setDayFilter(event.target.value)}><option>All</option>{days.map(day=><option value={day.date} key={day.date}>{day.label}</option>)}</select>
   </div>
   <div className="between hoursBatchBar"><div className="placeActions"><button className="btn" onClick={selectVisible} disabled={!visible.length}>Select first {Math.min(10,visible.length)}</button><button className="btn" onClick={()=>setSelected(new Set())} disabled={!selected.size}>Clear</button></div><div className="placeActions"><span className="chip neutral">{selected.size}/10 selected</span><button className="btn primary" onClick={()=>refresh([...selected])} disabled={!selected.size||refreshing}>{refreshing?'Refreshing…':`Refresh selected${selected.size?` (${selected.size})`:''}`}</button></div></div>
  </div>
  {results.length>0&&<div className="card refreshResults"><div className="between"><strong>Last refresh</strong><button className="textButton" onClick={()=>setResults([])}>Dismiss</button></div>{results.map(result=><div className={`refreshResult ${result.ok?'success':'failure'}`} key={result.placeId}><span>{result.ok?'✓':'!'}</span><div><strong>{result.name}</strong><p>{result.ok?(result.matchWarning??`Matched ${result.matchedName??result.name}`):result.error}</p></div></div>)}</div>}
  <div className="hoursTable" role="table" aria-label="Saved place hours">
   {visible.map(place=>{const status=hoursFilterStatus(place);const checked=selected.has(place.id);return <article className="hoursPlaceRow" role="row" key={place.id}>
    <input type="checkbox" aria-label={`Select ${place.name}`} checked={checked} disabled={!checked&&selected.size>=10} onChange={()=>toggleSelected(place.id)}/>
    <div className="hoursPlaceName"><strong>{place.name}</strong><span>{place.region} · {place.category} · {Number.isFinite(place.latitude)&&Number.isFinite(place.longitude)?'Location saved':'Location needed'}</span>{place.formattedAddress&&<small>{place.formattedAddress}</small>}</div>
    <span className={`hoursStatus manager-${status}`}>{hoursStatusCopy(place)}</span>
    <span className={`priority priority-${place.priority}`}>{place.priority==='must'?'Must do':place.priority}</span>
    <div className="placeActions"><button className="btn" onClick={()=>toggleIgnored(place)}>{place.ignoreHours?'Use hours':'Ignore hours'}</button><button className="btn" onClick={()=>refresh([place.id])} disabled={refreshing}>Refresh</button><button className="textButton" onClick={()=>onOpenPlace(place)}>Details</button></div>
   </article>;})}
  </div>
  {!visible.length&&<div className="empty card">No places match these hours filters.</div>}
 </section>;
}

function PlaceCard({place,onToggle,onEdit,onEditHours,onSave,onGoogleUpdate,onDuplicate,onDelete,tripDates}:{place:Place;onToggle:()=>void;onEdit?:(changes:Partial<Place>)=>void;onEditHours?:(day:Weekday,changes:{open?:string;close?:string;closed?:boolean})=>void;onSave?:()=>void;onGoogleUpdate?:(place:Place)=>void;onDuplicate?:()=>void;onDelete?:()=>void;tripDates?:TripState['days']}){
 const [editing,setEditing]=useState(false);
 const [saved,setSaved]=useState(false);
 const [refreshing,setRefreshing]=useState(false);
 const [refreshMessage,setRefreshMessage]=useState('');
 const hoursCount=Object.keys(place.weeklyHours??{}).length;
 const openStatus=placeOpenStatus(place,new Date());
 const areaSuggestion=!place.area?suggestPlaceArea(place):undefined;
 function save(){
  onSave?.();
  setSaved(true);
  window.setTimeout(()=>setSaved(false),1800);
 }
 function edit(changes:Partial<Place>,saveImmediately=false){
  onEdit?.(changes);
  if(saveImmediately)window.setTimeout(save,0);
 }
 async function refreshFromGoogle(){
  const storedSecret=sessionStorage.getItem('places-refresh-secret');
  const secret=storedSecret||window.prompt('Enter the Places refresh password');
  if(!secret)return;
  sessionStorage.setItem('places-refresh-secret',secret);
  setRefreshing(true);
  setRefreshMessage('');
  try{
   const response=await fetch('/api/places/refresh',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({placeId:place.id,secret})});
   const result=await response.json() as {place?:Place;matchedName?:string;matchWarning?:string;error?:string};
   if(!response.ok||!result.place)throw new Error(result.error||'Unable to refresh this place.');
   onGoogleUpdate?.(result.place);
   setRefreshMessage(result.matchWarning??`Updated from Google${result.matchedName?` · matched ${result.matchedName}`:''}`);
  }catch(error){
   if(error instanceof Error&&error.message.includes('password'))sessionStorage.removeItem('places-refresh-secret');
   setRefreshMessage(error instanceof Error?error.message:'Unable to refresh this place.');
  }finally{setRefreshing(false);}
 }
 return <article className={`card placeCard ${place.visited?'visited':''} ${editing?'editing':''}`}>
  <div className="between"><span className={`priority priority-${place.priority}`}>{place.priority==='must'?'Must do':place.priority}</span><button className="visitedButton" onClick={onToggle}>{place.visited?'✓ Visited':'Mark visited'}</button></div>
  <h3>{place.name}</h3>
  <div className="placeLocationMeta"><span className="muted small">{place.region} · {place.category}</span>{place.area&&<span className="areaBadge">{place.area}</span>}</div>
  {place.ignoreHours?<div className="hoursStatus manager-ignored">Hours ignored</div>:hoursCount>0?<div className={`hoursStatus hours-${openStatus.status}`}>{openStatus.status==='open'?'Open now':openStatus.status==='closed'?'Closed now':'Hours added'}{place.hoursVerifiedAt?` · ${place.hoursSource==='google'?'Google refresh':'verified'} ${new Date(place.hoursVerifiedAt).toLocaleDateString()}`:' · not verified'}</div>:<div className="hoursStatus hours-unknown">Hours not added</div>}
  {place.formattedAddress&&<div className="muted small">{place.formattedAddress}</div>}
  {place.notes&&<p>{place.notes}</p>}
  {place.tags.length>0&&<div className="tagRow">{place.tags.slice(0,4).map(tag=><span className="chip neutral" key={tag}>{tag}</span>)}</div>}
  <div className="placeActions"><a className="btn primary" href={place.mapUrl||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`} target="_blank" rel="noreferrer">Directions</a>{place.menuUrl&&<a className="btn" href={place.menuUrl} target="_blank" rel="noreferrer">Menu</a>}{place.websiteUrl&&<a className="btn" href={place.websiteUrl} target="_blank" rel="noreferrer">Website</a>}{onEdit&&<button className="btn" onClick={()=>setEditing(value=>!value)}>{editing?'Close editor':'Edit place'}</button>}</div>
  {editing&&onEdit&&onEditHours&&<div className="placeEditor">
   <div className="placeEditorGrid">
    <label>Name<input className="field" value={place.name} onChange={event=>edit({name:event.target.value})} onBlur={save}/></label>
    <label>Category<input className="field" value={place.category} onChange={event=>edit({category:event.target.value})} onBlur={save}/></label>
    <label>Region<select className="field" value={place.region} onChange={event=>edit({region:event.target.value},true)}><option>Toronto</option><option>Niagara & Buffalo</option></select></label>
    <label>Area<input className="field" list={`area-options-${place.id}`} value={place.area??''} placeholder="Choose or type a neighborhood" onChange={event=>edit({area:event.target.value})} onBlur={save}/><datalist id={`area-options-${place.id}`}>{suggestedAreaNames.map(value=><option value={value} key={value}/>)}</datalist>{areaSuggestion&&<button className="areaSuggestion" type="button" onClick={()=>edit({area:areaSuggestion},true)}>Use suggestion: {areaSuggestion}</button>}</label>
    <label>Priority<select className="field" value={place.priority} onChange={event=>edit({priority:event.target.value as Place['priority']},true)}><option value="must">Must do</option><option value="possible">Possible</option><option value="backup">Backup</option></select></label>
    <label>Visit time (minutes)<input className="field" type="number" min="5" step="5" value={place.estimatedDuration??60} onChange={event=>edit({estimatedDuration:Number(event.target.value)})} onBlur={save}/></label>
    <label>Time zone<input className="field" value={place.hoursTimeZone??'America/Toronto'} onChange={event=>edit({hoursTimeZone:event.target.value})} onBlur={save}/></label>
    <label className="toggleLine placeHoursToggle"><input type="checkbox" checked={Boolean(place.ignoreHours)} onChange={event=>edit({ignoreHours:event.target.checked},true)}/> Ignore opening hours</label>
   </div>
   <label>Notes<textarea className="field" rows={3} value={place.notes} onChange={event=>edit({notes:event.target.value})} onBlur={save}/></label>
   <div className="placeEditorGrid links">
    <label>Google Maps URL<input className="field" value={place.mapUrl} onChange={event=>edit({mapUrl:event.target.value})} onBlur={save}/></label>
    <label>Menu URL<input className="field" value={place.menuUrl} onChange={event=>edit({menuUrl:event.target.value})} onBlur={save}/></label>
    <label>Website URL<input className="field" value={place.websiteUrl} onChange={event=>edit({websiteUrl:event.target.value})} onBlur={save}/></label>
    <label>Tags<input className="field" value={place.tags.join(', ')} onChange={event=>edit({tags:event.target.value.split(',').map(tag=>tag.trim()).filter(Boolean)})} onBlur={save}/></label>
   </div>
   {tripDates&&<fieldset className="recommendedDates"><legend>Recommended trip days</legend><div>{tripDates.map(day=><label className="toggleLine" key={day.date}><input type="checkbox" checked={place.recommendedDates?.includes(day.date)??false} onChange={event=>{const dates=new Set(place.recommendedDates??[]);if(event.target.checked)dates.add(day.date);else dates.delete(day.date);edit({recommendedDates:[...dates]},true);}}/> {day.label}</label>)}</div></fieldset>}
   <div className={`hoursEditor ${place.ignoreHours?'hoursEditorIgnored':''}`}>
    <div className="between"><div><strong>Weekly hours</strong><p className="muted small">{place.ignoreHours?'Hours checks are disabled. Google refresh can still update its address and location.':'Used to prevent closed-place suggestions.'}</p></div><div className="placeActions"><button className="btn primary" onClick={refreshFromGoogle} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh Google data'}</button><button className="btn" disabled={place.ignoreHours} onClick={()=>edit({hoursVerifiedAt:new Date().toISOString(),hoursSource:'manual'},true)}>Mark verified today</button></div></div>
    {refreshMessage&&<p className="muted small" role="status">{refreshMessage}</p>}
    {placeWeekdays.map(([day,label])=>{const hours=place.weeklyHours?.[day]??{open:'09:00',close:'17:00',closed:false};return <div className="hoursRow" key={day}><strong>{label}</strong><input className="field" type="time" value={hours.open} disabled={hours.closed||place.ignoreHours} onChange={event=>onEditHours(day,{open:event.target.value})} onBlur={save}/><span>to</span><input className="field" type="time" value={hours.close} disabled={hours.closed||place.ignoreHours} onChange={event=>onEditHours(day,{close:event.target.value})} onBlur={save}/><label className="toggleLine"><input type="checkbox" checked={Boolean(hours.closed)} disabled={place.ignoreHours} onChange={event=>{onEditHours(day,{closed:event.target.checked});window.setTimeout(save,0);}}/> Closed</label></div>;})}
   </div>
   <div className="editorFooter"><div className="placeActions"><button className="btn" onClick={onDuplicate}>Duplicate</button><button className="btn danger" onClick={onDelete}>Delete place</button></div><div className="saveArea"><span className={`saveStatus ${saved?'visible':''}`} role="status">Saved</span><button className="btn primary" onClick={save}>Save changes</button></div></div>
  </div>}
 </article>;
}
