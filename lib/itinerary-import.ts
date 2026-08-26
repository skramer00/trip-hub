import type {ItineraryItemType,TripState} from './types';

export type ItineraryImportSuggestion={id:string;date:string;time:string;title:string;type:ItineraryItemType;destination?:string;keyInfo?:string;details?:string;fixed:boolean;selected:boolean};

const months:Record<string,number>={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
function pad(value:number){return String(value).padStart(2,'0');}
function validDate(date:string,state:TripState){return state.days.some(day=>day.date===date);}
function inferYear(month:number,day:number,state:TripState){
 const years=[...new Set(state.days.map(item=>Number(item.date.slice(0,4))))];
 for(const year of years){const candidate=`${year}-${pad(month)}-${pad(day)}`;if(validDate(candidate,state))return year;}
 return Number(state.settings?.startDate?.slice(0,4))||new Date().getFullYear();
}
export function dateFromText(text:string,state:TripState){
 const iso=text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);if(iso){const value=`${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;if(validDate(value,state))return value;}
 const numeric=text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?\b/);if(numeric){const month=Number(numeric[1]),day=Number(numeric[2]);let year=numeric[3]?Number(numeric[3]):inferYear(month,day,state);if(year<100)year+=2000;const value=`${year}-${pad(month)}-${pad(day)}`;if(validDate(value,state))return value;}
 const named=text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i);
 if(named){const month=months[named[1].toLowerCase().replace('.','')];const day=Number(named[2]);const year=named[3]?Number(named[3]):inferYear(month,day,state);const value=`${year}-${pad(month)}-${pad(day)}`;if(validDate(value,state))return value;}
 return undefined;
}
function normalizeTime(raw:string){
 const match=raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);if(!match)return 'Flexible';
 let hour=Number(match[1]);const minute=match[2]??'00';const meridiem=match[3]?.toUpperCase();
 if(meridiem)return `${hour}:${minute} ${meridiem}`;
 if(hour===0)return `12:${minute} AM`;if(hour<12)return `${hour}:${minute} AM`;if(hour===12)return `12:${minute} PM`;hour-=12;return `${hour}:${minute} PM`;
}
function timeFromText(text:string){const match=text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM)|(?:[01]?\d|2[0-3]):\d{2})\b/i);return match?normalizeTime(match[1]):'Flexible';}
function typeFromText(text:string):ItineraryItemType{const lower=text.toLowerCase();if(/flight|airline|airport|train|rail|bus|ferry|depart|arrival|arrive|transport/.test(lower))return'travel';if(/hotel|inn|resort|check[- ]?in|lodging|airbnb/.test(lower))return'hotel';if(/restaurant|dinner|lunch|breakfast|brunch|reservation|table/.test(lower))return'food';if(/reservation|ticket|tour|game|show|museum|admission|booking/.test(lower))return'reservation';return'activity';}
function confirmationFromText(text:string){const match=text.match(/(?:confirmation|confirm(?:ation)?\s*(?:number|#)?|booking\s*(?:number|#|ref)?|reservation\s*(?:number|#|ref)?|record locator|reference)\s*[:#-]?\s*([A-Z0-9-]{4,20})/i);return match?.[1];}
function destinationFromLines(lines:string[]){const labeled=lines.find(line=>/^(?:address|location|destination|venue|hotel)\s*:/i.test(line));if(labeled)return labeled.replace(/^[^:]+:\s*/,'').trim();const at=lines.find(line=>/^at\s+/i.test(line));return at?.replace(/^at\s+/i,'').trim();}
function cleanTitle(line:string){return line.replace(/^[-•*\s]+/,'').replace(/\b(?:on\s+)?(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g,'').replace(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/ig,'').replace(/\s{2,}/g,' ').replace(/^[,–—:\s]+|[,–—:\s]+$/g,'').trim();}

export function parseItineraryText(text:string,state:TripState):ItineraryImportSuggestion[]{
 const rawLines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);if(!rawLines.length)return[];
 const suggestions:ItineraryImportSuggestion[]=[];let currentDate:string|undefined;
 for(let index=0;index<rawLines.length;index++){
  const line=rawLines[index];const lineDate=dateFromText(line,state);if(lineDate)currentDate=lineDate;
  const date=lineDate??currentDate;if(!date)continue;
  const isDateOnly=Boolean(lineDate)&&cleanTitle(line).length<3;if(isDateOnly)continue;
  const time=timeFromText(line);
  const context=[line,...rawLines.slice(index+1,index+4).filter(next=>!dateFromText(next,state))];
  const combined=context.join(' · ');const type=typeFromText(combined);
  const hasSignal=time!=='Flexible'||type!=='activity'||Boolean(confirmationFromText(combined));if(!hasSignal)continue;
  let title=cleanTitle(line);if(!title||title.length<3){title=type==='travel'?'Travel':type==='hotel'?'Hotel':type==='food'?'Meal reservation':'Trip plan';}
  if(suggestions.some(item=>item.date===date&&item.time===time&&item.title.toLowerCase()===title.toLowerCase()))continue;
  const confirmation=confirmationFromText(combined);const destination=destinationFromLines(context.slice(1));
  suggestions.push({id:`import-${index}-${Math.random().toString(36).slice(2,7)}`,date,time,title,type,destination,keyInfo:confirmation?`Confirmation: ${confirmation}`:undefined,details:context.slice(1).filter(value=>value!==destination&&!/confirmation|booking|reservation\s*(?:number|#|ref)|record locator|reference/i.test(value)).slice(0,2).join(' · ')||undefined,fixed:time!=='Flexible'||['travel','hotel','reservation'].includes(type),selected:true});
 }
 return suggestions;
}

export function applyItinerarySuggestions(state:TripState,suggestions:ItineraryImportSuggestion[]){
 const next=structuredClone(state);const stamp=Date.now();
 suggestions.filter(item=>item.selected).forEach((suggestion,index)=>{const day=next.days.find(item=>item.date===suggestion.date);if(!day)return;day.items.push({id:`imported-${stamp}-${index}`,time:suggestion.time,title:suggestion.title,details:suggestion.details,done:false,destination:suggestion.destination,keyInfo:suggestion.keyInfo,fixed:suggestion.fixed,type:suggestion.type,estimatedDuration:suggestion.type==='food'?75:60,travelMode:'transit',travelMinutes:20,prepBuffer:15});});
 return next;
}
