import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {validToken} from '@/lib/auth';
import {listTrips,loadState,saveState} from '@/lib/db';
import {newTripState,slugForTrip,type NewTripInput} from '@/lib/new-trip';

async function editorRequest(){return validToken((await cookies()).get('trip_auth')?.value);}

export async function GET(){
 try{
  const trips=await listTrips();
  return NextResponse.json({ok:true,trips});
 }catch(error){
  console.error('Trip catalog load failed.',error);
  return NextResponse.json({ok:false,trips:[],error:'Trips could not be loaded.'},{status:500});
 }
}

export async function POST(req:Request){
 if(!(await editorRequest()))return NextResponse.json({ok:false,error:'Editor access required'},{status:401});
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
  return NextResponse.json({ok:true,tripId,state});
 }catch(error){
  console.error('Trip creation failed.',error);
  return NextResponse.json({ok:false,error:'Trip could not be created.'},{status:500});
 }
}
