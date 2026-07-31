import {findItineraryPlace} from '@/lib/place-hours';
import type {ItineraryItem,Place} from '@/lib/types';

export type LocationResolutionStatus='linked'|'auto'|'text'|'missing'|'ignored';

export function locationResolution(item:ItineraryItem,places:Place[]){
 if(item.locationNotNeeded)return {status:'ignored' as const};
 const explicit=item.placeId?places.find(place=>place.id===item.placeId):undefined;
 if(explicit)return {status:'linked' as const,place:explicit};
 const matched=findItineraryPlace(item,places);
 if(matched)return {status:'auto' as const,place:matched};
 if(item.destination?.trim())return {status:'text' as const};
 return {status:'missing' as const};
}

const genericLocationWords=new Set(['airport','international','terminal','arrive','arrival','depart','departure','preboard','flight','transit','station','stop','clear','customs','check','head','visit','explore','breakfast','lunch','dinner']);

function tokens(value:string){
 return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(token=>token.length>2&&!genericLocationWords.has(token)));
}

function matchScore(item:ItineraryItem,place:Place){
 const source=tokens(`${item.title} ${item.destination??''}`);
 const target=tokens(`${place.name} ${place.formattedAddress??''} ${place.tags.join(' ')}`);
 let overlap=0;
 source.forEach(token=>{if(target.has(token))overlap+=1;});
 const itemText=`${item.title} ${item.destination??''}`.toLowerCase();
 const placeName=place.name.toLowerCase();
 const exact=itemText.includes(placeName)||placeName.includes(item.title.toLowerCase())?20:0;
 if(!exact&&overlap<2)return 0;
 return exact+overlap*4+(place.priority==='must'?2:place.priority==='possible'?1:0);
}

export function suggestedLocationMatches(item:ItineraryItem,places:Place[],region?:string,limit=3){
 return places.map(place=>({place,score:matchScore(item,place)}))
  .filter(result=>result.score>0&&(!region||result.place.region===region))
  .sort((a,b)=>b.score-a.score||a.place.name.localeCompare(b.place.name))
  .slice(0,limit)
  .map(result=>result.place);
}
