import type {ItineraryItem,ItineraryItemType,Place,TripDay,TripState} from '@/lib/types';

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
}

const DEFAULT_PREP_BUFFER=15;
const DEFAULT_TRAVEL_MINUTES=20;
const DEFAULT_ACTIVITY_MINUTES=60;

const FIXED_WORDS=[
 'flight','depart','arrival','arrive','train','via rail','go train','bus','shuttle','ferry',
 'reservation','reserved','check-in','check in','checkout','check-out','game','kickoff',
 'tour','ticket','escape room','appointment','boarding','airport'
];

const FOOD_WORDS=['breakfast','lunch','dinner','brunch','coffee','restaurant','bakery','dessert','food'];
const TRAVEL_WORDS=['flight','train','bus','shuttle','ferry','airport','travel','transfer','check-in','check in'];

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

function estimatedPlaceDuration(place:Place){
 const smart=place as SmartPlace;
 if(smart.estimatedDuration&&smart.estimatedDuration>0)return smart.estimatedDuration;
 const text=`${place.category} ${place.notes} ${place.tags.join(' ')}`.toLowerCase();
 if(/coffee|bakery|dessert|snack/.test(text))return 30;
 if(/restaurant|lunch|dinner|brunch|food/.test(text))return 60;
 if(/park|market|shop|shopping|viewpoint/.test(text))return 45;
 if(/museum|gallery|aquarium|zoo|tour/.test(text))return 90;
 return 60;
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

export function scoreSuggestion(place:Place,day:TripDay,availableMinutes:number){
 const duration=estimatedPlaceDuration(place);
 const reasons:string[]=[];
 let score=0;
 if(place.visited)return {score:-1000,reasons,duration};
 if(place.priority==='must'){score+=40;reasons.push('One of your Must Do places');}
 else if(place.priority==='possible'){score+=20;reasons.push('A saved option you were considering');}
 else {score+=5;reasons.push('A useful backup option');}
 if(place.recommendedDates?.includes(day.date)){score+=25;reasons.push('Recommended for this day');}
 if(placeMatchesDay(place,day)){score+=15;reasons.push(`Fits your ${day.city} plans`);}
 if(availableMinutes>=duration+15){score+=30;reasons.push('Fits comfortably before your next scheduled event');}
 else if(availableMinutes>=duration){score+=15;reasons.push('Fits within the available time');}
 else {score-=40;reasons.push('May be tight for the available time');}
 return {score,reasons,duration};
}

export function findSuggestionCandidates(state:TripState,day:TripDay,availableMinutes:number,limit=3):SuggestedPlace[]{
 return state.places
  .filter(place=>!place.visited&&placeMatchesDay(place,day))
  .map(place=>{
   const ranked=scoreSuggestion(place,day,availableMinutes);
   return {place,score:ranked.score,reasons:ranked.reasons,reason:ranked.reasons.join(' • '),estimatedDuration:ranked.duration};
  })
  .filter(item=>item.score>0&&item.estimatedDuration<=Math.max(availableMinutes,30))
  .sort((a,b)=>b.score-a.score||a.estimatedDuration-b.estimatedDuration)
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

export function buildAssistantState(state:TripState,now=new Date()):AssistantState{
 if(!state.days.length){return {currentDayIndex:0,availableMinutes:0,status:'finished',headline:'No itinerary yet.',subheadline:'Add a day to begin using the trip assistant.',suggestions:[],notices:[],allRemainingFlexible:true};}
 const found=findCurrentDay(state,now);
 const day=found.day;
 const tripStart=new Date(`${state.days[0].date}T00:00:00`);
 if(now<tripStart){return {currentDay:day,currentDayIndex:found.index,availableMinutes:0,status:'beforeTrip',headline:'Your trip is coming up.',subheadline:`The first day begins ${state.days[0].label}.`,suggestions:[],notices:[],allRemainingFlexible:false};}
 const current=findCurrentActivity(day,now);
 const next=findNextItem(day,now);
 const reservation=findNextReservation(day,now);
 const leaveBy=reservation?calculateLeaveBy(reservation.item,reservation.at):undefined;
 const availableMinutes=leaveBy?Math.max(0,minutesBetween(now,leaveBy)):next?Math.max(0,minutesBetween(now,next.at)):0;
 const remaining=day.items.filter(item=>!item.done);
 const allRemainingFlexible=remaining.length>0&&remaining.every(item=>!isFixedItem(item));
 const presentation=buildPresentation({now,day,current,next,reservation,leaveBy,availableMinutes,allRemainingFlexible});
 const suggestions=(presentation.status==='explore'||presentation.status==='relax')&&availableMinutes>=30?findSuggestionCandidates(state,day,availableMinutes):[];
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
  allRemainingFlexible
 };
}
