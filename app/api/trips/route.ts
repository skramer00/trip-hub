import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {validToken} from '@/lib/auth';
import {accountStorageTripId,currentAccount,ensureTripAccessRow,membershipsForUser} from '@/lib/account-auth';
import {db,listTrips,loadState,saveState} from '@/lib/db';
import {newTripState,slugForTrip,type NewTripInput} from '@/lib/new-trip';

async function masterEditor(){return validToken((await cookies()).get('trip_auth')?.value);}

export async function GET(){
 try{
  const account=await currentAccount();const master=await masterEditor();const all=await listTrips();
  if(account){const memberships=await membershipsForUser(account.id);const roles=new Map(memberships.map(item=>[item.tripId,item.role]));const trips=all.filter(trip=>roles.has(trip.id)).map(trip=>({...trip,accessRole:roles.get(trip.id)}));return NextResponse.json({ok:true,trips,account:{email:account.email,name:account.name}});}
  if(master)return NextResponse.json({ok:true,trips:all.map(trip=>({...trip,accessRole:'owner'})),legacyOwner:true});
  return NextResponse.json({ok:true,trips:[]});
 }catch(error){
  console.error('Trip catalog load failed.',error);
  return NextResponse.json({ok:false,trips:[],error:'Trips could not be loaded.'},{status:500});
 }
}

export async function POST(req:Request){
 const account=await currentAccount();
 if(!account&&!(await masterEditor()))return NextResponse.json({ok:false,error:'Sign in or unlock owner access to create a trip.'},{status:401});
 try{
  const input=await req.json() as NewTripInput;
  if(!input.title?.trim()||!input.destinations?.trim()||!input.startDate||!input.endDate||!input.tripTimeZone)return NextResponse.json({ok:false,error:'Title, destinations, dates, and trip timezone are required.'},{status:400});
  if(input.endDate<input.startDate)return NextResponse.json({ok:false,error:'End date must be on or after the start date.'},{status:400});
  const base=slugForTrip(input);
  let tripId=base;
  let suffix=2;
  while(await loadState(tripId)){tripId=`${base}-${suffix++}`;}
  const state=newTripState(input);
  await saveState(state,tripId);
  await ensureTripAccessRow(tripId,'private');
  if(account)await db().from('trip_members').upsert({trip_id:accountStorageTripId(tripId),user_id:account.id,role:'owner'},{onConflict:'trip_id,user_id'});
  return NextResponse.json({ok:true,tripId,state});
 }catch(error){
  console.error('Trip creation failed.',error);
  return NextResponse.json({ok:false,error:'Trip could not be created.'},{status:500});
 }
}
