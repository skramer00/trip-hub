import {estimatedItemDuration} from '@/lib/assistant';
import type {ItineraryItem,Place,PlaceHoursInterval,Weekday} from '@/lib/types';

const WEEKDAYS:Weekday[]=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

export type ItineraryHoursStatus='open'|'closed'|'closesSoon'|'unknown';
export type ItineraryHoursCheck={
 place:Place;
 status:ItineraryHoursStatus;
 label:string;
 message:string;
};

function normalized(value:string){
 return value.toLowerCase().replace(/[^a-z0-9]/g,'');
}

export function findItineraryPlace(item:ItineraryItem,places:Place[]){
 if(item.locationNotNeeded)return undefined;
 if(item.placeId){
  const linked=places.find(place=>place.id===item.placeId);
  if(linked)return linked;
 }
 const destination=normalized(item.destination??'');
 const title=normalized(item.title);
 const candidates=places.filter(place=>!/(hotel|transit|station|storage)/i.test(place.category));
 return candidates.find(place=>{
  const name=normalized(place.name);
  return Boolean(name&&((destination&&destination===name)||title===name));
 })??candidates.find(place=>{
  const name=normalized(place.name);
  return name.length>=6&&Boolean((destination&&destination.includes(name))||title.includes(name));
 });
}

function minutesFromTime(value:string){
 const match=value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
 if(!match)return undefined;
 let hour=Number(match[1]);
 const minute=Number(match[2]??0);
 const suffix=match[3]?.toUpperCase();
 if(suffix==='PM'&&hour<12)hour+=12;
 if(suffix==='AM'&&hour===12)hour=0;
 if(hour>23||minute>59)return undefined;
 return hour*60+minute;
}

function clockMinutes(value:string){
 const match=value.match(/^(\d{1,2}):(\d{2})$/);
 if(!match)return undefined;
 return Number(match[1])*60+Number(match[2]);
}

function clockLabel(minutes:number){
 const normalizedMinutes=((minutes%1440)+1440)%1440;
 const hour24=Math.floor(normalizedMinutes/60);
 const minute=normalizedMinutes%60;
 const suffix=hour24>=12?'PM':'AM';
 const hour=hour24%12||12;
 return `${hour}:${String(minute).padStart(2,'0')} ${suffix}`;
}

function dateWeekday(date:string){
 const [year,month,day]=date.split('-').map(Number);
 if(!year||!month||!day)return undefined;
 return WEEKDAYS[new Date(Date.UTC(year,month-1,day,12)).getUTCDay()];
}

function intervalMinutes(interval:PlaceHoursInterval){
 const open=clockMinutes(interval.open);
 const close=clockMinutes(interval.close);
 if(open===undefined||close===undefined)return undefined;
 return {open,close};
}

function isInside(start:number,interval:{open:number;close:number}){
 return interval.close<=interval.open
  ?start>=interval.open||start<interval.close
  :start>=interval.open&&start<interval.close;
}

export function checkItineraryHours(item:ItineraryItem,date:string,places:Place[]):ItineraryHoursCheck|undefined{
 const place=findItineraryPlace(item,places);
 if(!place||place.ignoreHours)return undefined;
 const weekday=dateWeekday(date);
 const start=minutesFromTime(item.time);
 if(!weekday||start===undefined)return {place,status:'unknown',label:'Hours need review',message:'Add a recognizable start time to compare this stop with its opening hours.'};
 const hours=place.weeklyHours?.[weekday];
 const weekdayLabel=weekday[0].toUpperCase()+weekday.slice(1);
 if(!hours)return {place,status:'unknown',label:'Hours unknown',message:`Opening hours have not been added for ${weekdayLabel}.`};
 if(hours.closed)return {place,status:'closed',label:`Closed ${weekdayLabel}`,message:`${place.name} is marked closed on ${weekdayLabel}.`};
 const sourceIntervals=hours.intervals?.length?hours.intervals:[{open:hours.open,close:hours.close}];
 const intervals=sourceIntervals.map(intervalMinutes).filter((interval):interval is {open:number;close:number}=>Boolean(interval));
 if(!intervals.length)return {place,status:'unknown',label:'Hours need review',message:`The saved ${weekdayLabel} hours could not be read.`};
 const active=intervals.find(interval=>isInside(start,interval));
 const schedule=intervals.map(interval=>`${clockLabel(interval.open)}–${clockLabel(interval.close)}`).join(', ');
 if(!active)return {place,status:'closed',label:'Closed at this time',message:`Scheduled for ${item.time}, outside ${place.name}’s ${weekdayLabel} hours (${schedule}).`};
 const close=active.close<=active.open&&start>=active.open?active.close+1440:active.close;
 const available=close-start;
 const duration=estimatedItemDuration(item);
 if(available<duration){
  return {place,status:'closesSoon',label:`Closes at ${clockLabel(active.close)}`,message:`The planned ${duration}-minute visit would extend about ${duration-available} minutes past closing.`};
 }
 return {place,status:'open',label:`Open · closes ${clockLabel(active.close)}`,message:`The planned ${duration}-minute visit fits within ${place.name}’s saved hours.`};
}
