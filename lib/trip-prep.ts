import type {CheckItem,TripState} from '@/lib/types';

export type PrepDueStatus='overdue'|'today'|'soon'|'later'|'unscheduled';

function localDate(value:Date){return new Date(value.getFullYear(),value.getMonth(),value.getDate());}
function parseDate(value?:string){
 if(!value)return undefined;
 const [year,month,day]=value.split('-').map(Number);
 if(!year||!month||!day)return undefined;
 return new Date(year,month-1,day);
}
function dateOffset(value:string,days:number){
 const date=parseDate(value);
 if(!date)return '';
 date.setDate(date.getDate()+days);
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function isPrepTask(item:CheckItem){return item.checklistType==='prep';}
export function isBucketItem(item:CheckItem){return item.checklistType==='bucket';}
export function prepTasks(state:Pick<TripState,'packing'>){return state.packing.filter(isPrepTask);}
export function packingItems(state:Pick<TripState,'packing'>){return state.packing.filter(item=>!isPrepTask(item)&&!isBucketItem(item));}
export function bucketItems(state:Pick<TripState,'packing'>){return state.packing.filter(isBucketItem);}

export function prepDueStatus(item:CheckItem,now=new Date()):PrepDueStatus{
 const due=parseDate(item.dueDate);
 if(!due)return 'unscheduled';
 const days=Math.round((due.getTime()-localDate(now).getTime())/86400000);
 if(days<0)return 'overdue';
 if(days===0)return 'today';
 if(days<=7)return 'soon';
 return 'later';
}

export function formatPrepDueDate(item:CheckItem,now=new Date()){
 const due=parseDate(item.dueDate);
 if(!due)return 'No due date';
 const status=prepDueStatus(item,now);
 if(status==='overdue')return `Overdue · ${due.toLocaleDateString([],{month:'short',day:'numeric'})}`;
 if(status==='today')return 'Due today';
 return `Due ${due.toLocaleDateString([],{month:'short',day:'numeric'})}`;
}

export function nextPrepTask(state:Pick<TripState,'packing'>,now=new Date()){
 const rank:Record<PrepDueStatus,number>={overdue:0,today:1,soon:2,later:3,unscheduled:4};
 return prepTasks(state).filter(item=>!item.done).toSorted((a,b)=>{
  const statusDifference=rank[prepDueStatus(a,now)]-rank[prepDueStatus(b,now)];
  if(statusDifference)return statusDifference;
  return (a.dueDate??'9999-12-31').localeCompare(b.dueDate??'9999-12-31')||a.title.localeCompare(b.title);
 })[0];
}

const suggestedTasks=[
 {id:'transport',title:'Confirm local and event transportation',category:'Transportation',offset:-21,notes:'Verify any shuttles, trains, buses, or transfers tied to fixed plans.'},
 {id:'reservations',title:'Review reservations and ticket access',category:'Reservations',offset:-14,notes:'Confirm times, seats, confirmation details, and how each ticket will be opened.'},
 {id:'offline',title:'Download offline maps, tickets, and confirmations',category:'Offline access',offset:-7,notes:'Keep the essentials available even without reliable service.'},
 {id:'conditions',title:'Check weather and service advisories',category:'Final checks',offset:-3,notes:'Review the forecast plus any relevant transit or venue notices.'},
 {id:'documents',title:'Complete final document check',category:'Final checks',offset:-1,notes:'Put passports, IDs, payment cards, and essential documents where they are easy to reach.'},
] as const;

export function suggestedPrepChecklist(startDate:string,existing:CheckItem[]){
 const existingTitles=new Set(existing.map(item=>item.title.trim().toLowerCase()));
 return suggestedTasks.filter(task=>!existingTitles.has(task.title.toLowerCase())).map(task=>({
  id:`prep-${task.id}`,
  title:task.title,
  category:task.category,
  done:false,
  notes:task.notes,
  checklistType:'prep' as const,
  dueDate:dateOffset(startDate,task.offset)||undefined,
 }));
}
