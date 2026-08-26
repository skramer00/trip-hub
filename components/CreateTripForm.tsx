'use client';

import {useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';

const commonTimeZones=['America/Los_Angeles','America/Denver','America/Chicago','America/New_York','America/Toronto','Europe/London','Europe/Paris','Asia/Tokyo','Australia/Sydney','UTC'];

export default function CreateTripForm(){
 const router=useRouter();
 const localZone=useMemo(()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',[]);
 const [open,setOpen]=useState(false);
 const [title,setTitle]=useState('');
 const [destinations,setDestinations]=useState('');
 const [startDate,setStartDate]=useState('');
 const [endDate,setEndDate]=useState('');
 const [tripTimeZone,setTripTimeZone]=useState(localZone);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 async function submit(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError('');
  try{
   const response=await fetch('/api/trips',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title,destinations,startDate,endDate,tripTimeZone,homeTimeZone:localZone})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error??'Trip could not be created.');
   router.push(`/trips/${result.tripId}`);
   router.refresh();
  }catch(value){setError(value instanceof Error?value.message:'Trip could not be created.');setBusy(false);}
 }
 return <>{<button className="btn primary" onClick={()=>setOpen(true)}>+ Create Trip</button>}{open&&<div className="editorUnlockBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setOpen(false);}}><section className="card createTripDialog" role="dialog" aria-modal="true" aria-labelledby="create-trip-title"><button className="editorUnlockClose" aria-label="Close" onClick={()=>setOpen(false)} disabled={busy}>×</button><div className="eyebrow">NEW TRIP</div><h2 id="create-trip-title">Start a new Trip Hub</h2><p className="muted">Set the basics now. You can build the itinerary, food list, places, packing, and bucket list afterward.</p><form onSubmit={submit}><label>Trip title<input className="field" value={title} onChange={event=>setTitle(event.target.value)} placeholder="Boston Fall Trip" autoFocus required/></label><label>Destination(s)<input className="field" value={destinations} onChange={event=>setDestinations(event.target.value)} placeholder="Boston, MA" required/></label><div className="createTripDates"><label>Start date<input className="field" type="date" value={startDate} onChange={event=>{setStartDate(event.target.value);if(!endDate||endDate<event.target.value)setEndDate(event.target.value);}} required/></label><label>End date<input className="field" type="date" min={startDate||undefined} value={endDate} onChange={event=>setEndDate(event.target.value)} required/></label></div><label>Trip timezone<select className="field" value={tripTimeZone} onChange={event=>setTripTimeZone(event.target.value)}>{[...new Set([localZone,...commonTimeZones])].map(zone=><option key={zone} value={zone}>{zone.replaceAll('_',' ')}</option>)}</select></label>{error&&<p className="error" role="alert">{error}{error.includes('Editor access')?' Unlock editing on your existing trip first, then return here.':''}</p>}<div className="placeActions createTripActions"><button type="button" className="btn" onClick={()=>setOpen(false)} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy||!title.trim()||!destinations.trim()||!startDate||!endDate}>{busy?'Creating…':'Create Trip'}</button></div></form></section></div>}</>;
}
