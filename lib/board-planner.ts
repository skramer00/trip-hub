import {distanceBetweenPlaces,isFixedItem} from '@/lib/assistant';
import {checkItineraryHours,findItineraryPlace} from '@/lib/place-hours';
import {suggestPlaceArea} from '@/lib/place-areas';
import type {ItineraryItem,Place,TripDay} from '@/lib/types';

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

export function boardPlace(item:ItineraryItem,places:Place[]){
 return findItineraryPlace(item,places);
}

export function placeArea(place?:Place){
 return place?.area??(place?suggestPlaceArea(place):undefined);
}

function transitMinutes(distanceKm:number){
 return Math.max(6,Math.round(7+distanceKm*4.5));
}

export function routeSegment(from:Place,to:Place):RouteSegment{
 const distanceKm=distanceBetweenPlaces(from,to);
 const fromArea=placeArea(from);
 const toArea=placeArea(to);
 if(distanceKm!==undefined){
  const travelMinutes=transitMinutes(distanceKm);
  const kind=distanceKm<=1?'nearby':fromArea&&fromArea===toArea?'sameArea':'areaChange';
  return {from,to,distanceKm,travelMinutes,kind,label:distanceKm<1?`About ${travelMinutes} min · ${Math.max(100,Math.round(distanceKm*1000/100)*100)} m`:`About ${travelMinutes} min · ${distanceKm.toFixed(1)} km`};
 }
 if(fromArea&&toArea&&fromArea===toArea)return {from,to,kind:'sameArea',label:`Same neighborhood · ${fromArea.split(' — ').at(-1)}`};
 if(fromArea&&toArea)return {from,to,kind:'areaChange',label:`Neighborhood change · ${fromArea.split(' — ').at(-1)} → ${toArea.split(' — ').at(-1)}`};
 return {from,to,kind:'unknown',label:'Travel time not available'};
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
