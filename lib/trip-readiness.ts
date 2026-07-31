import {isFixedItem} from '@/lib/assistant';
import {analyzeDayRoute,placeArea} from '@/lib/board-planner';
import {locationResolution} from '@/lib/location-resolver';
import type {Place,TripState} from '@/lib/types';

export type ReadinessTarget='Locations'|'Hours'|'Reservations'|'Board';
export type ReadinessStatus='ready'|'review'|'attention';
export type ReadinessCheck={
 id:'locations'|'hours'|'keyInfo'|'neighborhoods'|'routes';
 label:string;
 value:string;
 detail:string;
 status:ReadinessStatus;
 target:ReadinessTarget;
};

function hasHours(place:Place){return Boolean(Object.keys(place.weeklyHours??{}).length);}

export function buildTripReadiness(state:TripState){
 const itineraryEntries=state.days.flatMap(day=>day.items.map(item=>({day,item,resolution:locationResolution(item,state.places)})));
 const locationMissing=itineraryEntries.filter(entry=>entry.resolution.status==='missing'||entry.resolution.status==='text').length;
 const suggestedMatches=itineraryEntries.filter(entry=>entry.resolution.status==='auto').length;
 const resolvedPlaces=new Map<string,Place>();
 itineraryEntries.forEach(entry=>{if(entry.resolution.place)resolvedPlaces.set(entry.resolution.place.id,entry.resolution.place);});
 const itineraryPlaces=[...resolvedPlaces.values()];
 const hoursMissing=itineraryPlaces.filter(place=>!place.ignoreHours&&!hasHours(place)).length;
 const neighborhoodMissing=itineraryPlaces.filter(place=>!placeArea(place)).length;
 const fixedPlans=itineraryEntries.filter(entry=>isFixedItem(entry.item));
 const keyInfoMissing=fixedPlans.filter(entry=>!(entry.item.keyInfo??entry.item.confirmationNumber)?.trim()).length;
 const routeWarningDays=state.days.filter(day=>analyzeDayRoute(day,state.places).warnings.some(warning=>/backtracking|neighborhood changes/.test(warning))).length;

 const checks:ReadinessCheck[]=[
  {id:'locations',label:'Locations',value:locationMissing?`${locationMissing} to review`:'Route-ready',detail:locationMissing?`${suggestedMatches} additional automatic match${suggestedMatches===1?'':'es'} can also be confirmed.`:`${suggestedMatches} automatic match${suggestedMatches===1?'':'es'} available to confirm.`,status:locationMissing?'attention':suggestedMatches?'review':'ready',target:'Locations'},
  {id:'hours',label:'Hours',value:hoursMissing?`${hoursMissing} missing`:'Covered',detail:hoursMissing?'Add hours or mark places where hours do not matter.':'Every linked itinerary place has hours or is intentionally ignored.',status:hoursMissing?'attention':'ready',target:'Hours'},
  {id:'keyInfo',label:'Key Info',value:keyInfoMissing?`${keyInfoMissing} incomplete`:'Saved',detail:keyInfoMissing?'Add confirmations, seats, terminals, or ticket details where useful.':'Every fixed plan includes saved reference information.',status:keyInfoMissing?'review':'ready',target:'Reservations'},
  {id:'neighborhoods',label:'Neighborhoods',value:neighborhoodMissing?`${neighborhoodMissing} unassigned`:'Organized',detail:neighborhoodMissing?'Review linked stops that still lack a confident neighborhood.':'Every linked itinerary place has a neighborhood.',status:neighborhoodMissing?'review':'ready',target:'Locations'},
  {id:'routes',label:'Day routes',value:routeWarningDays?`${routeWarningDays} day${routeWarningDays===1?'':'s'} to review`:'Flow looks good',detail:routeWarningDays?'The Board found possible backtracking or frequent area changes.':'No neighborhood backtracking concerns are currently detected.',status:routeWarningDays?'review':'ready',target:'Board'},
 ];
 return {checks,readyCount:checks.filter(check=>check.status==='ready').length,fixedPlanCount:fixedPlans.length,keyInfoComplete:fixedPlans.length-keyInfoMissing};
}
