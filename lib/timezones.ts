import type {ItineraryItem,TripSettings,TripState} from './types';

export const DEFAULT_HOME_TIME_ZONE='America/Los_Angeles';
export const DEFAULT_TRIP_TIME_ZONE='America/Toronto';

export function resolvedHomeTimeZone(settings?:Partial<TripSettings>){return settings?.homeTimeZone||DEFAULT_HOME_TIME_ZONE;}
export function resolvedTripTimeZone(settings?:Partial<TripSettings>){return settings?.tripTimeZone||DEFAULT_TRIP_TIME_ZONE;}
export function itemTimeZone(item:ItineraryItem,settings?:Partial<TripSettings>){return item.timeZone||resolvedTripTimeZone(settings);}

export function dateKeyInTimeZone(date:Date,timeZone:string){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return `${values.year}-${values.month}-${values.day}`;
}

export function clockPartsInTimeZone(date:Date,timeZone:string){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 return {hour:Number(parts.find(part=>part.type==='hour')?.value??0),minute:Number(parts.find(part=>part.type==='minute')?.value??0)};
}

function parseClock(time:string){
 const match=time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
 if(!match)return undefined;
 let hour=Number(match[1]);
 const minute=Number(match[2]??0);
 const suffix=match[3]?.toUpperCase();
 if(suffix==='PM'&&hour<12)hour+=12;
 if(suffix==='AM'&&hour===12)hour=0;
 if(hour>23||minute>59)return undefined;
 return {hour,minute};
}

function offsetMinutesAt(date:Date,timeZone:string){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 const asUtc=Date.UTC(Number(values.year),Number(values.month)-1,Number(values.day),Number(values.hour),Number(values.minute),Number(values.second));
 return (asUtc-date.getTime())/60000;
}

export function zonedDateTime(date:string,time:string,timeZone:string){
 const clock=parseClock(time);if(!clock)return undefined;
 const [year,month,day]=date.split('-').map(Number);if(!year||!month||!day)return undefined;
 const wallUtc=Date.UTC(year,month-1,day,clock.hour,clock.minute,0,0);
 let guess=new Date(wallUtc);
 for(let i=0;i<2;i++)guess=new Date(wallUtc-offsetMinutesAt(guess,timeZone)*60000);
 return guess;
}

export function formatTimeInZone(date:Date,timeZone:string,withZone=false){
 return new Intl.DateTimeFormat('en-US',{timeZone,hour:'numeric',minute:'2-digit',...(withZone?{timeZoneName:'short' as const}:{})}).format(date);
}

export function deviceTimeZone(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch{return 'UTC';}}
export function tripDateKey(state:TripState,date=new Date()){return dateKeyInTimeZone(date,resolvedTripTimeZone(state.settings));}
export function deviceDiffersFromTrip(state:TripState){return deviceTimeZone()!==resolvedTripTimeZone(state.settings);}
