import {isFixedItem} from '@/lib/assistant';
import {boardPlace,buildGoogleMapsLeg,placeArea,routeSegmentForMode} from '@/lib/board-planner';
import type {GooglePlaceCandidate,ItineraryItem,ItineraryItemType,Place,TravelMode,TripDay} from '@/lib/types';

export type AddToDayRouteLeg={from:string;to:string;label:string;minutes?:number;directionsUrl?:string};
export type AddToDayRoutePreview={
 previous?:ItineraryItem;next?:ItineraryItem;incoming?:AddToDayRouteLeg;outgoing?:AddToDayRouteLeg;
 placementLabel:string;suggestedTime:string;extraTravelMinutes?:number;notice?:string;warning?:string;
};

export function formatTripTime(totalMinutes:number){
 const normalized=((Math.round(totalMinutes/5)*5)%1440+1440)%1440;
 const hour24=Math.floor(normalized/60);
 const minute=normalized%60;
 const suffix=hour24>=12?'PM':'AM';
 const hour=hour24%12||12;
 return `${hour}:${String(minute).padStart(2,'0')} ${suffix}`;
}

export function itineraryTimeMinutes(value:string){
 const match=value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
 if(!match)return undefined;
 let hour=Number(match[1]);
 const minute=Number(match[2]??0);
 const suffix=match[3]?.toUpperCase();
 if(suffix==='PM'&&hour<12)hour+=12;
 if(suffix==='AM'&&hour===12)hour=0;
 if(hour>23||minute>59)return undefined;
 return hour*60+minute;
}

export function suggestedAddTime(day:TripDay){
 const timed=day.items.flatMap(item=>{
  const start=itineraryTimeMinutes(item.time);
  return start===undefined?[]:[start+(item.estimatedDuration??60)+(item.travelMinutes??20)];
 });
 return formatTripTime(timed.length?Math.min(Math.max(...timed),23*60+55):12*60);
}

export function regionForTripDay(day:TripDay){
 if(day.city.includes('Toronto'))return 'Toronto';
 if(day.city.includes('Buffalo')||day.city.includes('Niagara'))return 'Niagara & Buffalo';
 return 'Other';
}

export function inputTimeValue(value:string){
 const minutes=itineraryTimeMinutes(value)??12*60;
 return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
}

function previewItem(place:Place,time:string,travelMode:TravelMode):ItineraryItem{
 return {id:`preview-${place.id}`,time,title:place.name,destination:place.formattedAddress||place.name,done:false,placeId:place.id,travelMode};
}

function routeLeg(from:ItineraryItem,to:ItineraryItem,places:Place[],travelMode:TravelMode):AddToDayRouteLeg{
 const fromPlace=boardPlace(from,places);
 const toPlace=boardPlace(to,places);
 const segment=fromPlace&&toPlace?routeSegmentForMode(fromPlace,toPlace,travelMode):undefined;
 return {from:from.title,to:to.title,label:segment?.label??'Travel estimate available after locations are linked',minutes:segment?.travelMinutes,directionsUrl:buildGoogleMapsLeg(from,to,places,travelMode)};
}

export function addToDayRoutePreview(day:TripDay,places:Place[],place:Place,time:string,travelMode:TravelMode='transit',duration=place.estimatedDuration??60):AddToDayRoutePreview{
 const selectedMinutes=itineraryTimeMinutes(time)??12*60;
 const timed=day.items.flatMap(item=>{const minutes=itineraryTimeMinutes(item.time);return minutes===undefined?[]:[{item,minutes}];}).sort((a,b)=>a.minutes-b.minutes);
 const insertion=timed.findIndex(entry=>entry.minutes>selectedMinutes);
 const previousEntry=insertion===0?undefined:insertion<0?timed.at(-1):timed[insertion-1];
 const nextEntry=insertion<0?undefined:timed[insertion];
 const previous=previousEntry?.item;
 const next=nextEntry?.item;
 const candidate=previewItem(place,time,travelMode);
 const previewPlaces=places.some(saved=>saved.id===place.id)?places:[...places,place];
 const incoming=previous?routeLeg(previous,candidate,previewPlaces,travelMode):undefined;
 const outgoing=next?routeLeg(candidate,next,previewPlaces,travelMode):undefined;
 const existing=previous&&next?routeLeg(previous,next,previewPlaces,travelMode):undefined;
 const addedTravel=(incoming?.minutes??0)+(outgoing?.minutes??0);
 const extraTravelMinutes=incoming?.minutes!==undefined||outgoing?.minutes!==undefined?Math.max(0,addedTravel-(existing?.minutes??0)):undefined;
 let suggestedMinutes=selectedMinutes;
 if(previousEntry)suggestedMinutes=previousEntry.minutes+(previousEntry.item.estimatedDuration??60)+(incoming?.minutes??20);
 else if(nextEntry)suggestedMinutes=Math.max(0,nextEntry.minutes-duration-(outgoing?.minutes??20));
 const suggestedTime=formatTripTime(suggestedMinutes);
 const placementLabel=previous&&next?`Between ${previous.title} and ${next.title}`:previous?`After ${previous.title}`:next?`Before ${next.title}`:'First stop of the day';
 const previousPlace=previous?boardPlace(previous,previewPlaces):undefined;
 const nextPlace=next?boardPlace(next,previewPlaces):undefined;
 const candidateArea=placeArea(place);
 const previousArea=placeArea(previousPlace);
 const nextArea=placeArea(nextPlace);
 let notice:string|undefined;
 let warning:string|undefined;
 if(previousArea&&nextArea&&previousArea===nextArea&&candidateArea&&candidateArea!==previousArea){
  warning=`This leaves ${previousArea.split(' — ').at(-1)} and returns there for the next stop.`;
 }else if(extraTravelMinutes!==undefined&&extraTravelMinutes>=30){
  notice=`This may add about ${extraTravelMinutes} minutes of travel compared with going directly to the next stop.`;
 }
 if(nextEntry&&isFixedItem(nextEntry.item)){
  const arrivalAtNext=suggestedMinutes+duration+(outgoing?.minutes??20);
  if(arrivalAtNext>nextEntry.minutes)warning=`This may run about ${arrivalAtNext-nextEntry.minutes} minutes into ${nextEntry.item.title}. Consider an earlier start or a shorter visit.`;
 }
 return {previous,next,incoming,outgoing,placementLabel,suggestedTime,extraTravelMinutes,notice,warning};
}

export function itemTypeForPlace(place:Pick<Place,'category'|'tags'>):ItineraryItemType{
 const category=`${place.category} ${place.tags.join(' ')}`.toLowerCase();
 if(/restaurant|food|bakery|coffee|cafe|dessert|candy|bar/.test(category))return 'food';
 if(/hotel|lodging/.test(category))return 'hotel';
 if(/transit|station|airport/.test(category))return 'travel';
 return 'activity';
}

export function categoryForGooglePlace(candidate:GooglePlaceCandidate){
 const category=(candidate.category??'').toLowerCase();
 if(/restaurant|food|bakery|coffee|cafe|dessert|candy|bar/.test(category))return 'Food';
 if(/hotel|lodging/.test(category))return 'Hotel';
 if(/transit|station|airport/.test(category))return 'Transit';
 return candidate.category||'Attraction';
}

export function defaultDurationForCategory(category:string){
 const value=category.toLowerCase();
 if(/restaurant|food|bakery|coffee|cafe|dessert|candy|bar/.test(value))return 75;
 if(/hotel|lodging|transit|station|airport/.test(value))return 30;
 return 90;
}

export function itineraryItemFromPlace(place:Place,time:string,optional=false,travelMode:TravelMode='transit',travelMinutes=20):ItineraryItem{
 const destination=place.formattedAddress||place.name;
 return {
  id:`place-stop-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
  time,title:place.name,details:place.notes,destination,
  mapUrl:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=transit`,
  routeText:'Open transit directions from your current location.',keyInfo:'',userNotes:'',done:false,
  optional,fixed:false,type:itemTypeForPlace(place),estimatedDuration:place.estimatedDuration??60,
  travelMinutes,travelMode,prepBuffer:15,placeId:place.id
 };
}
