'use client';

import {useMemo,useState} from 'react';
import {formatTripTime,inputTimeValue,regionForTripDay,suggestedAddTime} from '@/lib/add-to-day';
import type {GooglePlaceCandidate,ItineraryItemType,Place,TripState} from '@/lib/types';

type Props={
 days:TripState['days'];places:Place[];initialDayIndex:number;onClose:()=>void;
 onAddSaved:(place:Place,dayIndex:number,time:string,optional:boolean)=>void;
 onAddGoogle:(candidate:GooglePlaceCandidate,dayIndex:number,time:string,optional:boolean)=>void;
 onAddCustom:(value:{title:string;destination:string;type:ItineraryItemType;dayIndex:number;time:string;optional:boolean})=>void;
};

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
 function selectDay(index:number){setDayIndex(index);setTime(inputTimeValue(suggestedAddTime(days[index])));}
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
   <div className="viewSwitch addSourceSwitch" aria-label="Stop source"><button className={mode==='saved'?'active':''} onClick={()=>setMode('saved')}>Saved places</button><button className={mode==='google'?'active':''} onClick={()=>setMode('google')}>Search Google</button><button className={mode==='custom'?'active':''} onClick={()=>setMode('custom')}>Custom stop</button></div>
   {mode!=='custom'&&<div className="addSearchRow"><input autoFocus className="field" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(mode==='google'&&event.key==='Enter')void searchGoogle();}} placeholder={mode==='saved'?'Search saved places…':'Restaurant, attraction, hotel…'}/>{mode==='google'&&<button className="btn primary" disabled={searching} onClick={()=>void searchGoogle()}>{searching?'Searching…':'Search'}</button>}</div>}
   {mode==='saved'&&<div className="addResultList">{savedResults.map(place=><article key={place.id}><div><strong>{place.name}</strong><small>{place.area??place.region} · {place.category} · {place.estimatedDuration??60} min</small>{place.weeklyHours&&<span>Hours saved</span>}</div><button className="btn" onClick={()=>{onAddSaved(place,dayIndex,tripTime,optional);onClose();}}>Add</button></article>)}{!savedResults.length&&<div className="empty">No saved places match this search.</div>}</div>}
   {mode==='google'&&<><div className="addResultList">{googleResults.map(candidate=><article key={candidate.googlePlaceId}><div><strong>{candidate.name}</strong><small>{candidate.formattedAddress??'Address unavailable'}{candidate.category?` · ${candidate.category}`:''}</small>{candidate.weeklyHours&&<span>Hours found</span>}</div><button className="btn" onClick={()=>{onAddGoogle(candidate,dayIndex,tripTime,optional);onClose();}}>Save + add</button></article>)}</div>{message&&<p className="muted small" role="status">{message}</p>}</>}
   {mode==='custom'&&<div className="customStopForm"><label>Stop name<input autoFocus className="field" value={title} onChange={event=>setTitle(event.target.value)} placeholder="Lunch, scenic walk, hotel break…"/></label><label>Destination or address<input className="field" value={destination} onChange={event=>setDestination(event.target.value)} placeholder="Optional, but needed for directions"/></label><label>Type<select className="field" value={type} onChange={event=>setType(event.target.value as ItineraryItemType)}><option value="activity">Activity</option><option value="food">Food</option><option value="travel">Travel</option><option value="hotel">Hotel</option><option value="reservation">Reservation</option></select></label><button className="btn primary" disabled={!title.trim()} onClick={()=>{onAddCustom({title:title.trim(),destination:destination.trim(),type,dayIndex,time:tripTime,optional});onClose();}}>Add custom stop</button></div>}
  </section>
 </div>;
}
