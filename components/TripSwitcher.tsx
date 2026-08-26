'use client';

import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {TripSummary} from '@/lib/trips';
import {activeTripId} from '@/lib/active-trip';

export default function TripSwitcher(){
 const router=useRouter();
 const [open,setOpen]=useState(false);
 const [trips,setTrips]=useState<TripSummary[]>([]);
 const [loading,setLoading]=useState(false);
 const currentId=typeof window==='undefined'?'':activeTripId();

 useEffect(()=>{
  if(!open||trips.length)return;
  setLoading(true);
  void fetch('/api/trips').then(async response=>{
   const result=await response.json() as {trips?:TripSummary[]};
   setTrips(result.trips??[]);
  }).catch(()=>setTrips([])).finally(()=>setLoading(false));
 },[open,trips.length]);

 function goToTrip(id:string){setOpen(false);router.push(`/trips/${id}`);}
 return <div className="tripSwitcher">
  <button className="btn ghost tripSwitcherButton" aria-expanded={open} aria-haspopup="menu" onClick={()=>setOpen(value=>!value)}>My Trips <span aria-hidden="true">⌄</span></button>
  {open&&<div className="tripSwitcherMenu" role="menu">
   <div className="tripSwitcherHeading"><strong>Switch trip</strong><button className="textButton" onClick={()=>{setOpen(false);router.push('/trips');}}>View all</button></div>
   {loading?<p className="muted small">Loading trips…</p>:trips.length?<div className="tripSwitcherList">{trips.map(trip=><button role="menuitem" className={trip.id===currentId?'active':''} onClick={()=>goToTrip(trip.id)} key={trip.id}><span><strong>{trip.title}</strong><small>{trip.destinations}</small></span>{trip.id===currentId&&<em>Current</em>}</button>)}</div>:<p className="muted small">No other trips yet.</p>}
   <button className="btn primary tripSwitcherAll" onClick={()=>{setOpen(false);router.push('/trips');}}>Manage trips</button>
  </div>}
 </div>;
}
