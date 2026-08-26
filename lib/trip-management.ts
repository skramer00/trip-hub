import type {TripDay,TripState} from './types';

export function tripDates(start:string,end:string){
 const out:string[]=[];
 const a=new Date(`${start}T12:00:00Z`),b=new Date(`${end}T12:00:00Z`);
 if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime())||b<a)return out;
 for(const d=new Date(a);d<=b;d.setUTCDate(d.getUTCDate()+1))out.push(d.toISOString().slice(0,10));
 return out;
}

export function tripDayLabel(date:string){return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric',timeZone:'UTC'});}

export function reshapeTripDays(state:TripState,start:string,end:string,destinations:string){
 const old=state.days;
 return tripDates(start,end).map((date,index):TripDay=>({date,label:tripDayLabel(date),city:old[index]?.city||destinations,items:old[index]?.items??[]}));
}

export function resetTripCopy(state:TripState,title:string,startDate:string,endDate:string){
 const copy=structuredClone(state);
 if(copy.settings){
  copy.settings.title=title;
  copy.settings.startDate=startDate;
  copy.settings.endDate=endDate;
  copy.settings.archived=false;
  copy.settings.onboardingCompleted=true;
  copy.settings.publicMessage=`Follow along with ${title}.`;
 }
 copy.days=reshapeTripDays(copy,startDate,endDate,copy.settings?.destinations||'').map(day=>({...day,items:day.items.map(item=>({...item,done:false,completedAt:undefined,skipped:false,skippedAt:undefined,lastRescheduledAt:undefined,rescheduledFromDate:undefined}))}));
 copy.foods=copy.foods.map(item=>({...item,done:false,triedAt:undefined,triedAtPlaceId:undefined,completedAt:undefined}));
 copy.packing=copy.packing.map(item=>({...item,done:false,completedAt:undefined}));
 copy.places=copy.places.map(place=>({...place,visited:false,visitedAt:undefined}));
 copy.mealBalanceByDate={};
 copy.journalNotesByDate={};
 copy.journalMoments=[];
 copy.readinessIgnoredActionIds=[];
 return copy;
}
