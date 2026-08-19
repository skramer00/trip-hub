import type {ItineraryItem,TripDay,TripState} from '@/lib/types';
import {estimatedItemDuration,isFixedItem} from '@/lib/assistant';

export type CalendarEntry={day:TripDay;item:ItineraryItem};
export type CalendarEntryDetails={valid:boolean;start?:Date;end?:Date;dateLabel:string;timeLabel:string;timeZone:string;timeZoneLabel:string;duration:number;issue?:string};

function pad(value:number){return String(value).padStart(2,'0');}

function parsedTime(value:string){
 const match=value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
 if(!match)return null;
 let hour=Number(match[1]);
 const minute=Number(match[2]??0);
 const suffix=match[3]?.toUpperCase();
 if(suffix==='PM'&&hour<12)hour+=12;
 if(suffix==='AM'&&hour===12)hour=0;
 if(hour>23||minute>59)return null;
 return {hour,minute};
}

export function itemTimeZone(day:TripDay,item:ItineraryItem){
 const location=`${day.city} ${item.title} ${item.destination??''}`.toLowerCase();
 if(/\b(lax|los angeles|california)\b/.test(location))return 'America/Los_Angeles';
 if(/buffalo|new york|niagara falls,? ny|orchard park/.test(location))return 'America/New_York';
 return 'America/Toronto';
}

function zonedDate(day:string,time:string,timeZone:string){
 const parsed=parsedTime(time);
 if(!parsed)return null;
 const [year,month,date]=day.split('-').map(Number);
 if(!year||!month||!date)return null;
 const desired=Date.UTC(year,month-1,date,parsed.hour,parsed.minute);
 let instant=desired;
 for(let attempt=0;attempt<2;attempt++){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  const represented=Date.UTC(Number(values.year),Number(values.month)-1,Number(values.day),Number(values.hour),Number(values.minute));
  instant-=represented-desired;
 }
 return new Date(instant);
}

function icsDate(value:Date){return `${value.getUTCFullYear()}${pad(value.getUTCMonth()+1)}${pad(value.getUTCDate())}T${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}00Z`;}
function icsText(value:string){return value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
function calendarDescription(item:ItineraryItem){return [item.details,item.routeText,item.keyInfo??item.confirmationNumber,item.userNotes].filter(Boolean).join('\n\n');}

export function fixedCalendarEntries(state:TripState){
 return state.days.flatMap(day=>day.items.filter(isFixedItem).map(item=>({day,item}))).filter(entry=>calendarEntryDetails(entry).valid);
}

function calendarDates(entry:CalendarEntry){
 const start=zonedDate(entry.day.date,entry.item.time,itemTimeZone(entry.day,entry.item));
 if(!start)return null;
 const end=new Date(start.getTime()+estimatedItemDuration(entry.item)*60_000);
 return {start,end};
}

export function calendarEntryDetails(entry:CalendarEntry):CalendarEntryDetails{
 const duration=estimatedItemDuration(entry.item);
 const timeZone=itemTimeZone(entry.day,entry.item);
 const dates=calendarDates(entry);
 const dateValue=new Date(`${entry.day.date}T12:00:00`);
 const dateLabel=Number.isNaN(dateValue.getTime())?entry.day.date:dateValue.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
 if(!parsedTime(entry.item.time))return {valid:false,dateLabel,timeLabel:entry.item.time||'No time',timeZone,timeZoneLabel:'',duration,issue:'Add a specific start time.'};
 if(!dates)return {valid:false,dateLabel,timeLabel:entry.item.time,timeZone,timeZoneLabel:'',duration,issue:'Check the itinerary date.'};
 const formatter=new Intl.DateTimeFormat('en-US',{timeZone,hour:'numeric',minute:'2-digit'});
 const zoneFormatter=new Intl.DateTimeFormat('en-US',{timeZone,timeZoneName:'short'});
 const timeZoneLabel=zoneFormatter.formatToParts(dates.start).find(part=>part.type==='timeZoneName')?.value??timeZone;
 return {valid:true,start:dates.start,end:dates.end,dateLabel,timeLabel:`${formatter.format(dates.start)}–${formatter.format(dates.end)}`,timeZone,timeZoneLabel,duration};
}

function calendarDocument(entries:CalendarEntry[]){
 const events=entries.flatMap(entry=>{
  const dates=calendarDates(entry);
  if(!dates)return [];
  const description=calendarDescription(entry.item);
  return ['BEGIN:VEVENT',`UID:${icsText(entry.item.id)}@trip-hub`,`DTSTAMP:${icsDate(new Date())}`,`DTSTART:${icsDate(dates.start)}`,`DTEND:${icsDate(dates.end)}`,`SUMMARY:${icsText(entry.item.title)}`,entry.item.destination?`LOCATION:${icsText(entry.item.destination)}`:'',description?`DESCRIPTION:${icsText(description)}`:'','END:VEVENT'].filter(Boolean);
 });
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Trip Hub//Trip Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH',...events,'END:VCALENDAR',''].join('\r\n');
}

export function tripCalendar(state:TripState){
 return calendarDocument(fixedCalendarEntries(state));
}

export function entryCalendar(entry:CalendarEntry){return calendarDocument([entry]);}

export function googleCalendarUrl(entry:CalendarEntry){
 const dates=calendarDates(entry);
 if(!dates)return '';
 const params=new URLSearchParams({action:'TEMPLATE',text:entry.item.title,dates:`${icsDate(dates.start).replace(/Z$/,'Z')}/${icsDate(dates.end).replace(/Z$/,'Z')}`,ctz:itemTimeZone(entry.day,entry.item)});
 const description=calendarDescription(entry.item);
 if(description)params.set('details',description);
 if(entry.item.destination)params.set('location',entry.item.destination);
 return `https://calendar.google.com/calendar/render?${params}`;
}

export function tripBackup(state:TripState){
 return JSON.stringify({format:'trip-hub-backup',version:1,exportedAt:new Date().toISOString(),state},null,2);
}

export function restoredTripState(value:unknown){
 if(!value||typeof value!=='object')throw new Error('This file does not contain a Trip Hub backup.');
 const record=value as Record<string,unknown>;
 const candidate=(record.format==='trip-hub-backup'?record.state:value) as Partial<TripState>;
 if(!candidate||!Array.isArray(candidate.days)||!Array.isArray(candidate.places)||!Array.isArray(candidate.foods)||!Array.isArray(candidate.packing))throw new Error('The backup is missing required trip information.');
 if(candidate.days.some(day=>!day||typeof day.date!=='string'||!Array.isArray(day.items)))throw new Error('The backup contains an invalid itinerary.');
 return candidate as TripState;
}
