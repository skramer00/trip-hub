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
 quickFix?:
  |{kind:'confirm-location';dayDate:string;itemId:string;placeId:string;label:string}
  |{kind:'ignore-hours';placeId:string;label:string};
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
 const ignoredIds=new Set(state.readinessIgnoredActionIds??[]);
 const resolvedPlaces=new Map<string,Place>();
 itineraryEntries.forEach(entry=>{if(entry.resolution.place)resolvedPlaces.set(entry.resolution.place.id,entry.resolution.place);});
 const itineraryPlaces=[...resolvedPlaces.values()];
 const hoursReviewPlaces=itineraryPlaces.filter(hoursNeedReview);
 const fixedPlans=itineraryEntries.filter(entry=>isFixedItem(entry.item));
 const incompleteFixedPlans=fixedPlans.map(entry=>{
  const missing:string[]=[];
  if(!(entry.item.keyInfo??entry.item.confirmationNumber)?.trim())missing.push('Key Info');
  if(entry.item.travelMinutes===undefined)missing.push('travel time');
  if(!entry.item.locationNotNeeded&&!entry.item.routeText?.trim()&&!entry.item.mapUrl?.trim())missing.push('route');
  return {...entry,missing};
 }).filter(entry=>entry.missing.length);
 const routeWarningEntries=state.days.map(day=>({day,warnings:analyzeDayRoute(day,state.places).warnings.filter(warning=>/backtracking|neighborhood changes/.test(warning))})).filter(entry=>entry.warnings.length);
 const allActions:ReadinessAction[]=[
  ...itineraryEntries.filter(entry=>['missing','text','auto'].includes(entry.resolution.status)).map(entry=>({id:`location-${entry.item.id}`,checkId:'locations' as const,label:entry.item.title,detail:entry.resolution.status==='auto'?'Confirm the suggested saved-place match.':entry.resolution.status==='text'?'Replace the text-only destination with a saved place.':'Add or intentionally dismiss this location.',status:entry.resolution.status==='missing'?'attention' as const:'review' as const,target:'Locations' as const,anchorId:`location-${entry.item.id}`,quickFix:entry.resolution.status==='auto'&&entry.resolution.place?{kind:'confirm-location' as const,dayDate:entry.day.date,itemId:entry.item.id,placeId:entry.resolution.place.id,label:`Confirm ${entry.resolution.place.name}`} : undefined})),
  ...hoursReviewPlaces.map(place=>({id:`hours-${place.id}`,checkId:'hours' as const,label:place.name,detail:hasHours(place)?'Business hours are stale or have not been verified.':'Business hours are missing.',status:'attention' as const,target:'Hours' as const,anchorId:`hours-${place.id}`,quickFix:{kind:'ignore-hours' as const,placeId:place.id,label:'Hours do not matter'}})),
  ...incompleteFixedPlans.map(entry=>({id:`fixed-${entry.item.id}`,checkId:'keyInfo' as const,label:entry.item.title,detail:`Add ${entry.missing.join(', ')}.`,status:'review' as const,target:'Itinerary' as const,anchorId:`itinerary-${entry.item.id}`})),
  ...itineraryPlaces.filter(place=>!placeArea(place)).map(place=>({id:`neighborhood-${place.id}`,checkId:'neighborhoods' as const,label:place.name,detail:'Assign a neighborhood so routing and nearby suggestions are more precise.',status:'review' as const,target:'Places' as const,anchorId:`place-${place.id}`})),
  ...routeWarningEntries.map(entry=>({id:`route-${entry.day.date}`,checkId:'routes' as const,label:`${entry.day.label} route`,detail:entry.warnings[0],status:'review' as const,target:'Board' as const,anchorId:`board-${entry.day.date}`}))
 ];
 const actions=allActions.filter(action=>!ignoredIds.has(action.id));
 const ignoredActions=allActions.filter(action=>ignoredIds.has(action.id));
 const count=(checkId:ReadinessCheck['id'])=>actions.filter(action=>action.checkId===checkId).length;
 const ignoredCount=(checkId:ReadinessCheck['id'])=>ignoredActions.filter(action=>action.checkId===checkId).length;
 const locationCount=count('locations');
 const autoLocationCount=actions.filter(action=>action.checkId==='locations'&&action.quickFix?.kind==='confirm-location').length;
 const hoursCount=count('hours');
 const fixedCount=count('keyInfo');
 const neighborhoodCount=count('neighborhoods');
 const routeCount=count('routes');
 const ignoredDetail=(checkId:ReadinessCheck['id'])=>{const total=ignoredCount(checkId);return total?` ${total} intentionally dismissed.`:'';};
 const checks:ReadinessCheck[]=[
  {id:'locations',label:'Locations',value:locationCount?`${locationCount} to review`:'Route-ready',detail:locationCount?`${autoLocationCount} suggested match${autoLocationCount===1?'':'es'} can be confirmed.${ignoredDetail('locations')}`:`Every location is linked or intentionally dismissed.${ignoredDetail('locations')}`,status:locationCount?actions.some(action=>action.checkId==='locations'&&action.status==='attention')?'attention':'review':'ready',target:'Locations'},
  {id:'hours',label:'Hours',value:hoursCount?`${hoursCount} to review`:'Covered',detail:hoursCount?`Add or refresh hours, or mark places where hours do not matter.${ignoredDetail('hours')}`:`Every linked itinerary place has current hours or is intentionally ignored.${ignoredDetail('hours')}`,status:hoursCount?'attention':'ready',target:'Hours'},
  {id:'keyInfo',label:'Fixed-plan details',value:fixedCount?`${fixedCount} incomplete`:'Saved',detail:fixedCount?`Add useful Key Info, travel time, or a route for fixed plans.${ignoredDetail('keyInfo')}`:`Every fixed plan is complete or intentionally dismissed.${ignoredDetail('keyInfo')}`,status:fixedCount?'review':'ready',target:'Itinerary'},
  {id:'neighborhoods',label:'Neighborhoods',value:neighborhoodCount?`${neighborhoodCount} unassigned`:'Organized',detail:neighborhoodCount?`Review linked stops that still lack a confident neighborhood.${ignoredDetail('neighborhoods')}`:`Every linked stop is organized or intentionally dismissed.${ignoredDetail('neighborhoods')}`,status:neighborhoodCount?'review':'ready',target:'Locations'},
  {id:'routes',label:'Day routes',value:routeCount?`${routeCount} day${routeCount===1?'':'s'} to review`:'Flow looks good',detail:routeCount?`The Board found possible backtracking or frequent area changes.${ignoredDetail('routes')}`:`No unresolved neighborhood backtracking concerns remain.${ignoredDetail('routes')}`,status:routeCount?'review':'ready',target:'Board'},
 ];
 return {checks,actions,ignoredActions,readyCount:checks.filter(check=>check.status==='ready').length,fixedPlanCount:fixedPlans.length,keyInfoComplete:fixedPlans.filter(entry=>(entry.item.keyInfo??entry.item.confirmationNumber)?.trim()).length,totalActionCount:allActions.length,resolvedActionCount:allActions.length-actions.length};
}
