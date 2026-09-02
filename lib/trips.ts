import type {TripState} from './types';

export const DEFAULT_TRIP_ID='toronto-niagara-buffalo-2026';
export const LEGACY_TRIP_ID='toronto-2026';

export type TripStatus='draft'|'upcoming'|'active'|'past'|'archived';
export type TripSummary={id:string;title:string;destinations:string;startDate:string;endDate:string;status:TripStatus;updatedAt?:string};
export type TripPlanningFocus={tab:'Overview'|'Today'|'Assistant'|'Itinerary'|'Locations'|'Places'|'Checklist'|'Journal';label:string;detail:string};

export function normalizeTripId(value?:string|null){
 const cleaned=(value??'').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
 return cleaned||DEFAULT_TRIP_ID;
}

export function tripStatus(state:TripState,now=new Date()):TripStatus{
 const settings=state.settings;
 if(settings?.archived)return 'archived';
 if(!settings?.startDate||!settings?.endDate)return 'draft';
 const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
 if(today<settings.startDate)return 'upcoming';
 if(today>settings.endDate)return 'past';
 return 'active';
}

function localDate(now:Date){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
function daysUntil(date:string,now:Date){if(!date)return Infinity;const today=new Date(`${localDate(now)}T12:00:00`);const target=new Date(`${date}T12:00:00`);return Math.ceil((target.getTime()-today.getTime())/86400000);}

export function tripPlanningFocus(state:TripState,now=new Date()):TripPlanningFocus{
 const status=tripStatus(state,now);
 const allItems=state.days.flatMap(day=>day.items);
 const scheduledPlaceIds=new Set(allItems.map(item=>item.placeId).filter(Boolean));
 const locationGaps=allItems.filter(item=>item.type!=='travel'&&!item.locationNotNeeded&&!item.placeId&&(item.destination||item.fixed)).length;
 const packing=state.packing.filter(item=>(item.checklistType??'packing')==='packing');
 const packingOpen=packing.filter(item=>!item.done&&!item.optional).length;
 const mustDoOpen=state.places.filter(place=>place.priority==='must'&&!place.visited&&!scheduledPlaceIds.has(place.id)).length;
 const until=daysUntil(state.settings?.startDate??'',now);

 if(status==='active')return {tab:'Today',label:'Continue today',detail:'Open the live daily plan and Trip Assistant.'};
 if(status==='past')return {tab:'Journal',label:'Wrap up trip',detail:'Capture memories and finish any trip recap.'};
 if(status==='draft'||allItems.length===0)return {tab:'Itinerary',label:'Build the itinerary',detail:'Add the first anchor plans, reservations, or travel details.'};
 if(locationGaps>0)return {tab:'Locations',label:'Connect locations',detail:`${locationGaps} itinerary item${locationGaps===1?'':'s'} still need a usable location.`};
 if(until<=10&&packingOpen>0)return {tab:'Checklist',label:'Finish packing',detail:`${packingOpen} essential packing item${packingOpen===1?'':'s'} still open.`};
 if(mustDoOpen>0)return {tab:'Places',label:'Place must-dos',detail:`${mustDoOpen} must-do place${mustDoOpen===1?' is':'s are'} not yet in the itinerary.`};
 if(until<=2)return {tab:'Checklist',label:'Final trip check',detail:'Review packing and before-you-go items before departure.'};
 return {tab:'Overview',label:'Continue planning',detail:'Review planning health and the next useful trip task.'};
}

export function tripSummary(id:string,state:TripState,updatedAt?:string):TripSummary{
 const settings=state.settings;
 return {id,title:settings?.title||'Untitled trip',destinations:settings?.destinations||'',startDate:settings?.startDate||'',endDate:settings?.endDate||'',status:tripStatus(state),updatedAt};
}
