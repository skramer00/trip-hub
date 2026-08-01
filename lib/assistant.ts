import type {ItineraryItem,ItineraryItemType,Place,TripDay,TripState,Weekday} from '@/lib/types';
import {suggestPlaceArea} from '@/lib/place-areas';

export type AssistantStatus='beforeTrip'|'relax'|'explore'|'leaveSoon'|'leaveNow'|'activity'|'finished';
export type AssistantNoticeType='info'|'travel'|'timing';
export type AssistantItemType=ItineraryItemType;

type SmartItineraryItem=ItineraryItem&{
 fixed?:boolean;
 type?:AssistantItemType;
 estimatedDuration?:number;
 travelMinutes?:number;
 prepBuffer?:number;
};

type SmartPlace=Place&{
 estimatedDuration?:number;
};

export type AssistantLocation={
 latitude:number;
 longitude:number;
 label:string;
};

export type SuggestionContext={
 anchor?:ItineraryItem;
 anchorPlace?:Place;
 anchorArea?:string;
 location?:AssistantLocation;
 now?:Date;
};

export type NearbyFilters={
 query?:string;
 region?:string;
 area?:string;
 category?:string;
 priority?:Place['priority']|'All';
 availableMinutes?:number;
 maxDistanceKm?:number;
 openNowOnly?:boolean;
 includeVisited?:boolean;
};

export interface AssistantNotice{
 type:AssistantNoticeType;
 message:string;
}

export interface SuggestedPlace{
 place:Place;
 score:number;
 reason:string;
 reasons:string[];
 estimatedDuration:number;
 distanceKm?:number;
 walkingMinutes?:number;
}

export interface AssistantState{
 currentDay?:TripDay;
 currentDayIndex:number;
 currentActivity?:ItineraryItem;
 nextItem?:ItineraryItem;
 nextReservation?:ItineraryItem;
 nextReservationAt?:Date;
 leaveBy?:Date;
 availableMinutes:number;
 status:AssistantStatus;
 headline:string;
 subheadline:string;
 suggestions:SuggestedPlace[];
 notices:AssistantNotice[];
 allRemainingFlexible:boolean;
 suggestionAnchor?:ItineraryItem;
}

const DEFAULT_PREP_BUFFER=15;
const DEFAULT_TRAVEL_MINUTES=20;
const DEFAULT_ACTIVITY_MINUTES=60;
const WEEKDAYS:Weekday[]=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

const FIXED_WORDS=[
 'flight','depart','arrival','arrive','train','via rail','go train','bus','shuttle','ferry',
 'reservation','reserved','check-in','check in','checkout','check-out','game','kickoff',
 'tour','ticket','escape room','appointment','boarding','airport'
];

const FOOD_WORDS=['breakfast','lunch','dinner','brunch','coffee','restaurant','bakery','dessert','food'];
const TRAVEL_WORDS=['flight','train','bus','shuttle','ferry','airport','travel','transfer','check-in','check in'];
const CONTEXT_STOP_WORDS=new Set([
 'about','after','again','along','and','before','from','head','into','later','near','option',
 'then','there','this','through','toward','visit','with','your','toronto','niagara','buffalo','falls'
]);

function localDateKey(date:Date){
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function dateAtTime(date:string,time:string){
 const match=time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
 if(!match)return undefined;
 let hour=Number(match[1]);
 const minute=Number(match[2]??0);
 const suffix=match[3]?.toUpperCase();
 if(suffix==='PM'&&hour<12)hour+=12;
 if(suffix==='AM'&&hour===12)hour=0;
 if(hour>23||minute>59)return undefined;
 const [year,month,day]=date.split('-').map(Number);
 if(!year||!month||!day)return undefined;
 return new Date(year,month-1,day,hour,minute,0,0);
}

function minutesBetween(from:Date,to:Date){
 return Math.floor((to.getTime()-from.getTime())/60000);
}

function itemText(item:ItineraryItem){
 return `${item.title} ${item.details??''} ${item.keyInfo??''}`.toLowerCase();
}

function meaningfulTokens(value:string){
 return [...new Set(value.toLowerCase().match(/[a-z0-9]+/g)??[])]
  .filter(token=>token.length>=4&&!CONTEXT_STOP_WORDS.has(token));
}

function placeText(place:Place){
 return `${place.name} ${place.area??''} ${place.category} ${place.notes} ${place.tags.join(' ')}`.toLowerCase();
}

function normalizedPlaceName(value:string){
 return value.toLowerCase().replace(/[^a-z0-9]/g,'');
}

function placeHasCoordinates(place?:Place):place is Place&{latitude:number;longitude:number}{
 return Boolean(place&&Number.isFinite(place.latitude)&&Number.isFinite(place.longitude));
}

function placeForItem(state:TripState,item?:ItineraryItem){
 if(!item||item.locationNotNeeded)return undefined;
 if(item.placeId){
  const linked=state.places.find(place=>place.id===item.placeId);
  if(linked)return linked;
 }
 const destination=normalizedPlaceName(item.destination??'');
 const title=normalizedPlaceName(item.title);
 return state.places.find(place=>{
  const name=normalizedPlaceName(place.name);
  return Boolean(name&&((destination&&destination===name)||title===name));
 })??state.places.find(place=>{
  const name=normalizedPlaceName(place.name);
  return name.length>=6&&Boolean((destination&&destination.includes(name))||title.includes(name));
 });
}

export function distanceBetweenCoordinates(from:{latitude:number;longitude:number},to:{latitude:number;longitude:number}){
 const radians=(degrees:number)=>degrees*Math.PI/180;
 const earthRadiusKm=6371;
 const latitudeDelta=radians(to.latitude-from.latitude);
 const longitudeDelta=radians(to.longitude-from.longitude);
 const startLatitude=radians(from.latitude);
 const endLatitude=radians(to.latitude);
 const a=Math.sin(latitudeDelta/2)**2+Math.cos(startLatitude)*Math.cos(endLatitude)*Math.sin(longitudeDelta/2)**2;
 return earthRadiusKm*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

export function distanceBetweenPlaces(from:Place,to:Place){
 if(!placeHasCoordinates(from)||!placeHasCoordinates(to))return undefined;
 return distanceBetweenCoordinates(from,to);
}

export function approximateWalkingMinutes(distanceKm:number){
 return Math.max(1,Math.round(distanceKm*16));
}

export function distanceLabel(distanceKm:number){
 if(distanceKm<1)return `${Math.max(50,Math.round(distanceKm*1000/50)*50)} m away`;
 return `${distanceKm.toFixed(distanceKm<10?1:0)} km away`;
}

function suggestionFamily(place:Place){
 const text=placeText(place);
 if(/bakery|candy|chocolate|dessert|ice cream|sweet/.test(text))return 'dessert';
 if(/bar|cafe|coffee|diner|food|pizza|restaurant|seafood|steak|taco/.test(text))return 'food';
 if(/gallery|museum|historic|history|library|theatre|theater/.test(text))return 'culture';
 if(/garden|island|park|trail|waterfront|viewpoint|falls/.test(text))return 'outdoors';
 if(/market|mall|shop|shopping|store/.test(text))return 'shopping';
 if(/station|transit|airport|terminal|bridge/.test(text))return 'transit';
 return place.category.trim().toLowerCase()||'other';
}

export function inferItemType(item:ItineraryItem):AssistantItemType{
 const smart=item as SmartItineraryItem;
 if(smart.type)return smart.type;
 const text=itemText(item);
 if(/hotel|check-in|check in|checkout|check-out/.test(text))return 'hotel';
 if(TRAVEL_WORDS.some(word=>text.includes(word)))return 'travel';
 if(FOOD_WORDS.some(word=>text.includes(word)))return 'food';
 if(FIXED_WORDS.some(word=>text.includes(word)))return 'reservation';
 return 'activity';
}

export function isFixedItem(item:ItineraryItem){
 const smart=item as SmartItineraryItem;
 if(typeof smart.fixed==='boolean')return smart.fixed;
 if(item.optional)return false;
 return FIXED_WORDS.some(word=>itemText(item).includes(word));
}

export function estimatedItemDuration(item:ItineraryItem){
 const smart=item as SmartItineraryItem;
 if(smart.estimatedDuration&&smart.estimatedDuration>0)return smart.estimatedDuration;
 const type=inferItemType(item);
 if(type==='food')return 60;
 if(type==='travel')return 90;
 if(type==='hotel')return 30;
 if(type==='reservation')return 90;
 return DEFAULT_ACTIVITY_MINUTES;
}

export function estimatedPlaceDuration(place:Place){
 const smart=place as SmartPlace;
 if(smart.estimatedDuration&&smart.estimatedDuration>0)return smart.estimatedDuration;
 const text=`${place.category} ${place.notes} ${place.tags.join(' ')}`.toLowerCase();
 if(/coffee|bakery|dessert|snack/.test(text))return 30;
 if(/restaurant|lunch|dinner|brunch|food/.test(text))return 60;
 if(/park|market|shop|shopping|viewpoint/.test(text))return 45;
 if(/museum|gallery|aquarium|zoo|tour/.test(text))return 90;
 return 60;
}

function clockMinutes(value:string){
 const match=value.match(/^(\d{1,2}):(\d{2})$/);
 if(!match)return undefined;
 return Number(match[1])*60+Number(match[2]);
}

export function placeOpenStatus(place:Place,now:Date){
 if(place.ignoreHours)return {status:'ignored' as const};
 let weekday=WEEKDAYS[now.getDay()];
 let current=now.getHours()*60+now.getMinutes();
 try{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:place.hoursTimeZone??'America/Toronto',weekday:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const weekdayName=parts.find(part=>part.type==='weekday')?.value.toLowerCase() as Weekday|undefined;
  const hour=Number(parts.find(part=>part.type==='hour')?.value);
  const minute=Number(parts.find(part=>part.type==='minute')?.value);
  if(weekdayName&&WEEKDAYS.includes(weekdayName))weekday=weekdayName;
  if(Number.isFinite(hour)&&Number.isFinite(minute))current=hour*60+minute;
 }catch{}
 const hours=place.weeklyHours?.[weekday];
 if(!hours)return {status:'unknown' as const};
 if(hours.closed)return {status:'closed' as const};
 const intervals=hours.intervals?.length?hours.intervals:[{open:hours.open,close:hours.close}];
 let longestUntilClose:number|undefined;
 for(const interval of intervals){
  const open=clockMinutes(interval.open);
  const close=clockMinutes(interval.close);
  if(open===undefined||close===undefined)continue;
  const overnight=close<=open;
  const openNow=overnight?current>=open||current<close:current>=open&&current<close;
  if(!openNow)continue;
  const minutesUntilClose=overnight?(current>=open?24*60-current+close:close-current):close-current;
  longestUntilClose=Math.max(longestUntilClose??0,minutesUntilClose);
 }
 if(longestUntilClose!==undefined)return {status:'open' as const,minutesUntilClose:longestUntilClose};
 return {status:'closed' as const};
}

export function findCurrentDay(state:TripState,now:Date){
 const key=localDateKey(now);
 const exact=state.days.findIndex(day=>day.date===key);
 if(exact>=0)return {day:state.days[exact],index:exact};
 const future=state.days.findIndex(day=>day.date>key);
 if(future>=0)return {day:state.days[future],index:future};
 return {day:state.days[state.days.length-1],index:Math.max(0,state.days.length-1)};
}

function scheduledItems(day:TripDay){
 return day.items
  .map(item=>({item,at:dateAtTime(day.date,item.time)}))
  .filter((entry):entry is {item:ItineraryItem;at:Date}=>Boolean(entry.at))
  .sort((a,b)=>a.at.getTime()-b.at.getTime());
}

export function findCurrentActivity(day:TripDay,now:Date){
 return scheduledItems(day).find(({item,at})=>{
  if(item.done)return false;
  const end=new Date(at.getTime()+estimatedItemDuration(item)*60000);
  return now>=at&&now<end;
 });
}

export function findNextItem(day:TripDay,now:Date){
 return scheduledItems(day).find(({item,at})=>!item.done&&at>now);
}

export function findNextReservation(day:TripDay,now:Date){
 return scheduledItems(day).find(({item,at})=>!item.done&&isFixedItem(item)&&at>now);
}

export function findPreviousItem(day:TripDay,now:Date){
 return scheduledItems(day).filter(({at})=>at<=now).at(-1);
}

export function calculateLeaveBy(item:ItineraryItem,at:Date){
 const smart=item as SmartItineraryItem;
 const travel=Math.max(0,smart.travelMinutes??DEFAULT_TRAVEL_MINUTES);
 const prep=Math.max(0,smart.prepBuffer??DEFAULT_PREP_BUFFER);
 return new Date(at.getTime()-(travel+prep)*60000);
}

function placeMatchesDay(place:Place,day:TripDay){
 if(place.recommendedDates?.length)return place.recommendedDates.includes(day.date);
 if(day.city.includes('Toronto'))return place.region==='Toronto';
 if(day.city.includes('Buffalo')||day.city.includes('Niagara'))return place.region==='Niagara & Buffalo';
 return true;
}

export function scoreSuggestion(place:Place,day:TripDay,availableMinutes:number,context:SuggestionContext={}){
 const duration=estimatedPlaceDuration(place);
 const reasons:string[]=[];
 let score=0;
 if(place.visited)return {score:-1000,reasons,duration};
 if(context.now){
  const openStatus=placeOpenStatus(place,context.now);
  if(openStatus.status==='closed')return {score:-1000,reasons:['Closed at this time'],duration};
  if(openStatus.status==='open'&&openStatus.minutesUntilClose<duration)return {score:-1000,reasons:['Closes too soon for the estimated visit'],duration};
  if(openStatus.status==='open'){score+=16;reasons.push('Open now and long enough for this visit');}
  else if(openStatus.status==='unknown'){score-=6;reasons.push('Hours are not saved yet — check before going');}
  else if(openStatus.status==='ignored')reasons.push('No opening-hours check needed');
 }
 if(place.priority==='must'){score+=40;reasons.push('One of your Must Do places');}
 else if(place.priority==='possible'){score+=20;reasons.push('A saved option you were considering');}
 else {score+=5;reasons.push('A useful backup option');}
 if(place.recommendedDates?.includes(day.date)){score+=30;reasons.push('Recommended for this day');}
 if(placeMatchesDay(place,day)){score+=15;reasons.push(`Fits your ${day.city} plans`);}
 const anchorLocation=context.location??(placeHasCoordinates(context.anchorPlace)?{latitude:context.anchorPlace.latitude,longitude:context.anchorPlace.longitude,label:context.anchorPlace.name}:undefined);
 const anchorArea=context.anchorArea??(context.anchorPlace?(context.anchorPlace.area??suggestPlaceArea(context.anchorPlace)):undefined);
 const placeArea=place.area??suggestPlaceArea(place);
 if(anchorArea&&placeArea===anchorArea){
  score+=18;
  reasons.push(`In the same neighborhood: ${placeArea}`);
 }else if(anchorArea&&placeArea){
  score-=8;
 }
 const distanceKm=anchorLocation&&placeHasCoordinates(place)?distanceBetweenCoordinates(anchorLocation,place):undefined;
 const walkingMinutes=distanceKm!==undefined?approximateWalkingMinutes(distanceKm):undefined;
 if(distanceKm!==undefined){
  if(distanceKm<=0.5)score+=32;
  else if(distanceKm<=1)score+=25;
  else if(distanceKm<=2)score+=15;
  else if(distanceKm<=4)score+=5;
  else if(distanceKm>8)score-=30;
  reasons.push(`${distanceLabel(distanceKm)} from ${anchorLocation?.label}${walkingMinutes!==undefined?` · about ${walkingMinutes} min walking`:''}`);
 }else if(context.location){
  score-=10;
 }
 if(context.anchor){
  const anchorTokens=meaningfulTokens(`${context.anchor.title} ${context.anchor.destination??''} ${context.anchor.details??''}`);
  const candidateText=placeText(place);
  const overlap=anchorTokens.filter(token=>candidateText.includes(token)).length;
  if(overlap>0){
   score+=Math.min(20,overlap*8);
   reasons.push(`Matches your ${context.anchor.title} plans`);
  }
 }
 if(availableMinutes>=duration+15){score+=30;reasons.push('Fits comfortably before your next scheduled event');}
 else if(availableMinutes>=duration){score+=15;reasons.push('Fits within the available time');}
 else {score-=40;reasons.push('May be tight for the available time');}
 return {score,reasons,duration,distanceKm,walkingMinutes};
}

export function findSuggestionCandidates(state:TripState,day:TripDay,availableMinutes:number,limit=3,context:SuggestionContext={}):SuggestedPlace[]{
 const anchorPlace=context.anchorPlace??placeForItem(state,context.anchor);
 const scoredContext={...context,anchorPlace};
 const ranked=state.places
  .filter(place=>!place.visited&&place.id!==anchorPlace?.id&&placeMatchesDay(place,day))
  .map(place=>{
   const result=scoreSuggestion(place,day,availableMinutes,scoredContext);
   return {place,score:result.score,reasons:result.reasons,reason:result.reasons.join(' • '),estimatedDuration:result.duration,distanceKm:result.distanceKm,walkingMinutes:result.walkingMinutes};
  })
  .filter(item=>item.score>0&&item.estimatedDuration<=Math.max(availableMinutes,30))
  .sort((a,b)=>b.score-a.score||(a.distanceKm??Number.POSITIVE_INFINITY)-(b.distanceKm??Number.POSITIVE_INFINITY)||a.estimatedDuration-b.estimatedDuration||a.place.name.localeCompare(b.place.name));

 const selected:SuggestedPlace[]=[];
 const usedFamilies=new Set<string>();
 for(const suggestion of ranked){
  const family=suggestionFamily(suggestion.place);
  if(usedFamilies.has(family))continue;
  selected.push(suggestion);
  usedFamilies.add(family);
  if(selected.length===limit)return selected;
 }
 for(const suggestion of ranked){
  if(selected.some(item=>item.place.id===suggestion.place.id))continue;
  selected.push(suggestion);
  if(selected.length===limit)break;
 }
 return selected;
}

export function findNearbyPlaces(
 state:TripState,
 day:TripDay,
 now:Date,
 location:AssistantLocation|undefined,
 filters:NearbyFilters={},
 limit=60
):SuggestedPlace[]{
 const availableMinutes=filters.availableMinutes??180;
 const needle=filters.query?.trim().toLowerCase()??'';
 return state.places
  .filter(place=>{
   if(!filters.includeVisited&&place.visited)return false;
   if(filters.region&&filters.region!=='All'&&place.region!==filters.region)return false;
   if(filters.area&&filters.area!=='All'&&(place.area??suggestPlaceArea(place))!==filters.area)return false;
   if(filters.category&&filters.category!=='All'&&place.category!==filters.category)return false;
   if(filters.priority&&filters.priority!=='All'&&place.priority!==filters.priority)return false;
   if(needle&&!placeText(place).includes(needle))return false;
   const open=placeOpenStatus(place,now);
   if(filters.openNowOnly&&!['open','ignored'].includes(open.status))return false;
   return true;
  })
  .map(place=>{
   const result=scoreSuggestion(place,day,availableMinutes,{
    location,
    anchorArea:filters.area&&filters.area!=='All'?filters.area:undefined
   });
   const distanceKm=location&&placeHasCoordinates(place)?distanceBetweenCoordinates(location,place):undefined;
   return {
    place,
    score:result.score,
    reasons:result.reasons,
    reason:result.reasons.join(' • '),
    estimatedDuration:result.duration,
    distanceKm,
    walkingMinutes:distanceKm===undefined?undefined:approximateWalkingMinutes(distanceKm)
   };
  })
  .filter(suggestion=>{
   if(suggestion.estimatedDuration>availableMinutes)return false;
   if(filters.maxDistanceKm!==undefined&&suggestion.distanceKm!==undefined&&suggestion.distanceKm>filters.maxDistanceKm)return false;
   return true;
  })
  .sort((a,b)=>{
   if(location){
    const distance=(a.distanceKm??Number.POSITIVE_INFINITY)-(b.distanceKm??Number.POSITIVE_INFINITY);
    if(distance!==0)return distance;
   }
   return b.score-a.score||a.estimatedDuration-b.estimatedDuration||a.place.name.localeCompare(b.place.name);
  })
  .slice(0,limit);
}

function greeting(now:Date){
 const hour=now.getHours();
 if(hour<12)return 'Good morning.';
 if(hour<17)return 'Good afternoon.';
 return 'Good evening.';
}

function buildPresentation(args:{
 now:Date;day:TripDay;current?:{item:ItineraryItem;at:Date};next?:{item:ItineraryItem;at:Date};reservation?:{item:ItineraryItem;at:Date};leaveBy?:Date;availableMinutes:number;allRemainingFlexible:boolean;
}){
 const {now,day,current,next,reservation,leaveBy,availableMinutes,allRemainingFlexible}=args;
 const notices:AssistantNotice[]=[];
 let status:AssistantStatus='relax';
 let headline=greeting(now);
 let subheadline='There is nothing you need to rush toward right now.';

 if(current){
  status='activity';
  headline=`You may be at ${current.item.title}.`;
  subheadline=reservation?`Your next fixed event is ${reservation.item.title} at ${reservation.item.time}.`:'Everything else today is flexible.';
 }else if(reservation&&leaveBy){
  const leaveIn=minutesBetween(now,leaveBy);
  if(leaveIn<=0){status='leaveNow';headline=`It may be time to head toward ${reservation.item.title}.`;subheadline=`It is scheduled for ${reservation.item.time}.`;notices.push({type:'travel',message:'Open transit directions when you are ready to go.'});}
  else if(leaveIn<=20){status='leaveSoon';headline=`You may want to leave for ${reservation.item.title} soon.`;subheadline=`You have about ${leaveIn} minutes before the suggested leave time.`;notices.push({type:'timing',message:`Suggested departure is around ${leaveBy.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}.`});}
  else if(availableMinutes>=45){status='explore';headline=`You have about ${availableMinutes} minutes before you need to head out.`;subheadline=`Your next fixed event is ${reservation.item.title} at ${reservation.item.time}.`;}
  else {status='relax';headline=`You have time before ${reservation.item.title}.`;subheadline=`It is scheduled for ${reservation.item.time}.`;}
 }else if(next){
  status='explore';
  headline='Everything coming up is flexible.';
  subheadline=`Your next idea is ${next.item.title} at ${next.item.time}, but there is no fixed commitment attached to it.`;
 }else{
  status='finished';
  headline='The rest of the day is open.';
  subheadline=`There are no remaining scheduled items for ${day.city}.`;
 }

 if(allRemainingFlexible&&next)notices.push({type:'info',message:'Everything remaining today can be adjusted or skipped.'});
 return {status,headline,subheadline,notices};
}

export function buildAssistantState(state:TripState,now=new Date(),location?:AssistantLocation):AssistantState{
 if(!state.days.length){return {currentDayIndex:0,availableMinutes:0,status:'finished',headline:'No itinerary yet.',subheadline:'Add a day to begin using the trip assistant.',suggestions:[],notices:[],allRemainingFlexible:true};}
 const found=findCurrentDay(state,now);
 const day=found.day;
 const tripStart=new Date(`${state.days[0].date}T00:00:00`);
 if(now<tripStart){return {currentDay:day,currentDayIndex:found.index,availableMinutes:0,status:'beforeTrip',headline:'Your trip is coming up.',subheadline:`The first day begins ${state.days[0].label}.`,suggestions:[],notices:[],allRemainingFlexible:false};}
 const current=findCurrentActivity(day,now);
 const next=findNextItem(day,now);
 const reservation=findNextReservation(day,now);
 const previous=findPreviousItem(day,now);
 const leaveBy=reservation?calculateLeaveBy(reservation.item,reservation.at):undefined;
 const availableMinutes=leaveBy?Math.max(0,minutesBetween(now,leaveBy)):next?Math.max(0,minutesBetween(now,next.at)):0;
 const remaining=day.items.filter(item=>!item.done);
 const allRemainingFlexible=remaining.length>0&&remaining.every(item=>!isFixedItem(item));
 const presentation=buildPresentation({now,day,current,next,reservation,leaveBy,availableMinutes,allRemainingFlexible});
 const suggestionAnchor=current?.item??previous?.item??next?.item;
 const suggestions=(presentation.status==='explore'||presentation.status==='relax')&&availableMinutes>=30?findSuggestionCandidates(state,day,availableMinutes,3,{anchor:suggestionAnchor,location,now}):[];
 return {
  currentDay:day,
  currentDayIndex:found.index,
  currentActivity:current?.item,
  nextItem:next?.item,
  nextReservation:reservation?.item,
  nextReservationAt:reservation?.at,
  leaveBy,
  availableMinutes,
  status:presentation.status,
  headline:presentation.headline,
  subheadline:presentation.subheadline,
  suggestions,
  notices:presentation.notices,
  allRemainingFlexible,
  suggestionAnchor
 };
}
