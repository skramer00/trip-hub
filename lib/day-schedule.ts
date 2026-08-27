import {formatTripTime,itineraryTimeMinutes} from '@/lib/add-to-day';
import {isFixedItem} from '@/lib/assistant';
import {boardPlace,routeSegmentForMode} from '@/lib/board-planner';
import type {ItineraryItem,Place,TripDay} from '@/lib/types';

export type ScheduleTimingStatus='open'|'comfortable'|'tight'|'overlap'|'unknown';

export type DayScheduleConnection={
 fromId:string;
 toId:string;
 travelMinutes?:number;
 departureMinutes?:number;
 arrivalMinutes?:number;
 gapMinutes?:number;
 status:ScheduleTimingStatus;
};

export type DayScheduleEntry={
 item:ItineraryItem;
 currentStart?:number;
 suggestedStart:number;
 suggestedTime:string;
 suggestedEnd:number;
 adjusted:boolean;
};

export type DayScheduleAnalysis={
 entries:DayScheduleEntry[];
 entryById:Map<string,DayScheduleEntry>;
 connections:Map<string,DayScheduleConnection>;
 notices:string[];
 adjustmentCount:number;
 canAdjust:boolean;
};

function duration(item:ItineraryItem){return Math.max(5,item.estimatedDuration??60);}

export function itineraryTravelMinutes(from:ItineraryItem,to:ItineraryItem,places:Place[]){
 const fromPlace=boardPlace(from,places);
 const toPlace=boardPlace(to,places);
 if(fromPlace&&toPlace){
  const segment=routeSegmentForMode(fromPlace,toPlace,to.travelMode??'transit');
  if(segment.travelMinutes!==undefined)return segment.travelMinutes;
 }
 return to.travelMinutes;
}

function scheduleBlock(items:ItineraryItem[],travel:number[],starts:number[],from:number,to:number,base:number){
 let cursor=Math.max(0,base);
 for(let index=from;index<=to;index++){
  starts[index]=cursor;
  cursor+=duration(items[index])+(index<to?travel[index+1]:0);
 }
}

export function analyzeDaySchedule(day:TripDay,places:Place[]):DayScheduleAnalysis{
 const items=day.items;
 if(!items.length)return {entries:[],entryById:new Map(),connections:new Map(),notices:[],adjustmentCount:0,canAdjust:false};
 const current=items.map(item=>itineraryTimeMinutes(item.time));
 const travel=items.map((item,index)=>index?itineraryTravelMinutes(items[index-1],item,places)??0:0);
 const starts=items.map((item,index)=>current[index]??(index?startsFallback(items,current,travel,index):9*60));
 const fixedIndexes=items.flatMap((item,index)=>isFixedItem(item)&&current[index]!==undefined?[index]:[]);
 const notices:string[]=[];

 if(!fixedIndexes.length){
  scheduleBlock(items,travel,starts,0,items.length-1,current[0]??9*60);
 }else{
  const firstFixed=fixedIndexes[0];
  if(firstFixed>0){
   scheduleBlock(items,travel,starts,0,firstFixed-1,current[0]??9*60);
   const arrival=starts[firstFixed-1]+duration(items[firstFixed-1])+travel[firstFixed];
   const anchor=current[firstFixed]!;
   if(arrival>anchor){
    const shift=Math.min(starts[0],arrival-anchor);
    for(let index=0;index<firstFixed;index++)starts[index]-=shift;
   }
  }
  for(let fixedPosition=0;fixedPosition<fixedIndexes.length;fixedPosition++){
   const fixedIndex=fixedIndexes[fixedPosition];
   starts[fixedIndex]=current[fixedIndex]!;
   const nextFixed=fixedIndexes[fixedPosition+1];
   const blockEnd=nextFixed===undefined?items.length-1:nextFixed-1;
   if(fixedIndex+1<=blockEnd){
    const base=starts[fixedIndex]+duration(items[fixedIndex])+travel[fixedIndex+1];
    scheduleBlock(items,travel,starts,fixedIndex+1,blockEnd,base);
   }
  }
 }

 const entries=items.map((item,index)=>{
  const suggestedStart=Math.max(0,starts[index]);
  const currentStart=current[index];
  return {item,currentStart,suggestedStart,suggestedTime:formatTripTime(suggestedStart),suggestedEnd:suggestedStart+duration(item),adjusted:!isFixedItem(item)&&(currentStart===undefined||Math.abs(currentStart-suggestedStart)>=5)};
 });
 const entryById=new Map(entries.map(entry=>[entry.item.id,entry]));
 const connections=new Map<string,DayScheduleConnection>();
 for(let index=1;index<items.length;index++){
  const previous=entries[index-1];
  const next=entries[index];
  const incoming=itineraryTravelMinutes(previous.item,next.item,places);
  const previousStart=previous.currentStart??previous.suggestedStart;
  const nextStart=next.currentStart??next.suggestedStart;
  const departureMinutes=previousStart+duration(previous.item);
  const arrivalMinutes=incoming===undefined?undefined:departureMinutes+incoming;
  const gapMinutes=arrivalMinutes===undefined?undefined:nextStart-arrivalMinutes;
  const status:ScheduleTimingStatus=gapMinutes===undefined?'unknown':gapMinutes<0?'overlap':gapMinutes<15?'tight':gapMinutes<45?'comfortable':'open';
  connections.set(next.item.id,{fromId:previous.item.id,toId:next.item.id,travelMinutes:incoming,departureMinutes,arrivalMinutes,gapMinutes,status});
  if(gapMinutes!==undefined&&gapMinutes<0&&isFixedItem(next.item))notices.push(`${next.item.title} is fixed, and the current sequence reaches it about ${Math.abs(gapMinutes)} minutes late.`);
 }
 for(const index of fixedIndexes){
  if(index===0)continue;
  const prior=entries[index-1];
  const arrival=prior.suggestedEnd+travel[index];
  if(arrival>entries[index].suggestedStart)notices.push(`Even after adjusting flexible stops, ${items[index].title} needs about ${arrival-entries[index].suggestedStart} more minutes.`);
 }
 const adjustmentCount=entries.filter(entry=>entry.adjusted).length;
 return {entries,entryById,connections,notices:[...new Set(notices)],adjustmentCount,canAdjust:adjustmentCount>0};
}

function startsFallback(items:ItineraryItem[],current:(number|undefined)[],travel:number[],index:number){
 const previous=current[index-1]??9*60;
 return previous+duration(items[index-1])+travel[index];
}

export function applySuggestedDayTimes(day:TripDay,places:Place[]):TripDay{
 const analysis=analyzeDaySchedule(day,places);
 return {...day,items:day.items.map((item,index)=>{
  if(isFixedItem(item))return item;
  const entry=analysis.entryById.get(item.id);
  const incoming=index?itineraryTravelMinutes(day.items[index-1],item,places):undefined;
  return {...item,time:entry?.suggestedTime??item.time,...(incoming!==undefined?{travelMinutes:incoming}:{})};
 })};
}
