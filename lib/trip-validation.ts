import type {TripState} from '@/lib/types';

export type TripValidation={valid:boolean;errors:string[];warnings:string[]};
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const timePattern=/^\d{1,2}(?::\d{2})?\s*(?:AM|PM)?$/i;

export function validateTripState(value:unknown):TripValidation{
 const errors:string[]=[];const warnings:string[]=[];
 if(!value||typeof value!=='object')return {valid:false,errors:['The backup does not contain a trip.'],warnings};
 const state=value as Partial<TripState>;
 for(const key of ['days','places','foods','packing'] as const)if(!Array.isArray(state[key]))errors.push(`Missing ${key} list.`);
 if(errors.length)return {valid:false,errors,warnings};
 const ids=new Map<string,string>();
 function track(id:unknown,label:string){if(typeof id!=='string'||!id.trim()){errors.push(`${label} is missing an ID.`);return;}const previous=ids.get(id);if(previous)errors.push(`Duplicate ID “${id}” is used by ${previous} and ${label}.`);else ids.set(id,label);}
 const dates=new Set<string>();
 for(const [di,day] of state.days!.entries()){
  const dayLabel=`Day ${di+1}`;
  if(!day||typeof day!=='object'){errors.push(`${dayLabel} is invalid.`);continue;}
  if(typeof day.date!=='string'||!datePattern.test(day.date))errors.push(`${dayLabel} has an invalid date.`);else if(dates.has(day.date))errors.push(`The itinerary contains two days for ${day.date}.`);else dates.add(day.date);
  if(!day.label?.trim())warnings.push(`${dayLabel} has no display label.`);if(!day.city?.trim())warnings.push(`${dayLabel} has no city.`);
  if(!Array.isArray(day.items)){errors.push(`${dayLabel} has no itinerary list.`);continue;}
  for(const [ii,item] of day.items.entries()){
   const label=`${day.label||dayLabel}, item ${ii+1}`;track(item?.id,label);
   if(!item?.title?.trim())errors.push(`${label} has no title.`);
   if(!item?.time?.trim())warnings.push(`${item?.title||label} has no time.`);else if(item.fixed&&!timePattern.test(item.time.trim()))warnings.push(`${item.title} has a fixed-plan time that may not export correctly.`);
  }
 }
 const placeIds=new Set<string>();
 for(const [index,place] of state.places!.entries()){const label=`Place ${index+1}`;track(place?.id,label);if(place?.id)placeIds.add(place.id);if(!place?.name?.trim())errors.push(`${label} has no name.`);if(!place?.region?.trim())warnings.push(`${place?.name||label} has no region.`);}
 for(const day of state.days!)for(const item of day.items??[])if(item.placeId&&!placeIds.has(item.placeId))warnings.push(`${item.title||'An itinerary item'} links to a place that no longer exists.`);
 for(const [index,item] of state.foods!.entries()){track(item?.id,`Food ${index+1}`);if(!item?.title?.trim())errors.push(`Food ${index+1} has no title.`);}
 for(const [index,item] of state.packing!.entries()){track(item?.id,`Checklist item ${index+1}`);if(!item?.title?.trim())errors.push(`Checklist item ${index+1} has no title.`);}
 if(state.settings?.startDate&&state.settings?.endDate&&state.settings.startDate>state.settings.endDate)errors.push('The trip end date is before its start date.');
 return {valid:errors.length===0,errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}
