import type {ItineraryItem,TripDay,TripState} from './types';
import type {AssistantLocation,AssistantNotice,AssistantState,AssistantStatus} from './assistant';
import {estimatedItemDuration,findSuggestionCandidates,isFixedItem} from './assistant';
import {dateKeyInTimeZone,formatTimeInZone,itemTimeZone,resolvedTripTimeZone,zonedDateTime} from './timezones';

export * from './assistant';

function minutesBetween(from:Date,to:Date){return Math.floor((to.getTime()-from.getTime())/60000);}

function previewInstant(now:Date,timeZone:string){
 const date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
 const time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
 return zonedDateTime(date,time,timeZone)??now;
}

function currentDay(state:TripState,now:Date){
 const zone=resolvedTripTimeZone(state.settings);
 const key=dateKeyInTimeZone(now,zone);
 const exact=state.days.findIndex(day=>day.date===key);
 if(exact>=0)return {day:state.days[exact],index:exact};
 const future=state.days.findIndex(day=>day.date>key);
 if(future>=0)return {day:state.days[future],index:future};
 return {day:state.days[state.days.length-1],index:Math.max(0,state.days.length-1)};
}

function scheduledItems(state:TripState,day:TripDay){
 return day.items
  .map(item=>({item,at:zonedDateTime(day.date,item.time,itemTimeZone(item,state.settings))}))
  .filter((entry):entry is {item:ItineraryItem;at:Date}=>Boolean(entry.at))
  .sort((a,b)=>a.at.getTime()-b.at.getTime());
}

function currentActivity(state:TripState,day:TripDay,now:Date){
 return scheduledItems(state,day).find(({item,at})=>{
  if(item.done||item.skipped)return false;
  const end=new Date(at.getTime()+estimatedItemDuration(item)*60000);
  return now>=at&&now<end;
 });
}

function nextItem(state:TripState,day:TripDay,now:Date){return scheduledItems(state,day).find(({item,at})=>!item.done&&!item.skipped&&at>now);}
function nextReservation(state:TripState,day:TripDay,now:Date){return scheduledItems(state,day).find(({item,at})=>!item.done&&!item.skipped&&isFixedItem(item)&&at>now);}
function previousItem(state:TripState,day:TripDay,now:Date){return scheduledItems(state,day).filter(({item,at})=>!item.skipped&&at<=now).at(-1);}

function leaveBy(item:ItineraryItem,at:Date){
 const travel=Math.max(0,item.travelMinutes??20);
 const prep=Math.max(0,item.prepBuffer??15);
 return new Date(at.getTime()-(travel+prep)*60000);
}

function greeting(now:Date,timeZone:string){
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone,hour:'2-digit',hourCycle:'h23'}).format(now));
 if(hour<12)return 'Good morning.';
 if(hour<17)return 'Good afternoon.';
 return 'Good evening.';
}

function presentation(args:{state:TripState;now:Date;day:TripDay;current?:{item:ItineraryItem;at:Date};next?:{item:ItineraryItem;at:Date};reservation?:{item:ItineraryItem;at:Date};leave?:Date;availableMinutes:number;allRemainingFlexible:boolean}){
 const {state,now,day,current,next,reservation,leave,availableMinutes,allRemainingFlexible}=args;
 const notices:AssistantNotice[]=[];
 const tripZone=resolvedTripTimeZone(state.settings);
 let status:AssistantStatus='relax';
 let headline=greeting(now,tripZone);
 let subheadline='There is nothing you need to rush toward right now.';
 if(current){
  status='activity';headline=`You may be at ${current.item.title}.`;
  subheadline=reservation?`Your next fixed event is ${reservation.item.title} at ${reservation.item.time}.`:'Everything else today is flexible.';
 }else if(reservation&&leave){
  const leaveIn=minutesBetween(now,leave);
  if(leaveIn<=0){status='leaveNow';headline=`It may be time to head toward ${reservation.item.title}.`;subheadline=`It is scheduled for ${reservation.item.time}.`;notices.push({type:'travel',message:'Open transit directions when you are ready to go.'});}
  else if(leaveIn<=20){status='leaveSoon';headline=`You may want to leave for ${reservation.item.title} soon.`;subheadline=`You have about ${leaveIn} minutes before the suggested leave time.`;notices.push({type:'timing',message:`Suggested departure is around ${formatTimeInZone(leave,itemTimeZone(reservation.item,state.settings),true)}.`});}
  else if(availableMinutes>=45){status='explore';headline=`You have about ${availableMinutes} minutes before you need to head out.`;subheadline=`Your next fixed event is ${reservation.item.title} at ${reservation.item.time}.`;}
  else {status='relax';headline=`You have time before ${reservation.item.title}.`;subheadline=`It is scheduled for ${reservation.item.time}.`;}
 }else if(next){status='explore';headline='Everything coming up is flexible.';subheadline=`Your next idea is ${next.item.title} at ${next.item.time}, but there is no fixed commitment attached to it.`;}
 else {status='finished';headline='The rest of the day is open.';subheadline=`There are no remaining scheduled items for ${day.city}.`;}
 if(allRemainingFlexible&&next)notices.push({type:'info',message:'Everything remaining today can be adjusted or skipped.'});
 return {status,headline,subheadline,notices};
}

export function buildAssistantState(state:TripState,now=new Date(),location?:AssistantLocation,anchorArea?:string,previewWallClock=false):AssistantState{
 if(!state.days.length)return {currentDayIndex:0,availableMinutes:0,status:'finished',headline:'No itinerary yet.',subheadline:'Add a day to begin using the trip assistant.',suggestions:[],notices:[],allRemainingFlexible:true};
 const tripZone=resolvedTripTimeZone(state.settings);
 const effectiveNow=previewWallClock?previewInstant(now,tripZone):now;
 const found=currentDay(state,effectiveNow);
 const day=found.day;
 const tripStart=zonedDateTime(state.days[0].date,'12:00 AM',tripZone)??new Date(`${state.days[0].date}T00:00:00`);
 if(effectiveNow<tripStart)return {currentDay:day,currentDayIndex:found.index,availableMinutes:0,status:'beforeTrip',headline:'Your trip is coming up.',subheadline:`The first day begins ${state.days[0].label}.`,suggestions:[],notices:[],allRemainingFlexible:false};
 const current=currentActivity(state,day,effectiveNow);
 const next=nextItem(state,day,effectiveNow);
 const reservation=nextReservation(state,day,effectiveNow);
 const previous=previousItem(state,day,effectiveNow);
 const leave=reservation?leaveBy(reservation.item,reservation.at):undefined;
 const availableMinutes=leave?Math.max(0,minutesBetween(effectiveNow,leave)):next?Math.max(0,minutesBetween(effectiveNow,next.at)):0;
 const remaining=day.items.filter(item=>!item.done&&!item.skipped);
 const allRemainingFlexible=remaining.length>0&&remaining.every(item=>!isFixedItem(item));
 const shown=presentation({state,now:effectiveNow,day,current,next,reservation,leave,availableMinutes,allRemainingFlexible});
 const suggestionAnchor=current?.item??previous?.item??next?.item;
 const suggestions=(shown.status==='explore'||shown.status==='relax')&&availableMinutes>=30?findSuggestionCandidates(state,day,availableMinutes,3,{anchor:suggestionAnchor,anchorArea,location,now:effectiveNow,previewWallClock:false}):[];
 return {currentDay:day,currentDayIndex:found.index,currentActivity:current?.item,nextItem:next?.item,nextReservation:reservation?.item,nextReservationAt:reservation?.at,leaveBy:leave,availableMinutes,status:shown.status,headline:shown.headline,subheadline:shown.subheadline,suggestions,notices:shown.notices,allRemainingFlexible,suggestionAnchor};
}
