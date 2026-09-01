import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {validToken} from '@/lib/auth';
import {accountCanEdit,accountIsOwner,accountStorageTripId,currentAccount,ensureTripAccessRow} from '@/lib/account-auth';
import {db,deleteState,loadState,saveState} from '@/lib/db';
import {normalizeTripId} from '@/lib/trips';
import {slugForTrip} from '@/lib/new-trip';
import {reshapeTripDays,resetTripCopy} from '@/lib/trip-management';

async function masterEditor(){return validToken((await cookies()).get('trip_auth')?.value);}
async function canEdit(tripId:string){return (await masterEditor())||await accountCanEdit(tripId);}
async function canOwn(tripId:string){return (await masterEditor())||await accountIsOwner(tripId);}

export async function PATCH(req:Request,{params}:{params:Promise<{tripId:string}>}){
 const {tripId}=await params;const id=normalizeTripId(tripId);if(!(await canEdit(id)))return NextResponse.json({ok:false,error:'Editor access required'},{status:401});
 const state=await loadState(id);if(!state)return NextResponse.json({ok:false,error:'Trip not found'},{status:404});
 const body=await req.json() as {title?:string;destinations?:string;startDate?:string;endDate?:string;tripTimeZone?:string;archived?:boolean};
 if(typeof body.archived==='boolean'&&!(await canOwn(id)))return NextResponse.json({ok:false,error:'Owner access is required to archive this trip.'},{status:403});
 const next=structuredClone(state);if(!next.settings)return NextResponse.json({ok:false,error:'Trip settings missing'},{status:400});
 const start=body.startDate??next.settings.startDate,end=body.endDate??next.settings.endDate;if(end<start)return NextResponse.json({ok:false,error:'End date must be on or after start date.'},{status:400});
 if(body.title?.trim())next.settings.title=body.title.trim();if(body.destinations?.trim())next.settings.destinations=body.destinations.trim();if(body.tripTimeZone)next.settings.tripTimeZone=body.tripTimeZone;if(typeof body.archived==='boolean')next.settings.archived=body.archived;
 if(start!==next.settings.startDate||end!==next.settings.endDate){next.days=reshapeTripDays(next,start,end,next.settings.destinations);next.settings.startDate=start;next.settings.endDate=end;}
 await saveState(next,id);return NextResponse.json({ok:true,state:next});
}

export async function POST(req:Request,{params}:{params:Promise<{tripId:string}>}){
 const {tripId}=await params;const id=normalizeTripId(tripId);if(!(await canEdit(id)))return NextResponse.json({ok:false,error:'Editor access required'},{status:401});
 const state=await loadState(id);if(!state)return NextResponse.json({ok:false,error:'Trip not found'},{status:404});
 const body=await req.json() as {action?:string;title?:string;startDate?:string;endDate?:string};if(body.action!=='duplicate')return NextResponse.json({ok:false,error:'Unsupported action'},{status:400});
 const title=body.title?.trim()||`${state.settings?.title||'Trip'} copy`;const startDate=body.startDate||state.settings?.startDate||'',endDate=body.endDate||state.settings?.endDate||startDate;
 const next=resetTripCopy(state,title,startDate,endDate);let copyId=slugForTrip({title,startDate});let suffix=2;while(await loadState(copyId))copyId=`${slugForTrip({title,startDate})}-${suffix++}`;await saveState(next,copyId);
 const account=await currentAccount();if(account){await ensureTripAccessRow(copyId);await db().from('trip_members').upsert({trip_id:accountStorageTripId(copyId),user_id:account.id,role:'owner'},{onConflict:'trip_id,user_id'});}
 return NextResponse.json({ok:true,tripId:copyId});
}

export async function DELETE(_req:Request,{params}:{params:Promise<{tripId:string}>}){
 const {tripId}=await params;const id=normalizeTripId(tripId);if(!(await canOwn(id)))return NextResponse.json({ok:false,error:'Owner access required'},{status:403});await deleteState(id);return NextResponse.json({ok:true});
}
