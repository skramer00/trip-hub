import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {loadState,saveState} from '@/lib/db';
import {validToken} from '@/lib/auth';
import {publicTripState} from '@/lib/public-state';
import type {TripState} from '@/lib/types';
import {validateTripState} from '@/lib/trip-validation';
import {freshTripState,hydrateStoredState} from '@/lib/state-migrations';

async function editorRequest(){return validToken((await cookies()).get('trip_auth')?.value);}

export async function GET(){
 try{
  const stored=await loadState();
  const state=stored?hydrateStoredState(stored):freshTripState();
  const editor=await editorRequest();
  return NextResponse.json({state:editor?state:publicTripState(state),cloud:true,editor});
 }catch(error){
  console.error('Trip state load failed; using local fallback.',error);
  const state=freshTripState();
  const editor=await editorRequest();
  return NextResponse.json({state:editor?state:publicTripState(state),cloud:false,editor});
 }
}

export async function PUT(req:Request){
 if(!(await editorRequest()))return NextResponse.json({ok:false,cloud:false,error:'Editor access required'},{status:401});
 try{
  const state=await req.json() as unknown;
  const validation=validateTripState(state);
  if(!validation.valid)return NextResponse.json({ok:false,cloud:false,error:'Trip data failed validation.',details:validation.errors},{status:400});
  const saved=await saveState(state as TripState);
  return NextResponse.json({ok:true,cloud:saved});
 }catch(error){
  console.error('Trip state save failed; keeping device copy.',error);
  return NextResponse.json({ok:false,cloud:false,error:'Shared saving is temporarily unavailable. Your changes remain on this device.'},{status:503});
 }
}
