'use client';

import {useMemo} from 'react';
import {buildTripReadiness,type ReadinessTarget} from '@/lib/trip-readiness';
import type {TripState} from '@/lib/types';

type PlanningTarget=ReadinessTarget|'Checklist'|'Places'|'Today'|'Journal';
type HealthItem={id:string;title:string;detail:string;target:PlanningTarget;urgency:'attention'|'review'|'later'};

function daysUntil(date:string){
 const target=new Date(`${date}T12:00:00`).getTime();
 const today=new Date();
 const local=new Date(today.getFullYear(),today.getMonth(),today.getDate(),12).getTime();
 return Math.ceil((target-local)/86400000);
}

export function planningHealthItems(state:TripState):HealthItem[]{
 const settings=state.settings;
 if(!settings?.startDate||!settings.endDate)return[];
 const untilStart=daysUntil(settings.startDate);
 const untilEnd=daysUntil(settings.endDate);
 const readiness=buildTripReadiness(state);
 const result:HealthItem[]=[];

 if(untilStart>0){
  readiness.actions.slice(0,4).forEach(action=>result.push({id:action.id,title:action.label,detail:action.detail,target:action.target,urgency:action.status==='attention'?'attention':'review'}));
  const packing=state.packing.filter(item=>(item.checklistType??'packing')==='packing'&&!item.optional);
  const unpacked=packing.filter(item=>!item.done);
  if(untilStart<=14&&unpacked.length)result.push({id:'packing',title:`${unpacked.length} packing item${unpacked.length===1?'':'s'} left`,detail:untilStart<=3?'Departure is close. This is worth finishing now.':'Packing is still in progress; no rush yet.',target:'Checklist',urgency:untilStart<=3?'attention':'review'});
  const prep=state.packing.filter(item=>item.checklistType==='prep'&&!item.done&&!item.optional);
  if(prep.length)result.push({id:'prep',title:`${prep.length} before-you-go task${prep.length===1?'':'s'} open`,detail:'Review preparation tasks with due dates before departure.',target:'Checklist',urgency:prep.some(item=>item.dueDate&&daysUntil(item.dueDate)<=1)?'attention':'review'});
  const unscheduledMust=state.places.filter(place=>place.priority==='must'&&!place.visited&&!state.days.some(day=>day.items.some(item=>item.placeId===place.id)));
  if(unscheduledMust.length)result.push({id:'must-places',title:`${unscheduledMust.length} must-do place${unscheduledMust.length===1?'':'s'} not scheduled`,detail:'These can stay flexible, but make sure you have room for the ones that matter most.',target:'Places',urgency:'later'});
 }else if(untilEnd>=0){
  const today=new Date().toISOString().slice(0,10);
  const day=state.days.find(item=>item.date===today)??state.days.find(item=>item.items.some(plan=>!plan.done&&!plan.skipped));
  if(day){
   const next=day.items.find(item=>!item.done&&!item.skipped);
   if(next&&(!next.locationNotNeeded&&!next.placeId&&!next.destination))result.push({id:`live-location-${next.id}`,title:`Add a location for ${next.title}`,detail:'This is the next scheduled item, so a route would be useful now.',target:'Itinerary',urgency:'attention'});
  }
  readiness.actions.filter(action=>action.status==='attention').slice(0,2).forEach(action=>result.push({id:`live-${action.id}`,title:action.label,detail:action.detail,target:action.target,urgency:'review'}));
 }else{
  const bucket=state.packing.filter(item=>item.checklistType==='bucket'&&!item.done);
  const mustPlaces=state.places.filter(place=>place.priority==='must'&&!place.visited);
  if(bucket.length||mustPlaces.length)result.push({id:'trip-leftovers',title:'A few trip goals are still unchecked',detail:`${bucket.length} bucket-list item${bucket.length===1?'':'s'} and ${mustPlaces.length} must-do place${mustPlaces.length===1?'':'s'} remain. Mark what you actually did or leave them for next time.`,target:bucket.length?'Checklist':'Places',urgency:'later'});
  if(!(state.journalMoments?.length))result.push({id:'journal',title:'Capture a trip memory',detail:'The trip is over; add a few highlights if you want a useful recap later.',target:'Journal',urgency:'later'});
 }
 return result.slice(0,6);
}

export default function PlanningHealth({state,onNavigate}:{state:TripState;onNavigate:(target:PlanningTarget)=>void}){
 const items=useMemo(()=>planningHealthItems(state),[state]);
 const settings=state.settings;
 if(!settings)return null;
 const untilStart=daysUntil(settings.startDate);const untilEnd=daysUntil(settings.endDate);
 const phase=untilStart>0?'planning':untilEnd>=0?'traveling':'complete';
 const heading=phase==='planning'?(items.length?'A few things are worth checking':'Planning looks in good shape'):phase==='traveling'?(items.length?'Only what matters right now':'Nothing urgent needs attention'):(items.length?'Wrap up what you care about':'Trip complete');
 return <section className={`card planningHealth phase-${phase}`} aria-labelledby="planning-health-title"><div className="planningHealthHead"><div><div className="eyebrow">PLANNING HEALTH</div><h3 id="planning-health-title">{heading}</h3><p>{phase==='planning'?'Trip Hub surfaces gaps without turning the trip into a race to finish everything.':phase==='traveling'?'During the trip, this stays quiet unless a scheduled plan needs attention.':'A light post-trip cleanup, not homework.'}</p></div><span className={`healthPulse ${items.some(item=>item.urgency==='attention')?'attention':items.length?'review':'ready'}`}>{items.some(item=>item.urgency==='attention')?'Needs attention':items.length?`${items.length} note${items.length===1?'':'s'}`:'All clear'}</span></div>{items.length?<div className="planningHealthList">{items.map(item=><button key={item.id} className={`planningHealthItem urgency-${item.urgency}`} onClick={()=>onNavigate(item.target)}><span className="healthDot"/><span><strong>{item.title}</strong><small>{item.detail}</small></span><b>→</b></button>)}</div>:<div className="planningHealthClear"><span>✓</span><div><strong>No cleanup needed</strong><small>Keep planning at your own pace.</small></div></div>}</section>;
}
