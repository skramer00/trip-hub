'use client';

import {useMemo,useState} from 'react';
import {addToDayRoutePreview,categoryForGooglePlace,defaultDurationForCategory,formatTripTime,inputTimeValue,regionForTripDay,suggestedAddTime} from '@/lib/add-to-day';
import type {AddToDayRouteLeg,AddToDayRoutePreview} from '@/lib/add-to-day';
import type {GooglePlaceCandidate,ItineraryItemType,Place,TravelMode,TripState} from '@/lib/types';

type Props={
 days:TripState['days'];places:Place[];initialDayIndex:number;onClose:()=>void;
 onAddSaved:(place:Place,dayIndex:number,time:string,optional:boolean,travelMode:TravelMode,travelMinutes?:number)=>void;
 onAddGoogle:(candidate:GooglePlaceCandidate,dayIndex:number,time:string,optional:boolean,travelMode:TravelMode,travelMinutes?:number)=>void;
 onAddCustom:(value:{title:string;destination:string;type:ItineraryItemType;dayIndex:number;time:string;optional:boolean;travelMode:TravelMode;travelMinutes?:number})=>void;
};

type SelectedStop={source:'saved';place:Place}|{source:'google';place:Place;candidate:GooglePlaceCandidate};

const travelModeLabels:Record<TravelMode,string>={walking:'Walk',transit:'Transit',driving:'Drive'};

function RoutePreview({preview,travelMode,onTravelMode,onUseSuggested}:{preview:AddToDayRoutePreview;travelMode:TravelMode;onTravelMode:(mode:TravelMode)=>void;onUseSuggested:()=>void}){
 return <section className="addRoutePreview" aria-label="Route preview">
  <div className="addRoutePreviewTop"><div><span>Route-aware placement</span><strong>{preview.placementLabel}</strong></div><label>Travel by<select className="field" value={travelMode} onChange={event=>onTravelMode(event.target.value as TravelMode)}>{Object.entries(travelModeLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label></div>
  <div className="addRouteLegs">
   {preview.incoming?<RouteLeg leg={preview.incoming}/>:<div className="addRouteEdge"><span>Start</span><strong>No earlier located stop</strong></div>}
   {preview.outgoing?<RouteLeg leg={preview.outgoing}/>:<div className="addRouteEdge"><span>Finish</span><strong>No later located stop</strong></div>}
  </div>
  <div className="addRouteTiming"><span>Suggested start: <strong>{preview.suggestedTime}</strong></span><button className="textButton" type="button" onClick={onUseSuggested}>Use suggested time</button>{preview.extraTravelMinutes!==undefined&&<span>Approx. added travel: <strong>{preview.extraTravelMinutes} min</strong></span>}</div>
  {preview.notice&&<p className="addRouteNotice">{preview.notice}</p>}
  {preview.warning&&<p className="addRouteWarning">{preview.warning}</p>}
 </section>;
}

function RouteLeg({leg}:{leg:AddToDayRouteLeg}){
 return <div className="addRouteLeg"><span>{leg.from} → {leg.to}</span><strong>{leg.label}</strong>{leg.directionsUrl&&<a href={leg.directionsUrl} target="_blank" rel="noreferrer">Directions ↗</a>}</div>;
}

export default function AddToDayPanel({days,places,initialDayIndex,onClose,onAddSaved,onAddGoogle,onAddCustom}:Props){
 const [dayIndex,setDayIndex]=useState(initialDayIndex);
 const [time,setTime]=useState(()=>inputTimeValue(suggestedAddTime(days[initialDayIndex])));
 const [optional,setOptional]=useState(false);
 const [query,setQuery]=useState('');
 const [mode,setMode]=useState<'saved'|'google'|'custom'>('saved');
 const [googleResults,setGoogleResults]=useState<GooglePlaceCandidate[]>([]);
 const [searching,setSearching]=useState(false);
 const [message,setMessage]=useState('');
 const [title,setTitle]=useState('');
 const [destination,setDestination]=useState('');
 const [type,setType]=useState<ItineraryItemType>('activity');
 const [travelMode,setTravelMode]=useState<TravelMode>('transit');
 const [selected,setSelected]=useState<SelectedStop|null>(null);
 const savedResults=useMemo(()=>{
  const needle=query.trim().toLowerCase();
  const day=days[dayIndex];
  const priorityRank:Record<Place['priority'],number>={must:0,possible:1,backup:2};
  return places.filter(place=>{
   const region=regionForTripDay(day);
   return place.region===region&&(!needle||`${place.name} ${place.category} ${place.area??''} ${place.notes}`.toLowerCase().includes(needle));
  }).sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||a.name.localeCompare(b.name)).slice(0,12);
 },[dayIndex,days,places,query]);
 const tripTime=formatTripTime(Number(time.slice(0,2))*60+Number(time.slice(3,5)));
 const customPlace=useMemo<Place|null>(()=>title.trim()?{id:'custom-preview',name:title.trim(),region:regionForTripDay(days[dayIndex]),category:type==='food'?'Food':type==='hotel'?'Hotel':type==='travel'?'Transit':'Attraction',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'possible',visited:false,estimatedDuration:type==='food'?75:type==='travel'||type==='hotel'?30:60,formattedAddress:destination.trim()||undefined}:null,[dayIndex,days,destination,title,type]);
 const previewPlace=mode==='custom'?customPlace:selected?.place??null;
 const previewDuration=previewPlace?.estimatedDuration??60;
 const preview=useMemo(()=>previewPlace?addToDayRoutePreview(days[dayIndex],places,previewPlace,tripTime,travelMode,previewDuration):null,[dayIndex,days,places,previewDuration,previewPlace,travelMode,tripTime]);
 function selectDay(index:number){setDayIndex(index);setTime(inputTimeValue(suggestedAddTime(days[index])));setSelected(null);}
 function chooseSaved(place:Place){setSelected({source:'saved',place});}
 function chooseGoogle(candidate:GooglePlaceCandidate){
  const category=categoryForGooglePlace(candidate);
  const place:Place={id:`google-preview-${candidate.googlePlaceId}`,name:candidate.name,region:regionForTripDay(days[dayIndex]),category,notes:'',mapUrl:candidate.mapUrl??'',menuUrl:'',websiteUrl:candidate.websiteUrl??'',tags:[],priority:'possible',visited:false,estimatedDuration:defaultDurationForCategory(category),googlePlaceId:candidate.googlePlaceId,formattedAddress:candidate.formattedAddress,latitude:candidate.latitude,longitude:candidate.longitude,weeklyHours:candidate.weeklyHours};
  setSelected({source:'google',candidate,place});
 }
 function confirmSelected(){
  if(!selected)return;
  const travelMinutes=preview?.incoming?.minutes;
  if(selected.source==='saved')onAddSaved(selected.place,dayIndex,tripTime,optional,travelMode,travelMinutes);
  else onAddGoogle(selected.candidate,dayIndex,tripTime,optional,travelMode,travelMinutes);
  onClose();
 }
 async function searchGoogle(){
  if(query.trim().length<3){setMessage('Enter at least three characters.');return;}
  const storedSecret=sessionStorage.getItem('places-refresh-secret');
  const secret=storedSecret||window.prompt('Enter the Places search password');
  if(!secret)return;
  sessionStorage.setItem('places-refresh-secret',secret);
  setSearching(true);setMessage('');
  try{
   const region=regionForTripDay(days[dayIndex]);
   const response=await fetch('/api/places/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:query.trim(),region,secret})});
   const result=await response.json() as {results?:GooglePlaceCandidate[];error?:string};
   if(!response.ok)throw new Error(result.error??'Google search failed.');
   setGoogleResults(result.results??[]);setMessage(result.results?.length?'Choose a Google result below.':'No Google matches found.');
  }catch(error){setMessage(error instanceof Error?error.message:'Google search failed.');}
  finally{setSearching(false);}
 }
 return <div className="editorUnlockBackdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)onClose();}}>
  <section className="card addToDayPanel" role="dialog" aria-modal="true" aria-labelledby="add-to-day-title">
   <button className="editorUnlockClose" aria-label="Close Add to Day" onClick={onClose}>×</button>
   <div className="eyebrow">PLAN A STOP</div><h2 id="add-to-day-title">Add to day</h2><p className="muted">Choose a saved place, search Google, or create a custom stop. Trip Hub fills in the route details for you.</p>
   <div className="addToDaySchedule"><label>Day<select className="field" value={dayIndex} onChange={event=>selectDay(Number(event.target.value))}>{days.map((day,index)=><option value={index} key={day.date}>{day.label} · {day.city}</option>)}</select></label><label>Time<input className="field" type="time" value={time} onChange={event=>setTime(event.target.value)}/></label><label className="toggleLine addOptional"><input type="checkbox" checked={optional} onChange={event=>setOptional(event.target.checked)}/> Optional stop</label></div>
   <div className="viewSwitch addSourceSwitch" aria-label="Stop source"><button className={mode==='saved'?'active':''} onClick={()=>{setMode('saved');setSelected(null);}}>Saved places</button><button className={mode==='google'?'active':''} onClick={()=>{setMode('google');setSelected(null);}}>Search Google</button><button className={mode==='custom'?'active':''} onClick={()=>{setMode('custom');setSelected(null);}}>Custom stop</button></div>
   {mode!=='custom'&&<div className="addSearchRow"><input autoFocus className="field" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(mode==='google'&&event.key==='Enter')void searchGoogle();}} placeholder={mode==='saved'?'Search saved places…':'Restaurant, attraction, hotel…'}/>{mode==='google'&&<button className="btn primary" disabled={searching} onClick={()=>void searchGoogle()}>{searching?'Searching…':'Search'}</button>}</div>}
   {selected&&preview&&mode!=='custom'&&<div className="selectedAddStop"><div className="selectedAddStopHeading"><div><span>Selected stop</span><strong>{selected.place.name}</strong></div><button className="textButton" type="button" onClick={()=>setSelected(null)}>Choose another</button></div><RoutePreview preview={preview} travelMode={travelMode} onTravelMode={setTravelMode} onUseSuggested={()=>setTime(inputTimeValue(preview.suggestedTime))}/><button className="btn primary addConfirm" type="button" onClick={confirmSelected}>{selected.source==='google'?'Save place + add to day':'Add to day'}</button></div>}
   {mode==='saved'&&!selected&&<div className="addResultList">{savedResults.map(place=><article key={place.id}><div><strong>{place.name}</strong><small>{place.area??place.region} · {place.category} · {place.estimatedDuration??60} min</small>{place.weeklyHours&&<span>Hours saved</span>}</div><button className="btn" onClick={()=>chooseSaved(place)}>Plan</button></article>)}{!savedResults.length&&<div className="empty">No saved places match this search.</div>}</div>}
   {mode==='google'&&!selected&&<><div className="addResultList">{googleResults.map(candidate=><article key={candidate.googlePlaceId}><div><strong>{candidate.name}</strong><small>{candidate.formattedAddress??'Address unavailable'}{candidate.category?` · ${candidate.category}`:''}</small>{candidate.weeklyHours&&<span>Hours found</span>}</div><button className="btn" onClick={()=>chooseGoogle(candidate)}>Plan</button></article>)}</div>{message&&<p className="muted small" role="status">{message}</p>}</>}
   {mode==='custom'&&<div className="customStopForm"><label>Stop name<input autoFocus className="field" value={title} onChange={event=>setTitle(event.target.value)} placeholder="Lunch, scenic walk, hotel break…"/></label><label>Destination or address<input className="field" value={destination} onChange={event=>setDestination(event.target.value)} placeholder="Optional, but needed for directions"/></label><label>Type<select className="field" value={type} onChange={event=>setType(event.target.value as ItineraryItemType)}><option value="activity">Activity</option><option value="food">Food</option><option value="travel">Travel</option><option value="hotel">Hotel</option><option value="reservation">Reservation</option></select></label>{preview&&<div className="customRoutePreview"><RoutePreview preview={preview} travelMode={travelMode} onTravelMode={setTravelMode} onUseSuggested={()=>setTime(inputTimeValue(preview.suggestedTime))}/></div>}<button className="btn primary" disabled={!title.trim()} onClick={()=>{onAddCustom({title:title.trim(),destination:destination.trim(),type,dayIndex,time:tripTime,optional,travelMode,travelMinutes:preview?.incoming?.minutes});onClose();}}>Add custom stop</button></div>}
  </section>
 </div>;
}
