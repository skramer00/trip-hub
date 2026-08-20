import {isFixedItem} from '@/lib/assistant';
import {analyzeDayRoute,placeArea} from '@/lib/board-planner';
import {locationResolution} from '@/lib/location-resolver';
import type {Place,TripState} from '@/lib/types';

export type ReadinessTarget='Locations'|'Hours'|'Itinerary'|'Places'|'Board';
export type ReadinessStatus='ready'|'review'|'attention';
export type ReadinessCheck={
 id:'locations'|'hours'|'keyInfo'|'neighborhoods'|'routes';
 label:string;
 value:string;
 detail:string;
 status:ReadinessStatus;
 target:ReadinessTarget;
};
export type ReadinessAction={
 id:string;
 checkId:ReadinessCheck['id'];
 label:string;
 detail:string;
 status:Exclude<ReadinessStatus,'ready'>;
 target:ReadinessTarget;
 anchorId:string;
};

function hasHours(place:Place){return Boolean(Object.keys(place.weeklyHours??{}).length);}
function hoursNeedReview(place:Place){
 if(place.ignoreHours)return false;
 if(!hasHours(place))return true;
 if(!place.hoursVerifiedAt)return true;
 const verified=new Date(place.hoursVerifiedAt).getTime();
 return !Number.isFinite(verified)||(Date.now()-verified)/86400000>=30;
}

export function buildTripReadiness(state:TripState){
 const itineraryEntries=state.days.flatMap(day=>day.items.map(item=>({day,item,resolution:locationResolution(item,state.places)})));
 const locationMissing=itineraryEntries.filter(entry=>entry.resolution.status==='missing'||entry.resolution.status==='text').length;
 const suggestedMatches=itineraryEntries.filter(entry=>entry.resolution.status==='auto').length;
 const resolvedPlaces=new Map<string,Place>();
 itineraryEntries.forEach(entry=>{if(entry.resolution.place)resolvedPlaces.set(entry.resolution.place.id,entry.resolution.place);});
 const itineraryPlaces=[...resolvedPlaces.values()];
 const hoursReviewPlaces=itineraryPlaces.filter(hoursNeedReview);
 const hoursMissing=hoursReviewPlaces.length;
 const neighborhoodMissing=itineraryPlaces.filter(place=>!placeArea(place)).length;
 const fixedPlans=itineraryEntries.filter(entry=>isFixedItem(entry.item));
 const incompleteFixedPlans=fixedPlans.map(entry=>{
  const missing:string[]=[];
  if(!(entry.item.keyInfo??entry.item.confirmationNumber)?.trim())missing.push('Key Info');
  if(entry.item.travelMinutes===undefined)missing.push('travel time');
  if(!entry.item.locationNotNeeded&&!entry.item.routeText?.trim()&&!entry.item.mapUrl?.trim())missing.push('route');
  return {...entry,missing};
 }).filter(entry=>entry.missing.length);
 const keyInfoMissing=incompleteFixedPlans.length;
 const routeWarningEntries=state.days.map(day=>({day,warnings:analyzeDayRoute(day,state.places).warnings.filter(warning=>/backtracking|neighborhood changes/.test(warning))})).filter(entry=>entry.warnings.length);
 const routeWarningDays=routeWarningEntries.length;

 const checks:ReadinessCheck[]=[
  {id:'locations',label:'Locations',value:locationMissing?`${locationMissing} to review`:'Route-ready',detail:locationMissing?`${suggestedMatches} additional automatic match${suggestedMatches===1?'':'es'} can also be confirmed.`:`${suggestedMatches} automatic match${suggestedMatches===1?'':'es'} available to confirm.`,status:locationMissing?'attention':suggestedMatches?'review':'ready',target:'Locations'},
  {id:'hours',label:'Hours',value:hoursMissing?`${hoursMissing} to review`:'Covered',detail:hoursMissing?'Add or refresh hours, or mark places where hours do not matter.':'Every linked itinerary place has current hours or is intentionally ignored.',status:hoursMissing?'attention':'ready',target:'Hours'},
  {id:'keyInfo',label:'Fixed-plan details',value:keyInfoMissing?`${keyInfoMissing} incomplete`:'Saved',detail:keyInfoMissing?'Add useful Key Info, travel time, or a route for fixed plans.':'Every fixed plan has its practical travel details.',status:keyInfoMissing?'review':'ready',target:'Itinerary'},
  {id:'neighborhoods',label:'Neighborhoods',value:neighborhoodMissing?`${neighborhoodMissing} unassigned`:'Organized',detail:neighborhoodMissing?'Review linked stops that still lack a confident neighborhood.':'Every linked itinerary place has a neighborhood.',status:neighborhoodMissing?'review':'ready',target:'Locations'},
  {id:'routes',label:'Day routes',value:routeWarningDays?`${routeWarningDays} day${routeWarningDays===1?'':'s'} to review`:'Flow looks good',detail:routeWarningDays?'The Board found possible backtracking or frequent area changes.':'No neighborhood backtracking concerns are currently detected.',status:routeWarningDays?'review':'ready',target:'Board'},
 ];
 const actions:ReadinessAction[]=[
  ...itineraryEntries.filter(entry=>['missing','text','auto'].includes(entry.resolution.status)).map(entry=>({id:`location-${entry.item.id}`,checkId:'locations' as const,label:entry.item.title,detail:entry.resolution.status==='auto'?'Confirm the suggested saved-place match.':entry.resolution.status==='text'?'Replace the text-only destination with a saved place.':'Add or intentionally dismiss this location.',status:entry.resolution.status==='missing'?'attention' as const:'review' as const,target:'Locations' as const,anchorId:`location-${entry.item.id}`})),
  ...hoursReviewPlaces.map(place=>({id:`hours-${place.id}`,checkId:'hours' as const,label:place.name,detail:hasHours(place)?'Business hours are stale or have not been verified.':'Business hours are missing.',status:'attention' as const,target:'Hours' as const,anchorId:`hours-${place.id}`})),
  ...incompleteFixedPlans.map(entry=>({id:`fixed-${entry.item.id}`,checkId:'keyInfo' as const,label:entry.item.title,detail:`Add ${entry.missing.join(', ')}.`,status:'review' as const,target:'Itinerary' as const,anchorId:`itinerary-${entry.item.id}`})),
  ...itineraryPlaces.filter(place=>!placeArea(place)).map(place=>({id:`neighborhood-${place.id}`,checkId:'neighborhoods' as const,label:place.name,detail:'Assign a neighborhood so routing and nearby suggestions are more precise.',status:'review' as const,target:'Places' as const,anchorId:`place-${place.id}`})),
  ...routeWarningEntries.map(entry=>({id:`route-${entry.day.date}`,checkId:'routes' as const,label:`${entry.day.label} route`,detail:entry.warnings[0],status:'review' as const,target:'Board' as const,anchorId:`board-${entry.day.date}`}))
 ];
 return {checks,actions,readyCount:checks.filter(check=>check.status==='ready').length,fixedPlanCount:fixedPlans.length,keyInfoComplete:fixedPlans.filter(entry=>(entry.item.keyInfo??entry.item.confirmationNumber)?.trim()).length};
}
