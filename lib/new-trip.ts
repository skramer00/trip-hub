import type {TripDay,TripState} from './types';
import {normalizeTripId} from './trips';

export type NewTripInput={title:string;destinations:string;startDate:string;endDate:string;tripTimeZone:string;homeTimeZone?:string};

function dateRange(start:string,end:string){
 const startDate=new Date(`${start}T12:00:00Z`),endDate=new Date(`${end}T12:00:00Z`);
 if(Number.isNaN(startDate.getTime())||Number.isNaN(endDate.getTime())||endDate<startDate)return [];
 const dates:string[]=[];
 for(let cursor=new Date(startDate);cursor<=endDate;cursor.setUTCDate(cursor.getUTCDate()+1))dates.push(cursor.toISOString().slice(0,10));
 return dates;
}

function dayLabel(date:string){return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric',timeZone:'UTC'});}

export function slugForTrip(input:Pick<NewTripInput,'title'|'startDate'>){
 const year=input.startDate.slice(0,4);
 return normalizeTripId(`${input.title}-${year}`);
}

export function newTripState(input:NewTripInput):TripState{
 const title=input.title.trim(),destinations=input.destinations.trim();
 const days:TripDay[]=dateRange(input.startDate,input.endDate).map(date=>({date,label:dayLabel(date),city:destinations,items:[]}));
 return {
  days,
  foods:[],
  packing:[],
  places:[],
  dietaryPreferences:[],
  mealBalanceByDate:{},
  journalNotesByDate:{},
  journalMoments:[],
  nearbyPresets:[],
  readinessIgnoredActionIds:[],
  settings:{
   version:3,
   title,
   destinations,
   startDate:input.startDate,
   endDate:input.endDate,
   publicMessage:`Follow along with ${title}.`,
   coverTheme:'forest',
   publicSections:['overview','today','recap','explore','food'],
   homeTimeZone:input.homeTimeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',
   tripTimeZone:input.tripTimeZone||'UTC'
  }
 };
}
