import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {validToken} from '@/lib/auth';
import {deleteState,loadState,saveState} from '@/lib/db';
import {normalizeTripId} from '@/lib/trips';
import {slugForTrip} from '@/lib/new-trip';
import type {TripDay,TripState} from '@/lib/types';

async function editorRequest(){return validToken((await cookies()).get('trip_auth')?.value);}
function dates(start:string,end:string){const out:string[]=[];const a=new Date(`${start}T12:00:00Z`),b=new Date(`${end}T12:00:00Z`);for(const d=new Date(a);d<=b;d.setUTCDate(d.getUTCDate()+1))out.push(d.toISOString().slice(0,10));return out;}
function label(date:string){return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric',timeZone:'UTC'});}
function reshapeDays(state:TripState,start:string,end:string,destinations:string){const old=state.days;return dates(start,end).map((date,index):TripDay=>({date,label:label(date),city:old[index]?.city||destinations,items:old[index]?.items??[]}));}
function resetCopy(state:TripState,title:string,startDate:string,endDate:string){const copy=structuredClone(state);if(copy.settings){copy.settings.title=title;copy.settings.startDate=startDate;copy.settings.endDate=endDate;copy.settings.archived=false;copy.settings.publicMessage=`Follow along with ${title}.`;}
 copy.days=reshapeDays(copy,startDate,endDate,copy.settings?.destinations||'').map(day=>({...day,items:day.items.map(item=>({...item,done:false,completedAt:undefined,skipped:false,skippedAt:undefined,lastRescheduledAt:undefined,rescheduledFromDate:undefined}))}));
 copy.foods=copy.foods.map(item=>({...item,done:false,triedAt:undefined,triedAtPlaceId:undefined,completedAt:undefined}));
 copy.packing=copy.packing.map(item=>({...item,done:false,completedAt:undefined}));
 copy.places=copy.places.map(place=>({...place,visited:false,visitedAt:undefined}));
 copy.mealBalanceByDate={};copy.journalNotesByDate={};copy.journalMoments=[];copy.readinessIgnoredActionIds=[];
 return copy;
}

export async function PATCH(req:Request,{params}:{params:Promise<{tripId:string}>}){
 if(!(await editorRequest()))return NextResponse.json({ok:false,error:'Editor access required'},{status:401});
 const {tripId}=await params;const id=normalizeTripId(tripId);const state=await loadState(id);if(!state)return NextResponse.json({ok:false,error:'Trip not found'},{status:404});
 const body=await req.json() as {title?:string;destinations?:string;startDate?:string;endDate?:string;tripTimeZone?:string;archived?:boolean};
 const next=structuredClone(state);if(!next.settings)return NextResponse.json({ok:false,error:'Trip settings missing'},{status:400});
 const start=body.startDate??next.settings.startDate,end=body.endDate??next.settings.endDate;if(end<start)return NextResponse.json({ok:false,error:'End date must be on or after start date.'},{status:400});
 if(body.title?.trim())next.settings.title=body.title.trim();if(body.destinations?.trim())next.settings.destinations=body.destinations.trim();if(body.tripTimeZone)next.settings.tripTimeZone=body.tripTimeZone;if(typeof body.archived==='boolean')next.settings.archived=body.archived;
 if(start!==next.settings.startDate||end!==next.settings.endDate){next.days=reshapeDays(next,start,end,next.settings.destinations);next.settings.startDate=start;next.settings.endDate=end;}
 await saveState(next,id);return NextResponse.json({ok:true,state:next});
}

export async function POST(req:Request,{params}:{params:Promise<{tripId:string}>}){
 if(!(await editorRequest()))return NextResponse.json({ok:false,error:'Editor access required'},{status:401});
 const {tripId}=await params;const id=normalizeTripId(tripId);const state=await loadState(id);if(!state)return NextResponse.json({ok:false,error:'Trip not found'},{status:404});
 const body=await req.json() as {action?:string;title?:string;startDate?:string;endDate?:string};if(body.action!=='duplicate')return NextResponse.json({ok:false,error:'Unsupported action'},{status:400});
 const title=body.title?.trim()||`${state.settings?.title||'Trip'} copy`;const startDate=body.startDate||state.settings?.startDate||'',endDate=body.endDate||state.settings?.endDate||startDate;
 const next=resetCopy(state,title,startDate,endDate);let copyId=slugForTrip({title,startDate});let suffix=2;while(await loadState(copyId))copyId=`${slugForTrip({title,startDate})}-${suffix++}`;await saveState(next,copyId);return NextResponse.json({ok:true,tripId:copyId});
}

export async function DELETE(_req:Request,{params}:{params:Promise<{tripId:string}>}){
 if(!(await editorRequest()))return NextResponse.json({ok:false,error:'Editor access required'},{status:401});const {tripId}=await params;await deleteState(normalizeTripId(tripId));return NextResponse.json({ok:true});
}
