import {approximateWalkingMinutes,distanceBetweenPlaces,isFixedItem} from '@/lib/assistant';
import {checkItineraryHours,findItineraryPlace} from '@/lib/place-hours';
import {suggestPlaceArea} from '@/lib/place-areas';
import type {ItineraryItem,Place,TravelMode,TripDay} from '@/lib/types';

export type RouteSegment={
 from:Place;
 to:Place;
 distanceKm?:number;
 travelMinutes?:number;
 label:string;
 kind:'nearby'|'sameArea'|'areaChange'|'unknown';
};

export type DayRouteAnalysis={
 segments:Map<string,RouteSegment>;
 totalDistanceKm:number;
 totalTravelMinutes:number;
 linkedStops:number;
 neighborhoodChanges:number;
 warnings:string[];
 canOptimize:boolean;
};

export type BoardRouteStop={
 item:ItineraryItem;
 place?:Place;
 query?:string;
 area?:string;
 locationQuality:'linked'|'text'|'missing'|'ignored';
};

export function boardPlace(item:ItineraryItem,places:Place[]){
 if(item.locationNotNeeded)return undefined;
 return findItineraryPlace(item,places);
}

export function placeArea(place?:Place){
 return place?.area??(place?suggestPlaceArea(place):undefined);
}

export function placeQuery(place:Place){
 if(place.latitude!==undefined&&place.longitude!==undefined)return `${place.latitude},${place.longitude}`;
 return place.formattedAddress||place.name;
}

export function itineraryStopQuery(item:ItineraryItem,places:Place[]){
 if(item.locationNotNeeded)return undefined;
 const place=boardPlace(item,places);
 return place?placeQuery(place):item.destination?.trim()||undefined;
}

export function buildGoogleMapsLeg(from:ItineraryItem,to:ItineraryItem,places:Place[],travelMode:TravelMode='transit'){
 const origin=itineraryStopQuery(from,places);
 const destination=itineraryStopQuery(to,places);
 if(!origin||!destination)return undefined;
 const params=new URLSearchParams({api:'1',origin,destination,travelmode:travelMode});
 return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function dayRouteStops(day:TripDay,places:Place[]):BoardRouteStop[]{
 return day.items.map(item=>{
  if(item.locationNotNeeded)return {item,locationQuality:'ignored' as const};
  const place=boardPlace(item,places);
  if(place)return {item,place,query:placeQuery(place),area:placeArea(place),locationQuality:'linked' as const};
  const query=item.destination?.trim();
  return {item,query:query||undefined,locationQuality:query?'text' as const:'missing' as const};
 });
}

export function buildGoogleMapsDayRoute(day:TripDay,places:Place[],travelMode:'walking'|'transit'='transit'){
 const stops=dayRouteStops(day,places).filter(stop=>stop.query);
 if(stops.length<2)return undefined;
 if(travelMode==='walking'){
  if(stops.some(stop=>!stop.place))return undefined;
  for(let index=1;index<stops.length;index++){
   const distance=distanceBetweenPlaces(stops[index-1].place!,stops[index].place!);
   if(distance===undefined||distance>8)return undefined;
  }
 }
 const params=new URLSearchParams({api:'1',origin:stops[0].query!,destination:stops.at(-1)!.query!,travelmode:travelMode});
 if(stops.length>2)params.set('waypoints',stops.slice(1,-1).map(stop=>stop.query).join('|'));
 return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function routeOrderChanged(day:TripDay,places:Place[]){
 const suggested=suggestDayOrder(day,places);
 return suggested.some((item,index)=>item.id!==day.items[index]?.id);
}

function transitMinutes(distanceKm:number){
 return Math.max(6,Math.round(7+distanceKm*4.5));
}

function drivingMinutes(distanceKm:number){
 return Math.max(5,Math.round(4+distanceKm*2.2));
}

export function routeSegmentForMode(from:Place,to:Place,travelMode:TravelMode='transit'):RouteSegment{
 const distanceKm=distanceBetweenPlaces(from,to);
 const fromArea=placeArea(from);
 const toArea=placeArea(to);
 if(distanceKm!==undefined){
  const travelMinutes=travelMode==='walking'?approximateWalkingMinutes(distanceKm):travelMode==='driving'?drivingMinutes(distanceKm):transitMinutes(distanceKm);
  const kind=distanceKm<=1?'nearby':fromArea&&fromArea===toArea?'sameArea':'areaChange';
  return {from,to,distanceKm,travelMinutes,kind,label:distanceKm<1?`About ${travelMinutes} min · ${Math.max(100,Math.round(distanceKm*1000/100)*100)} m`:`About ${travelMinutes} min · ${distanceKm.toFixed(1)} km`};
 }
 if(fromArea&&toArea&&fromArea===toArea)return {from,to,kind:'sameArea',label:`Same neighborhood · ${fromArea.split(' — ').at(-1)}`};
 if(fromArea&&toArea)return {from,to,kind:'areaChange',label:`Neighborhood change · ${fromArea.split(' — ').at(-1)} → ${toArea.split(' — ').at(-1)}`};
 return {from,to,kind:'unknown',label:'Travel time not available'};
}

export function routeSegment(from:Place,to:Place):RouteSegment{
 return routeSegmentForMode(from,to,'transit');
}

export function analyzeDayRoute(day:TripDay,places:Place[]):DayRouteAnalysis{
 const segments=new Map<string,RouteSegment>();
 let previous:Place|undefined;
 let totalDistanceKm=0;
 let totalTravelMinutes=0;
 let neighborhoodChanges=0;
 let linkedStops=0;
 const areaSequence:string[]=[];
 const warnings:string[]=[];
 for(const item of day.items){
  const place=boardPlace(item,places);
  if(!place)continue;
  linkedStops+=1;
  const area=placeArea(place);
  if(area)areaSequence.push(area);
  if(previous){
   const segment=routeSegment(previous,place);
   segments.set(item.id,segment);
   totalDistanceKm+=segment.distanceKm??0;
   totalTravelMinutes+=segment.travelMinutes??0;
   if(segment.kind==='areaChange')neighborhoodChanges+=1;
  }
  previous=place;
  const hours=checkItineraryHours(item,day.date,places);
  if(hours?.status==='closed'||hours?.status==='closesSoon')warnings.push(`${item.title}: ${hours.label}`);
 }
 for(let index=2;index<areaSequence.length;index++){
  if(areaSequence[index]===areaSequence[index-2]&&areaSequence[index]!==areaSequence[index-1]){
   warnings.push(`Possible backtracking to ${areaSequence[index].split(' — ').at(-1)}.`);
   break;
  }
 }
 if(neighborhoodChanges>=3)warnings.push(`${neighborhoodChanges} neighborhood changes may make this day feel transit-heavy.`);
 return {segments,totalDistanceKm,totalTravelMinutes,linkedStops,neighborhoodChanges,warnings:[...new Set(warnings)],canOptimize:day.items.filter(item=>!isFixedItem(item)&&Boolean(boardPlace(item,places))).length>=2};
}

function proximityScore(from:Place|undefined,to:Place){
 if(!from)return 0;
 const distance=distanceBetweenPlaces(from,to);
 if(distance!==undefined)return distance;
 const fromArea=placeArea(from);
 const toArea=placeArea(to);
 return fromArea&&toArea&&fromArea===toArea?1:100;
}

function optimizeBlock(items:ItineraryItem[],places:Place[],anchor?:Place){
 const remaining=[...items];
 const ordered:ItineraryItem[]=[];
 let current=anchor;
 while(remaining.length){
  let bestIndex=0;
  let bestScore=Number.POSITIVE_INFINITY;
  remaining.forEach((item,index)=>{
   const place=boardPlace(item,places);
   const score=place?proximityScore(current,place):1000+index;
   if(score<bestScore){bestScore=score;bestIndex=index;}
  });
  const [next]=remaining.splice(bestIndex,1);
  ordered.push(next);
  current=boardPlace(next,places)??current;
 }
 return ordered;
}

export function suggestDayOrder(day:TripDay,places:Place[]){
 const output:ItineraryItem[]=[];
 let flexible:ItineraryItem[]=[];
 let anchor:Place|undefined;
 const flush=()=>{
  const optimized=optimizeBlock(flexible,places,anchor);
  output.push(...optimized);
  const last=optimized.at(-1);
  anchor=last?boardPlace(last,places)??anchor:anchor;
  flexible=[];
 };
 for(const item of day.items){
  if(isFixedItem(item)){
   flush();
   output.push(item);
   anchor=boardPlace(item,places)??anchor;
  }else flexible.push(item);
 }
 flush();
 return output;
}
