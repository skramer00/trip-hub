'use client';

import Image from 'next/image';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {buildAssistantState,estimatedItemDuration,findNearbyPlaces,findSuggestionCandidates,foodsTriedOnDate,inferItemType,isFixedItem,placeOpenStatus} from '@/lib/assistant';
import {checkItineraryHours} from '@/lib/place-hours';
import {areaOptions,groupPlacesByArea,suggestedAreaNames,suggestPlaceArea} from '@/lib/place-areas';
import {analyzeDayRoute,boardPlace,buildGoogleMapsDayRoute,buildGoogleMapsLeg,dayRouteStops,placeArea,routeOrderChanged,suggestDayOrder} from '@/lib/board-planner';
import {analyzeDaySchedule,applySuggestedDayTimes} from '@/lib/day-schedule';
import type {DayScheduleConnection} from '@/lib/day-schedule';
import {locationResolution,suggestedLocationMatches} from '@/lib/location-resolver';
import {buildTripReadiness} from '@/lib/trip-readiness';
import type {ReadinessAction,ReadinessTarget} from '@/lib/trip-readiness';
import {deleteReservationAttachment,listReservationAttachments,saveReservationAttachment} from '@/lib/attachments';
import type {ReservationAttachment} from '@/lib/attachments';
import type {ItineraryHoursCheck} from '@/lib/place-hours';
import type {AssistantLocation,AssistantState,SuggestedPlace} from '@/lib/assistant';
import type {CheckItem,GooglePlaceCandidate,ItineraryItem,JournalMoment,JournalMomentType,NearbyDietaryMode,NearbyPreset,Place,PublicTripSection,TravelMode,TripCoverTheme,TripSettings,TripState,Weekday} from '@/lib/types';
import type {DietaryFit,DietaryPreference} from '@/lib/types';
import {dietaryFitLabel,dietaryFits,dietaryPreferenceLabel,dietaryPreferences,dietaryRating,isFoodPlace,normalizeNearbyDietaryMode,placeMatchesDietaryFilter,setDietaryRating} from '@/lib/dietary';
import type {DietaryPlaceFitFilter} from '@/lib/dietary';
import {placeSpecialtyFoodIds,placeSpecialtyFoods} from '@/lib/food-specialties';
import {weatherNotice,weatherPackingReminders,weatherPreference} from '@/lib/weather';
import {publicTripState} from '@/lib/public-state';
import {resolvedTripSettings,tripDateLabel} from '@/lib/trip-settings';
import {calendarEntryDetails,entryCalendar,fixedCalendarEntries,googleCalendarUrl,restoredTripState,tripBackup,tripCalendar} from '@/lib/trip-export';
import {validateTripState} from '@/lib/trip-validation';
import type {WeatherResponse} from '@/lib/weather';
import DietaryReview from '@/components/DietaryReview';
import TripChecklist from '@/components/TripChecklist';
import RouteConnector from '@/components/RouteConnector';
import AddToDayPanel from '@/components/AddToDayPanel';
import {categoryForGooglePlace,defaultDurationForCategory,formatTripTime,itineraryItemFromPlace,regionForTripDay} from '@/lib/add-to-day';
import {lastSyncKey,localStateKey,markCloudSynced,pendingSyncKey,pushCloudState,readLocalState,stageDeviceState} from '@/lib/client-state';
import {formatPrepDueDate,nextPrepTask,prepDueStatus,prepTasks} from '@/lib/trip-prep';

const tabs=['Overview','Today','Assistant','Journal','Nearby','Board','Itinerary','Locations','Reservations','Settings','Food','Dietary','Places','Hours','Checklist'] as const;
type Tab=(typeof tabs)[number];
const navGroups=[
 {label:'Trip',tabs:['Overview','Today','Assistant','Journal'] as Tab[]},
 {label:'Plan',tabs:['Board','Itinerary','Locations','Reservations','Settings'] as Tab[]},
 {label:'Explore',tabs:['Nearby','Places','Hours'] as Tab[]},
 {label:'Lists',tabs:['Food','Dietary','Checklist'] as Tab[]}
] as const;
const tabLabels:Partial<Record<Tab,string>>={Today:'Daily Plan',Assistant:'Trip Assistant',Board:'Trip Board',Itinerary:'Edit Itinerary',Locations:'Location Setup',Settings:'Trip Settings',Places:'Saved Places',Hours:'Business Hours',Food:'Food List',Dietary:'Dietary Review'};
function publicNavGroups(sections:PublicTripSection[]){
 const groups:{label:string;tabs:Tab[]}[]=[];
 if(sections.includes('overview')||sections.includes('today')||sections.includes('recap'))groups.push({label:'Trip',tabs:[...(sections.includes('overview')?['Overview'] as Tab[]:[]),...(sections.includes('today')?['Today','Assistant'] as Tab[]:[]),...(sections.includes('recap')?['Journal'] as Tab[]:[])]});
 if(sections.includes('explore'))groups.push({label:'Explore',tabs:['Nearby','Places']});
 if(sections.includes('food'))groups.push({label:'Food',tabs:['Food']});
 return groups.length?groups:[{label:'Trip',tabs:['Today'] as Tab[]}];
}
function publicLandingTab(state:TripState){return publicNavGroups(resolvedTripSettings(state.settings).publicSections)[0].tabs[0];}
type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
type AssistantPreview={date:string;time:string;area:string};

type EditableKey='time'|'title'|'details'|'destination'|'routeText'|'keyInfo'|'userNotes'|'optional'|'skipped'|'fixed'|'type'|'estimatedDuration'|'travelMinutes'|'travelMode'|'prepBuffer'|'placeId'|'locationNotNeeded';
type EditableValue=string|boolean|number|undefined;
const offlineReadyKey='trip-offline-ready-v2';
const boardHiddenDaysKey='trip-board-hidden-days-v1';
const editorSessionKey='trip-editor-session-v1';
const restoreRollbackKey='trip-before-restore-v1';

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
function downloadText(filename:string,contents:string,type:string){
 const url=URL.createObjectURL(new Blob([contents],{type}));
 const link=document.createElement('a');
 link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),0);
}
function safeFilename(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'trip';}
function previewMoment(preview:AssistantPreview|null,fallback:Date){
 if(!preview)return fallback;
 const [year,month,day]=preview.date.split('-').map(Number);
 const [hour,minute]=preview.time.split(':').map(Number);
 if(!year||!month||!day||!Number.isFinite(hour)||!Number.isFinite(minute))return fallback;
 return new Date(year,month-1,day,hour,minute,0,0);
}
function itineraryItemRegion(day:TripState['days'][number],item:ItineraryItem){
 const locationText=`${item.title} ${item.destination??''}`.toLowerCase();
 if(/\b(lax|los angeles|california)\b/.test(locationText))return 'Other';
 return day.city.includes('Toronto')?'Toronto':'Niagara & Buffalo';
}

export default function TripApp(){
 const [state,setState]=useState<TripState|null>(null);
 const [tab,setTab]=useState<Tab>('Today');
 const [cloud,setCloud]=useState(false);
 const [query,setQuery]=useState('');
 const [region,setRegion]=useState('All');
 const [area,setArea]=useState('All');
 const [category,setCategory]=useState('All');
 const [priority,setPriority]=useState('All');
 const [dietFilter,setDietFilter]=useState<'All'|DietaryPreference>('All');
 const [dietFitFilter,setDietFitFilter]=useState<DietaryPlaceFitFilter>('recommended');
 const [showVisited,setShowVisited]=useState(true);
 const [groupPlaceView,setGroupPlaceView]=useState(true);
 const [selectedPlaceIds,setSelectedPlaceIds]=useState<Set<string>>(()=>new Set());
 const [bulkPlaceArea,setBulkPlaceArea]=useState('');
 const [now,setNow]=useState(()=>new Date());
 const [online,setOnline]=useState(()=>typeof navigator==='undefined'||navigator.onLine);
 const [pendingSync,setPendingSync]=useState(false);
 const [syncError,setSyncError]=useState('');
 const [lastSyncedAt,setLastSyncedAt]=useState<string|null>(null);
 const [restoreRollbackAvailable,setRestoreRollbackAvailable]=useState(false);
 const [offlineReady,setOfflineReady]=useState(false);
 const [offlineDownloading,setOfflineDownloading]=useState(false);
 const [offlineMessage,setOfflineMessage]=useState('');
 const [installPrompt,setInstallPrompt]=useState<InstallPromptEvent|null>(null);
 const [boardUndo,setBoardUndo]=useState<TripState|null>(null);
 const [addToDayIndex,setAddToDayIndex]=useState<number|null>(null);
 const [locationUndo,setLocationUndo]=useState<TripState|null>(null);
 const [liveLocation,setLiveLocation]=useState<AssistantLocation|null>(null);
 const [locationStatus,setLocationStatus]=useState<'idle'|'requesting'|'active'|'error'>('idle');
 const [locationMessage,setLocationMessage]=useState('');
 const [assistantPreview,setAssistantPreview]=useState<AssistantPreview|null>(null);
 const [isEditor,setIsEditor]=useState(false);
 const [authReady,setAuthReady]=useState(false);
 const [showEditorUnlock,setShowEditorUnlock]=useState(false);
 const [editorPin,setEditorPin]=useState('');
 const [authError,setAuthError]=useState('');
 const [authBusy,setAuthBusy]=useState(false);
 const [showSharePanel,setShowSharePanel]=useState(false);
 const [publicPreview,setPublicPreview]=useState(false);
 const [publicUrl,setPublicUrl]=useState('');
 const [qrCode,setQrCode]=useState('');
 const [shareMessage,setShareMessage]=useState('');
 const [showDailyBrief,setShowDailyBrief]=useState(false);
 const [briefDayIndex,setBriefDayIndex]=useState(0);
 const [itineraryView,setItineraryView]=useState<'planning'|'details'>('planning');

 useEffect(()=>{
  let active=true;
  const hasPending=localStorage.getItem(pendingSyncKey)==='true';
  setOfflineReady(localStorage.getItem(offlineReadyKey)==='true');
  setLastSyncedAt(localStorage.getItem(lastSyncKey));
  setRestoreRollbackAvailable(Boolean(localStorage.getItem(restoreRollbackKey)));
  void fetch('/api/state').then(async response=>{
   if(!response.ok)throw new Error('Trip state unavailable');
   const result=await response.json();
   if(!active)return;
   const editor=Boolean(result.editor);
   const local=editor?readLocalState(localStorage):null;
   const selected=editor&&hasPending&&local?local:result.state;
   setIsEditor(editor);
   if(editor)localStorage.setItem(editorSessionKey,'true');else localStorage.removeItem(editorSessionKey);
   setAuthReady(true);
   setPendingSync(editor&&hasPending);
   setState(selected);
   if(!editor)setTab(publicLandingTab(selected));
   setCloud(Boolean(result.cloud));
   if(editor)localStorage.setItem(localStateKey,JSON.stringify(selected));
   if(editor&&hasPending&&local&&navigator.onLine){
    try{
     const synced=await pushCloudState(local);
     if(active&&synced){
      localStorage.removeItem(pendingSyncKey);
      setPendingSync(false);
      setCloud(true);
      recordSynced();
      setSyncError('');
     }
    }catch(error){if(active)setSyncError(error instanceof Error?error.message:'Shared saving is temporarily unavailable.');}
   }
  }).catch(()=>{
   if(!active)return;
   const local=readLocalState(localStorage);
   if(localStorage.getItem(editorSessionKey)==='true'&&local){setState(local);setIsEditor(true);setPendingSync(hasPending);}
   setAuthReady(true);
  });
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  if(process.env.NODE_ENV!=='production')return;
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
   if(!isEditor)return;
   const local=readLocalState(localStorage);
   if(localStorage.getItem(pendingSyncKey)==='true'&&local){
    try{
     const synced=await pushCloudState(local);
     if(synced){
      localStorage.removeItem(pendingSyncKey);
      setPendingSync(false);
      setCloud(true);
      recordSynced();
      setSyncError('');
     }
    }catch(error){setSyncError(error instanceof Error?error.message:'Shared saving is temporarily unavailable.');}
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
 },[isEditor]);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60000);return()=>window.clearInterval(timer);},[]);
 useEffect(()=>{setPublicUrl(window.location.origin);},[]);
 useEffect(()=>{
  if(!showSharePanel||!publicUrl)return;
  let active=true;
  void import('qrcode').then(({default:QRCode})=>QRCode.toDataURL(publicUrl,{width:360,margin:2,color:{dark:'#123f2d',light:'#ffffff'}})).then(value=>{if(active)setQrCode(value);}).catch(()=>{if(active)setQrCode('');});
 return()=>{active=false;};
 },[publicUrl,showSharePanel]);
 function recordSynced(){setLastSyncedAt(markCloudSynced(localStorage));}
 async function persist(next:TripState){
  if(!isEditor)return;
  setState(next);
  stageDeviceState(localStorage,next);
  setPendingSync(true);
  setSyncError('');
  if(!navigator.onLine)return;
  try{
   const synced=await pushCloudState(next);
   if(synced){
    localStorage.removeItem(pendingSyncKey);
    setPendingSync(false);
    setCloud(true);
    recordSynced();
    setSyncError('');
   }
  }catch(error){setSyncError(error instanceof Error?error.message:'Shared saving is temporarily unavailable.');}
 }
 async function retrySync(){if(state&&navigator.onLine)await persist(state);}
 function restoreTrip(restored:TripState){
  if(!state)return;
  localStorage.setItem(restoreRollbackKey,JSON.stringify(state));
  setRestoreRollbackAvailable(true);
  void persist(restored);
 }
 function undoTripRestore(){
  try{
   const previous=localStorage.getItem(restoreRollbackKey);if(!previous)return;
   const restored=restoredTripState(JSON.parse(previous));
   localStorage.removeItem(restoreRollbackKey);setRestoreRollbackAvailable(false);void persist(restored);
  }catch{}
 }
 async function loadTripState(){
  const response=await fetch('/api/state',{cache:'no-store'});
  if(!response.ok)throw new Error('Trip state unavailable');
  const result=await response.json();
  setState(result.state);
  setCloud(Boolean(result.cloud));
  setIsEditor(Boolean(result.editor));
  if(!result.editor)setTab(publicLandingTab(result.state));
  return result;
 }
 async function unlockEditor(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  setAuthBusy(true);setAuthError('');
  try{
   const response=await fetch('/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:editorPin})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error??'Editor access failed');
   const loaded=await loadTripState();
   localStorage.setItem(editorSessionKey,'true');
   localStorage.setItem(localStateKey,JSON.stringify(loaded.state));
   localStorage.removeItem(pendingSyncKey);
   setPendingSync(false);setEditorPin('');setShowEditorUnlock(false);setTab('Today');
  }catch(error){setAuthError(error instanceof Error?error.message:'Editor access failed');}
  finally{setAuthBusy(false);}
 }
 async function lockEditor(){
  await fetch('/api/auth',{method:'DELETE'});
  localStorage.removeItem(editorSessionKey);
  localStorage.removeItem(pendingSyncKey);
  setPendingSync(false);setPublicPreview(false);setShowSharePanel(false);setTab('Today');
  await loadTripState();
 }
 async function copyPublicLink(){
  if(!publicUrl)return;
  try{await navigator.clipboard.writeText(publicUrl);setShareMessage('Public link copied.');}
  catch{setShareMessage('Copy the link shown below.');}
 }
 async function sharePublicLink(){
  if(!publicUrl)return;
  const settings=resolvedTripSettings(state?.settings);
  if(navigator.share){
   try{await navigator.share({title:settings.title,text:settings.publicMessage,url:publicUrl});setShareMessage('Share sheet opened.');return;}catch{}
  }
  await copyPublicLink();
 }
 function enterPublicPreview(){
  if(!state)return;
  setState(publicTripState(state));
  setPublicPreview(true);
  setShowSharePanel(false);
  setTab(publicLandingTab(state));
 }
 async function exitPublicPreview(){
  setPublicPreview(false);
  await loadTripState();
  setTab('Today');
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
 function toggleDay(di:number,ii:number){if(!state)return;const next=structuredClone(state);const item=next.days[di].items[ii];item.done=!item.done;if(item.done){item.completedAt=new Date().toISOString();item.skipped=false;delete item.skippedAt;}else delete item.completedAt;void persist(next);}
 function editItem(di:number,ii:number,key:EditableKey,value:EditableValue){if(!state)return;const next=structuredClone(state);const item=next.days[di].items[ii];if(key==='optional'||key==='fixed'||key==='locationNotNeeded')item[key]=Boolean(value);else if(key==='skipped'){item.skipped=Boolean(value);if(item.skipped)item.skippedAt??=new Date().toISOString();else delete item.skippedAt;}else if(key==='estimatedDuration'||key==='travelMinutes'||key==='prepBuffer'){if(value===undefined||value==='')delete item[key];else item[key]=Math.max(0,Number(value));}else if(key==='type')item.type=String(value) as ItineraryItem['type'];else if(key==='travelMode')item.travelMode=String(value) as TravelMode;else item[key]=String(value);if(key==='destination')item.mapUrl=mapsUrl(String(value));setState(next);localStorage.setItem('trip-state',JSON.stringify(next));}
 function setTravelMode(di:number,ii:number,mode:TravelMode){if(!state)return;const next=structuredClone(state);next.days[di].items[ii].travelMode=mode;void persist(next);}
 function saveEdits(di?:number){const latest=readLocalState(localStorage)??state;if(!latest)return;const next=structuredClone(latest);if(di!==undefined)next.days[di].items=sortItems(next.days[di].items);void persist(next);}
 function addItem(di:number,value?:{title:string;destination:string;type:ItineraryItem['type'];time:string;optional:boolean;travelMode?:TravelMode;travelMinutes?:number}){if(!state)return;const next=structuredClone(state);const destination=value?.destination??'';next.days[di].items.push({id:`custom-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,time:value?.time??'12:00 PM',title:value?.title??'New stop',details:'',destination,mapUrl:mapsUrl(destination),routeText:destination?'Open directions from the previous stop.':'',keyInfo:'',userNotes:'',done:false,optional:value?.optional??false,fixed:value?.type==='reservation',type:value?.type??'activity',estimatedDuration:60,travelMinutes:value?.travelMinutes??20,travelMode:value?.travelMode??'transit',prepBuffer:15});next.days[di].items=sortItems(next.days[di].items);setBoardUndo(structuredClone(state));void persist(next);}
 function addPlaceToItinerary(place:Place,di:number,optional=false,time='Flexible',travelMode:TravelMode='transit',travelMinutes=20){
  if(!state)return;
  const next=structuredClone(state);
  next.days[di].items.push(itineraryItemFromPlace(place,time,optional,travelMode,travelMinutes));
  next.days[di].items=sortItems(next.days[di].items);
  setBoardUndo(structuredClone(state));
  void persist(next);
 }
 function addGooglePlaceToItinerary(candidate:GooglePlaceCandidate,di:number,time:string,optional:boolean,travelMode:TravelMode='transit',travelMinutes=20){
  if(!state)return;
  const next=structuredClone(state);
  const normalizedAddress=candidate.formattedAddress?.trim().toLowerCase();
  let place=next.places.find(saved=>saved.googlePlaceId===candidate.googlePlaceId||(normalizedAddress&&saved.formattedAddress?.trim().toLowerCase()===normalizedAddress));
  if(place){
   place.name=candidate.name;place.googlePlaceId=candidate.googlePlaceId;place.formattedAddress=candidate.formattedAddress;place.latitude=candidate.latitude;place.longitude=candidate.longitude;place.mapUrl=candidate.mapUrl??place.mapUrl;place.websiteUrl=candidate.websiteUrl??place.websiteUrl;
   if(candidate.weeklyHours){place.weeklyHours=candidate.weeklyHours;place.hoursSource='google';place.hoursVerifiedAt=new Date().toISOString();}
  }else{
   const region=regionForTripDay(next.days[di]);
   const category=categoryForGooglePlace(candidate);
   place={id:`place-google-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name:candidate.name,region,category,notes:'',mapUrl:candidate.mapUrl??'',menuUrl:'',websiteUrl:candidate.websiteUrl??'',tags:[],priority:'possible',visited:false,estimatedDuration:defaultDurationForCategory(category),googlePlaceId:candidate.googlePlaceId,formattedAddress:candidate.formattedAddress,latitude:candidate.latitude,longitude:candidate.longitude,weeklyHours:candidate.weeklyHours,hoursSource:candidate.weeklyHours?'google':undefined,hoursVerifiedAt:candidate.weeklyHours?new Date().toISOString():undefined,hoursTimeZone:region==='Toronto'?'America/Toronto':region==='Niagara & Buffalo'?'America/New_York':undefined};
   place.area=suggestPlaceArea(place);next.places.unshift(place);
  }
  next.days[di].items.push(itineraryItemFromPlace(place,time,optional,travelMode,travelMinutes));
  next.days[di].items=sortItems(next.days[di].items);
  setBoardUndo(structuredClone(state));
  void persist(next);
 }
 function skipItineraryItem(di:number,itemId:string){
  if(!state)return;
  const next=structuredClone(state);
  const item=next.days[di]?.items.find(candidate=>candidate.id===itemId);
  if(!item)return;
  item.skipped=true;
  item.skippedAt=new Date().toISOString();
  item.done=false;
  delete item.completedAt;
  void persist(next);
 }
 function deleteItem(di:number,ii:number){if(!state||!window.confirm(`Delete “${state.days[di].items[ii].title}”?`))return;const next=structuredClone(state);next.days[di].items.splice(ii,1);void persist(next);}
 function moveItem(di:number,ii:number,target:number){if(!state||target===di)return;const next=structuredClone(state);const [item]=next.days[di].items.splice(ii,1);item.lastRescheduledAt=new Date().toISOString();item.rescheduledFromDate=next.days[di].date;next.days[target].items.push(item);next.days[target].items=sortItems(next.days[target].items);void persist(next);}
 function reorderItem(di:number,ii:number,direction:-1|1){if(!state)return;const target=ii+direction;if(target<0||target>=state.days[di].items.length)return;const next=structuredClone(state);[next.days[di].items[ii],next.days[di].items[target]]=[next.days[di].items[target],next.days[di].items[ii]];void persist(next);}
 function moveBoardItem(fromDay:number,fromIndex:number,toDay:number,toIndex:number){
  if(!state)return;
  const next=structuredClone(state);
  const [item]=next.days[fromDay].items.splice(fromIndex,1);
  if(fromDay!==toDay){item.lastRescheduledAt=new Date().toISOString();item.rescheduledFromDate=next.days[fromDay].date;}
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
  delete copy.completedAt;
  delete copy.skippedAt;
  delete copy.lastRescheduledAt;
  delete copy.rescheduledFromDate;
  next.days[di].items.splice(ii+1,0,copy);
  setBoardUndo(structuredClone(state));
  void persist(next);
 }
 function saveBoardItem(di:number,ii:number,draft:ItineraryItem,targetDay:number){
  if(!state)return;
  const next=structuredClone(state);
  next.days[di].items.splice(ii,1);
  const saved=structuredClone(draft);
  if(targetDay!==di){saved.lastRescheduledAt=new Date().toISOString();saved.rescheduledFromDate=next.days[di].date;}
  next.days[targetDay].items.push(saved);
  next.days[targetDay].items=sortItems(next.days[targetDay].items);
  setBoardUndo(structuredClone(state));
  void persist(next);
 }
 function addBoardItem(di:number){
  setAddToDayIndex(di);
 }
 function addBoardPlace(place:Place,di:number){
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
 function adjustBoardDayTiming(di:number){
  if(!state)return;
  const next=structuredClone(state);
  const adjusted=applySuggestedDayTimes(next.days[di],next.places);
  if(adjusted.items.every((item,index)=>item.time===next.days[di].items[index]?.time&&item.travelMinutes===next.days[di].items[index]?.travelMinutes))return;
  setBoardUndo(structuredClone(state));
  next.days[di]=adjusted;
  void persist(next);
 }
 function undoBoardChange(){
  if(!boardUndo||!state)return;
  const previous=structuredClone(boardUndo);
  setBoardUndo(structuredClone(state));
  void persist(previous);
 }
 function toggleFood(index:number){if(!state)return;const next=structuredClone(state);const food=next.foods[index];food.done=!food.done;if(food.done)food.triedAt=new Date().toISOString();else{delete food.triedAt;delete food.triedAtPlaceId;}void persist(next);}
 function toggleChecklistItem(id:string){
  if(!state)return;
  const next=structuredClone(state);
  const item=next.packing.find(candidate=>candidate.id===id);
  if(!item)return;
  item.done=!item.done;
  if(item.done)item.completedAt=new Date().toISOString();else delete item.completedAt;
  void persist(next);
 }
 function updateChecklistItem(id:string,changes:Partial<CheckItem>,saveNow=false){
  if(!state)return;
  const next=structuredClone(state);
  const item=next.packing.find(candidate=>candidate.id===id);
  if(!item)return;
  Object.assign(item,changes);
  setState(next);
  localStorage.setItem(localStateKey,JSON.stringify(next));
  if(saveNow)void persist(next);
 }
 function addChecklistItem(item:CheckItem){if(!state)return;const next=structuredClone(state);next.packing.push(item);void persist(next);}
 function addSuggestedChecklistItems(items:CheckItem[]){if(!state||!items.length)return;const next=structuredClone(state);next.packing.push(...items);void persist(next);}
 function deleteChecklistItem(id:string){if(!state)return;const next=structuredClone(state);next.packing=next.packing.filter(item=>item.id!==id);void persist(next);}
 function markFoodTried(foodId:string,placeId?:string,done=true){
  if(!state)return;
  const next=structuredClone(state);
  const food=next.foods.find(item=>item.id===foodId);
  if(!food)return;
  food.done=done;
  if(done){food.triedAt=new Date().toISOString();food.triedAtPlaceId=placeId;}
  else{delete food.triedAt;delete food.triedAtPlaceId;}
  void persist(next);
 }
 function updateFoodPlaceConnection(placeId:string,foodId:string,linked:boolean){
  if(!state)return;
  const next=structuredClone(state);
  const place=next.places.find(item=>item.id===placeId);
  if(!place)return;
  const ids=new Set(placeSpecialtyFoodIds(place,next.foods));
  if(linked)ids.add(foodId);else ids.delete(foodId);
  place.specialtyFoodIds=[...ids];
  void persist(next);
 }
 function toggleTripDiet(preference:DietaryPreference){if(!state)return;const next=structuredClone(state);const selected=new Set(next.dietaryPreferences??[]);if(selected.has(preference))selected.delete(preference);else selected.add(preference);next.dietaryPreferences=[...selected];void persist(next);}
 function updateMealBalance(date:string,changes:{treatSampled?:boolean;note?:string},saveNow=false){
  if(!state)return;
  const next=structuredClone(state);
  next.mealBalanceByDate??={};
  const current=next.mealBalanceByDate[date]??{treatSampled:false};
  next.mealBalanceByDate[date]={...current,...changes};
  setState(next);
  localStorage.setItem(localStateKey,JSON.stringify(next));
  if(saveNow)void persist(next);
 }
 function toggleVisited(id:string){if(!state)return;const next=structuredClone(state);const place=next.places.find(p=>p.id===id);if(place){place.visited=!place.visited;if(place.visited)place.visitedAt=new Date().toISOString();else delete place.visitedAt;}void persist(next);}
 function updateJournalNote(date:string,note:string,saveNow=false){
  if(!state)return;
  const next=structuredClone(state);
  next.journalNotesByDate??={};
  next.journalNotesByDate[date]=note;
  setState(next);
  localStorage.setItem(localStateKey,JSON.stringify(next));
  if(saveNow)void persist(next);
 }
 function saveJournalMoment(moment:JournalMoment){
  if(!state)return;
  const next=structuredClone(state);
  next.journalMoments??=[];
  const index=next.journalMoments.findIndex(item=>item.id===moment.id);
  const previous=index>=0?next.journalMoments[index]:undefined;
  if(previous?.foodId&&(previous.foodId!==moment.foodId||moment.type!=='food')){
   const previousFood=next.foods.find(food=>food.id===previous.foodId);
   const stillLinked=next.journalMoments.some(item=>item.id!==previous.id&&item.foodId===previous.foodId);
   if(previousFood?.triedAt===journalMomentTimestamp(previous)&&!stillLinked){previousFood.done=false;delete previousFood.triedAt;delete previousFood.triedAtPlaceId;}
  }
  if(index>=0)next.journalMoments[index]={...moment,updatedAt:new Date().toISOString()};
  else next.journalMoments.push(moment);
  if(moment.type==='food'&&moment.foodId){const food=next.foods.find(item=>item.id===moment.foodId);if(food){food.done=true;food.triedAt=journalMomentTimestamp(moment);food.triedAtPlaceId=moment.placeId;}}
  void persist(next);
 }
 function deleteJournalMoment(id:string){
  if(!state)return;
  const next=structuredClone(state);
  const removed=(next.journalMoments??[]).find(moment=>moment.id===id);
  next.journalMoments=(next.journalMoments??[]).filter(moment=>moment.id!==id);
  if(removed?.foodId){const food=next.foods.find(item=>item.id===removed.foodId);const stillLinked=next.journalMoments.some(moment=>moment.foodId===removed.foodId);if(food?.triedAt===journalMomentTimestamp(removed)&&!stillLinked){food.done=false;delete food.triedAt;delete food.triedAtPlaceId;}}
  void persist(next);
 }
 function editPlace(id:string,changes:Partial<Place>){
  if(!state)return;
  const next=structuredClone(state);
  const place=next.places.find(candidate=>candidate.id===id);
  if(!place)return;
  Object.assign(place,changes);
  setState(next);
  localStorage.setItem(localStateKey,JSON.stringify(next));
 }
 function editPlaces(updates:{id:string;changes:Partial<Place>}[]){
  if(!state||!updates.length)return;
  const next=structuredClone(state);
  const changesById=new Map(updates.map(update=>[update.id,update.changes]));
  next.places.forEach(place=>{const changes=changesById.get(place.id);if(changes)Object.assign(place,changes);});
  void persist(next);
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
 function togglePlaceSelection(id:string){
  setSelectedPlaceIds(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
 }
 function assignSelectedPlaceArea(){
  if(!state||!bulkPlaceArea||!selectedPlaceIds.size)return;
  const next=structuredClone(state);
  next.places.forEach(place=>{if(selectedPlaceIds.has(place.id))place.area=bulkPlaceArea;});
  setSelectedPlaceIds(new Set());
  setBulkPlaceArea('');
  void persist(next);
 }
 function openReadinessAction(action:ReadinessAction|{target:ReadinessTarget;anchorId?:string}){
  if(action.target==='Places'&&'anchorId' in action){
   const place=state?.places.find(candidate=>`place-${candidate.id}`===action.anchorId);
   if(place){setQuery(place.name);setRegion(place.region);setArea('All');setCategory('All');setPriority('All');}
  }
  setTab(action.target);
  const anchorId=action.anchorId;
  if(anchorId)window.setTimeout(()=>document.getElementById(anchorId)?.scrollIntoView({behavior:'smooth',block:'center'}),100);
 }
 function ignoreReadinessAction(actionId:string){
  if(!state)return;
  const next=structuredClone(state);
  next.readinessIgnoredActionIds=[...new Set([...(next.readinessIgnoredActionIds??[]),actionId])];
  void persist(next);
 }
 function restoreReadinessAction(actionId:string){
  if(!state)return;
  const next=structuredClone(state);
  next.readinessIgnoredActionIds=(next.readinessIgnoredActionIds??[]).filter(id=>id!==actionId);
  void persist(next);
 }
 function applyReadinessQuickFix(action:ReadinessAction){
  if(!state||!action.quickFix)return;
  const quickFix=action.quickFix;
  const next=structuredClone(state);
  if(quickFix.kind==='ignore-hours'){
   const place=next.places.find(candidate=>candidate.id===quickFix.placeId);
   if(!place)return;
   place.ignoreHours=true;
  }else{
   const day=next.days.find(candidate=>candidate.date===quickFix.dayDate);
   const item=day?.items.find(candidate=>candidate.id===quickFix.itemId);
   const place=next.places.find(candidate=>candidate.id===quickFix.placeId);
   if(!item||!place)return;
   item.locationNotNeeded=false;
   item.placeId=place.id;
   item.destination=place.formattedAddress||place.name;
   item.mapUrl=mapsUrl(item.destination);
  }
  next.readinessIgnoredActionIds=(next.readinessIgnoredActionIds??[]).filter(id=>id!==action.id);
  void persist(next);
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
 function savePlaceChanges(){const latest=readLocalState(localStorage)??state;if(latest)void persist(structuredClone(latest));}
 function saveNearbyPreset(preset:NearbyPreset){
  if(!state)return;
  const next=structuredClone(state);
  next.nearbyPresets??=[];
  const index=next.nearbyPresets.findIndex(item=>item.id===preset.id);
  if(index>=0)next.nearbyPresets[index]=preset;
  else next.nearbyPresets.push(preset);
  void persist(next);
 }
 function deleteNearbyPreset(id:string){
  if(!state)return;
  const next=structuredClone(state);
  next.nearbyPresets=(next.nearbyPresets??[]).filter(item=>item.id!==id);
  if(next.defaultNearbyPresetId===id)delete next.defaultNearbyPresetId;
  void persist(next);
 }
 function setDefaultNearbyPreset(id?:string){
  if(!state)return;
  const next=structuredClone(state);
  if(id)next.defaultNearbyPresetId=id;
  else delete next.defaultNearbyPresetId;
  void persist(next);
 }
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
 function linkItineraryLocation(di:number,ii:number,placeId:string){
  if(!state)return;
  setLocationUndo(structuredClone(state));
  const next=structuredClone(state);
  const item=next.days[di].items[ii];
  const place=next.places.find(candidate=>candidate.id===placeId);
  if(!place)return;
  item.locationNotNeeded=false;
  item.placeId=place.id;
  item.destination=place.formattedAddress||place.name;
  item.mapUrl=mapsUrl(item.destination);
  void persist(next);
 }
 function clearItineraryLocation(di:number,ii:number){
  if(!state)return;
  setLocationUndo(structuredClone(state));
  const next=structuredClone(state);
  delete next.days[di].items[ii].placeId;
  void persist(next);
 }
 function createAndLinkItineraryLocation(di:number,ii:number){
  if(!state)return;
  setLocationUndo(structuredClone(state));
  const next=structuredClone(state);
  const day=next.days[di];
  const item=day.items[ii];
  const region=itineraryItemRegion(day,item);
  const category=item.type==='food'?'Food':item.type==='hotel'?'Hotel':item.type==='travel'?'Transit':'Attraction';
  const normalizedName=item.title.trim().toLowerCase();
  const existing=next.places.find(candidate=>candidate.name.trim().toLowerCase()===normalizedName||(item.destination&&candidate.formattedAddress?.trim().toLowerCase()===item.destination.trim().toLowerCase()));
  if(existing){item.placeId=existing.id;item.locationNotNeeded=false;item.destination=existing.formattedAddress||existing.name;item.mapUrl=mapsUrl(item.destination);void persist(next);return;}
  const id=`place-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const place:Place={id,name:item.title,region,category,notes:item.details??'',mapUrl:item.mapUrl??'',menuUrl:'',websiteUrl:'',tags:[],priority:'possible',visited:false,estimatedDuration:item.estimatedDuration??60,formattedAddress:item.destination?.trim()||undefined};
  next.places.unshift(place);
  item.placeId=id;
  item.locationNotNeeded=false;
  item.destination=place.formattedAddress||place.name;
  item.mapUrl=mapsUrl(item.destination);
  void persist(next);
 }
 function setLocationNotNeeded(di:number,ii:number,notNeeded:boolean){
  if(!state)return;
  setLocationUndo(structuredClone(state));
  const next=structuredClone(state);
  const item=next.days[di].items[ii];
  item.locationNotNeeded=notNeeded;
  if(notNeeded)delete item.placeId;
  void persist(next);
 }
 function linkGoogleItineraryLocation(di:number,ii:number,candidate:GooglePlaceCandidate){
  if(!state)return;
  setLocationUndo(structuredClone(state));
  const next=structuredClone(state);
  const day=next.days[di];
  const item=day.items[ii];
  const normalizedAddress=candidate.formattedAddress?.trim().toLowerCase();
  let place=next.places.find(saved=>saved.googlePlaceId===candidate.googlePlaceId||(normalizedAddress&&saved.formattedAddress?.trim().toLowerCase()===normalizedAddress));
  if(place){
   place.name=candidate.name;
   place.googlePlaceId=candidate.googlePlaceId;
   place.formattedAddress=candidate.formattedAddress;
   place.latitude=candidate.latitude;
   place.longitude=candidate.longitude;
   place.mapUrl=candidate.mapUrl??place.mapUrl;
   place.websiteUrl=candidate.websiteUrl??place.websiteUrl;
   if(candidate.weeklyHours){place.weeklyHours=candidate.weeklyHours;place.hoursSource='google';place.hoursVerifiedAt=new Date().toISOString();}
   place.area=place.area??suggestPlaceArea(place);
  }else{
   const category=item.type==='food'?'Food':item.type==='hotel'?'Hotel':item.type==='travel'?'Transit':'Attraction';
   place={id:`place-google-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name:candidate.name,region:itineraryItemRegion(day,item),category,notes:item.details??'',mapUrl:candidate.mapUrl??'',menuUrl:'',websiteUrl:candidate.websiteUrl??'',tags:[],priority:'possible',visited:false,estimatedDuration:item.estimatedDuration??60,googlePlaceId:candidate.googlePlaceId,formattedAddress:candidate.formattedAddress,latitude:candidate.latitude,longitude:candidate.longitude,weeklyHours:candidate.weeklyHours,hoursSource:'google',hoursVerifiedAt:new Date().toISOString()};
   place.area=suggestPlaceArea(place);
   next.places.unshift(place);
  }
  item.placeId=place.id;
  item.locationNotNeeded=false;
  item.destination=place.formattedAddress||place.name;
  item.mapUrl=mapsUrl(item.destination);
  place.hoursTimeZone=place.region==='Toronto'?'America/Toronto':place.region==='Niagara & Buffalo'?'America/New_York':undefined;
  void persist(next);
 }
 function undoLocationChange(){if(!locationUndo)return;const previous=structuredClone(locationUndo);setLocationUndo(null);void persist(previous);}
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
 const currentDaySchedule=useMemo(()=>state&&currentDay?analyzeDaySchedule(currentDay,state.places):null,[currentDay,state]);
 const nextStepIndex=currentDay?.items.findIndex(item=>!item.done&&!item.skipped)??-1;
 const nextStep=nextStepIndex>=0?currentDay?.items[nextStepIndex]:undefined;
 const availableAreas=useMemo(()=>areaOptions(state?.places??[]),[state]);
 const unassignedAreaCount=state?.places.filter(place=>!place.area).length??0;
 const suggestibleAreaCount=state?.places.filter(place=>!place.area&&Boolean(suggestPlaceArea(place))).length??0;
 const filtered=useMemo(()=>{if(!state)return[];const needle=query.trim().toLowerCase();return state.places.filter(place=>{const dietMatches=dietFilter==='All'||placeMatchesDietaryFilter(place,dietFilter,dietFitFilter);return (region==='All'||place.region===region)&&(area==='All'||(area==='Unassigned'?!place.area:place.area===area))&&(category==='All'||place.category===category)&&(priority==='All'||place.priority===priority)&&dietMatches&&(showVisited||!place.visited)&&(!needle||`${place.name} ${place.area??''} ${place.notes} ${place.tags.join(' ')}`.toLowerCase().includes(needle));});},[state,query,region,area,category,priority,dietFilter,dietFitFilter,showVisited]);
 const hasPlaceFilters=Boolean(query.trim()||region!=='All'||area!=='All'||category!=='All'||priority!=='All'||dietFilter!=='All'||!showVisited);
 function clearPlaceFilters(){setQuery('');setRegion('All');setArea('All');setCategory('All');setPriority('All');setDietFilter('All');setDietFitFilter('recommended');setShowVisited(true);}
 const groupedPlaces=useMemo(()=>groupPlacesByArea(filtered),[filtered]);
 const nearbySuggestions=useMemo(()=>{if(!state||!currentDay)return[];const rank={must:0,possible:1,backup:2};return state.places.filter(place=>placeMatchesDay(place,currentDay.city,currentDay.date)&&!place.visited).sort((a,b)=>rank[a.priority]-rank[b.priority]).slice(0,6);},[state,currentDay]);
 const assistantNow=useMemo(()=>previewMoment(assistantPreview,now),[assistantPreview,now]);
 const assistantLocation=assistantPreview?.area?undefined:liveLocation??undefined;
 const assistant=useMemo(()=>state?buildAssistantState(state,assistantNow,assistantLocation,assistantPreview?.area||undefined,Boolean(assistantPreview)):null,[assistantLocation,assistantNow,assistantPreview,state]);
 const reservations=useMemo(()=>state?state.days.flatMap(day=>day.items.flatMap(item=>isFixedItem(item)?[{day,item}]:[])):[],[state]);
 const readiness=useMemo(()=>state?buildTripReadiness(state):null,[state]);
 const editorView=isEditor&&!publicPreview;
 const tripSettings=resolvedTripSettings(state?.settings);
 const visibleNavGroups=useMemo(()=>editorView?navGroups:publicNavGroups(tripSettings.publicSections),[editorView,tripSettings.publicSections]);
 const activeNavGroup=visibleNavGroups.find(group=>(group.tabs as readonly Tab[]).includes(tab))??visibleNavGroups[0];
 useEffect(()=>{
  if(!visibleNavGroups.some(group=>group.tabs.includes(tab)))setTab(visibleNavGroups[0].tabs[0]);
 },[tab,visibleNavGroups]);

 if(!state)return <main className="shell"><div className="card">{authReady?'Trip unavailable. Check your connection and refresh.':'Loading trip…'}</div></main>;
 const completedToday=currentDay?.items.filter(i=>i.done).length??0;
 const totalToday=currentDay?.items.length??0;
 const tripProgress=state.days.flatMap(day=>day.items);
 const completedTrip=tripProgress.filter(i=>i.done).length;
 const itineraryHoursIssues=state.days.flatMap(day=>day.items.map(item=>checkItineraryHours(item,day.date,state.places))).filter((check):check is ItineraryHoursCheck=>Boolean(check&&(check.status==='closed'||check.status==='closesSoon')));

 const syncLabel=!editorView?publicPreview?'● Previewing public view':'● Public view':!online?'● Offline · saved on this device':syncError?'! Shared sync needs attention':pendingSync?'○ Waiting to sync':cloud?'● Shared sync':'○ Device only';
 const syncDetail=editorView&&lastSyncedAt&&!pendingSync&&online?`Saved ${new Date(lastSyncedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`:'';
 return <>
  <header className={`hero theme-${tripSettings.coverTheme}`}><div className="heroInner"><div><div className="eyebrow">TRIP HUB</div><h1>{tripSettings.title}</h1><p>{tripSettings.destinations} · {tripDateLabel(tripSettings.startDate,tripSettings.endDate)}</p></div><div className="headerActions"><span className={`sync syncStack ${editorView&&online&&cloud&&!pendingSync&&!syncError?'online':''} ${!online?'offline':''} ${syncError?'attention':''}`} title={syncError||undefined}><strong>{syncLabel}</strong>{syncDetail&&<small>{syncDetail}</small>}</span>{editorView&&syncError&&<button className="btn ghost syncRetry" onClick={()=>void retrySync()}>Retry sync</button>}<button className="btn ghost" onClick={()=>{setShareMessage('');setShowSharePanel(true);}}>Share & access</button>{editorView&&<button className="btn ghost" onClick={()=>setTab('Settings')}>Settings</button>}<button className="btn ghost" onClick={downloadOffline} disabled={offlineDownloading}>{offlineDownloading?'Downloading…':offlineReady?'✓ Offline ready':'Download for offline'}</button>{installPrompt&&<button className="btn ghost" onClick={installApp}>Install app</button>}{editorView?<button className="btn ghost" onClick={lockEditor}>Lock editing</button>:!isEditor&&<button className="btn ghost" onClick={()=>{setAuthError('');setShowEditorUnlock(true);}}>Editor access</button>}{offlineMessage&&<span className="offlineMessage" role="status">{offlineMessage}</span>}{editorView&&syncError&&<span className="syncErrorMessage" role="alert">{syncError}</span>}</div></div></header>
  <main className={`shell ${editorView?'editorMode':'viewerMode'}`}>
   {!editorView&&<div className={`publicViewBanner ${publicPreview?'previewing':''}`}><span aria-hidden="true">◉</span><div><strong>{publicPreview?'Public preview':'Public view'}</strong><small>{publicPreview?'This is exactly what visitors see. Your editor session remains unlocked.':'Browse the trip and recap. Editing and private trip details are locked.'}</small></div>{publicPreview?<button className="textButton" onClick={exitPublicPreview}>Return to editor</button>:<button className="textButton" onClick={()=>setShowEditorUnlock(true)}>Unlock editing</button>}</div>}
   {!editorView&&tripSettings.publicMessage&&<section className="card publicWelcome"><div className="eyebrow">WELCOME TO OUR TRIP</div><p>{tripSettings.publicMessage}</p></section>}
   <nav className="tabs mainTabs" aria-label="Trip sections">{visibleNavGroups.map(group=><button key={group.label} className={activeNavGroup.label===group.label?'active':''} onClick={()=>setTab(group.tabs[0])}>{group.label}</button>)}</nav>
   {activeNavGroup.tabs.length>1&&<nav className="subTabs" aria-label={`${activeNavGroup.label} views`}>{activeNavGroup.tabs.map(item=><button key={item} className={tab===item?'active':''} onClick={()=>setTab(item)}>{tabLabels[item]??item}</button>)}</nav>}
   {tab==='Overview'&&<TripOverview state={state} settings={tripSettings} canEdit={editorView} onToday={()=>setTab('Today')} onBrief={index=>{setBriefDayIndex(index);setShowDailyBrief(true);}} onEditDay={()=>setTab('Itinerary')} onChecklist={()=>setTab('Checklist')}/>}
   {tab==='Today'&&currentDay&&<section>
   <div className="todayHero card"><div><div className="eyebrow">TODAY</div><h2>{currentDay.label} · {currentDay.city}</h2><p className="muted">Recommendations below are selected for this specific itinerary day.</p>{editorView&&<button className="btn dailyBriefOpen" onClick={()=>{setBriefDayIndex(currentDayIndex);setShowDailyBrief(true);}}>Open daily brief</button>}</div><div className="progressRing" aria-label={`${completedToday} of ${totalToday} complete`}><strong>{completedToday}/{totalToday}</strong><span>done</span></div></div>
    {editorView&&<MealBalanceCard date={currentDay.date} value={state.mealBalanceByDate?.[currentDay.date]} triedFoods={foodsTriedOnDate(state,currentDay.date)} onChange={updateMealBalance}/>}
    {editorView&&<QuickCapture date={currentDay.date} places={state.places} foods={state.foods} onSave={saveJournalMoment} onDelete={deleteJournalMoment}/>}
    {editorView&&readiness&&<TripReadinessDashboard readiness={readiness} onOpen={openReadinessAction} onQuickFix={applyReadinessQuickFix} onIgnore={ignoreReadinessAction} onRestore={restoreReadinessAction}/>}
    {nextStep?<div className="card nextStepCard" style={{marginTop:'16px'}}><div className="eyebrow">NEXT STEP</div><div className="between" style={{alignItems:'flex-start',gap:'16px',marginTop:'6px'}}><div><h2 style={{marginBottom:'4px'}}>{nextStep.title}</h2><div className="muted">{nextStep.time}</div>{nextStep.details&&<p>{nextStep.details}</p>}{nextStep.routeText&&<p className="muted small">🚌 {nextStep.routeText}</p>}{(nextStep.keyInfo||nextStep.confirmationNumber)&&<div style={{marginTop:'12px'}}><strong>Key Info</strong><p style={{whiteSpace:'pre-wrap',marginTop:'4px'}}>{nextStep.keyInfo??nextStep.confirmationNumber}</p></div>}</div><span className="chip">{nextStepIndex+1} of {currentDay.items.length}</span></div><div className="placeActions" style={{marginTop:'14px'}}>{nextStep.mapUrl&&<a className="btn primary" href={nextStep.mapUrl} target="_blank" rel="noreferrer">Open transit directions</a>}<button className="btn" onClick={()=>toggleDay(currentDayIndex,nextStepIndex)}>Mark complete</button></div></div>:<div className="card" style={{marginTop:'16px'}}><div className="eyebrow">NEXT STEP</div><h2 style={{marginTop:'6px'}}>You’re done for today</h2><p className="muted">Every itinerary item for this day is complete.</p></div>}
    <div className="statGrid"><div className="stat"><span>Trip progress</span><strong>{completedTrip}/{tripProgress.length}</strong></div><div className="stat"><span>Saved places</span><strong>{state.places.length}</strong></div><div className="stat"><span>Foods remaining</span><strong>{state.foods.filter(i=>!i.done).length}</strong></div></div>
    <h2 className="sectionTitle">Today’s plan</h2>
    {currentDay.items.map((item,index)=>{const hoursCheck=checkItineraryHours(item,currentDay.date,state.places);return <div className="timelineStack" key={item.id}>{index>0&&<RouteConnector from={currentDay.items[index-1]} to={item} places={state.places} timing={currentDaySchedule?.connections.get(item.id)} editable={editorView} onModeChange={mode=>setTravelMode(currentDayIndex,index,mode)}/>}<div className={`card timelineItem ${item.done?'done':''} ${item.skipped?'skipped':''}`}><input aria-label={`Mark ${item.title} complete`} type="checkbox" checked={item.done} onChange={()=>toggleDay(currentDayIndex,index)}/><div className="timeBadge">{item.time}</div><ItineraryDetails item={item} places={state.places} dayIndex={currentDayIndex} itemIndex={index} hoursCheck={hoursCheck} onEdit={editItem} onSave={()=>saveEdits(currentDayIndex)} onShowPlace={place=>{setQuery(place.name);setRegion(place.region);setArea('All');setCategory('All');setPriority('All');setTab('Places');}}/></div></div>;})}
    <div className="between sectionHeading"><h2 className="sectionTitle">Recommended for this day</h2><button className="textButton" onClick={()=>{setRegion(currentDay.city.includes('Toronto')?'Toronto':'Niagara & Buffalo');setArea('All');setTab('Places');}}>See all</button></div>
    <div className="grid compactGrid">{nearbySuggestions.map(place=><PlaceCard key={place.id} place={place} onToggle={()=>toggleVisited(place.id)}/>)}</div>
   </section>}
   {tab==='Assistant'&&assistant&&<AssistantView assistant={assistant} tripState={state} now={assistantNow} liveLocation={assistantPreview?.area?null:liveLocation} preview={assistantPreview} onPreviewChange={setAssistantPreview} onMealBalanceChange={updateMealBalance} locationStatus={locationStatus} locationMessage={locationMessage} onRequestLocation={requestLocation} onStopLocation={stopUsingLocation} onComplete={item=>{
    const day=state.days[assistant.currentDayIndex];
    const itemIndex=day?.items.findIndex(candidate=>candidate.id===item.id)??-1;
    if(itemIndex>=0)toggleDay(assistant.currentDayIndex,itemIndex);
   }} onSkip={item=>skipItineraryItem(assistant.currentDayIndex,item.id)} onAddToToday={place=>addPlaceToItinerary(place,assistant.currentDayIndex,true)} onVisited={toggleVisited} onShowPlaces={place=>{
    setQuery(place.name);
    setRegion(place.region);
    setArea('All');
    setCategory('All');
    setPriority('All');
    setTab('Places');
   }} onExploreNearby={()=>setTab('Nearby')} onMarkFoodTried={markFoodTried}/>}
   {tab==='Journal'&&<TripJournal state={state} canEdit={editorView} onNoteChange={updateJournalNote} onMomentSave={saveJournalMoment} onMomentDelete={deleteJournalMoment}/>}
   {tab==='Nearby'&&currentDay&&<NearbyExplorer state={state} currentDayIndex={currentDayIndex} now={now} liveLocation={liveLocation} locationStatus={locationStatus} locationMessage={locationMessage} onRequestLocation={requestLocation} onStopLocation={stopUsingLocation} onVisited={toggleVisited} onAddToItinerary={addPlaceToItinerary} onSavePreset={saveNearbyPreset} onDeletePreset={deleteNearbyPreset} onSetDefaultPreset={setDefaultNearbyPreset} onShowPlace={place=>{
    setQuery(place.name);
    setRegion(place.region);
    setArea('All');
    setCategory('All');
    setPriority('All');
    setTab('Places');
   }}/>}
   {tab==='Board'&&<TripBoard days={state.days} places={state.places} canUndo={Boolean(boardUndo)} onUndo={undoBoardChange} onMove={moveBoardItem} onDuplicate={duplicateBoardItem} onDelete={deleteItem} onSaveItem={saveBoardItem} onAdd={addBoardItem} onAddPlace={addBoardPlace} onOptimize={optimizeBoardDay} onAdjustTiming={adjustBoardDayTiming} onToggle={toggleDay} onTravelMode={setTravelMode}/>}
   {tab==='Itinerary'&&<section><div className="pageIntro"><div><div className="eyebrow">FULL SCHEDULE</div><h2>Edit the trip without touching code</h2><p className="muted">Use Planning view for a clean route-first outline, or Details when you need every note and setting.</p></div><div className="itineraryHeaderActions"><div className="viewSwitch" aria-label="Itinerary view"><button className={itineraryView==='planning'?'active':''} onClick={()=>setItineraryView('planning')}>Planning</button><button className={itineraryView==='details'?'active':''} onClick={()=>setItineraryView('details')}>Details</button></div><div className="placeActions">{boardUndo&&<button className="btn" onClick={undoBoardChange}>↶ Undo planning change</button>}{itineraryHoursIssues.length>0&&<span className="chip hoursIssueCount">{itineraryHoursIssues.length} hours notice{itineraryHoursIssues.length===1?'':'s'}</span>}<span className="chip">{completedTrip}/{tripProgress.length} complete</span></div></div></div>{state.days.map((day,di)=><article className={`card dayCard itinerary-${itineraryView}`} key={day.date}><div className="between dayHeader"><div><div className="eyebrow">{day.date}</div><h2>{day.label} · {day.city}</h2></div><div className="placeActions"><span className="chip">{day.items.filter(i=>i.done).length}/{day.items.length}</span><button className="btn primary" onClick={()=>setAddToDayIndex(di)}>+ Add to day</button></div></div>{day.items.map((item,ii)=>{const hoursCheck=checkItineraryHours(item,day.date,state.places);return <div className="itineraryStack" key={item.id}>{ii>0&&<RouteConnector from={day.items[ii-1]} to={item} places={state.places} editable onModeChange={mode=>setTravelMode(di,ii,mode)}/>}<div id={`itinerary-${item.id}`} className={`itineraryRow ${item.done?'done':''}`}><input aria-label={`Mark ${item.title} complete`} type="checkbox" checked={item.done} onChange={()=>toggleDay(di,ii)}/><div style={{minWidth:0,flex:1}}><ItineraryEditor compact={itineraryView==='planning'} item={item} dayIndex={di} itemIndex={ii} days={state.days} places={state.places} hoursCheck={hoursCheck} onEdit={editItem} onSave={()=>saveEdits(di)} onMove={moveItem} onReorder={reorderItem} onDelete={deleteItem} onShowPlace={place=>{setQuery(place.name);setRegion(place.region);setArea('All');setCategory('All');setPriority('All');setTab('Places');}}/></div></div></div>;})}</article>)}</section>}
   {tab==='Locations'&&<LocationResolver days={state.days} places={state.places} canUndo={Boolean(locationUndo)} onUndo={undoLocationChange} onLink={linkItineraryLocation} onGoogleLink={linkGoogleItineraryLocation} onClear={clearItineraryLocation} onCreate={createAndLinkItineraryLocation} onSetNotNeeded={setLocationNotNeeded} onAssignAreas={assignSuggestedAreas} onOpenItem={itemId=>{setTab('Itinerary');window.setTimeout(()=>document.getElementById(`itinerary-${itemId}`)?.scrollIntoView({behavior:'smooth',block:'center'}),0);}}/>}
   {tab==='Reservations'&&<ReservationsView reservations={reservations} onShowItem={itemId=>{
    setTab('Itinerary');
    window.setTimeout(()=>document.getElementById(`itinerary-${itemId}`)?.scrollIntoView({behavior:'smooth',block:'center'}),0);
   }}/>}
   {tab==='Settings'&&<TripSettingsView
    state={state} settings={tripSettings} publicUrl={publicUrl}
    canUndoRestore={restoreRollbackAvailable} onUndoRestore={undoTripRestore}
    onSave={settings=>{const next=structuredClone(state);next.settings=settings;void persist(next);}}
    onRestore={restoreTrip} onPrint={()=>{setTab('Overview');window.setTimeout(()=>window.print(),200);}}
    onShare={()=>{setShareMessage('');setShowSharePanel(true);}} onPreview={enterPublicPreview}
   />}
   {tab==='Food'&&<section><div className="pageIntro"><div><div className="eyebrow">LOCAL FLAVORS</div><h2>Eat the trip</h2></div><span className="chip">{state.foods.filter(i=>i.done).length}/{state.foods.length} tried</span></div>{editorView&&<><div className="card tripDietPanel"><div><strong>Food preferences for this trip</strong><p className="muted small">These gently improve recommendations; they do not hide foods or judge what you choose.</p></div><div className="dietChoiceRow">{dietaryPreferences.map(preference=><label className={`dietChoice ${state.dietaryPreferences?.includes(preference.id)?'selected':''}`} key={preference.id}><input type="checkbox" checked={state.dietaryPreferences?.includes(preference.id)??false} onChange={()=>toggleTripDiet(preference.id)}/>{preference.label}{!preference.active&&<small>ready for later</small>}</label>)}</div></div><FoodConnectionsPanel foods={state.foods} places={state.places} onConnection={updateFoodPlaceConnection} onOpenPlace={place=>{setQuery(place.name);setRegion(place.region);setArea('All');setCategory('All');setPriority('All');setTab('Places');}}/></>}{['Try','Bring home'].map(group=><div key={group} className="listGroup"><h2 className="sectionTitle">{group}</h2><div className="grid">{state.foods.map((food,index)=>food.category===group&&<label className={`card checkCard ${food.done?'done':''}`} key={food.id}><input type="checkbox" checked={food.done} onChange={()=>toggleFood(index)}/><div><h3>{food.title}</h3>{food.notes&&<p className="muted small">{food.notes}</p>}{food.triedAt&&<p className="foodTriedMeta">Tried{food.triedAtPlaceId?` at ${state.places.find(place=>place.id===food.triedAtPlaceId)?.name??'a saved place'}`:''} · {new Date(food.triedAt).toLocaleDateString()}</p>}</div></label>)}</div></div>)}</section>}
   {tab==='Dietary'&&<DietaryReview places={state.places} onEdit={editPlace} onBulkEdit={editPlaces} onSave={savePlaceChanges}/>}
   {tab==='Places'&&<section>
    <div className="pageIntro"><div><div className="eyebrow">SAVED SPOTS</div><h2>{editorView?'Find and manage places':'Explore saved places'}</h2><p className="muted">{editorView?'Organize saved spots by region, neighborhood, and practical dietary fit.':'Browse restaurants, neighborhoods, museums, and other trip ideas.'}</p></div><div className="placeActions"><span className="chip">{filtered.length} shown</span>{editorView&&unassignedAreaCount>0&&<button className="btn" onClick={()=>setArea('Unassigned')}>{unassignedAreaCount} unassigned</button>}{editorView&&suggestibleAreaCount>0&&<button className="btn" onClick={assignSuggestedAreas}>Suggest {suggestibleAreaCount} areas</button>}{editorView&&<button className="btn primary" onClick={addPlace}>+ Add place</button>}</div></div>
    <div className="filterPanel card">
     <div className="placeSearchRow"><input className="field searchField" placeholder="Search restaurants, neighborhoods, museums, notes…" value={query} onChange={e=>setQuery(e.target.value)}/>{hasPlaceFilters&&<button className="btn" onClick={clearPlaceFilters}>Clear filters</button>}</div>
     <div className="filterGrid placeFilters"><select className="field" aria-label="Filter by region" value={region} onChange={e=>setRegion(e.target.value)}><option>All</option><option>Toronto</option><option>Niagara & Buffalo</option></select><select className="field" aria-label="Filter by area" value={area} onChange={e=>setArea(e.target.value)}><option>All</option><option>Unassigned</option>{availableAreas.map(value=><option value={value} key={value}>{value}</option>)}</select><select className="field" aria-label="Filter by category" value={category} onChange={e=>setCategory(e.target.value)}><option>All</option>{[...new Set(state.places.map(p=>p.category))].sort().map(v=><option key={v}>{v}</option>)}</select><select className="field" aria-label="Filter by priority" value={priority} onChange={e=>setPriority(e.target.value)}><option>All</option><option value="must">Must do</option><option value="possible">Possible</option><option value="backup">Backup</option></select></div>
     {editorView&&<fieldset className="placeDietFilters"><legend>Dietary fit</legend><p>Choose a preference, then include only easy choices, easy and workable choices, or every place regardless of rating.</p><div className="placeDietFilterGroup"><span>Preference</span><div><button type="button" className={dietFilter==='All'?'active':''} aria-pressed={dietFilter==='All'} onClick={()=>setDietFilter('All')}>Any</button>{dietaryPreferences.map(item=><button type="button" className={dietFilter===item.id?'active':''} aria-pressed={dietFilter===item.id} onClick={()=>{setDietFilter(item.id);setDietFitFilter('recommended');}} key={item.id}>{item.label}{!item.active&&<small>limited data</small>}</button>)}</div></div>{dietFilter!=='All'&&<div className="placeDietFilterGroup"><span>{dietaryPreferenceLabel(dietFilter)} fit</span><div><button type="button" className={dietFitFilter==='easy'?'active':''} aria-pressed={dietFitFilter==='easy'} onClick={()=>setDietFitFilter('easy')}>Easy</button><button type="button" className={dietFitFilter==='recommended'?'active':''} aria-pressed={dietFitFilter==='recommended'} onClick={()=>setDietFitFilter('recommended')}>Easy + workable</button><button type="button" className={dietFitFilter==='any'?'active':''} aria-pressed={dietFitFilter==='any'} onClick={()=>setDietFitFilter('any')}>Any</button></div></div>}</fieldset>}
     {hasPlaceFilters&&<div className="activePlaceFilters" aria-label="Active place filters"><strong>Active:</strong>{query.trim()&&<span>Search: {query.trim()}</span>}{region!=='All'&&<span>{region}</span>}{area!=='All'&&<span>{area}</span>}{category!=='All'&&<span>{category}</span>}{priority!=='All'&&<span>{priority==='must'?'Must do':priority==='possible'?'Possible':'Backup'}</span>}{dietFilter!=='All'&&<span>{dietaryPreferenceLabel(dietFilter)} · {dietFitFilter==='recommended'?'Easy + workable':dietFitFilter==='easy'?'Easy':'Any'}</span>}{!showVisited&&<span>Unvisited only</span>}</div>}
     <div className="placeViewOptions"><label className="toggleLine"><input type="checkbox" checked={showVisited} onChange={e=>setShowVisited(e.target.checked)}/> Show visited places</label><label className="toggleLine"><input type="checkbox" checked={groupPlaceView} onChange={e=>setGroupPlaceView(e.target.checked)}/> Group by neighborhood</label></div>
    </div>
    {editorView&&selectedPlaceIds.size>0&&<div className="card neighborhoodBulkBar"><div><strong>{selectedPlaceIds.size} place{selectedPlaceIds.size===1?'':'s'} selected</strong><p className="muted small">Assign one neighborhood to the selected places.</p></div><div className="placeActions"><select className="field" aria-label="Neighborhood for selected places" value={bulkPlaceArea} onChange={event=>setBulkPlaceArea(event.target.value)}><option value="">Choose neighborhood…</option>{availableAreas.map(value=><option value={value} key={value}>{value}</option>)}</select><button className="btn primary" disabled={!bulkPlaceArea} onClick={assignSelectedPlaceArea}>Assign</button><button className="btn" onClick={()=>setSelectedPlaceIds(new Set())}>Clear</button></div></div>}
    {groupPlaceView?groupedPlaces.map(group=><section className="placeNeighborhood" key={group.area}><div className="placeNeighborhoodHeader"><div><div className="eyebrow">{group.places[0]?.region??'Saved places'}</div><h3>{group.label}</h3></div><span className="chip neutral">{group.places.length}</span></div><div className="grid placeGrid">{group.places.map(place=><PlaceCard key={place.id} place={place} selected={selectedPlaceIds.has(place.id)} onSelect={editorView?()=>togglePlaceSelection(place.id):undefined} onToggle={()=>toggleVisited(place.id)} onEdit={editorView?changes=>editPlace(place.id,changes):undefined} onEditHours={editorView?(day,changes)=>editPlaceHours(place.id,day,changes):undefined} onSave={editorView?savePlaceChanges:undefined} onGoogleUpdate={editorView?replacePlace:undefined} onDuplicate={editorView?()=>duplicatePlace(place.id):undefined} onDelete={editorView?()=>deletePlace(place.id):undefined} tripDates={state.days} tripFoods={state.foods}/>)}</div></section>):<div className="grid placeGrid">{filtered.map(place=><PlaceCard key={place.id} place={place} selected={selectedPlaceIds.has(place.id)} onSelect={editorView?()=>togglePlaceSelection(place.id):undefined} onToggle={()=>toggleVisited(place.id)} onEdit={editorView?changes=>editPlace(place.id,changes):undefined} onEditHours={editorView?(day,changes)=>editPlaceHours(place.id,day,changes):undefined} onSave={editorView?savePlaceChanges:undefined} onGoogleUpdate={editorView?replacePlace:undefined} onDuplicate={editorView?()=>duplicatePlace(place.id):undefined} onDelete={editorView?()=>deletePlace(place.id):undefined} tripDates={state.days} tripFoods={state.foods}/>)}</div>}
    {filtered.length===0&&<div className="empty card">No saved places match those filters.</div>}
   </section>}
   {tab==='Hours'&&<HoursManager places={state.places} days={state.days} onUpdated={replacePlaces} onIgnoreHours={(place,ignoreHours)=>{editPlace(place.id,{ignoreHours});window.setTimeout(savePlaceChanges,0);}} onOpenPlace={place=>{
    setQuery(place.name);
    setRegion(place.region);
    setArea('All');
    setCategory('All');
    setPriority('All');
    setTab('Places');
   }}/>}
   {tab==='Checklist'&&<TripChecklist items={state.packing} startDate={tripSettings.startDate} onToggle={toggleChecklistItem} onUpdate={updateChecklistItem} onAdd={addChecklistItem} onDelete={deleteChecklistItem} onAddSuggested={addSuggestedChecklistItems}/>}
  </main>
  {editorView&&showDailyBrief&&<DailyBrief state={state} initialDayIndex={briefDayIndex} onClose={()=>setShowDailyBrief(false)} onOffline={downloadOffline}/>}
  {editorView&&addToDayIndex!==null&&<AddToDayPanel days={state.days} places={state.places} initialDayIndex={addToDayIndex} onClose={()=>setAddToDayIndex(null)} onAddSaved={(place,dayIndex,time,optional,travelMode,travelMinutes)=>addPlaceToItinerary(place,dayIndex,optional,time,travelMode,travelMinutes)} onAddGoogle={addGooglePlaceToItinerary} onAddCustom={value=>addItem(value.dayIndex,value)}/>}
  {showSharePanel&&<div className="editorUnlockBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowSharePanel(false);}}><section className="card shareAccessPanel" role="dialog" aria-modal="true" aria-labelledby="share-access-title"><button className="editorUnlockClose" aria-label="Close share and access" onClick={()=>setShowSharePanel(false)}>×</button><div className="eyebrow">SHARE & ACCESS</div><div className="shareAccessHeading"><div><h2 id="share-access-title">Invite people into the trip</h2><p className="muted">Visitors can browse the public itinerary, places, food list, and recap without seeing private planning details.</p></div><span className={`accessModeBadge ${editorView?'editing':'public'}`}>{editorView?'Editing unlocked':'Public view'}</span></div><div className="shareAccessGrid"><div className="shareLinkCard"><strong>Public trip link</strong><div className="shareUrl"><span>{publicUrl||'Loading link…'}</span><button className="btn primary" onClick={copyPublicLink} disabled={!publicUrl}>Copy</button></div><div className="shareButtons"><button className="btn" onClick={sharePublicLink} disabled={!publicUrl}>Share from this device</button>{isEditor&&<button className="btn" onClick={enterPublicPreview}>Preview public view</button>}</div>{shareMessage&&<p className="shareMessage" role="status">{shareMessage}</p>}</div><div className="qrCard"><div className="qrFrame">{qrCode?<Image src={qrCode} alt="QR code for the public Trip Hub link" width={180} height={180} unoptimized/>:<span>Preparing QR code…</span>}</div><small>Scan to open the public trip</small></div></div><div className="privacySummary"><div><span className="privacyIcon public">✓</span><div><strong>Visitors can see</strong><p>Public itinerary, saved places, food ideas, nearby suggestions, and the trip recap.</p></div></div><div><span className="privacyIcon private">⌁</span><div><strong>Stays private</strong><p>Confirmation numbers, Key Info, personal notes, packing lists, dietary guidance, and editing tools.</p></div></div></div>{isEditor?<div className="shareAccessFooter"><div><strong>Editor session is active</strong><span>{publicPreview?'You are previewing the public experience.':'Your private editing tools are currently available on this device.'}</span></div><button className="btn dangerButton" onClick={lockEditor}>Lock editing now</button></div>:<div className="shareAccessFooter"><div><strong>Viewing publicly</strong><span>Use the shared PIN if you need to make changes.</span></div><button className="btn" onClick={()=>{setShowSharePanel(false);setAuthError('');setShowEditorUnlock(true);}}>Editor access</button></div>}</section></div>}
  {showEditorUnlock&&<div className="editorUnlockBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowEditorUnlock(false);}}><section className="card editorUnlock" role="dialog" aria-modal="true" aria-labelledby="editor-unlock-title"><button className="editorUnlockClose" aria-label="Close editor access" onClick={()=>setShowEditorUnlock(false)}>×</button><div className="eyebrow">PRIVATE EDITING</div><h2 id="editor-unlock-title">Unlock editor mode</h2><p className="muted">Enter the shared editor PIN to update plans, confirmations, private notes, dietary guidance, and checklists.</p><form onSubmit={unlockEditor}><label>Editor PIN<input className="field" type="password" autoFocus autoComplete="current-password" value={editorPin} onChange={event=>setEditorPin(event.target.value)}/></label>{authError&&<p className="error" role="alert">{authError}</p>}<button className="btn primary" disabled={authBusy||!editorPin}>{authBusy?'Unlocking…':'Unlock editing'}</button></form></section></div>}
 </>;
}

function TripOverview({state,settings,canEdit,onToday,onBrief,onEditDay,onChecklist}:{state:TripState;settings:TripSettings;canEdit:boolean;onToday:()=>void;onBrief:(dayIndex:number)=>void;onEditDay:(date:string)=>void;onChecklist:()=>void}){
 const fixedPlans=state.days.reduce((total,day)=>total+day.items.filter(isFixedItem).length,0);
 const nextTask=nextPrepTask(state);
 const preparation=prepTasks(state);
 return <section className="overviewPage"><div className="pageIntro overviewIntro"><div><div className="eyebrow">TRIP OVERVIEW</div><h2>The whole journey at a glance</h2><p className="muted">Browse each day, open routes, and expand only the details you need.</p></div><button className="btn primary" onClick={onToday}>Open today’s plan</button></div>
  <div className="overviewStats"><div><strong>{state.days.length}</strong><span>trip days</span></div><div><strong>{fixedPlans}</strong><span>timed anchors</span></div><div><strong>{state.places.length}</strong><span>saved places</span></div></div>
  {canEdit&&<div className={`card overviewPrep ${nextTask?`due-${prepDueStatus(nextTask)}`:'complete'}`}><div className="overviewPrepIcon" aria-hidden="true">{nextTask?'→':'★'}</div><div>{nextTask?<><div className="eyebrow">NEXT BEFORE-YOU-GO TASK</div><h3>{nextTask.title}</h3><p>{formatPrepDueDate(nextTask)} · {nextTask.category}</p></>:<><div className="eyebrow">BEFORE YOU GO</div><h3>{preparation.length?'Preparation list complete':'Set up your trip-preparation list'}</h3><p>{preparation.length?'Every preparation task is checked off.':'Add due-dated reminders without mixing them into packing.'}</p></>}</div><button className="btn" onClick={onChecklist}>{nextTask?'Open checklist':preparation.length?'Review list':'Set up tasks'}</button></div>}
  <div className="overviewTimeline">{state.days.map((day,index)=><details className="card overviewDay" key={day.date}><summary><span className="overviewMarker" aria-hidden="true">{index+1}</span><span className="overviewDayTitle"><small>{day.date}</small><strong>{day.label} · {day.city}</strong><em>{day.items.length} plan{day.items.length===1?'':'s'} · {day.items.filter(isFixedItem).length} timed</em></span><span className="overviewChevron" aria-hidden="true">⌄</span></summary><div className="overviewDayBody">{day.items.length?<ol>{day.items.map(item=><li key={item.id}><span className="overviewTime">{item.time}</span><div><div className="overviewItemTitle"><strong>{item.title}</strong>{isFixedItem(item)&&<span className="chip">Timed</span>}{item.optional&&<span className="chip neutral">Optional</span>}</div>{item.details&&<p>{item.details}</p>}{item.mapUrl&&<a className="textLink" href={item.mapUrl} target="_blank" rel="noreferrer">Open route ↗</a>}</div></li>)}</ol>:<p className="muted">This day is open for exploring.</p>}{canEdit&&<div className="overviewDayActions"><button className="btn primary" onClick={()=>onBrief(index)}>Open daily brief</button><button className="btn overviewEdit" onClick={()=>onEditDay(day.date)}>Edit this day</button></div>}</div></details>)}</div>
  <div className="card overviewFooter"><div><strong>{settings.destinations}</strong><p className="muted small">{tripDateLabel(settings.startDate,settings.endDate)}</p></div><button className="textButton" onClick={onToday}>Go to the live day view →</button></div>
 </section>;
}

function briefLeaveBy(item:ItineraryItem){
 if(!isFixedItem(item))return '';
 const start=timeValue(item.time);
 if(start===9999)return '';
 let minutes=start-(item.travelMinutes??20)-(item.prepBuffer??15);
 while(minutes<0)minutes+=24*60;
 const hour24=Math.floor(minutes/60)%24;
 const minute=minutes%60;
 const suffix=hour24>=12?'PM':'AM';
 const hour=hour24%12||12;
 return `${hour}:${String(minute).padStart(2,'0')} ${suffix}`;
}

function briefHoursLabel(place:Place,date:string){
 const moment=new Date(`${date}T12:00:00`);
 const status=placeOpenStatus(place,moment,true).status;
 if(status==='open')return 'Open around midday';
 if(status==='closed')return 'Closed around midday';
 if(status==='ignored')return 'Hours not needed';
 return 'Check hours';
}

function DailyBrief({state,initialDayIndex,onClose,onOffline}:{state:TripState;initialDayIndex:number;onClose:()=>void;onOffline:()=>void}){
 const [dayIndex,setDayIndex]=useState(initialDayIndex);
 const [weather,setWeather]=useState<WeatherResponse|null>(null);
 const day=state.days[dayIndex]??state.days[0];
 useEffect(()=>{
  if(!day?.date)return;
  const controller=new AbortController();
  setWeather(null);
  fetch(`/api/weather?date=${encodeURIComponent(day.date)}`,{signal:controller.signal}).then(response=>response.ok?response.json():Promise.reject()).then((value:WeatherResponse)=>setWeather(value)).catch(()=>{});
  return()=>controller.abort();
 },[day?.date]);
 if(!day)return null;
 const fixedItems=day.items.filter(isFixedItem);
 const hoursIssues=day.items.map(item=>checkItineraryHours(item,day.date,state.places)).filter((check):check is ItineraryHoursCheck=>Boolean(check&&(check.status==='closed'||check.status==='closesSoon')));
 const hotelEntry=state.days.slice(0,dayIndex+1).flatMap(sourceDay=>sourceDay.items.filter(item=>inferItemType(item)==='hotel').map(item=>({day:sourceDay,item}))).at(-1);
 const candidates=state.places.filter(place=>placeMatchesDay(place,day.city,day.date)&&!place.visited).sort((a,b)=>({must:0,possible:1,backup:2}[a.priority]-{must:0,possible:1,backup:2}[b.priority]));
 const foodIdeas=candidates.filter(isFoodPlace).slice(0,3);
 const activityIdeas=candidates.filter(place=>!isFoodPlace(place)&&!['Hotel','Transit'].includes(place.category)).slice(0,3);
 const relevantCity=day.city.includes('Toronto')?'Toronto':day.city.includes('Buffalo')?'Buffalo':'Niagara Falls';
 const forecast=weather?.forecasts.find(item=>item.city===relevantCity&&item.status==='available');
 const packing=weatherPackingReminders(forecast);
 function printBrief(){document.body.classList.add('printing-daily-brief');const cleanup=()=>document.body.classList.remove('printing-daily-brief');window.addEventListener('afterprint',cleanup,{once:true});window.print();window.setTimeout(cleanup,1500);}
 const placeList=(title:string,places:Place[])=><section className="briefSection"><h3>{title}</h3>{places.length?<div className="briefIdeas">{places.map(place=><article key={place.id}><div><strong>{place.name}</strong><span>{place.area??place.region} · {briefHoursLabel(place,day.date)}</span></div><a className="textLink" href={place.mapUrl||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`} target="_blank" rel="noreferrer">Map ↗</a></article>)}</div>:<p className="muted small">No saved options needed here yet.</p>}</section>;
 return <div className="dailyBriefBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="dailyBrief card" role="dialog" aria-modal="true" aria-labelledby="daily-brief-title"><div className="dailyBriefToolbar"><label>Trip day<select className="field" value={dayIndex} onChange={event=>setDayIndex(Number(event.target.value))}>{state.days.map((option,index)=><option value={index} key={option.date}>{option.label} · {option.city}</option>)}</select></label><div className="placeActions"><button className="btn" onClick={onOffline}>Save offline</button><button className="btn primary" onClick={printBrief}>Print / Save PDF</button><button className="editorUnlockClose briefClose" aria-label="Close daily brief" onClick={onClose}>×</button></div></div>
  <header className="dailyBriefHeader"><div><div className="eyebrow">DAILY TRAVEL BRIEF</div><h1 id="daily-brief-title">{day.label} · {day.city}</h1><p>{new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</p></div><div className="briefCount"><strong>{fixedItems.length}</strong><span>timed plans</span></div></header>
  {forecast?<section className="briefWeather"><div><span aria-hidden="true">{forecast.kind==='clear'?'☀️':forecast.kind==='rain'?'🌧️':forecast.kind==='storm'?'⛈️':forecast.kind==='snow'?'🌨️':'⛅'}</span><div><strong>{forecast.summary}</strong><small>{Math.round(forecast.temperatureMax??0)}° / {Math.round(forecast.temperatureMin??0)}°F · {forecast.precipitationProbability??0}% precipitation</small></div></div>{packing.length>0&&<p>{packing.join(' ')}</p>}</section>:<section className="briefWeather unavailable"><strong>Forecast not available yet</strong><span>The rest of the brief is ready offline.</span></section>}
  {hotelEntry&&<section className="briefHotel"><div><div className="eyebrow">YOUR BASE</div><h3>{hotelEntry.item.title}</h3>{hotelEntry.item.destination&&<p>{hotelEntry.item.destination}</p>}{(hotelEntry.item.keyInfo||hotelEntry.item.confirmationNumber)&&<p className="keyInfo"><strong>Key Info</strong><br/>{hotelEntry.item.keyInfo??hotelEntry.item.confirmationNumber}</p>}</div>{hotelEntry.item.mapUrl&&<a className="btn" href={hotelEntry.item.mapUrl} target="_blank" rel="noreferrer">Directions</a>}</section>}
  <section className="briefSection"><h3>Today’s schedule</h3><div className="briefSchedule">{day.items.map(item=>{const leaveBy=briefLeaveBy(item);return <article className={item.optional?'optional':''} key={item.id}><span className="briefTime">{item.time}</span><div><div className="briefItemTitle"><strong>{item.title}</strong>{isFixedItem(item)&&<span className="chip">Timed</span>}{item.optional&&<span className="chip neutral">Optional</span>}</div>{item.details&&<p>{item.details}</p>}{leaveBy&&<p className="briefLeave">Plan to leave around {leaveBy} · {item.travelMinutes??20} min travel + {item.prepBuffer??15} min buffer</p>}{(item.keyInfo||item.confirmationNumber)&&<div className="briefKeyInfo"><strong>Key Info</strong><span>{item.keyInfo??item.confirmationNumber}</span></div>}{item.userNotes&&<p className="briefNotes">Note: {item.userNotes}</p>}<div className="briefLinks">{item.mapUrl&&<a href={item.mapUrl} target="_blank" rel="noreferrer">Route ↗</a>}{item.routeText&&<span>{item.routeText}</span>}</div></div></article>;})}</div></section>
  {hoursIssues.length>0&&<section className="briefAlerts"><strong>{hoursIssues.length} hours notice{hoursIssues.length===1?'':'s'}</strong>{hoursIssues.map((check,index)=><p key={`${check.place.id}-${index}`}>{check.place.name}: {check.message}</p>)}</section>}
  <div className="briefSuggestionGrid">{placeList('Food options nearby',foodIdeas)}{placeList('Flexible ideas nearby',activityIdeas)}</div>
 </section></div>;
}

const publicSectionOptions:{id:PublicTripSection;label:string;detail:string}[]=[
 {id:'overview',label:'Trip overview',detail:'Expandable day-by-day public itinerary'},
 {id:'today',label:'Today & Assistant',detail:'Daily plan and calm next-step guidance'},
 {id:'recap',label:'Trip recap',detail:'Public journal moments and trip memories'},
 {id:'explore',label:'Explore',detail:'Nearby ideas and saved public places'},
 {id:'food',label:'Food',detail:'Foods to try and bring home'}
];
const coverThemes:{id:TripCoverTheme;label:string}[]=[{id:'forest',label:'Forest'},{id:'lake',label:'Lake'},{id:'sunset',label:'Sunset'}];

function TripSettingsView({state,settings,publicUrl,canUndoRestore,onUndoRestore,onSave,onRestore,onPrint,onShare,onPreview}:{state:TripState;settings:TripSettings;publicUrl:string;canUndoRestore:boolean;onUndoRestore:()=>void;onSave:(settings:TripSettings)=>void;onRestore:(state:TripState)=>void;onPrint:()=>void;onShare:()=>void;onPreview:()=>void}){
 const [draft,setDraft]=useState(settings);
 const [saved,setSaved]=useState(false);
 const [transferMessage,setTransferMessage]=useState('');
 const [restoreCandidate,setRestoreCandidate]=useState<{name:string;state:TripState}|null>(null);
 useEffect(()=>setDraft(settings),[settings]);
 function update<K extends keyof TripSettings>(key:K,value:TripSettings[K]){setDraft(current=>({...current,[key]:value}));setSaved(false);}
 function toggleSection(section:PublicTripSection){
  const selected=draft.publicSections.includes(section)?draft.publicSections.filter(item=>item!==section):[...draft.publicSections,section];
  if(selected.length)update('publicSections',selected);
 }
 const filename=safeFilename(settings.title||'trip');
 const calendarEntries=fixedCalendarEntries(state);
 const allFixedEntries=state.days.flatMap(day=>day.items.filter(isFixedItem).map(item=>({day,item})));
 const invalidCalendarEntries=allFixedEntries.filter(entry=>!calendarEntryDetails(entry).valid);
 const calendarCount=calendarEntries.length;
 const tripHealth=validateTripState(state);
 async function importBackup(file?:File){
  if(!file)return;
  setTransferMessage('');
  try{
   const restored=restoredTripState(JSON.parse(await file.text()));
   const validation=validateTripState(restored);
   if(!validation.valid)throw new Error(`This backup cannot be restored: ${validation.errors[0]}`);
   setRestoreCandidate({name:file.name,state:restored});
   setTransferMessage(validation.warnings.length?`Backup is ready to preview with ${validation.warnings.length} item${validation.warnings.length===1?'':'s'} worth reviewing.`:'Backup is ready to preview.');
  }catch(error){setTransferMessage(error instanceof Error?error.message:'The backup could not be restored.');}
 }
 return <section className="settingsPage"><div className="pageIntro"><div><div className="eyebrow">TRIP SETTINGS</div><h2>Shape the trip and its public page</h2><p className="muted">These details travel with the trip, so the same system can support future destinations and shared templates.</p></div></div>
  <div className="settingsGrid"><form className="card settingsForm" onSubmit={event=>{event.preventDefault();onSave(draft);setSaved(true);}}><div><h3>Trip identity</h3><p className="muted small">Used in the header, share sheet, and public link preview.</p></div><label>Trip title<input className="field" value={draft.title} onChange={event=>update('title',event.target.value)}/></label><label>Destinations<input className="field" value={draft.destinations} onChange={event=>update('destinations',event.target.value)}/></label><div className="settingsDates"><label>Start date<input className="field" type="date" value={draft.startDate} onChange={event=>update('startDate',event.target.value)}/></label><label>End date<input className="field" type="date" value={draft.endDate} onChange={event=>update('endDate',event.target.value)}/></label></div><label>Public welcome message<textarea className="field" rows={4} value={draft.publicMessage} onChange={event=>update('publicMessage',event.target.value)}/></label><button className="btn primary" disabled={!draft.title.trim()||!draft.destinations.trim()}>Save trip settings</button>{saved&&<p className="settingsSaved" role="status">Trip settings saved and shared.</p>}</form>
   <div><div className="card settingsCard"><h3>Public cover</h3><p className="muted small">Choose the mood visitors see when they open the trip.</p><div className="themeChoices">{coverThemes.map(theme=><button type="button" className={`themeChoice theme-${theme.id} ${draft.coverTheme===theme.id?'selected':''}`} aria-pressed={draft.coverTheme===theme.id} onClick={()=>update('coverTheme',theme.id)} key={theme.id}><span>{theme.label}</span></button>)}</div></div>
    <div className="card settingsCard"><h3>Visible public sections</h3><p className="muted small">Private notes, confirmations, checklists, and dietary guidance stay hidden regardless.</p><div className="publicSectionChoices">{publicSectionOptions.map(section=><label className={draft.publicSections.includes(section.id)?'selected':''} key={section.id}><input type="checkbox" checked={draft.publicSections.includes(section.id)} onChange={()=>toggleSection(section.id)}/><span><strong>{section.label}</strong><small>{section.detail}</small></span></label>)}</div></div>
    <div className="card settingsCard shareHome"><h3>Share & access</h3><p className="muted small">Your public link is ready. Preview it before sharing or open the full access controls.</p><span className="settingsPublicUrl">{publicUrl||'Preparing public link…'}</span><div className="shareButtons"><button className="btn primary" onClick={onShare}>Open sharing tools</button><button className="btn" onClick={onPreview}>Preview public page</button></div></div>
    <div className="card settingsCard transferCard"><div className="between"><div><h3>Trip health & backup</h3><p className="muted small">Validate the trip, take the schedule with you, or keep a private portable copy.</p></div><span className={`healthBadge ${tripHealth.valid?'healthy':'attention'}`}>{tripHealth.valid?'✓ Data healthy':`${tripHealth.errors.length} issue${tripHealth.errors.length===1?'':'s'}`}</span></div>{tripHealth.warnings.length>0&&<details className="tripHealthDetails"><summary>{tripHealth.warnings.length} planning note{tripHealth.warnings.length===1?'':'s'}</summary><ul>{tripHealth.warnings.slice(0,8).map(item=><li key={item}>{item}</li>)}</ul></details>}<div className="transferActions"><button className="btn" disabled={!calendarCount} onClick={()=>downloadText(`${filename}.ics`,tripCalendar(state),'text/calendar;charset=utf-8')}>Download calendar <small>{calendarCount} fixed plans</small></button><button className="btn" onClick={onPrint}>Print itinerary</button><button className="btn" onClick={()=>downloadText(`${filename}-backup.json`,tripBackup(state),'application/json;charset=utf-8')}>Download backup</button><label className="btn transferUpload">Choose backup<input type="file" accept="application/json,.json" onChange={event=>{void importBackup(event.currentTarget.files?.[0]);event.currentTarget.value='';}}/></label>{canUndoRestore&&<button className="btn" onClick={onUndoRestore}>Undo last restore</button>}</div>{restoreCandidate&&<div className="restorePreview"><div><div className="eyebrow">RESTORE PREVIEW</div><h4>{restoreCandidate.state.settings?.title||'Trip Hub backup'}</h4><p>{restoreCandidate.name} · {restoreCandidate.state.days.length} days · {restoreCandidate.state.places.length} places · {restoreCandidate.state.days.flatMap(day=>day.items).length} itinerary items</p></div><div className="placeActions"><button className="btn" onClick={()=>setRestoreCandidate(null)}>Cancel</button><button className="btn primary" onClick={()=>{onRestore(restoreCandidate.state);setRestoreCandidate(null);setTransferMessage('Backup restored. You can undo this restore until another one is made.');}}>Restore this backup</button></div></div>}<details className="calendarPreview"><summary>Preview {calendarCount} calendar event{calendarCount===1?'':'s'}</summary><div>{calendarEntries.map(entry=>{const details=calendarEntryDetails(entry);return <div className="calendarPreviewRow" key={entry.item.id}><span><strong>{entry.item.title}</strong><small>{details.dateLabel} · {details.timeLabel}</small></span><span>{details.duration} min · {details.timeZoneLabel}</span></div>;})}</div></details>{invalidCalendarEntries.length>0&&<div className="calendarIssues"><strong>{invalidCalendarEntries.length} fixed plan{invalidCalendarEntries.length===1?' needs':'s need'} attention</strong>{invalidCalendarEntries.map(entry=>{const details=calendarEntryDetails(entry);return <button className="calendarIssue" type="button" onClick={()=>{setTransferMessage(`${entry.item.title}: ${details.issue}`);}} key={entry.item.id}><span>{entry.item.title}</span><small>{details.issue}</small></button>;})}</div>}<p className="transferPrivacy">Backups contain private notes and confirmation details. Reservation file attachments remain stored only on this device.</p>{transferMessage&&<p className="settingsSaved" role="status">{transferMessage}</p>}</div></div>
  </div>
 </section>;
}

function TripReadinessDashboard({readiness,onOpen,onQuickFix,onIgnore,onRestore}:{readiness:ReturnType<typeof buildTripReadiness>;onOpen:(action:ReadinessAction|{target:ReadinessTarget;anchorId?:string})=>void;onQuickFix:(action:ReadinessAction)=>void;onIgnore:(actionId:string)=>void;onRestore:(actionId:string)=>void}){
 const priorityActions=readiness.actions.slice(0,6);
 const firstAction=readiness.actions[0];
 return <section className="card readinessDashboard" aria-labelledby="trip-readiness-title">
  <div className="readinessHeader"><div><div className="eyebrow">TRIP READINESS</div><h2 id="trip-readiness-title">{readiness.readyCount===readiness.checks.length?'Ready for travel':`${readiness.readyCount} of ${readiness.checks.length} planning areas ready`}</h2><p className="muted small">A calm overview of details worth checking before departure.</p></div><div className="readinessHeaderActions"><div className="readinessFixed"><strong>{readiness.keyInfoComplete}/{readiness.fixedPlanCount}</strong><span>fixed plans with Key Info</span></div>{firstAction&&<button className="btn primary readinessNext" onClick={()=>onOpen(firstAction)}>Fix next →</button>}</div></div>
  <div className="readinessGrid">{readiness.checks.map(check=><button className={`readinessCard status-${check.status}`} onClick={()=>onOpen({target:check.target})} key={check.id}><span className="readinessIcon" aria-hidden="true">{check.status==='ready'?'✓':check.status==='attention'?'!':'•'}</span><span className="readinessCopy"><strong>{check.label}</strong><b>{check.value}</b><small>{check.detail}</small></span><span className="readinessArrow" aria-hidden="true">→</span></button>)}</div>
  {priorityActions.length>0?<div className="readinessQueue"><div className="between"><div><div className="eyebrow">GUIDED CLEANUP</div><h3>{readiness.actions.length} planning note{readiness.actions.length===1?'':'s'} left</h3></div><span className="chip neutral">Showing {priorityActions.length}</span></div><div className="readinessActionList">{priorityActions.map((action,index)=><article className={`readinessAction status-${action.status}`} key={action.id}><span className="readinessActionDot" aria-hidden="true"/><div><strong>{index===0?'Next: ':''}{action.label}</strong><p>{action.detail}</p></div><div className="readinessActionButtons">{action.quickFix&&<button className="btn primary" onClick={()=>onQuickFix(action)}>{action.quickFix.label}</button>}<button className="btn" onClick={()=>onOpen(action)}>Review</button><button className="textButton" onClick={()=>onIgnore(action.id)}>Not needed</button></div></article>)}</div></div>:<div className="readinessComplete"><span aria-hidden="true">✓</span><div><strong>Trip details are in good shape</strong><p>No readiness cleanup items are waiting.</p></div></div>}
  {readiness.ignoredActions.length>0&&<details className="readinessIgnored"><summary>{readiness.ignoredActions.length} intentionally dismissed item{readiness.ignoredActions.length===1?'':'s'}</summary><div>{readiness.ignoredActions.map(action=><div className="readinessIgnoredRow" key={action.id}><span><strong>{action.label}</strong><small>{action.detail}</small></span><button className="textButton" onClick={()=>onRestore(action.id)}>Restore</button></div>)}</div></details>}
 </section>;
}

type DragPosition={dayIndex:number;itemIndex:number};

function TripBoard({days,places,canUndo,onUndo,onMove,onDuplicate,onDelete,onSaveItem,onAdd,onAddPlace,onOptimize,onAdjustTiming,onToggle,onTravelMode}:{days:TripState['days'];places:Place[];canUndo:boolean;onUndo:()=>void;onMove:(fromDay:number,fromIndex:number,toDay:number,toIndex:number)=>void;onDuplicate:(dayIndex:number,itemIndex:number)=>void;onDelete:(dayIndex:number,itemIndex:number)=>void;onSaveItem:(dayIndex:number,itemIndex:number,draft:ItineraryItem,targetDay:number)=>void;onAdd:(dayIndex:number)=>void;onAddPlace:(place:Place,dayIndex:number)=>void;onOptimize:(dayIndex:number)=>void;onAdjustTiming:(dayIndex:number)=>void;onToggle:(dayIndex:number,itemIndex:number)=>void;onTravelMode:(dayIndex:number,itemIndex:number,mode:TravelMode)=>void}){
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
 const [editing,setEditing]=useState<{dayIndex:number;itemIndex:number}|null>(null);
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
      const schedule=analyzeDaySchedule(day,places);
      return <article id={`board-${day.date}`} className={`boardColumn ${isCollapsed?'collapsed':''} ${draggingPlaceId?'acceptingPlace':''}`} key={day.date} onDragOver={event=>event.preventDefault()} onDrop={event=>dropAt(event,di,day.items.length)}>
       <header className="boardColumnHeader"><button className="boardCollapse" onClick={()=>toggleCollapsed(day.date)} aria-expanded={!isCollapsed} aria-label={`${isCollapsed?'Expand':'Collapse'} ${day.label}`}>{isCollapsed?'▸':'▾'}</button><div><div className="eyebrow">{day.date}</div><h3>{day.label}</h3><p>{day.city}</p></div><span className="chip neutral">{day.items.length}</span></header>
       {!isCollapsed&&<>
        <div className="boardRouteSummary"><div><strong>{route.linkedStops} routed stops</strong><span>{route.totalTravelMinutes?`≈ ${route.totalTravelMinutes} min transit · ${route.totalDistanceKm.toFixed(1)} km`:'Add linked places for travel estimates'}</span>{schedule.adjustmentCount>0&&<span>{schedule.adjustmentCount} flexible time{schedule.adjustmentCount===1?'':'s'} can be aligned to this order</span>}</div><div className="boardRouteActions"><button className="textButton" onClick={()=>setRouteDayIndex(di)}>View route</button><button className="textButton" onClick={()=>onOptimize(di)} disabled={!route.canOptimize}>Suggest order</button><button className="textButton timingAdjust" onClick={()=>onAdjustTiming(di)} disabled={!schedule.canAdjust}>Adjust times</button></div></div>
        {(route.warnings.length>0||schedule.notices.length>0)&&<div className="boardRouteWarnings">{[...schedule.notices,...route.warnings].slice(0,3).map(warning=><span key={warning}>⚠ {warning}</span>)}</div>}
        <div className="boardCards">
         {day.items.map((item,ii)=>{const boardType=inferItemType(item);const linkedPlace=boardPlace(item,places);const linkedArea=placeArea(linkedPlace);const scheduleEntry=schedule.entryById.get(item.id);return <div className="boardCardStack" key={item.id}>
          {ii>0&&<RouteConnector compact editable from={day.items[ii-1]} to={item} places={places} timing={schedule.connections.get(item.id)} onModeChange={mode=>onTravelMode(di,ii,mode)}/>}
          <article className={`boardCard board-${boardType} ${item.done?'complete':''} ${dragging?.dayIndex===di&&dragging.itemIndex===ii?'dragging':''}`} draggable onDragStart={event=>{setDragging({dayIndex:di,itemIndex:ii});setDraggingPlaceId(null);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);}} onDragEnd={()=>setDragging(null)} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.stopPropagation();dropAt(event,di,ii);}}>
           <div className="boardCardTop"><button className="dragHandle" aria-label={`Drag ${item.title}`} title="Drag to move">⋮⋮</button><span className="boardTime">{item.time}</span>{scheduleEntry?.adjusted&&<span className="suggestedBoardTime">→ {scheduleEntry.suggestedTime}</span>}<label className="boardCheck"><input aria-label={`Mark ${item.title} complete`} type="checkbox" checked={item.done} onChange={()=>onToggle(di,ii)}/></label></div>
           <button className="boardCardTitle" onClick={()=>setEditing({dayIndex:di,itemIndex:ii})}>{item.title}</button>
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
  {editing&&days[editing.dayIndex]?.items[editing.itemIndex]&&<BoardQuickEditDrawer key={days[editing.dayIndex].items[editing.itemIndex].id} item={days[editing.dayIndex].items[editing.itemIndex]} dayIndex={editing.dayIndex} itemIndex={editing.itemIndex} days={days} places={places} onClose={()=>setEditing(null)} onSave={(draft,targetDay)=>{onSaveItem(editing.dayIndex,editing.itemIndex,draft,targetDay);setEditing(null);}} onDuplicate={()=>{onDuplicate(editing.dayIndex,editing.itemIndex);setEditing(null);}} onDelete={()=>{onDelete(editing.dayIndex,editing.itemIndex);setEditing(null);}}/>}
 </section>;
}

function BoardQuickEditDrawer({item,dayIndex,itemIndex,days,places,onClose,onSave,onDuplicate,onDelete}:{item:ItineraryItem;dayIndex:number;itemIndex:number;days:TripState['days'];places:Place[];onClose:()=>void;onSave:(draft:ItineraryItem,targetDay:number)=>void;onDuplicate:()=>void;onDelete:()=>void}){
 const [draft,setDraft]=useState<ItineraryItem>(()=>structuredClone(item));
 const [targetDay,setTargetDay]=useState(dayIndex);
 const [confirmDiscard,setConfirmDiscard]=useState(false);
 const closeButtonRef=useRef<HTMLButtonElement>(null);
 const keepEditingRef=useRef<HTMLButtonElement>(null);
 const dirty=targetDay!==dayIndex||JSON.stringify(draft)!==JSON.stringify(item);
 const requestClose=useCallback(()=>{if(dirty){setConfirmDiscard(true);return;}onClose();},[dirty,onClose]);
 function update<K extends keyof ItineraryItem>(key:K,value:ItineraryItem[K]){setDraft(current=>({...current,[key]:value}));}
 useEffect(()=>{
  function closeOnEscape(event:KeyboardEvent){if(event.key!=='Escape')return;if(confirmDiscard){setConfirmDiscard(false);return;}requestClose();}
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  closeButtonRef.current?.focus();
  window.addEventListener('keydown',closeOnEscape);
  return ()=>{window.removeEventListener('keydown',closeOnEscape);document.body.style.overflow=previousOverflow;};
 },[confirmDiscard,requestClose]);
 useEffect(()=>{if(confirmDiscard)keepEditingRef.current?.focus();},[confirmDiscard]);
 const previewDay=useMemo(()=>{
  const sourceItems=days[targetDay].items.filter(candidate=>candidate.id!==item.id);
  const items=targetDay===dayIndex?[...sourceItems.slice(0,itemIndex),draft,...sourceItems.slice(itemIndex)]:[...sourceItems,draft];
  return {...days[targetDay],items:sortItems(items)};
 },[dayIndex,days,draft,item.id,itemIndex,targetDay]);
 const preview=useMemo(()=>analyzeDaySchedule(previewDay,places),[places,previewDay]);
 const previewEntry=preview.entryById.get(draft.id);
 const previewIndex=previewDay.items.findIndex(candidate=>candidate.id===draft.id);
 const previousItem=previewIndex>0?previewDay.items[previewIndex-1]:undefined;
 const nextItem=previewIndex>=0?previewDay.items[previewIndex+1]:undefined;
 const resolved=locationResolution(draft,places).place;
 const fixed=isFixedItem(draft);
 const itemType=inferItemType(draft);
 return <div className="boardEditBackdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)requestClose();}}>
  <aside className="boardEditDrawer" role="dialog" aria-modal="true" aria-labelledby="board-edit-title">
   <header className="boardEditHeader"><div><div className="boardEditEyebrow"><span className="eyebrow">QUICK EDIT</span>{dirty&&<span className="boardDirtyBadge">Unsaved changes</span>}</div><h2 id="board-edit-title">{draft.title||'Untitled stop'}</h2><p>{days[dayIndex].label} · {days[dayIndex].city}</p></div><button ref={closeButtonRef} className="boardEditClose" onClick={requestClose} aria-label="Close quick editor">×</button></header>
   <div className="boardEditBody">
    <div className="boardEditPrimary"><label>Time<input className="field" value={draft.time} onChange={event=>update('time',event.target.value)}/></label><label>Duration<input className="field" type="number" min="5" step="5" value={draft.estimatedDuration??''} placeholder={String(estimatedItemDuration(draft))} onChange={event=>update('estimatedDuration',event.target.value?Number(event.target.value):undefined)}/></label></div>
    <label>Title<input className="field" value={draft.title} onChange={event=>update('title',event.target.value)}/></label>
    <div className="boardEditPrimary"><label>Planning<select className="field" value={fixed?'fixed':'flexible'} onChange={event=>update('fixed',event.target.value==='fixed')}><option value="fixed">Fixed plan</option><option value="flexible">Flexible idea</option></select></label><label>Type<select className="field" value={itemType} onChange={event=>update('type',event.target.value as ItineraryItem['type'])}><option value="reservation">Reservation</option><option value="activity">Activity</option><option value="food">Food</option><option value="travel">Travel</option><option value="hotel">Hotel</option></select></label></div>
    <label>Destination<input className="field" value={draft.destination??''} placeholder="Where is this stop?" onChange={event=>{const destination=event.target.value;setDraft(current=>({...current,destination,mapUrl:mapsUrl(destination)}));}}/></label>
    <label>Saved place<select className="field" value={draft.placeId??''} onChange={event=>{const place=places.find(candidate=>candidate.id===event.target.value);setDraft(current=>({...current,placeId:event.target.value||undefined,...(place?{destination:place.name,mapUrl:place.mapUrl}:{} )}));}}><option value="">No saved place linked</option>{['Toronto','Niagara & Buffalo','Other'].map(region=><optgroup label={region} key={region}>{places.filter(place=>place.region===region).sort((a,b)=>a.name.localeCompare(b.name)).map(place=><option value={place.id} key={place.id}>{place.name}</option>)}</optgroup>)}</select>{resolved&&<small>Hours and route data linked to {resolved.name}.</small>}</label>
    <div className="boardEditPrimary"><label>Travel mode<select className="field" value={draft.travelMode??'transit'} onChange={event=>update('travelMode',event.target.value as TravelMode)}><option value="walking">Walking</option><option value="transit">Public transit</option><option value="driving">Driving</option></select></label><label>Travel time<input className="field" type="number" min="0" step="5" value={draft.travelMinutes??''} placeholder="Auto" onChange={event=>update('travelMinutes',event.target.value?Number(event.target.value):undefined)}/></label></div>
    <label>Day<select className="field" value={targetDay} onChange={event=>setTargetDay(Number(event.target.value))}>{days.map((day,index)=><option value={index} key={day.date}>{day.label} · {day.city}</option>)}</select></label>
    <div className="boardTimingPreview" aria-label="Route and schedule preview"><div><span>Route & schedule preview</span><strong>{previewEntry?.adjusted?`${draft.time||'No time'} → ${previewEntry.suggestedTime}`:draft.time||previewEntry?.suggestedTime||'No time set'}</strong></div><span>{fixed?'Fixed time stays anchored':'Flexible time can follow the route'}</span><div className="boardEditRouteFlow">{previousItem?<BoardEditRouteLeg from={previousItem} to={draft} places={places} connection={preview.connections.get(draft.id)}/>:<div className="boardEditRouteEdge"><span>Starts this route</span><strong>{draft.title}</strong></div>}{nextItem&&<BoardEditRouteLeg from={draft} to={nextItem} places={places} connection={preview.connections.get(nextItem.id)}/>}</div>{preview.notices.map(notice=><p key={notice}>⚠ {notice}</p>)}</div>
    <label>Notes<textarea className="field" rows={3} value={draft.userNotes??''} placeholder="Private reminders or planning notes" onChange={event=>update('userNotes',event.target.value)}/></label>
    <label>Key Info<textarea className="field" rows={3} value={draft.keyInfo??draft.confirmationNumber??''} placeholder="Confirmation, seats, terminal, ticket details…" onChange={event=>update('keyInfo',event.target.value)}/></label>
    <div className="boardEditToggles"><label><input type="checkbox" checked={Boolean(draft.optional)} onChange={event=>update('optional',event.target.checked)}/> Optional</label><label><input type="checkbox" checked={Boolean(draft.locationNotNeeded)} onChange={event=>update('locationNotNeeded',event.target.checked)}/> Route location not needed</label></div>
   </div>
   <footer className="boardEditFooter"><div><button className="textButton" onClick={onDuplicate}>Duplicate</button><button className="textButton dangerText" onClick={onDelete}>Delete</button></div><div><button className="btn" onClick={requestClose}>Cancel</button><button className="btn primary" onClick={()=>onSave(draft,targetDay)} disabled={!dirty||!draft.title.trim()}>Save stop</button></div></footer>
   {confirmDiscard&&<div className="boardDiscardBackdrop" role="presentation"><section className="boardDiscardDialog" role="alertdialog" aria-modal="true" aria-labelledby="board-discard-title" aria-describedby="board-discard-description"><div className="eyebrow">UNSAVED CHANGES</div><h3 id="board-discard-title">Discard your edits?</h3><p id="board-discard-description">This stop has changes that haven’t been saved yet.</p><div><button ref={keepEditingRef} className="btn primary" onClick={()=>setConfirmDiscard(false)}>Keep editing</button><button className="btn dangerButton" onClick={onClose}>Discard changes</button></div></section></div>}
  </aside>
 </div>;
}

function BoardEditRouteLeg({from,to,places,connection}:{from:ItineraryItem;to:ItineraryItem;places:Place[];connection?:DayScheduleConnection}){
 const mode=to.travelMode??'transit';
 const directions=buildGoogleMapsLeg(from,to,places,mode);
 const travel=connection?.travelMinutes??to.travelMinutes;
 const timing=connection?.departureMinutes!==undefined&&connection.arrivalMinutes!==undefined?`Leave ${formatTripTime(connection.departureMinutes)} · arrive ${formatTripTime(connection.arrivalMinutes)}`:undefined;
 const margin=connection?.gapMinutes;
 const marginLabel=margin===undefined?undefined:margin<0?`${Math.abs(margin)} min late`:margin<15?`${margin} min margin`:`${margin} min free before ${to.title}`;
 return <div className={`boardEditRouteLeg ${connection?`timing-${connection.status}`:''}`} aria-label={`Preview route from ${from.title} to ${to.title}`}>
  <div><span>{from.title}</span><b aria-hidden="true">→</b><strong>{to.title}</strong></div>
  <div className="boardEditRouteMeta"><span>{mode==='walking'?'Walk':mode==='driving'?'Drive':'Transit'}{travel!==undefined?` · ${travel} min`:''}</span>{timing&&<span>{timing}</span>}{marginLabel&&<span className="boardEditRouteMargin">{marginLabel}</span>}{directions&&<a href={directions} target="_blank" rel="noreferrer">Directions ↗</a>}</div>
 </div>;
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
  return <ol className="dayRouteStops">{stops.map((stop,index)=><li className={`dayRouteStop location-${stop.locationQuality}`} key={stop.item.id}><span className="routeStopNumber">{index+1}</span><div><div className="between"><strong>{stop.item.title}</strong><span className="boardTime">{stop.item.time}</span></div><p>{stop.locationQuality==='ignored'?'No route location needed.':stop.place?.formattedAddress||stop.item.destination||stop.place?.name||'Add a destination to include this stop in Maps.'}</p><div className="boardBadges"><span className={`chip ${isFixedItem(stop.item)?'':'neutral'}`}>{isFixedItem(stop.item)?'Fixed':'Flexible'}</span>{stop.area&&<span className="chip boardArea">{stop.area.split(' — ').at(-1)}</span>}<span className={`chip routeQuality quality-${stop.locationQuality}`}>{stop.locationQuality==='linked'?'Saved place':stop.locationQuality==='text'?'Text location':stop.locationQuality==='ignored'?'Location not needed':'Location missing'}</span></div></div></li>)}</ol>;
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

type LocationEntry={day:TripState['days'][number];dayIndex:number;item:ItineraryItem;itemIndex:number;resolution:ReturnType<typeof locationResolution>};

function LocationResolver({days,places,canUndo,onUndo,onLink,onGoogleLink,onClear,onCreate,onSetNotNeeded,onAssignAreas,onOpenItem}:{days:TripState['days'];places:Place[];canUndo:boolean;onUndo:()=>void;onLink:(dayIndex:number,itemIndex:number,placeId:string)=>void;onGoogleLink:(dayIndex:number,itemIndex:number,candidate:GooglePlaceCandidate)=>void;onClear:(dayIndex:number,itemIndex:number)=>void;onCreate:(dayIndex:number,itemIndex:number)=>void;onSetNotNeeded:(dayIndex:number,itemIndex:number,notNeeded:boolean)=>void;onAssignAreas:()=>void;onOpenItem:(itemId:string)=>void}){
 const [statusFilter,setStatusFilter]=useState<'needs'|'all'|'linked'|'auto'|'text'|'missing'|'ignored'>('needs');
 const [dayFilter,setDayFilter]=useState('All');
 const [search,setSearch]=useState('');
 const [skipped,setSkipped]=useState<Set<string>>(()=>new Set());
 const [googleSecret,setGoogleSecret]=useState('');
 const entries:LocationEntry[]=days.flatMap((day,dayIndex)=>day.items.map((item,itemIndex)=>({day,dayIndex,item,itemIndex,resolution:locationResolution(item,places)})));
 const counts={linked:entries.filter(entry=>entry.resolution.status==='linked').length,auto:entries.filter(entry=>entry.resolution.status==='auto').length,text:entries.filter(entry=>entry.resolution.status==='text').length,missing:entries.filter(entry=>entry.resolution.status==='missing').length,ignored:entries.filter(entry=>entry.resolution.status==='ignored').length};
 const actionable=entries.filter(entry=>!['linked','ignored'].includes(entry.resolution.status)&&!skipped.has(entry.item.id));
 const activeEntry=actionable[0];
 const resolvedCount=counts.linked+counts.ignored;
 const assignablePlaces=places.filter(place=>!place.area&&Boolean(suggestPlaceArea(place)));
 const itineraryAreas=entries.reduce((totals,entry)=>{const areaName=placeArea(entry.resolution.place);if(areaName)totals.set(areaName,(totals.get(areaName)??0)+1);return totals;},new Map<string,number>());
 const areaBreakdown=[...itineraryAreas.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 const awkwardDays=days.map(day=>({day,route:analyzeDayRoute(day,places)})).filter(({route})=>route.warnings.some(warning=>/backtracking|neighborhood changes/.test(warning)));
 const needle=search.trim().toLowerCase();
 const filtered=entries.filter(entry=>{
  if(dayFilter!=='All'&&entry.day.date!==dayFilter)return false;
  if(statusFilter==='needs'&&['linked','ignored'].includes(entry.resolution.status))return false;
  if(statusFilter!=='all'&&statusFilter!=='needs'&&entry.resolution.status!==statusFilter)return false;
  return !needle||`${entry.item.title} ${entry.item.destination??''} ${entry.day.city}`.toLowerCase().includes(needle);
 });
 const statusCopy={linked:'Linked',auto:'Suggested match',text:'Text only',missing:'Needs location',ignored:'Not needed'} as const;
 function skipActive(){if(!activeEntry)return;setSkipped(current=>new Set([...current,activeEntry.item.id]));}
 return <section>
  <div className="pageIntro"><div><div className="eyebrow">LOCATION WIZARD</div><h2>Make every useful stop route-ready</h2><p className="muted">Resolve one stop at a time, search saved places, or look it up with Google only when needed.</p></div><div className="placeActions"><span className="chip">{resolvedCount}/{entries.length} resolved</span><button className="btn" disabled={!canUndo} onClick={onUndo}>↶ Undo</button></div></div>
  {activeEntry?<LocationWizardCard key={activeEntry.item.id} entry={activeEntry} places={places} googleSecret={googleSecret} onGoogleSecret={setGoogleSecret} onLink={onLink} onGoogleLink={onGoogleLink} onCreate={onCreate} onNotNeeded={()=>onSetNotNeeded(activeEntry.dayIndex,activeEntry.itemIndex,true)} onSkip={skipActive} onEdit={()=>onOpenItem(activeEntry.item.id)}/>:<div className="card locationWizardComplete"><span>✓</span><div><h2>Location cleanup complete</h2><p className="muted">Everything is linked, intentionally marked not needed, or skipped for this review.</p></div>{skipped.size>0&&<button className="btn" onClick={()=>setSkipped(new Set())}>Review {skipped.size} skipped</button>}</div>}
  <div className="card neighborhoodCleanup">
   <div className="neighborhoodCleanupHeader"><div><div className="eyebrow">NEIGHBORHOOD CLEANUP</div><h3>{areaBreakdown.length} neighborhoods represented in the itinerary</h3><p className="muted small">Assignments power Board grouping, route checks, and same-area Assistant suggestions.</p></div>{assignablePlaces.length>0?<button className="btn primary" onClick={onAssignAreas}>Assign {assignablePlaces.length} suggested neighborhood{assignablePlaces.length===1?'':'s'}</button>:<span className="chip">Suggestions assigned</span>}</div>
   {areaBreakdown.length>0&&<div className="neighborhoodChips">{areaBreakdown.map(([areaName,count])=><span className="areaBadge" key={areaName}>{areaName.split(' — ').at(-1)} · {count}</span>)}</div>}
   {awkwardDays.length>0&&<div className="neighborhoodWarnings"><strong>Days worth reviewing</strong>{awkwardDays.map(({day,route})=><div key={day.date}><span>{day.label}</span><p>{route.warnings.find(warning=>/backtracking|neighborhood changes/.test(warning))}</p></div>)}</div>}
  </div>
  <details className="locationOverview"><summary>Review all itinerary locations</summary>
   <div className="locationStats">
    <button className={statusFilter==='linked'?'active':''} onClick={()=>setStatusFilter('linked')}><strong>{counts.linked}</strong><span>Linked</span></button><button className={statusFilter==='auto'?'active':''} onClick={()=>setStatusFilter('auto')}><strong>{counts.auto}</strong><span>Suggested</span></button><button className={statusFilter==='text'?'active':''} onClick={()=>setStatusFilter('text')}><strong>{counts.text}</strong><span>Text only</span></button><button className={statusFilter==='missing'?'active':''} onClick={()=>setStatusFilter('missing')}><strong>{counts.missing}</strong><span>Missing</span></button><button className={statusFilter==='ignored'?'active':''} onClick={()=>setStatusFilter('ignored')}><strong>{counts.ignored}</strong><span>Not needed</span></button>
   </div>
   <div className="card locationResolverFilters"><input className="field" aria-label="Search itinerary locations" placeholder="Search itinerary stops…" value={search} onChange={event=>setSearch(event.target.value)}/><select className="field" aria-label="Filter locations by day" value={dayFilter} onChange={event=>setDayFilter(event.target.value)}><option>All</option>{days.map(day=><option value={day.date} key={day.date}>{day.label} · {day.city}</option>)}</select><select className="field" aria-label="Filter by location status" value={statusFilter} onChange={event=>setStatusFilter(event.target.value as typeof statusFilter)}><option value="needs">Needs attention</option><option value="all">All stops</option><option value="linked">Linked</option><option value="auto">Suggested matches</option><option value="text">Text only</option><option value="missing">Missing</option><option value="ignored">Not needed</option></select></div>
   <div className="locationResolverList">{filtered.map(entry=>{const suggestions=suggestedLocationMatches(entry.item,places,itineraryItemRegion(entry.day,entry.item));const resolvedPlace=entry.resolution.place;const resolvedArea=placeArea(resolvedPlace);return <article id={`location-${entry.item.id}`} className={`card locationResolverCard resolution-${entry.resolution.status}`} key={entry.item.id}><div className="locationResolverMain"><div className="between"><div><div className="eyebrow">{entry.day.label} · {entry.day.city}</div><h3>{entry.item.title}</h3></div><span className={`locationStatus status-${entry.resolution.status}`}>{statusCopy[entry.resolution.status]}</span></div><p className="muted small">{entry.item.destination||'No destination has been entered.'}</p>{resolvedPlace&&<div className="resolvedPlace"><strong>{entry.resolution.status==='linked'?'Linked place':'Suggested saved place'}</strong><span>{resolvedPlace.name}{resolvedArea?` · ${resolvedArea.split(' — ').at(-1)}`:''}</span></div>}{suggestions.length>0&&!['linked','ignored'].includes(entry.resolution.status)&&<div className="locationSuggestions"><span>Quick matches</span><div>{suggestions.map(place=><button className="btn" onClick={()=>onLink(entry.dayIndex,entry.itemIndex,place.id)} key={place.id}>{place.name}</button>)}</div></div>}</div><div className="locationResolverActions"><div className="placeActions">{entry.resolution.status==='auto'&&resolvedPlace&&<button className="btn primary" onClick={()=>onLink(entry.dayIndex,entry.itemIndex,resolvedPlace.id)}>Confirm match</button>}{(entry.resolution.status==='text'||entry.resolution.status==='missing')&&<button className="btn" onClick={()=>onCreate(entry.dayIndex,entry.itemIndex)}>Create saved place</button>}{entry.resolution.status==='linked'&&<button className="btn" onClick={()=>onClear(entry.dayIndex,entry.itemIndex)}>Clear link</button>}{entry.resolution.status==='ignored'?<button className="btn" onClick={()=>onSetNotNeeded(entry.dayIndex,entry.itemIndex,false)}>Location is needed</button>:<button className="btn" onClick={()=>onSetNotNeeded(entry.dayIndex,entry.itemIndex,true)}>Not needed</button>}<button className="textButton" onClick={()=>onOpenItem(entry.item.id)}>Edit stop</button></div></div></article>;})}</div>
  </details>
 </section>;
}

function LocationWizardCard({entry,places,googleSecret,onGoogleSecret,onLink,onGoogleLink,onCreate,onNotNeeded,onSkip,onEdit}:{entry:LocationEntry;places:Place[];googleSecret:string;onGoogleSecret:(value:string)=>void;onLink:(dayIndex:number,itemIndex:number,placeId:string)=>void;onGoogleLink:(dayIndex:number,itemIndex:number,candidate:GooglePlaceCandidate)=>void;onCreate:(dayIndex:number,itemIndex:number)=>void;onNotNeeded:()=>void;onSkip:()=>void;onEdit:()=>void}){
 const region=itineraryItemRegion(entry.day,entry.item);
 const [savedQuery,setSavedQuery]=useState(entry.item.destination??entry.item.title);
 const [googleQuery,setGoogleQuery]=useState(entry.item.destination??entry.item.title);
 const [googleResults,setGoogleResults]=useState<GooglePlaceCandidate[]>([]);
 const [googleMessage,setGoogleMessage]=useState('');
 const [searching,setSearching]=useState(false);
 const query=savedQuery.trim().toLowerCase();
 const suggested=suggestedLocationMatches(entry.item,places,region,5);
 const savedResults=(query?places.filter(place=>place.region===region&&`${place.name} ${place.formattedAddress??''} ${place.area??''}`.toLowerCase().includes(query)):suggested).sort((a,b)=>Number(suggested.includes(b))-Number(suggested.includes(a))||a.name.localeCompare(b.name)).slice(0,6);
 async function searchGoogle(event:React.FormEvent){
  event.preventDefault();setSearching(true);setGoogleMessage('');setGoogleResults([]);
  try{const response=await fetch('/api/places/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:googleQuery,region,secret:googleSecret})});const result=await response.json();if(!response.ok)throw new Error(result.error??'Google search failed.');setGoogleResults(result.results??[]);setGoogleMessage(result.cached?'Showing cached results.':result.results?.length?'Google results are shown below.':'No Google matches found.');}catch(error){setGoogleMessage(error instanceof Error?error.message:'Google search failed.');}finally{setSearching(false);}
 }
 return <article className="card locationWizardCard">
  <div className="locationWizardProgress"><span>Next unresolved stop</span><strong>{entry.day.label} · {entry.day.city}</strong></div>
  <div className="locationWizardTitle"><div><h2>{entry.item.title}</h2><p>{entry.item.destination||'No destination entered yet.'}</p></div><span className={`locationStatus status-${entry.resolution.status}`}>{entry.resolution.status==='auto'?'Suggested match':entry.resolution.status==='text'?'Text location':'Needs location'}</span></div>
  {entry.resolution.place&&<div className="wizardSuggested"><div><strong>Best saved match</strong><p>{entry.resolution.place.name}{entry.resolution.place.formattedAddress?` · ${entry.resolution.place.formattedAddress}`:''}</p></div><button className="btn primary" onClick={()=>onLink(entry.dayIndex,entry.itemIndex,entry.resolution.place!.id)}>Confirm</button></div>}
  <div className="locationWizardColumns">
   <section><h3>Search saved places</h3><input className="field" aria-label="Search saved places for this stop" value={savedQuery} placeholder="Type a place name…" onChange={event=>setSavedQuery(event.target.value)}/><div className="wizardResults">{savedResults.map(place=><button onClick={()=>onLink(entry.dayIndex,entry.itemIndex,place.id)} key={place.id}><strong>{place.name}</strong><span>{place.area??place.formattedAddress??place.region}</span></button>)}{!savedResults.length&&<p className="muted small">No saved places match. Try Google or create a place from the itinerary text.</p>}</div>
   </section>
   <section><h3>Search Google Places</h3><form className="googleLocationSearch" onSubmit={searchGoogle}><input className="field" value={googleQuery} aria-label="Google Places search" onChange={event=>setGoogleQuery(event.target.value)} placeholder="Place or address"/><input className="field" type="password" value={googleSecret} aria-label="Google Places password" onChange={event=>onGoogleSecret(event.target.value)} placeholder="Places refresh password"/><button className="btn" disabled={searching||googleQuery.trim().length<3||!googleSecret}>{searching?'Searching…':'Search Google'}</button></form>{googleMessage&&<p className="wizardMessage" role="status">{googleMessage}</p>}<div className="wizardResults">{googleResults.map(candidate=>{const duplicate=places.find(place=>place.googlePlaceId===candidate.googlePlaceId||(candidate.formattedAddress&&place.formattedAddress===candidate.formattedAddress));return <button onClick={()=>onGoogleLink(entry.dayIndex,entry.itemIndex,candidate)} key={candidate.googlePlaceId}><strong>{candidate.name}{duplicate?' · Saved':''}</strong><span>{candidate.formattedAddress}</span></button>;})}</div>
   </section>
  </div>
  <div className="locationWizardFooter"><div className="placeActions"><button className="btn" onClick={()=>onCreate(entry.dayIndex,entry.itemIndex)}>Create from this stop</button><button className="btn" onClick={onNotNeeded}>Location not needed</button><button className="textButton" onClick={onEdit}>Edit itinerary stop</button></div><button className="textButton" onClick={onSkip}>Skip for now →</button></div>
 </article>;
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
    const calendarDetails=calendarEntryDetails({day,item});
    const calendarUrl=googleCalendarUrl({day,item});
    return <article className="card reservationCard" key={item.id}>
     <div className="between reservationTop"><div><div className="eyebrow">{day.label} · {day.city}</div><h3>{item.title}</h3></div><span className="timeBadge">{item.time}</span></div>
     <div className="reservationMeta"><span className="chip neutral">{inferItemType(item)}</span>{item.estimatedDuration&&<span className="chip neutral">{item.estimatedDuration} min</span>}</div>
     {item.details&&<p className="muted small">{item.details}</p>}
     {item.destination&&<div className="reservationSection"><strong>Destination</strong><p>{item.destination}</p></div>}
     {keyInfo&&<div className="reservationSection keyInfo"><strong>Key Info</strong><p>{keyInfo}</p></div>}
     {item.userNotes&&<div className="reservationSection"><strong>Notes</strong><p>{item.userNotes}</p></div>}
     {item.routeText&&<p className="muted small reservationRoute">🚌 {item.routeText}</p>}
     <div className={`reservationCalendar ${calendarDetails.valid?'ready':'issue'}`}><strong>{calendarDetails.valid?'Calendar timing':'Calendar needs attention'}</strong><p>{calendarDetails.dateLabel} · {calendarDetails.timeLabel}{calendarDetails.valid?` · ${calendarDetails.duration} min · ${calendarDetails.timeZoneLabel}`:` · ${calendarDetails.issue}`}</p></div>
     <ReservationAttachments item={item}/>
     <div className="placeActions reservationActions">{item.mapUrl&&<a className="btn primary" href={item.mapUrl} target="_blank" rel="noreferrer">Open directions</a>}{calendarDetails.valid&&<><a className="btn" href={calendarUrl} target="_blank" rel="noreferrer">Google Calendar</a><button className="btn" onClick={()=>downloadText(`${safeFilename(item.title)}.ics`,entryCalendar({day,item}),'text/calendar;charset=utf-8')}>Apple / Outlook</button></>}<button className="btn" onClick={()=>onShowItem(item.id)}>View in itinerary</button></div>
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

function ItineraryEditor({item,dayIndex,itemIndex,days,places,hoursCheck,compact=false,onEdit,onSave,onMove,onReorder,onDelete,onShowPlace}:{item:ItineraryItem;dayIndex:number;itemIndex:number;days:TripState['days'];places:Place[];hoursCheck?:ItineraryHoursCheck;compact?:boolean;onEdit:(di:number,ii:number,key:EditableKey,value:EditableValue)=>void;onSave:()=>void;onMove:(di:number,ii:number,target:number)=>void;onReorder:(di:number,ii:number,direction:-1|1)=>void;onDelete:(di:number,ii:number)=>void;onShowPlace:(place:Place)=>void}){
 const [open,setOpen]=useState(false);
 const [saved,setSaved]=useState(false);
 const inferredDuration=estimatedItemDuration(item);
 const fixed=isFixedItem(item);
 const itemType=inferItemType(item);
 const linkedArea=placeArea(locationResolution(item,places).place);
 function save(){
  onSave();
  setSaved(true);
  window.setTimeout(()=>setSaved(false),1800);
 }
 return <div className="timelineCopy">
  <div className="between itinerarySummary">
   <div>
    <div className="titleRow"><h3>{item.title}</h3><span className={`chip ${fixed?'':'neutral'}`}>{fixed?'Fixed':'Flexible'}</span><span className="chip neutral">{itemType}</span>{linkedArea&&<span className="chip boardArea">{linkedArea.split(' — ').at(-1)}</span>}{item.optional&&<span className="chip neutral">Optional</span>}{item.skipped&&<span className="chip skippedChip">Skipped for now</span>}{hoursCheck&&<span className={`itineraryHoursBadge check-${hoursCheck.status}`}>{hoursCheck.label}</span>}</div>
    <div className="muted small">{item.time}{item.destination?` · ${item.destination}`:''}{` · ${inferredDuration} min`}</div>
    {!compact&&item.details&&<p className="muted small">{item.details}</p>}
    {!compact&&hoursCheck&&hoursCheck.status!=='open'&&<div className={`itineraryHoursNotice check-${hoursCheck.status}`}><div><strong>{hoursCheck.place.name}</strong><p>{hoursCheck.message}</p></div><button className="textButton" onClick={()=>onShowPlace(hoursCheck.place)}>Review place</button></div>}
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
    <label className="small">Travel mode<select className="field" value={item.travelMode??'transit'} onChange={event=>{onEdit(dayIndex,itemIndex,'travelMode',event.target.value);save();}}><option value="walking">Walking</option><option value="transit">Public transit</option><option value="driving">Driving</option></select></label>
    <label className="small">Preparation buffer<input className="field" type="number" min="0" step="5" value={item.prepBuffer??''} placeholder="15" onChange={event=>onEdit(dayIndex,itemIndex,'prepBuffer',event.target.value===''?undefined:Number(event.target.value))} onBlur={save}/></label>
   </div>
   <p className="muted small planningHint">Travel time and preparation buffer determine the Assistant’s suggested leave time for fixed plans.</p>
   <label className="small">Description<textarea className="field" rows={2} value={item.details??''} onChange={event=>onEdit(dayIndex,itemIndex,'details',event.target.value)} onBlur={save}/></label>
   <label className="small">Destination<input className="field" value={item.destination??''} placeholder="St. Lawrence Market" onChange={event=>onEdit(dayIndex,itemIndex,'destination',event.target.value)} onBlur={save}/></label>
   <label className="small">Saved place for hours<select className="field" disabled={item.locationNotNeeded} value={item.placeId??''} onChange={event=>{onEdit(dayIndex,itemIndex,'placeId',event.target.value);window.setTimeout(save,0);}}><option value="">{hoursCheck&&!item.placeId?`Auto-matched: ${hoursCheck.place.name}`:'No saved place linked'}</option>{['Toronto','Niagara & Buffalo','Other'].map(placeRegion=><optgroup label={placeRegion} key={placeRegion}>{places.filter(place=>place.region===placeRegion).sort((a,b)=>a.name.localeCompare(b.name)).map(place=><option value={place.id} key={place.id}>{place.name}</option>)}</optgroup>)}</select><span className="muted small">Linking a place makes schedule checks precise; clear it to use name matching.</span></label>
   <label className="small">Transit instructions<textarea className="field" rows={2} value={item.routeText??''} onChange={event=>onEdit(dayIndex,itemIndex,'routeText',event.target.value)} onBlur={save}/></label>
   <div className="filterGrid">
    <label className="small">Key Info<textarea className="field" rows={3} value={item.keyInfo??item.confirmationNumber??''} onChange={event=>onEdit(dayIndex,itemIndex,'keyInfo',event.target.value)} onBlur={save}/></label>
    <label className="small">Notes<textarea className="field" rows={3} value={item.userNotes??''} onChange={event=>onEdit(dayIndex,itemIndex,'userNotes',event.target.value)} onBlur={save}/></label>
   </div>
   <div className="editorToggles"><label className="toggleLine"><input type="checkbox" checked={Boolean(item.optional)} onChange={event=>{onEdit(dayIndex,itemIndex,'optional',event.target.checked);save();}}/> Optional stop</label><label className="toggleLine"><input type="checkbox" checked={Boolean(item.skipped)} onChange={event=>{onEdit(dayIndex,itemIndex,'skipped',event.target.checked);save();}}/> Skipped for now</label><label className="toggleLine"><input type="checkbox" checked={Boolean(item.locationNotNeeded)} onChange={event=>{onEdit(dayIndex,itemIndex,'locationNotNeeded',event.target.checked);save();}}/> Route location not needed</label></div>
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

function ItineraryDetails({item,places,dayIndex,itemIndex,hoursCheck,onEdit,onSave,onShowPlace}:{item:ItineraryItem;places:Place[];dayIndex:number;itemIndex:number;hoursCheck?:ItineraryHoursCheck;onEdit:(di:number,ii:number,key:EditableKey,value:EditableValue)=>void;onSave:()=>void;onShowPlace:(place:Place)=>void}){
 const keyInfo=item.keyInfo??item.confirmationNumber??'';
 const linkedArea=placeArea(locationResolution(item,places).place);
 return <div className="timelineCopy"><div className="titleRow"><h3>{item.title}</h3>{linkedArea&&<span className="chip boardArea">{linkedArea.split(' — ').at(-1)}</span>}{item.optional&&<span className="chip neutral">Optional</span>}{item.skipped&&<span className="chip skippedChip">Skipped for now</span>}{hoursCheck&&<span className={`itineraryHoursBadge check-${hoursCheck.status}`}>{hoursCheck.label}</span>}</div>{item.details&&<p className="muted small">{item.details}</p>}{hoursCheck&&hoursCheck.status!=='open'&&<div className={`itineraryHoursNotice compact check-${hoursCheck.status}`}><div><strong>{hoursCheck.place.name}</strong><p>{hoursCheck.message}</p></div><button className="textButton" onClick={()=>onShowPlace(hoursCheck.place)}>Review</button></div>}<details style={{marginTop:'10px'}}><summary className="textLink" style={{cursor:'pointer'}}>Trip details</summary><div style={{paddingTop:'10px'}}>{item.routeText&&<p className="muted small">🚌 {item.routeText}</p>}{item.mapUrl&&<a className="textLink" href={item.mapUrl} target="_blank" rel="noreferrer">Transit from current location ↗</a>}<div className="filterGrid" style={{marginTop:'12px'}}><label className="small">Key Info<textarea className="field" rows={3} value={keyInfo} placeholder="Confirmation, seat, terminal, ticket details…" onChange={e=>onEdit(dayIndex,itemIndex,'keyInfo',e.target.value)} onBlur={onSave}/></label><label className="small">Notes<textarea className="field" rows={3} value={item.userNotes??''} placeholder="Add reminders or details" onChange={e=>onEdit(dayIndex,itemIndex,'userNotes',e.target.value)} onBlur={onSave}/></label></div></div></details></div>;
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

type JournalEvent={id:string;at:string;kind:'completed'|'visited'|'food'|'skipped'|'rescheduled'|'moment';title:string;detail?:string;moment?:JournalMoment};

function tripDateForTimestamp(timestamp:string){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(timestamp));
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return `${values.year}-${values.month}-${values.day}`;
}

function journalMomentTimestamp(moment:JournalMoment){
 return new Date(`${moment.date}T${moment.time}:00-04:00`).toISOString();
}

function journalEvents(state:TripState,date:string):JournalEvent[]{
 const events:JournalEvent[]=[];
 for(const day of state.days){
  for(const item of day.items){
   if(item.completedAt&&tripDateForTimestamp(item.completedAt)===date)events.push({id:`complete-${item.id}`,at:item.completedAt,kind:'completed',title:item.title,detail:`Completed from ${day.label} plans`});
   if(item.skippedAt&&tripDateForTimestamp(item.skippedAt)===date)events.push({id:`skip-${item.id}`,at:item.skippedAt,kind:'skipped',title:item.title,detail:'Left flexible for another time'});
   if(item.lastRescheduledAt&&tripDateForTimestamp(item.lastRescheduledAt)===date)events.push({id:`move-${item.id}`,at:item.lastRescheduledAt,kind:'rescheduled',title:item.title,detail:`Moved from ${item.rescheduledFromDate??'another day'} to ${day.label}`});
  }
 }
 for(const place of state.places){
  if(place.visitedAt&&tripDateForTimestamp(place.visitedAt)===date)events.push({id:`visit-${place.id}`,at:place.visitedAt,kind:'visited',title:place.name,detail:`Visited · ${place.area??place.region}`});
 }
 for(const food of state.foods){
  if(!food.triedAt||tripDateForTimestamp(food.triedAt)!==date)continue;
  if((state.journalMoments??[]).some(moment=>moment.date===date&&moment.foodId===food.id))continue;
  const place=food.triedAtPlaceId?state.places.find(item=>item.id===food.triedAtPlaceId):undefined;
  events.push({id:`food-${food.id}`,at:food.triedAt,kind:'food',title:food.title,detail:place?`Tried at ${place.name}`:'Local specialty tried'});
 }
 for(const moment of state.journalMoments??[]){
  if(moment.date!==date)continue;
  const place=moment.placeId?state.places.find(item=>item.id===moment.placeId):undefined;
  const food=moment.foodId?state.foods.find(item=>item.id===moment.foodId):undefined;
  const links=[place?.name,food?.title].filter(Boolean).join(' · ');
  events.push({id:`moment-${moment.id}`,at:journalMomentTimestamp(moment),kind:'moment',title:moment.title,detail:[links,moment.note].filter(Boolean).join(' — '),moment});
 }
 return events.sort((a,b)=>a.at.localeCompare(b.at));
}

function tripTimeNow(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Toronto',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return `${values.hour}:${values.minute}`;
}

function QuickCapture({date,places,foods,initial,onSave,onDelete,onCancel}:{date:string;places:Place[];foods:CheckItem[];initial?:JournalMoment;onSave:(moment:JournalMoment)=>void;onDelete:(id:string)=>void;onCancel?:()=>void}){
 const [type,setType]=useState<JournalMomentType>(initial?.type??'memory');
 const [time,setTime]=useState(initial?.time??tripTimeNow());
 const [title,setTitle]=useState(initial?.title??'');
 const [note,setNote]=useState(initial?.note??'');
 const [placeId,setPlaceId]=useState(initial?.placeId??'');
 const [foodId,setFoodId]=useState(initial?.foodId??'');
 const [lastSaved,setLastSaved]=useState<JournalMoment|null>(null);
 useEffect(()=>{
  setType(initial?.type??'memory');setTime(initial?.time??tripTimeNow());setTitle(initial?.title??'');setNote(initial?.note??'');setPlaceId(initial?.placeId??'');setFoodId(initial?.foodId??'');
 },[date,initial]);
 function reset(){setType('memory');setTime(tripTimeNow());setTitle('');setNote('');setPlaceId('');setFoodId('');}
 function save(){
  if(!title.trim())return;
  const moment:JournalMoment={id:initial?.id??`moment-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,date,time:time||tripTimeNow(),type,title:title.trim(),note:note.trim()||undefined,placeId:placeId||undefined,foodId:foodId||undefined,createdAt:initial?.createdAt??new Date().toISOString(),updatedAt:initial?new Date().toISOString():undefined};
  onSave(moment);setLastSaved(initial?null:moment);reset();onCancel?.();
 }
 const sortedPlaces=useMemo(()=>[...places].sort((a,b)=>a.name.localeCompare(b.name)),[places]);
 return <details className="card quickCapture" open={initial?true:undefined}>
  <summary><span><strong>{initial?'Edit captured moment':'＋ Quick capture'}</strong><small>{initial?'Update what you want to remember':'Add an unplanned place, food, activity, or memory'}</small></span></summary>
  <div className="quickCaptureBody">
   <div className="momentTypeChoices">{([['place','⌖ Place'],['food','🍴 Food'],['activity','✓ Activity'],['memory','✦ Memory']] as [JournalMomentType,string][]).map(([value,label])=><button className={type===value?'active':''} key={value} onClick={()=>setType(value)}>{label}</button>)}</div>
   <div className="quickCapturePrimary"><label>Time<input className="field" type="time" value={time} onChange={event=>setTime(event.target.value)}/></label><label>Title<input className="field" value={title} onChange={event=>setTitle(event.target.value)} placeholder="What happened?"/></label></div>
   <label>Note<textarea className="field" rows={2} value={note} onChange={event=>setNote(event.target.value)} placeholder="Optional detail, order, reaction, or memory…"/></label>
   <div className="quickCaptureLinks"><label>Saved place<select className="field" value={placeId} onChange={event=>{setPlaceId(event.target.value);const place=places.find(item=>item.id===event.target.value);if(place&&!title)setTitle(place.name);}}><option value="">No place linked</option>{sortedPlaces.map(place=><option value={place.id} key={place.id}>{place.name}</option>)}</select></label><label>Specialty food<select className="field" value={foodId} onChange={event=>{setFoodId(event.target.value);const food=foods.find(item=>item.id===event.target.value);if(food&&!title)setTitle(food.title);}}><option value="">No food linked</option>{foods.map(food=><option value={food.id} key={food.id}>{food.title}</option>)}</select></label></div>
   <div className="quickCaptureActions"><div>{initial&&<button className="textButton dangerText" onClick={()=>{if(window.confirm(`Delete “${initial.title}”?`)){onDelete(initial.id);onCancel?.();}}}>Delete</button>}{onCancel&&<button className="textButton" onClick={onCancel}>Cancel</button>}</div><button className="btn primary" disabled={!title.trim()} onClick={save}>{initial?'Save changes':'Add to journal'}</button></div>
   {lastSaved&&<div className="captureUndo" role="status"><span>✓ Added “{lastSaved.title}” to the journal.</span><button className="textButton" onClick={()=>{onDelete(lastSaved.id);setLastSaved(null);}}>Undo</button></div>}
  </div>
 </details>;
}

function TripJournal({state,canEdit,onNoteChange,onMomentSave,onMomentDelete}:{state:TripState;canEdit:boolean;onNoteChange:(date:string,note:string,saveNow?:boolean)=>void;onMomentSave:(moment:JournalMoment)=>void;onMomentDelete:(id:string)=>void}){
 const [editingMomentId,setEditingMomentId]=useState<string|null>(null);
 const [view,setView]=useState<'journal'|'recap'>(canEdit?'journal':'recap');
 useEffect(()=>{if(!canEdit)setView('recap');},[canEdit]);
 const momentCount=state.days.reduce((total,day)=>total+journalEvents(state,day.date).length,0);
 return <section className={view==='recap'?'recapScreen':''}><div className="pageIntro journalIntro"><div><div className="eyebrow">TRIP JOURNAL</div><h2>{view==='journal'?'The story of your trip':'Toronto · Niagara · Buffalo'}</h2><p className="muted">{view==='journal'?'Completed plans, discoveries, and local foods appear here automatically. Add anything else you want to remember.':'A keepsake built from the moments, places, and flavors you captured along the way.'}</p></div><div className="journalIntroActions">{canEdit&&<div className="viewSwitch" aria-label="Journal view"><button className={view==='journal'?'active':''} onClick={()=>setView('journal')}>Journal</button><button className={view==='recap'?'active':''} onClick={()=>setView('recap')}>Recap</button></div>}{view==='recap'?<button className="btn recapPrintButton" onClick={()=>window.print()}>Print / Save PDF</button>:<span className="chip">{momentCount} moments</span>}</div></div>{view==='recap'?<TripRecap state={state} publicView={!canEdit}/>:<div className="journalDays">{state.days.map(day=>{const events=journalEvents(state,day.date);const completed=events.filter(event=>event.kind==='completed').length;const visits=events.filter(event=>event.kind==='visited').length;const foods=events.filter(event=>event.kind==='food'||event.moment?.type==='food').length;const editingMoment=(state.journalMoments??[]).find(moment=>moment.id===editingMomentId&&moment.date===day.date);return <article className="card journalDay" key={day.date}>
  <div className="journalDayHeader"><div><div className="eyebrow">{day.date}</div><h2>{day.label} · {day.city}</h2></div><div className="journalStats"><span>{completed} completed</span><span>{visits} visited</span><span>{foods} tasted</span></div></div>
  {events.length>0?<div className="journalTimeline">{events.map(event=><div className={`journalEvent journal-${event.kind}`} key={event.id}><span className="journalEventIcon" aria-hidden="true">{event.moment?.type==='place'||event.kind==='visited'?'⌖':event.moment?.type==='food'||event.kind==='food'?'🍴':event.moment?.type==='memory'?'✦':event.kind==='completed'||event.moment?.type==='activity'?'✓':event.kind==='skipped'?'↷':'↔'}</span><div><div className="journalEventTop"><strong>{event.title}</strong><div><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',timeZone:'America/Toronto'})}</time>{event.moment&&<button className="textButton" onClick={()=>setEditingMomentId(event.moment!.id)}>Edit</button>}</div></div>{event.detail&&<p>{event.detail}</p>}</div></div>)}</div>:<p className="journalEmpty">No moments recorded yet. This day will fill in naturally as you use Trip Hub.</p>}
  <QuickCapture date={day.date} places={state.places} foods={state.foods} initial={editingMoment} onSave={onMomentSave} onDelete={onMomentDelete} onCancel={()=>setEditingMomentId(null)}/>
  <label className="journalNotes"><strong>Notes and discoveries</strong><textarea className="field" rows={3} value={state.journalNotesByDate?.[day.date]??''} onChange={event=>onNoteChange(day.date,event.target.value)} onBlur={event=>onNoteChange(day.date,event.currentTarget.value,true)} placeholder="A favorite moment, an unplanned stop, what you ordered, or anything worth remembering…"/></label>
 </article>;})}</div>}</section>;
}

function recapEventIcon(event:JournalEvent){
 if(event.moment?.type==='place'||event.kind==='visited')return '⌖';
 if(event.moment?.type==='food'||event.kind==='food')return '🍴';
 if(event.moment?.type==='memory')return '✦';
 if(event.kind==='completed'||event.moment?.type==='activity')return '✓';
 if(event.kind==='skipped')return '↷';
 return '↔';
}

function TripRecap({state,publicView=false}:{state:TripState;publicView?:boolean}){
 const dayStories=state.days.map(day=>({day,events:journalEvents(state,day.date),note:state.journalNotesByDate?.[day.date]?.trim()??''}));
 const allEvents=dayStories.flatMap(story=>story.events);
 const visitedCount=new Set(allEvents.filter(event=>event.kind==='visited'||event.moment?.type==='place').map(event=>event.moment?.placeId??event.title)).size;
 const foodsCount=new Set(allEvents.filter(event=>event.kind==='food'||event.moment?.type==='food').map(event=>event.moment?.foodId??event.title)).size;
 const activityCount=allEvents.filter(event=>event.kind==='completed'||event.moment?.type==='activity').length;
 const highlights=allEvents.filter(event=>event.moment?.type==='memory').slice(0,4);
 const storiesWithContent=dayStories.filter(story=>story.events.length>0||story.note);
 return <div className="tripRecap">
  <header className="recapCover card"><div><div className="eyebrow">TRIP RECAP · 2026</div><h1>One week around Lake Ontario</h1><p>Toronto · Niagara Falls · Buffalo</p><span>September 24–October 1</span></div><div className="recapMonogram" aria-hidden="true">TO</div></header>
  <section className="recapStats" aria-label="Trip highlights"><div><strong>{visitedCount}</strong><span>places discovered</span></div><div><strong>{foodsCount}</strong><span>local foods tried</span></div><div><strong>{activityCount}</strong><span>activities completed</span></div><div><strong>{allEvents.length}</strong><span>moments captured</span></div></section>
  {highlights.length>0&&<section className="recapHighlights card"><div className="eyebrow">FAVORITE MOMENTS</div><div className="recapHighlightGrid">{highlights.map(event=><blockquote key={event.id}><span>✦</span><div><strong>{event.title}</strong>{!publicView&&event.detail&&<p>{event.detail}</p>}</div></blockquote>)}</div></section>}
  <section className="recapStory"><div className="recapSectionHeading"><div className="eyebrow">DAY BY DAY</div><h2>The trip story</h2></div>{storiesWithContent.length>0?storiesWithContent.map(({day,events,note})=><article className="recapDay card" key={day.date}>
   <header><div><span>{new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</span><h2>{day.city}</h2></div><strong>{events.length} moment{events.length===1?'':'s'}</strong></header>
   {events.length>0&&<div className="recapMoments">{events.filter(event=>event.kind!=='skipped'&&event.kind!=='rescheduled').map(event=><div className={`recapMoment recap-${event.kind}`} key={event.id}><span className="recapMomentIcon" aria-hidden="true">{recapEventIcon(event)}</span><div><strong>{event.title}</strong>{event.detail&&(!publicView||!event.moment)&&<p>{event.detail}</p>}</div><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',timeZone:'America/Toronto'})}</time></div>)}</div>}
   {!publicView&&note&&<div className="recapDayNote"><span>From the journal</span><p>{note}</p></div>}
  </article>):<div className="card recapEmpty"><h3>Your recap is ready to grow</h3><p>Complete plans, mark places visited, try local foods, or add Quick Capture memories. They will appear here automatically.</p></div>}</section>
  <footer className="recapFooter"><strong>Trip Hub</strong><span>Made from your travel journal</span></footer>
 </div>;
}

function FoodConnectionsPanel({foods,places,onConnection,onOpenPlace}:{foods:CheckItem[];places:Place[];onConnection:(placeId:string,foodId:string,linked:boolean)=>void;onOpenPlace:(place:Place)=>void}){
 const [unlinkedOnly,setUnlinkedOnly]=useState(false);
 const [selectedPlaces,setSelectedPlaces]=useState<Record<string,string>>({});
 const foodPlaces=useMemo(()=>places.filter(isFoodPlace).sort((a,b)=>a.name.localeCompare(b.name)),[places]);
 const rows=foods.map(food=>({food,connected:places.filter(place=>placeSpecialtyFoodIds(place,foods).includes(food.id))})).filter(row=>!unlinkedOnly||row.connected.length===0);
 const connectedCount=foods.filter(food=>places.some(place=>placeSpecialtyFoodIds(place,foods).includes(food.id))).length;
 return <details className="card foodConnectionsPanel">
  <summary><span><strong>Specialty connections</strong><small>Link foods to the restaurants that serve them</small></span><span className="chip">{connectedCount}/{foods.length} linked</span></summary>
  <div className="foodConnectionsBody">
   <div className="foodConnectionsToolbar"><p className="muted small">These connections power nearby specialty suggestions in the Assistant.</p><label className="toggleLine"><input type="checkbox" checked={unlinkedOnly} onChange={event=>setUnlinkedOnly(event.target.checked)}/> Show unlinked foods only</label></div>
   <div className="foodConnectionsList">{rows.map(({food,connected})=>{const available=foodPlaces.filter(place=>!connected.some(item=>item.id===place.id));const selected=selectedPlaces[food.id]??'';return <article className="foodConnectionRow" key={food.id}>
    <div className="foodConnectionHeading"><div><strong>{food.title}</strong><small>{connected.length?`${connected.length} place${connected.length===1?'':'s'} linked`:'No restaurant linked yet'}</small></div>{food.done&&<span className="chip">Tried</span>}</div>
    {connected.length>0&&<div className="connectedPlaces">{connected.map(place=><div key={place.id}><button className="connectedPlaceName" onClick={()=>onOpenPlace(place)}>{place.name}</button><button className="textButton dangerText" onClick={()=>onConnection(place.id,food.id,false)}>Remove</button></div>)}</div>}
    <div className="connectionForm"><select className="field" aria-label={`Restaurant to link with ${food.title}`} value={selected} onChange={event=>setSelectedPlaces(current=>({...current,[food.id]:event.target.value}))}><option value="">Choose a food place…</option>{available.map(place=><option value={place.id} key={place.id}>{place.name}</option>)}</select><button className="btn" disabled={!selected} onClick={()=>{if(!selected)return;onConnection(selected,food.id,true);setSelectedPlaces(current=>({...current,[food.id]:''}));}}>Link place</button></div>
   </article>;})}</div>
   {rows.length===0&&<p className="empty">Every food currently has at least one restaurant connection.</p>}
  </div>
 </details>;
}

function MealBalanceCard({date,value,triedFoods=[],onChange,compact=false}:{date:string;value?:{treatSampled:boolean;note?:string};triedFoods?:CheckItem[];onChange:(date:string,changes:{treatSampled?:boolean;note?:string},saveNow?:boolean)=>void;compact?:boolean}){
 const sampled=value?.treatSampled??false;
 const automatic=triedFoods.length>0;
 const favorSimpler=sampled||automatic;
 return <section className={`card mealBalanceCard ${compact?'compact':''}`} aria-label="Meal preference for this day">
  <div className="mealBalanceCopy"><div className="eyebrow">MEAL PREFERENCE</div><h3>{favorSimpler?'Favor simpler next-meal ideas':'Keep every food option in the mix'}</h3><p className="muted small">A gentle recommendation hint for this day only—not a food scorecard.</p></div>
  {automatic&&<div className="automaticMealSignal"><strong>Noted automatically</strong><span>You tried {triedFoods.map(food=>food.title).join(' + ')} today.</span></div>}
  <div className="mealBalanceControls"><label className="mealBalanceToggle"><input type="checkbox" checked={sampled} onChange={event=>onChange(date,{treatSampled:event.target.checked},true)}/> {automatic?'Also keep the manual override on':'We sampled today’s treat'}</label><input className="field" value={value?.note??''} onChange={event=>onChange(date,{note:event.target.value})} onBlur={()=>onChange(date,{},true)} placeholder="Optional note, such as poutine at lunch" aria-label="Optional note about today's treat"/></div>
  {favorSimpler&&<p className="mealBalanceActive">The Assistant will gently favor easier or workable food options next. Nothing is hidden.</p>}
 </section>;
}

type AssistantSuggestionMode='all'|'food'|'indoor';

function matchesAssistantMode(place:Place,mode:AssistantSuggestionMode){
 if(mode==='all')return true;
 const text=`${place.name} ${place.category} ${place.tags.join(' ')}`.toLowerCase();
 if(mode==='food')return isFoodPlace(place);
 return /museum|gallery|aquarium|library|market|shop|mall|theatre|theater|escape|restaurant|food|bakery|cafe|coffee|store|hall of fame/.test(text);
}

function AssistantView({assistant,tripState,now,liveLocation,preview,onPreviewChange,onMealBalanceChange,locationStatus,locationMessage,onRequestLocation,onStopLocation,onComplete,onSkip,onAddToToday,onVisited,onShowPlaces,onExploreNearby,onMarkFoodTried}:{assistant:AssistantState;tripState:TripState;now:Date;liveLocation:AssistantLocation|null;preview:AssistantPreview|null;onPreviewChange:(preview:AssistantPreview|null)=>void;onMealBalanceChange:(date:string,changes:{treatSampled?:boolean;note?:string},saveNow?:boolean)=>void;locationStatus:'idle'|'requesting'|'active'|'error';locationMessage:string;onRequestLocation:()=>void;onStopLocation:()=>void;onComplete:(item:ItineraryItem)=>void;onSkip:(item:ItineraryItem)=>void;onAddToToday:(place:Place)=>void;onVisited:(id:string)=>void;onShowPlaces:(place:Place)=>void;onExploreNearby:()=>void;onMarkFoodTried:(foodId:string,placeId?:string,done?:boolean)=>void}){
 const [extraMinutes,setExtraMinutes]=useState<number|null>(null);
 const [suggestionMode,setSuggestionMode]=useState<AssistantSuggestionMode>('all');
 const [addedPlaces,setAddedPlaces]=useState<Set<string>>(()=>new Set());
 const [weather,setWeather]=useState<WeatherResponse|null>(null);
 const [weatherLoading,setWeatherLoading]=useState(false);
 const [lastTried,setLastTried]=useState<{food:CheckItem;place:Place}|null>(null);
 const previewMode=Boolean(preview);
 const actionItem=assistant.currentActivity??assistant.nextReservation??assistant.nextItem;
 const fixedItem=assistant.nextReservation;
 const suggestionMinutes=extraMinutes??Math.max(assistant.availableMinutes,60);
 const previewDay=tripState.days.find(day=>day.date===(preview?.date??assistant.currentDay?.date));
 const weatherDate=previewDay?.date??assistant.currentDay?.date;
 useEffect(()=>{
  if(!weatherDate)return;
  const controller=new AbortController();
  setWeatherLoading(true);
  fetch(`/api/weather?date=${encodeURIComponent(weatherDate)}`,{signal:controller.signal})
   .then(response=>response.ok?response.json():Promise.reject(new Error('Forecast unavailable')))
   .then((value:WeatherResponse)=>setWeather(value))
   .catch(error=>{if(error instanceof Error&&error.name!=='AbortError')setWeather(null);})
   .finally(()=>setWeatherLoading(false));
  return()=>controller.abort();
 },[weatherDate]);
 const previewRegion=previewDay?.city.includes('Toronto')?'Toronto':'Niagara & Buffalo';
 const previewAreas=useMemo(()=>areaOptions(tripState.places.filter(place=>place.region===previewRegion)),[previewRegion,tripState.places]);
 const relevantCity=assistant.currentDay?.city.includes('Toronto')?'Toronto':assistant.currentDay?.city.includes('Buffalo')?'Buffalo':'Niagara Falls';
 const relevantForecast=weather?.forecasts.find(forecast=>forecast.city===relevantCity&&forecast.status==='available');
 const weatherSuggestions=useMemo(()=>assistant.currentDay?findSuggestionCandidates(tripState,assistant.currentDay,suggestionMinutes,extraMinutes||suggestionMode!=='all'?60:3,{anchor:assistant.suggestionAnchor,anchorArea:preview?.area||undefined,location:liveLocation??undefined,now,previewWallClock:previewMode,weather:relevantForecast}).filter(suggestion=>matchesAssistantMode(suggestion.place,suggestionMode)).slice(0,extraMinutes||suggestionMode!=='all'?6:3):[],[assistant.currentDay,assistant.suggestionAnchor,extraMinutes,liveLocation,now,preview?.area,previewMode,relevantForecast,suggestionMinutes,suggestionMode,tripState]);
 const displayedSuggestions:SuggestedPlace[]=relevantForecast?weatherSuggestions:extraMinutes||suggestionMode!=='all'?weatherSuggestions:assistant.suggestions;
 const foodTrySuggestions=useMemo(()=>{
  if(!assistant.currentDay||suggestionMinutes<30)return [];
  const candidates=findSuggestionCandidates(tripState,assistant.currentDay,suggestionMinutes,60,{anchor:assistant.suggestionAnchor,anchorArea:preview?.area||undefined,location:liveLocation??undefined,now,previewWallClock:previewMode,weather:relevantForecast});
  const usedFoods=new Set<string>();
  const options:{food:CheckItem;suggestion:SuggestedPlace}[]=[];
  for(const suggestion of candidates){
   for(const food of placeSpecialtyFoods(suggestion.place,tripState.foods).filter(item=>!item.done)){
    if(usedFoods.has(food.id))continue;
    usedFoods.add(food.id);
    options.push({food,suggestion});
    if(options.length===4)return options;
   }
  }
  return options;
 },[assistant.currentDay,assistant.suggestionAnchor,liveLocation,now,preview?.area,previewMode,relevantForecast,suggestionMinutes,tripState]);
 const forecastNotice=weatherNotice(relevantForecast);
 const packingReminders=weatherPackingReminders(relevantForecast);
 function addSuggestion(place:Place){
  onAddToToday(place);
  setAddedPlaces(current=>new Set(current).add(place.id));
 }
 function markTried(food:CheckItem,place:Place){
  onMarkFoodTried(food.id,place.id,true);
  setLastTried({food,place});
 }
 function undoTried(){
  if(!lastTried)return;
  onMarkFoodTried(lastTried.food.id,undefined,false);
  setLastTried(null);
 }
 return <section className="assistantPage">
  <div className={`card assistantPreview ${preview?'active':''}`}>
   <div className="assistantPreviewHeader"><div><div className="eyebrow">ASSISTANT PREVIEW</div><h2>{preview?'Testing a trip moment':'See what the Assistant will suggest'}</h2><p className="muted">Previewing never changes your itinerary, checkmarks, or real-time settings.</p></div>{preview?<button className="btn" onClick={()=>onPreviewChange(null)}>Return to live mode</button>:<button className="btn primary" onClick={()=>onPreviewChange({date:assistant.currentDay?.date??tripState.days[0].date,time:'12:00',area:''})}>Preview a day</button>}</div>
   {preview&&<div className="assistantPreviewFields">
    <label>Trip day<select className="field" value={preview.date} onChange={event=>onPreviewChange({...preview,date:event.target.value,area:''})}>{tripState.days.map(day=><option value={day.date} key={day.date}>{day.label} · {day.city}</option>)}</select></label>
    <label>Time<input className="field" type="time" value={preview.time} onChange={event=>onPreviewChange({...preview,time:event.target.value})}/></label>
    <label>Starting neighborhood<select className="field" value={preview.area} onChange={event=>onPreviewChange({...preview,area:event.target.value})}><option value="">Use itinerary context</option>{previewAreas.map(areaName=><option value={areaName} key={areaName}>{areaName}</option>)}</select></label>
   </div>}
   {preview&&<div className="previewBanner"><span>Previewing</span><strong>{previewDay?.label} at {now.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</strong>{preview.area&&<small>Starting around {preview.area}</small>}</div>}
  </div>
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
   <div className="assistantQuickFilters" aria-label="Suggestion type">
    <span>What sounds useful?</span>
    <div className="timeChoices">{([['all','Any idea'],['food','Find food'],['indoor','Something indoors']] as [AssistantSuggestionMode,string][]).map(([mode,label])=><button className={suggestionMode===mode?'active':''} key={mode} onClick={()=>setSuggestionMode(mode)}>{label}</button>)}</div>
   </div>
  </div>

  {assistant.currentDay&&<MealBalanceCard compact date={assistant.currentDay.date} value={tripState.mealBalanceByDate?.[assistant.currentDay.date]} triedFoods={foodsTriedOnDate(tripState,assistant.currentDay.date)} onChange={onMealBalanceChange}/>}

  <section className="card weatherPanel">
   <div className="weatherHeader"><div><div className="eyebrow">TRIP WEATHER</div><h2>Forecast for {weatherDate}</h2><p className="muted">Weather gently adjusts suggestions; it never removes your choices.</p></div>{relevantForecast&&<span className={`weatherPreference preference-${weatherPreference(relevantForecast)}`}>{weatherPreference(relevantForecast)==='indoor'?'Indoor-friendly day':weatherPreference(relevantForecast)==='outdoor'?'Good outdoor window':'Mixed conditions'}</span>}</div>
   {weatherLoading&&!weather&&<p className="muted">Checking the forecast…</p>}
   {weather&&<div className="weatherGrid">{weather.forecasts.map(forecast=><article className={`weatherCity weather-${forecast.status}`} key={forecast.city}><div className="between"><strong>{forecast.city}</strong>{forecast.status==='available'&&<span className="weatherIcon" aria-hidden="true">{forecast.kind==='clear'?'☀️':forecast.kind==='cloudy'?'⛅':forecast.kind==='rain'?'🌧️':forecast.kind==='storm'?'⛈️':forecast.kind==='snow'?'🌨️':'🌫️'}</span>}</div>{forecast.status==='available'?<><b>{Math.round(forecast.temperatureMax??0)}° / {Math.round(forecast.temperatureMin??0)}°F</b><span>{forecast.summary} · {forecast.precipitationProbability??0}% precipitation</span></>:<><b>Forecast not available yet</b><span>{forecast.message}</span></>}</article>)}</div>}
   {forecastNotice&&<div className="weatherNotice">{forecastNotice}</div>}
   {packingReminders.length>0&&<div className="weatherPacking"><strong>Helpful packing notes</strong><ul>{packingReminders.map(reminder=><li key={reminder}>{reminder}</li>)}</ul></div>}
   {!weatherLoading&&!weather&&<div className="weatherNotice">The forecast service is temporarily unavailable. Your itinerary and suggestions still work normally.</div>}
  </section>

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
    {!actionItem.locationNotNeeded&&actionItem.mapUrl&&<a className="btn primary" href={actionItem.mapUrl} target="_blank" rel="noreferrer">Open transit directions</a>}
    {!previewMode&&!actionItem.done&&<button className="btn" onClick={()=>onComplete(actionItem)}>Mark complete</button>}
    {!previewMode&&!actionItem.done&&!isFixedItem(actionItem)&&<button className="textButton" onClick={()=>onSkip(actionItem)}>Skip this idea for now</button>}
    {previewMode&&<span className="muted small previewOnly">Preview only · no trip changes</span>}
   </div>
  </div>}

  {assistant.leaveBy&&fixedItem&&<div className="card leaveCard">
   <div><div className="eyebrow">SUGGESTED DEPARTURE</div><strong className="leaveTime">{formatClock(assistant.leaveBy)}</strong><p className="muted">A relaxed estimate with the 15-minute preparation buffer included.</p></div>
   <div className="reservationSummary"><span>Next fixed plan</span><strong>{fixedItem.title}</strong><small>{fixedItem.time}</small></div>
  </div>}

  {lastTried&&<div className="foodTriedUndo" role="status"><span>✓ {lastTried.food.title} marked tried at {lastTried.place.name}.</span><button className="textButton" onClick={undoTried}>Undo</button></div>}
  {foodTrySuggestions.length>0&&<section className="card foodTryPanel"><div className="foodTryHeader"><div><div className="eyebrow">FOODS STILL TO TRY NEARBY</div><h2>Local tastes that fit this part of the day</h2><p className="muted">These stay optional. Once a food is checked off, the Assistant stops emphasizing it.</p></div><button className="btn" onClick={onExploreNearby}>Explore food nearby</button></div><div className="foodTryList">{foodTrySuggestions.map(({food,suggestion})=>{const directions=mapsUrl(suggestion.place.formattedAddress||suggestion.place.name);return <article key={`${food.id}-${suggestion.place.id}`}><span className="specialtyBadge">{food.title}</span><div><strong>{suggestion.place.name}</strong><small>{suggestion.walkingMinutes!==undefined?`About ${suggestion.walkingMinutes} min walking · `:''}{suggestion.reasons.find(reason=>reason.includes('Open now'))??`Fits within about ${suggestionMinutes} minutes`}</small></div><div className="placeActions">{!previewMode&&<button className="btn primary compactAction" onClick={()=>markTried(food,suggestion.place)}>Mark tried</button>}<a className="textButton" href={directions} target="_blank" rel="noreferrer">Directions</a><button className="textButton" onClick={()=>onShowPlaces(suggestion.place)}>Details</button></div></article>;})}</div></section>}

  {displayedSuggestions.length>0&&<section>
   <div className="pageIntro assistantIntro"><div><div className="eyebrow">{extraMinutes?'EXTRA-TIME IDEAS':'GREAT OPTIONS RIGHT NOW'}</div><h2>{extraMinutes?`Good options for about ${extraMinutes} minutes`:suggestionMode==='food'?'Food options that fit right now':suggestionMode==='indoor'?'Indoor options that fit right now':'Options that fit your available time'}</h2><p className="muted">These are possibilities, not obligations. Your next fixed commitment remains the timing guardrail.</p></div><span className="chip">About {suggestionMinutes} min free</span></div>
   <div className="grid assistantGrid">{displayedSuggestions.map(suggestion=>{const open=placeOpenStatus(suggestion.place,now,previewMode);const directions=mapsUrl(suggestion.place.formattedAddress||suggestion.place.name);const untriedSpecialties=placeSpecialtyFoods(suggestion.place,tripState.foods).filter(food=>!food.done);return <article className="card suggestionCard" key={suggestion.place.id}>
    <div className="between"><span className={`priority priority-${suggestion.place.priority}`}>{suggestion.place.priority==='must'?'Must do':suggestion.place.priority}</span><span className={`hoursStatus hours-${open.status==='ignored'?'unknown':open.status}`}>{open.status==='open'?'Open now':open.status==='ignored'?'Hours not needed':'Hours unknown'}</span></div>
    <h3>{suggestion.place.name}</h3>
    <div className="placeLocationMeta"><span className="chip neutral">{suggestion.place.category}</span>{(suggestion.place.area??suggestPlaceArea(suggestion.place))&&<span className="areaBadge">{(suggestion.place.area??suggestPlaceArea(suggestion.place))!.split(' — ').at(-1)}</span>}</div>
    {untriedSpecialties.length>0&&<div className="specialtyRow"><strong>Still to try</strong>{untriedSpecialties.map(food=><span className="specialtyBadge" key={food.id}>{food.title}</span>)}</div>}
    {tripState.dietaryPreferences?.length?<div className="dietBadgeRow">{tripState.dietaryPreferences.map(preference=>{const rating=dietaryRating(suggestion.place,preference);return rating&&rating.fit!=='unknown'?<span className={`dietBadge diet-${rating.fit}`} key={preference}><i/>{dietaryPreferenceLabel(preference)}: {dietaryFitLabel(rating.fit)}</span>:null;})}</div>:null}
    <p className="nearbyFacts"><strong>{suggestion.estimatedDuration} min visit</strong>{suggestion.distanceKm!==undefined&&<span>{suggestion.distanceKm<1?`${Math.max(50,Math.round(suggestion.distanceKm*1000/50)*50)} m away`:`${suggestion.distanceKm.toFixed(1)} km away`}</span>}{suggestion.walkingMinutes!==undefined&&<span>≈ {suggestion.walkingMinutes} min walk</span>}</p>
    {suggestion.place.notes&&<p>{suggestion.place.notes}</p>}
    <div className="whyBox"><strong>Why this fits</strong><ul>{suggestion.reasons.slice(0,4).map(reason=><li key={reason}>{reason}</li>)}</ul></div>
    <div className="placeActions"><a className="btn" href={directions} target="_blank" rel="noreferrer">Transit directions</a>{previewMode?<button className="btn primary" disabled>Preview only</button>:<button className="btn primary" disabled={addedPlaces.has(suggestion.place.id)} onClick={()=>addSuggestion(suggestion.place)}>{addedPlaces.has(suggestion.place.id)?'✓ Added to today':'Add to today'}</button>}<button className="btn" onClick={()=>onShowPlaces(suggestion.place)}>View details</button>{!previewMode&&<button className="textButton" onClick={()=>onVisited(suggestion.place.id)}>Mark visited</button>}</div>
   </article>;})}</div>
  </section>}

  {(extraMinutes||suggestionMode!=='all')&&displayedSuggestions.length===0&&<div className="card assistantEmpty"><div className="assistantEmptyIcon">✦</div><h2>No saved places fit those choices yet.</h2><p className="muted">Try a longer time window, choose “Any idea,” or browse all saved places.</p></div>}
  {!extraMinutes&&assistant.suggestions.length===0&&!actionItem&&<div className="card assistantEmpty"><div className="assistantEmptyIcon">✦</div><h2>Nothing you need to do right now.</h2><p className="muted">Enjoy the open time. Your itinerary and saved places are still available whenever you want them.</p></div>}
 </section>;
}

function NearbyExplorer({state,currentDayIndex,now,liveLocation,locationStatus,locationMessage,onRequestLocation,onStopLocation,onVisited,onAddToItinerary,onSavePreset,onDeletePreset,onSetDefaultPreset,onShowPlace}:{state:TripState;currentDayIndex:number;now:Date;liveLocation:AssistantLocation|null;locationStatus:'idle'|'requesting'|'active'|'error';locationMessage:string;onRequestLocation:()=>void;onStopLocation:()=>void;onVisited:(id:string)=>void;onAddToItinerary:(place:Place,dayIndex:number)=>void;onSavePreset:(preset:NearbyPreset)=>void;onDeletePreset:(id:string)=>void;onSetDefaultPreset:(id?:string)=>void;onShowPlace:(place:Place)=>void}){
 const defaultRegion=state.days[currentDayIndex]?.city.includes('Toronto')?'Toronto':'Niagara & Buffalo';
 const defaultPreset=state.nearbyPresets?.find(preset=>preset.id===state.defaultNearbyPresetId);
 const [selectedRegion,setSelectedRegion]=useState(defaultPreset?.region??defaultRegion);
 const [selectedArea,setSelectedArea]=useState(defaultPreset?.area??'All');
 const [selectedCategory,setSelectedCategory]=useState(defaultPreset?.category??'All');
 const [selectedPriority,setSelectedPriority]=useState<'All'|Place['priority']>(defaultPreset?.priority??'All');
 const [nearbyMode,setNearbyMode]=useState<'all'|'food'>(defaultPreset?.foodOnly?'food':'all');
 const [dietaryMode,setDietaryMode]=useState<NearbyDietaryMode>(normalizeNearbyDietaryMode(defaultPreset?.dietaryMode));
 const [availableMinutes,setAvailableMinutes]=useState(defaultPreset?.availableMinutes??60);
 const [maxDistanceKm,setMaxDistanceKm]=useState(defaultPreset?.maxDistanceKm??2);
 const [openNowOnly,setOpenNowOnly]=useState(defaultPreset?.openNowOnly??true);
 const [includeVisited,setIncludeVisited]=useState(defaultPreset?.includeVisited??false);
 const [nearbyQuery,setNearbyQuery]=useState(defaultPreset?.query??'');
 const [specialtyOnly,setSpecialtyOnly]=useState(Boolean(defaultPreset?.specialtyOnly));
 const [activeCustomPresetId,setActiveCustomPresetId]=useState(defaultPreset?.id??'');
 const [presetName,setPresetName]=useState(defaultPreset?.name??'');
 const [targetDayIndex,setTargetDayIndex]=useState(currentDayIndex);
 const [addedMessage,setAddedMessage]=useState('');
 const [activeFoodPreset,setActiveFoodPreset]=useState<'easy'|'quick'|'local'|'late'|'before'|'all'|null>(null);
 const day=state.days[targetDayIndex]??state.days[currentDayIndex];
 const activeDietaryPreferences=state.dietaryPreferences??[];
 const triedToday=foodsTriedOnDate(state,day.date);
 const mealBalanceActive=Boolean(state.mealBalanceByDate?.[day.date]?.treatSampled||triedToday.length);
 const automaticGapMinutes=useMemo(()=>{
  const wallClock=new Date(`${day.date}T${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:00`);
  const gap=buildAssistantState(state,wallClock,liveLocation??undefined,undefined,true).availableMinutes;
  return Math.max(15,Math.min(240,gap||60));
 },[day.date,liveLocation,now,state]);
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
  includeVisited,
  foodOnly:nearbyMode==='food',
  dietaryMode:nearbyMode==='food'?dietaryMode:'all',
  specialtyOnly:nearbyMode==='food'&&specialtyOnly
 },60),[availableMinutes,day,dietaryMode,includeVisited,liveLocation,maxDistanceKm,nearbyMode,nearbyQuery,now,openNowOnly,selectedArea,selectedCategory,selectedPriority,selectedRegion,specialtyOnly,state]);
 function add(place:Place){
  onAddToItinerary(place,targetDayIndex);
  setAddedMessage(`${place.name} was added to ${state.days[targetDayIndex].label} as a flexible stop.`);
 }
 function applyFoodPreset(preset:'easy'|'quick'|'local'|'late'|'before'|'all'){
  setNearbyMode('food');
  setSelectedCategory('All');
  setNearbyQuery('');
  setSelectedPriority('All');
  setIncludeVisited(false);
  setSpecialtyOnly(false);
  setActiveCustomPresetId('');
  setPresetName('');
  setActiveFoodPreset(preset);
  if(preset==='easy'){setDietaryMode('easy');setAvailableMinutes(60);setMaxDistanceKm(2);setOpenNowOnly(true);}
  if(preset==='quick'){setDietaryMode('all');setAvailableMinutes(30);setMaxDistanceKm(1);setOpenNowOnly(true);}
  if(preset==='local'){setDietaryMode('all');setAvailableMinutes(90);setMaxDistanceKm(5);setOpenNowOnly(true);setSpecialtyOnly(true);}
  if(preset==='late'){setDietaryMode('all');setAvailableMinutes(120);setMaxDistanceKm(5);setOpenNowOnly(true);}
  if(preset==='before'){setDietaryMode('all');setAvailableMinutes(automaticGapMinutes);setMaxDistanceKm(2);setOpenNowOnly(true);}
  if(preset==='all'){setDietaryMode('all');setAvailableMinutes(240);setMaxDistanceKm(15);setOpenNowOnly(false);}
 }
 function applyCustomPreset(preset:NearbyPreset){
  setNearbyMode(preset.foodOnly?'food':'all');setNearbyQuery(preset.query);setSelectedRegion(preset.region);setSelectedArea(preset.area);setSelectedCategory(preset.category);setSelectedPriority(preset.priority);setAvailableMinutes(preset.availableMinutes);setMaxDistanceKm(preset.maxDistanceKm);setOpenNowOnly(preset.openNowOnly);setIncludeVisited(preset.includeVisited);setDietaryMode(normalizeNearbyDietaryMode(preset.dietaryMode));setSpecialtyOnly(Boolean(preset.specialtyOnly));setActiveFoodPreset(null);setActiveCustomPresetId(preset.id);setPresetName(preset.name);
 }
 function currentPreset(id:string,name:string):NearbyPreset{return {id,name,foodOnly:nearbyMode==='food',query:nearbyQuery,region:selectedRegion,area:selectedArea,category:selectedCategory,priority:selectedPriority,availableMinutes,maxDistanceKm,openNowOnly,includeVisited,dietaryMode,specialtyOnly};}
 function saveCustomPreset(){
  const name=presetName.trim();
  if(!name)return;
  const id=activeCustomPresetId||`nearby-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  onSavePreset(currentPreset(id,name));setActiveCustomPresetId(id);setPresetName(name);setActiveFoodPreset(null);
 }
 return <section className="nearbyPage">
  <div className="pageIntro"><div><div className="eyebrow">{nearbyMode==='food'?'FOOD NEARBY':'NEARBY EXPLORER'}</div><h2>{nearbyMode==='food'?'Where should we eat right now?':'What sounds good nearby?'}</h2><p className="muted">{nearbyMode==='food'?'Restaurant ideas ranked by timing, location, hours, saved priority, and practical dietary fit.':'Browse possibilities without committing to them. Closed places and options that do not fit your available time can stay out of the way.'}</p></div><span className="chip">{results.length} option{results.length===1?'':'s'}</span></div>
  <div className="nearbyModeTabs" role="group" aria-label="Nearby result type"><button className={nearbyMode==='all'?'active':''} onClick={()=>setNearbyMode('all')}>All nearby</button><button className={nearbyMode==='food'?'active':''} onClick={()=>{setNearbyMode('food');setSelectedCategory('All');}}>Food nearby</button></div>
  {nearbyMode==='food'&&<div className="card foodNearbyContext"><div><strong>{activeDietaryPreferences.length?`Using ${activeDietaryPreferences.map(dietaryPreferenceLabel).join(' + ')}`:'No dietary preferences selected'}</strong><p className="muted small">Unknown restaurants stay visible unless you choose a stricter fit filter.</p></div>{mealBalanceActive&&<div className="foodBalanceNotice">{triedToday.length?`You tried ${triedToday.map(food=>food.title).join(' + ')} today. `:'Today’s treat is noted. '}Easier options receive a gentle ranking boost; nothing is hidden.</div>}</div>}
  {nearbyMode==='food'&&<div className="card foodPresetPanel"><div><strong>Quick starting points</strong><p className="muted small">Each preset only adjusts the visible filters below. Fine-tune anything afterward.</p></div><div className="foodPresetButtons"><button className={activeFoodPreset==='easy'?'active':''} onClick={()=>applyFoodPreset('easy')}>Easy meal nearby</button><button className={activeFoodPreset==='quick'?'active':''} onClick={()=>applyFoodPreset('quick')}>Quick bite</button><button className={activeFoodPreset==='local'?'active':''} onClick={()=>applyFoodPreset('local')}>Local specialty</button><button className={activeFoodPreset==='late'?'active':''} onClick={()=>applyFoodPreset('late')}>Late-night food</button><button className={activeFoodPreset==='before'?'active':''} onClick={()=>applyFoodPreset('before')}>Before next reservation</button><button className={activeFoodPreset==='all'?'active':''} onClick={()=>applyFoodPreset('all')}>Show everything</button></div>{activeFoodPreset==='before'&&<span className="presetStatus">Using about {automaticGapMinutes} minutes before the next scheduled plan.</span>}</div>}
  <details className="card savedPresetPanel" open={Boolean(activeCustomPresetId)}><summary><span><strong>My Nearby presets</strong><small>{state.nearbyPresets?.length??0} saved</small></span></summary><div className="savedPresetBody"><p className="muted small">Save this exact combination of mode, location, timing, hours, dietary, and specialty filters.</p><div className="presetSaveRow"><input className="field" value={presetName} onChange={event=>setPresetName(event.target.value)} placeholder="Preset name, such as Waterfront lunch"/><button className="btn primary" disabled={!presetName.trim()} onClick={saveCustomPreset}>{activeCustomPresetId?'Update preset':'Save new preset'}</button>{activeCustomPresetId&&<button className="btn" onClick={()=>{setActiveCustomPresetId('');setPresetName('');}}>Save as new</button>}</div><div className="savedPresetList">{(state.nearbyPresets??[]).map(preset=><div className={preset.id===activeCustomPresetId?'active':''} key={preset.id}><button className="presetApply" onClick={()=>applyCustomPreset(preset)}><strong>{preset.name}</strong><span>{preset.foodOnly?'Food':'All places'} · {preset.region}{preset.specialtyOnly?' · Local specialties':''}</span></button><button className="textButton" onClick={()=>onSetDefaultPreset(state.defaultNearbyPresetId===preset.id?undefined:preset.id)}>{state.defaultNearbyPresetId===preset.id?'★ Default':'Make default'}</button><button className="textButton dangerText" onClick={()=>{if(window.confirm(`Delete “${preset.name}”?`)){onDeletePreset(preset.id);if(activeCustomPresetId===preset.id){setActiveCustomPresetId('');setPresetName('');}}}}>Delete</button></div>)}</div>{!(state.nearbyPresets?.length)&&<span className="muted small">No custom presets yet. Adjust the filters, give the setup a name, and save it.</span>}</div></details>
  <div className="card nearbyControls">
   <div className="nearbyLocationPanel">
    <div><strong>{liveLocation?'Using your current location':'Choose an area or use your location'}</strong><p className="muted small">{liveLocation?'Results with saved coordinates are sorted by distance. Your location is not saved.':'Neighborhood mode works even when a place does not have coordinates yet.'}</p>{locationMessage&&<span className="locationError" role="status">{locationMessage}</span>}</div>
    <div className="placeActions">{liveLocation&&<button className="btn" onClick={onStopLocation}>Use neighborhood instead</button>}<button className="btn primary" onClick={onRequestLocation} disabled={locationStatus==='requesting'}>{locationStatus==='requesting'?'Finding you…':liveLocation?'Refresh location':'Use my current location'}</button></div>
   </div>
   <div className="nearbyFilterGrid">
    <label>Search<input className="field" value={nearbyQuery} onChange={event=>setNearbyQuery(event.target.value)} placeholder="Coffee, museum, poutine…"/></label>
    <label>Region<select className="field" value={selectedRegion} onChange={event=>{setSelectedRegion(event.target.value);setSelectedArea('All');}}><option>All</option><option>Toronto</option><option>Niagara & Buffalo</option></select></label>
    <label>Neighborhood<select className="field" value={selectedArea} onChange={event=>setSelectedArea(event.target.value)}><option>All</option>{areaChoices.map(value=><option value={value} key={value}>{value}</option>)}</select></label>
    {nearbyMode==='all'&&<label>Category<select className="field" value={selectedCategory} onChange={event=>setSelectedCategory(event.target.value)}><option>All</option>{[...new Set(state.places.map(place=>place.category))].sort().map(value=><option value={value} key={value}>{value}</option>)}</select></label>}
    {nearbyMode==='food'&&activeDietaryPreferences.length>0&&<label>Dietary fit<select className="field" value={dietaryMode} onChange={event=>setDietaryMode(event.target.value as NearbyDietaryMode)}><option value="easy">Easy</option><option value="recommended">Easy + Workable</option><option value="all">Any</option></select></label>}
    <label>Priority<select className="field" value={selectedPriority} onChange={event=>setSelectedPriority(event.target.value as typeof selectedPriority)}><option>All</option><option value="must">Must do</option><option value="possible">Possible</option><option value="backup">Backup</option></select></label>
    <label>Time available<select className="field" value={availableMinutes} onChange={event=>setAvailableMinutes(Number(event.target.value))}>{![30,60,90,120,240].includes(availableMinutes)&&<option value={availableMinutes}>{availableMinutes} minutes</option>}<option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={90}>90 minutes</option><option value={120}>2 hours</option><option value={240}>Half day</option></select></label>
    {liveLocation&&<label>Maximum distance<select className="field" value={maxDistanceKm} onChange={event=>setMaxDistanceKm(Number(event.target.value))}><option value={0.5}>500 m</option><option value={1}>1 km</option><option value={2}>2 km</option><option value={5}>5 km</option><option value={15}>15 km</option></select></label>}
    <label>Add results to<select className="field" value={targetDayIndex} onChange={event=>setTargetDayIndex(Number(event.target.value))}>{state.days.map((tripDay,index)=><option value={index} key={tripDay.date}>{tripDay.label} · {tripDay.city}</option>)}</select></label>
   </div>
   <div className="nearbyToggles"><label className="toggleLine"><input type="checkbox" checked={openNowOnly} onChange={event=>setOpenNowOnly(event.target.checked)}/> Open now or hours not required</label><label className="toggleLine"><input type="checkbox" checked={includeVisited} onChange={event=>setIncludeVisited(event.target.checked)}/> Include visited places</label>{nearbyMode==='food'&&<label className="toggleLine"><input type="checkbox" checked={specialtyOnly} onChange={event=>{setSpecialtyOnly(event.target.checked);setActiveFoodPreset(null);}}/> Local specialties only</label>}</div>
   {addedMessage&&<div className="nearbyAdded" role="status"><span>✓</span>{addedMessage}<button className="textButton" onClick={()=>setAddedMessage('')}>Dismiss</button></div>}
  </div>
  <div className="grid nearbyGrid">
   {results.map(suggestion=>{const open=placeOpenStatus(suggestion.place,now);const directions=mapsUrl(suggestion.place.formattedAddress||suggestion.place.name);const displayArea=suggestion.place.area??suggestPlaceArea(suggestion.place);const specialties=placeSpecialtyFoods(suggestion.place,state.foods);const allActiveRatings=activeDietaryPreferences.map(preference=>dietaryRating(suggestion.place,preference)??{preference,fit:'unknown' as const,tip:undefined});const displayedRatings=nearbyMode==='food'?allActiveRatings:allActiveRatings.filter(rating=>rating.fit!=='unknown'&&rating.fit!=='not-applicable');return <article className={`card nearbyCard ${suggestion.place.visited?'visited':''}`} key={suggestion.place.id}>
    <div className="between"><span className={`priority priority-${suggestion.place.priority}`}>{suggestion.place.priority==='must'?'Must do':suggestion.place.priority}</span><span className={`hoursStatus hours-${open.status==='ignored'?'unknown':open.status}`}>{open.status==='open'?'Open now':open.status==='closed'?'Closed now':open.status==='ignored'?'Hours not needed':'Hours unknown'}</span></div>
    <h3>{suggestion.place.name}</h3>
    <div className="placeLocationMeta"><span className="chip neutral">{suggestion.place.category}</span>{displayArea&&<span className="areaBadge">{displayArea.split(' — ').at(-1)}</span>}</div>
    {specialties.length>0&&<div className="specialtyRow"><strong>Local foods</strong>{specialties.map(food=><span className="specialtyBadge" key={food.id}>{food.title}</span>)}</div>}
    <p className="nearbyFacts"><strong>{suggestion.estimatedDuration} min</strong>{suggestion.distanceKm!==undefined&&<span>{suggestion.distanceKm<1?`${Math.max(50,Math.round(suggestion.distanceKm*1000/50)*50)} m away`:`${suggestion.distanceKm.toFixed(1)} km away`}</span>}{suggestion.walkingMinutes!==undefined&&<span>≈ {suggestion.walkingMinutes} min walk</span>}</p>
    {displayedRatings.length>0&&<div className="nearbyDietary"><div className="dietBadgeRow">{displayedRatings.map(rating=><span className={`dietBadge diet-${rating.fit}`} key={rating.preference}><i/>{dietaryPreferenceLabel(rating.preference)}: {dietaryFitLabel(rating.fit)}</span>)}</div>{displayedRatings.some(rating=>rating.tip)&&<p><strong>Best bet:</strong> {displayedRatings.find(rating=>rating.tip)?.tip}</p>}</div>}
    {suggestion.place.notes&&<p className="muted small">{suggestion.place.notes}</p>}
    <div className="whyBox"><strong>Why it fits</strong><ul>{suggestion.reasons.slice(0,3).map(reason=><li key={reason}>{reason}</li>)}</ul></div>
    <div className="nearbyCardActions"><a className="btn" href={directions} target="_blank" rel="noreferrer">Transit directions</a><button className="btn primary" onClick={()=>add(suggestion.place)}>Add to {state.days[targetDayIndex].label}</button><button className="textButton" onClick={()=>onShowPlace(suggestion.place)}>Details</button><button className="textButton" onClick={()=>onVisited(suggestion.place.id)}>{suggestion.place.visited?'Mark unvisited':'Mark visited'}</button></div>
   </article>;})}
  </div>
  {!results.length&&<div className="card assistantEmpty"><div className="assistantEmptyIcon">⌖</div><h2>No saved {nearbyMode==='food'?'food ':''}places match this combination.</h2><p className="muted">Try a larger area, a longer time window, a broader dietary-fit setting, or turn off “Open now.”</p></div>}
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
   {visible.map(place=>{const status=hoursFilterStatus(place);const checked=selected.has(place.id);return <article id={`hours-${place.id}`} className="hoursPlaceRow" role="row" key={place.id}>
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

function PlaceCard({place,selected=false,onSelect,onToggle,onEdit,onEditHours,onSave,onGoogleUpdate,onDuplicate,onDelete,tripDates,tripFoods}:{place:Place;selected?:boolean;onSelect?:()=>void;onToggle:()=>void;onEdit?:(changes:Partial<Place>)=>void;onEditHours?:(day:Weekday,changes:{open?:string;close?:string;closed?:boolean})=>void;onSave?:()=>void;onGoogleUpdate?:(place:Place)=>void;onDuplicate?:()=>void;onDelete?:()=>void;tripDates?:TripState['days'];tripFoods?:CheckItem[]}){
 const [editing,setEditing]=useState(false);
 const [saved,setSaved]=useState(false);
 const [refreshing,setRefreshing]=useState(false);
 const [refreshMessage,setRefreshMessage]=useState('');
 const hoursCount=Object.keys(place.weeklyHours??{}).length;
 const openStatus=placeOpenStatus(place,new Date());
 const areaSuggestion=!place.area?suggestPlaceArea(place):undefined;
 const linkedSpecialties=tripFoods?placeSpecialtyFoods(place,tripFoods):[];
 function save(){
  onSave?.();
  setSaved(true);
  window.setTimeout(()=>setSaved(false),1800);
 }
 function edit(changes:Partial<Place>,saveImmediately=false){
  onEdit?.(changes);
  if(saveImmediately)window.setTimeout(save,0);
 }
 function editDietary(preference:DietaryPreference,changes:{fit?:DietaryFit;tip?:string},saveImmediately=false){
  const existing=dietaryRating(place,preference);
  edit({dietaryRatings:setDietaryRating(place,preference,changes.fit??existing?.fit??'unknown',changes.tip??existing?.tip??'')},saveImmediately);
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
 return <article id={`place-${place.id}`} className={`card placeCard ${place.visited?'visited':''} ${editing?'editing':''} ${selected?'selected':''}`}>
  <div className="between"><div className="placeCardSelectRow">{onSelect&&<label className="placeSelect"><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${place.name}`}/><span>Select</span></label>}<span className={`priority priority-${place.priority}`}>{place.priority==='must'?'Must do':place.priority}</span></div><button className="visitedButton" onClick={onToggle}>{place.visited?'✓ Visited':'Mark visited'}</button></div>
  <h3>{place.name}</h3>
  <div className="placeLocationMeta"><span className="muted small">{place.region} · {place.category}</span>{place.area&&<span className="areaBadge">{place.area}</span>}</div>
  {place.ignoreHours?<div className="hoursStatus manager-ignored">Hours ignored</div>:hoursCount>0?<div className={`hoursStatus hours-${openStatus.status}`}>{openStatus.status==='open'?'Open now':openStatus.status==='closed'?'Closed now':'Hours added'}{place.hoursVerifiedAt?` · ${place.hoursSource==='google'?'Google refresh':'verified'} ${new Date(place.hoursVerifiedAt).toLocaleDateString()}`:' · not verified'}</div>:<div className="hoursStatus hours-unknown">Hours not added</div>}
  {place.formattedAddress&&<div className="muted small">{place.formattedAddress}</div>}
  {place.notes&&<p>{place.notes}</p>}
  {place.tags.length>0&&<div className="tagRow">{place.tags.slice(0,4).map(tag=><span className="chip neutral" key={tag}>{tag}</span>)}</div>}
  {linkedSpecialties.length>0&&<div className="specialtyRow"><strong>Local foods</strong>{linkedSpecialties.map(food=><span className="specialtyBadge" key={food.id}>{food.title}</span>)}</div>}
  {place.dietaryRatings?.some(rating=>rating.fit!=='unknown')&&<div className="dietBadgeRow">{place.dietaryRatings.filter(rating=>rating.fit!=='unknown').map(rating=><span className={`dietBadge diet-${rating.fit}`} title={rating.tip} key={rating.preference}><i/>{dietaryPreferenceLabel(rating.preference)}: {dietaryFitLabel(rating.fit)}</span>)}</div>}
  {place.dietaryRatings?.some(rating=>rating.tip)&&<div className="dietTipList">{place.dietaryRatings.filter(rating=>rating.tip).map(rating=><p key={rating.preference}><strong>{dietaryPreferenceLabel(rating.preference)} best bet:</strong> {rating.tip}</p>)}</div>}
  <div className="placeActions"><a className="btn primary" href={place.mapUrl||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`} target="_blank" rel="noreferrer">Directions</a>{place.menuUrl&&<a className="btn" href={place.menuUrl} target="_blank" rel="noreferrer">Menu</a>}{place.websiteUrl&&<a className="btn" href={place.websiteUrl} target="_blank" rel="noreferrer">Website</a>}{onEdit&&<button className="btn" onClick={()=>setEditing(value=>!value)}>{editing?'Close editor':'Edit place'}</button>}</div>
  {editing&&onEdit&&onEditHours&&<div className="placeEditor">
   <div className="placeEditorGrid">
    <label>Name<input className="field" value={place.name} onChange={event=>edit({name:event.target.value})} onBlur={save}/></label>
    <label>Category<input className="field" value={place.category} onChange={event=>edit({category:event.target.value})} onBlur={save}/></label>
    <label>Region<select className="field" value={place.region} onChange={event=>edit({region:event.target.value},true)}><option>Toronto</option><option>Niagara & Buffalo</option><option>Other</option></select></label>
    <label>Area<input className="field" list={`area-options-${place.id}`} value={place.area??''} placeholder="Choose or type a neighborhood" onChange={event=>edit({area:event.target.value})} onBlur={save}/><datalist id={`area-options-${place.id}`}>{suggestedAreaNames.map(value=><option value={value} key={value}/>)}</datalist>{areaSuggestion&&<button className="areaSuggestion" type="button" onClick={()=>edit({area:areaSuggestion},true)}>Use suggestion: {areaSuggestion}</button>}</label>
    <label>Priority<select className="field" value={place.priority} onChange={event=>edit({priority:event.target.value as Place['priority']},true)}><option value="must">Must do</option><option value="possible">Possible</option><option value="backup">Backup</option></select></label>
    <label>Visit time (minutes)<input className="field" type="number" min="5" step="5" value={place.estimatedDuration??60} onChange={event=>edit({estimatedDuration:Number(event.target.value)})} onBlur={save}/></label>
    <label>Time zone<input className="field" value={place.hoursTimeZone??'America/Toronto'} onChange={event=>edit({hoursTimeZone:event.target.value})} onBlur={save}/></label>
    <label>Food place<select className="field" value={place.foodPlace===true?'food':place.foodPlace===false?'not-food':'auto'} onChange={event=>edit({foodPlace:event.target.value==='auto'?undefined:event.target.value==='food'},true)}><option value="auto">Auto detect</option><option value="food">Food place</option><option value="not-food">Not food</option></select></label>
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
   {tripFoods&&tripFoods.length>0&&<fieldset className="specialtyEditor"><legend>Local foods served here</legend><p className="muted small">Connect this place to the trip foods it is known for. These links power the Local specialty preset.</p><div>{tripFoods.map(food=><label className="toggleLine" key={food.id}><input type="checkbox" checked={place.specialtyFoodIds?.includes(food.id)??false} onChange={event=>{const ids=new Set(place.specialtyFoodIds??[]);if(event.target.checked)ids.add(food.id);else ids.delete(food.id);edit({specialtyFoodIds:[...ids]},true);}}/> {food.title}</label>)}</div></fieldset>}
   <fieldset className="dietaryEditor"><legend>Dietary guidance</legend><p className="muted small">Practical guidance only—not a medical “safe” designation. Unknown means this place has not been evaluated.</p><div className="dietaryEditorRows">{dietaryPreferences.map(preference=>{const rating=dietaryRating(place,preference.id)??{preference:preference.id,fit:'unknown' as const,tip:''};return <div className="dietaryEditorRow" key={preference.id}><strong>{preference.label}</strong><select className="field" value={rating.fit} onChange={event=>editDietary(preference.id,{fit:event.target.value as DietaryFit},true)}>{dietaryFits.map(fit=><option value={fit.id} key={fit.id}>{fit.label}</option>)}</select><input className="field" value={rating.tip??''} placeholder="Best bet or ordering tip" onChange={event=>editDietary(preference.id,{tip:event.target.value})} onBlur={save}/></div>;})}</div></fieldset>
   <div className={`hoursEditor ${place.ignoreHours?'hoursEditorIgnored':''}`}>
    <div className="between"><div><strong>Weekly hours</strong><p className="muted small">{place.ignoreHours?'Hours checks are disabled. Google refresh can still update its address and location.':'Used to prevent closed-place suggestions.'}</p></div><div className="placeActions"><button className="btn primary" onClick={refreshFromGoogle} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh Google data'}</button><button className="btn" disabled={place.ignoreHours} onClick={()=>edit({hoursVerifiedAt:new Date().toISOString(),hoursSource:'manual'},true)}>Mark verified today</button></div></div>
    {refreshMessage&&<p className="muted small" role="status">{refreshMessage}</p>}
    {placeWeekdays.map(([day,label])=>{const hours=place.weeklyHours?.[day]??{open:'09:00',close:'17:00',closed:false};return <div className="hoursRow" key={day}><strong>{label}</strong><input className="field" type="time" value={hours.open} disabled={hours.closed||place.ignoreHours} onChange={event=>onEditHours(day,{open:event.target.value})} onBlur={save}/><span>to</span><input className="field" type="time" value={hours.close} disabled={hours.closed||place.ignoreHours} onChange={event=>onEditHours(day,{close:event.target.value})} onBlur={save}/><label className="toggleLine"><input type="checkbox" checked={Boolean(hours.closed)} disabled={place.ignoreHours} onChange={event=>{onEditHours(day,{closed:event.target.checked});window.setTimeout(save,0);}}/> Closed</label></div>;})}
   </div>
   <div className="editorFooter"><div className="placeActions"><button className="btn" onClick={onDuplicate}>Duplicate</button><button className="btn danger" onClick={onDelete}>Delete place</button></div><div className="saveArea"><span className={`saveStatus ${saved?'visible':''}`} role="status">Saved</span><button className="btn primary" onClick={save}>Save changes</button></div></div>
  </div>}
 </article>;
}
