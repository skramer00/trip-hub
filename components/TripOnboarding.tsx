'use client';

import {useMemo,useState} from 'react';
import type {CheckItem,DietaryPreference,ItineraryItem,Place,TripState} from '@/lib/types';

const preferenceOptions:{id:DietaryPreference;label:string}[]=[
 {id:'low-fodmap',label:'Low FODMAP'},{id:'gluten-free',label:'Gluten free'},{id:'vegetarian',label:'Vegetarian'},{id:'vegan',label:'Vegan'},{id:'dairy-free',label:'Dairy free'},{id:'pescatarian',label:'Pescatarian'},{id:'nut-aware',label:'Nut aware'}
];
const starterPacking=['Passport / ID','Wallet & payment cards','Phone','Phone charger','Portable battery','Prescription medications','Toiletries','Underwear & socks','Everyday clothes','Comfortable walking shoes','Light layer / jacket','Reusable water bottle'];
const starterPrep=['Check passport / ID requirements','Confirm transportation bookings','Confirm lodging','Review mobile data / roaming','Share itinerary with someone at home'];

type DraftStop={title:string;date:string;time:string;type:'activity'|'food'|'travel'|'hotel'|'reservation'};
type DraftPlace={name:string;category:string};

export default function TripOnboarding({state,onComplete}:{state:TripState;onComplete:(next:TripState)=>void}){
 const [step,setStep]=useState(0);
 const [preferences,setPreferences]=useState<DietaryPreference[]>(state.dietaryPreferences??[]);
 const [addPacking,setAddPacking]=useState(true);
 const [addPrep,setAddPrep]=useState(true);
 const [places,setPlaces]=useState<DraftPlace[]>([{name:'',category:'Attraction'}]);
 const [stops,setStops]=useState<DraftStop[]>([{title:'',date:state.days[0]?.date??'',time:'12:00 PM',type:'activity'}]);
 const days=state.days;
 const destination=state.settings?.destinations||'your destination';
 const title=state.settings?.title||'Your trip';
 const usablePlaces=useMemo(()=>places.filter(item=>item.name.trim()),[places]);
 const usableStops=useMemo(()=>stops.filter(item=>item.title.trim()&&item.date),[stops]);

 function finish(){
  const next=structuredClone(state);
  next.dietaryPreferences=preferences;
  const existingTitles=new Set(next.packing.map(item=>item.title.toLowerCase()));
  const additions:CheckItem[]=[];
  if(addPacking)starterPacking.forEach((item,index)=>{if(!existingTitles.has(item.toLowerCase()))additions.push({id:`starter-pack-${index}-${Date.now()}`,title:item,category:index<6?'Essentials':'Packing',done:false,checklistType:'packing',source:'suggested',sortOrder:index});});
  if(addPrep)starterPrep.forEach((item,index)=>{if(!existingTitles.has(item.toLowerCase()))additions.push({id:`starter-prep-${index}-${Date.now()}`,title:item,category:'Trip preparation',done:false,checklistType:'prep',source:'suggested',sortOrder:index});});
  next.packing=[...next.packing,...additions];
  usablePlaces.forEach((draft,index)=>{
   const place:Place={id:`starter-place-${Date.now()}-${index}`,name:draft.name.trim(),region:destination,category:draft.category||'Attraction',notes:'Added during trip setup.',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'possible',visited:false,estimatedDuration:60};
   next.places.push(place);
  });
  usableStops.forEach((draft,index)=>{
   const day=next.days.find(candidate=>candidate.date===draft.date);if(!day)return;
   const item:ItineraryItem={id:`starter-stop-${Date.now()}-${index}`,time:draft.time||'Flexible',title:draft.title.trim(),done:false,type:draft.type,fixed:draft.type==='reservation'||draft.type==='travel'||draft.type==='hotel',optional:false,estimatedDuration:draft.type==='food'?75:60,travelMode:'transit',travelMinutes:20,prepBuffer:15};
   day.items.push(item);
  });
  next.days.forEach(day=>day.items.sort((a,b)=>a.time.localeCompare(b.time)));
  if(next.settings)next.settings.onboardingCompleted=true;
  onComplete(next);
 }
 function skip(){const next=structuredClone(state);if(next.settings)next.settings.onboardingCompleted=true;onComplete(next);}

 const progress=((step+1)/4)*100;
 return <div className="onboardingOverlay" role="dialog" aria-modal="true" aria-label="Set up your trip"><section className="card onboardingCard">
  <div className="onboardingTop"><div><div className="eyebrow">NEW TRIP SETUP</div><h2>{step===0?`Make ${title} useful right away`:step===1?'Set your food preferences':step===2?'Save a few places':'Add the plans you already know'}</h2></div><button className="textButton" onClick={skip}>Skip setup</button></div>
  <div className="onboardingProgress"><span style={{width:`${progress}%`}}/></div>
  {step===0&&<div className="onboardingStep"><p className="muted">Trip Hub can start with the boring-but-useful basics so you can spend your time planning the fun parts.</p><label className="setupChoice"><input type="checkbox" checked={addPacking} onChange={event=>setAddPacking(event.target.checked)}/><span><strong>Add a starter packing list</strong><small>Essentials, clothes, tech, medications, and walking-day basics.</small></span></label><label className="setupChoice"><input type="checkbox" checked={addPrep} onChange={event=>setAddPrep(event.target.checked)}/><span><strong>Add a Before You Go list</strong><small>Bookings, lodging, ID requirements, roaming, and itinerary sharing.</small></span></label></div>}
  {step===1&&<div className="onboardingStep"><p className="muted">Select only the preferences you actually want Trip Hub to consider when evaluating restaurants and food options.</p><div className="preferenceGrid">{preferenceOptions.map(option=><label className={preferences.includes(option.id)?'selected':''} key={option.id}><input type="checkbox" checked={preferences.includes(option.id)} onChange={()=>setPreferences(current=>current.includes(option.id)?current.filter(item=>item!==option.id):[...current,option.id])}/><span>{option.label}</span></label>)}</div><p className="muted small">No preference? Leave everything unchecked.</p></div>}
  {step===2&&<div className="onboardingStep"><p className="muted">Add hotels, attractions, restaurants, neighborhoods, or anything else you already know you want handy. You can flesh out addresses and Google details later.</p><div className="setupRows">{places.map((place,index)=><div className="setupRow" key={index}><input className="field" value={place.name} placeholder={`Place in ${destination}`} onChange={event=>setPlaces(current=>current.map((item,i)=>i===index?{...item,name:event.target.value}:item))}/><select className="field" value={place.category} onChange={event=>setPlaces(current=>current.map((item,i)=>i===index?{...item,category:event.target.value}:item))}><option>Attraction</option><option>Food</option><option>Hotel</option><option>Transit</option><option>Shopping</option><option>Neighborhood</option></select>{places.length>1&&<button className="textButton" onClick={()=>setPlaces(current=>current.filter((_,i)=>i!==index))}>Remove</button>}</div>)}</div><button className="btn" onClick={()=>setPlaces(current=>[...current,{name:'',category:'Attraction'}])}>+ Add another place</button></div>}
  {step===3&&<div className="onboardingStep"><p className="muted">Flights, hotels, reservations and anchor activities are enough. Leave the rest flexible.</p><div className="setupRows">{stops.map((stop,index)=><div className="setupRow itinerarySetupRow" key={index}><input className="field" value={stop.title} placeholder="Flight, hotel, reservation, activity…" onChange={event=>setStops(current=>current.map((item,i)=>i===index?{...item,title:event.target.value}:item))}/><select className="field" value={stop.date} onChange={event=>setStops(current=>current.map((item,i)=>i===index?{...item,date:event.target.value}:item))}>{days.map(day=><option value={day.date} key={day.date}>{day.label}</option>)}</select><input className="field" value={stop.time} aria-label="Time" onChange={event=>setStops(current=>current.map((item,i)=>i===index?{...item,time:event.target.value}:item))}/><select className="field" value={stop.type} onChange={event=>setStops(current=>current.map((item,i)=>i===index?{...item,type:event.target.value as DraftStop['type']}:item))}><option value="activity">Activity</option><option value="reservation">Reservation</option><option value="food">Food</option><option value="travel">Travel</option><option value="hotel">Hotel</option></select>{stops.length>1&&<button className="textButton" onClick={()=>setStops(current=>current.filter((_,i)=>i!==index))}>Remove</button>}</div>)}</div><button className="btn" onClick={()=>setStops(current=>[...current,{title:'',date:days[0]?.date??'',time:'12:00 PM',type:'activity'}])}>+ Add another plan</button></div>}
  <div className="onboardingActions"><button className="btn" disabled={step===0} onClick={()=>setStep(current=>Math.max(0,current-1))}>Back</button><span className="muted small">Step {step+1} of 4</span>{step<3?<button className="btn primary" onClick={()=>setStep(current=>Math.min(3,current+1))}>Continue</button>:<button className="btn primary" onClick={finish}>Finish setup</button>}</div>
 </section></div>;
}
