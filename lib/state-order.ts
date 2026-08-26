import type {ItineraryItem,TripState} from './types';

export function itinerarySortMinutes(value:string){
 const normalized=value.trim().toLowerCase();
 if(normalized==='breakfast')return 8*60;
 if(normalized==='brunch')return 10*60+30;
 if(normalized==='lunch')return 12*60;
 if(normalized==='afternoon')return 15*60;
 if(normalized==='dinner')return 18*60;
 if(normalized==='evening')return 19*60;
 if(normalized==='late night'||normalized==='late-night')return 22*60;
 const match=value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
 if(!match)return 24*60;
 let hour=Number(match[1]);
 const minute=Number(match[2]??0);
 const suffix=match[3]?.toUpperCase();
 if(suffix==='PM'&&hour<12)hour+=12;
 if(suffix==='AM'&&hour===12)hour=0;
 if(hour>23||minute>59)return 24*60;
 return hour*60+minute;
}

export function sortItineraryItems(items:ItineraryItem[]){
 return [...items].sort((a,b)=>itinerarySortMinutes(a.time)-itinerarySortMinutes(b.time));
}

export function normalizeItineraryOrder(state:TripState):TripState{
 return {...state,days:state.days.map(day=>({...day,items:sortItineraryItems(day.items)}))};
}
