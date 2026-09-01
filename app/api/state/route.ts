import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {loadState,saveState} from '@/lib/db';
import {validToken} from '@/lib/auth';
import {inviteCanEdit,tripAccessCookieName,validTripShare} from '@/lib/collaboration';
import {accountCanEdit,accountCanView,tripVisibility} from '@/lib/account-auth';
import {publicTripState} from '@/lib/public-state';
import type {TripState} from '@/lib/types';
import {validateTripState} from '@/lib/trip-validation';
import {freshTripState,hydrateStoredState} from '@/lib/state-migrations';
import {DEFAULT_TRIP_ID,normalizeTripId} from '@/lib/trips';

async function editorRequest(tripId:string){const jar=await cookies();return validToken(jar.get('trip_auth')?.value)||inviteCanEdit(jar.get(tripAccessCookieName(tripId))?.value,tripId)||await accountCanEdit(tripId);}
function requestTripId(req:Request){return normalizeTripId(new URL(req.url).searchParams.get('tripId')||DEFAULT_TRIP_ID);}
async function viewerRequest(req:Request,tripId:string){
 if(await editorRequest(tripId)||await accountCanView(tripId))return true;
 const visibility=await tripVisibility(tripId);
 if(visibility==='public')return true;
 if(visibility==='shared')return validTripShare(new URL(req.url).searchParams.get('share'),tripId);
 return false;
}

export async function GET(req:Request){
 const tripId=requestTripId(req);
 try{
  if(!(await viewerRequest(req,tripId)))return NextResponse.json({state:null,cloud:true,editor:false,tripId,error:'This trip is private.'},{status:403});
  const stored=await loadState(tripId);
  if(!stored&&tripId!==DEFAULT_TRIP_ID)return NextResponse.json({state:null,cloud:true,editor:await editorRequest(tripId),tripId},{status:404});
  const state=stored?hydrateStoredState(stored):freshTripState();
  const editor=await editorRequest(tripId);
  return NextResponse.json({state:editor?state:publicTripState(state),cloud:true,editor,tripId});
 }catch(error){
  console.error('Trip state load failed; using local fallback.',error);
  if(tripId!==DEFAULT_TRIP_ID)return NextResponse.json({state:null,cloud:false,editor:await editorRequest(tripId),tripId},{status:503});
  const state=freshTripState();
  const editor=await editorRequest(tripId);
  return NextResponse.json({state:editor?state:publicTripState(state),cloud:false,editor,tripId});
 }
}

export async function PUT(req:Request){
 const tripId=requestTripId(req);
 if(!(await editorRequest(tripId)))return NextResponse.json({ok:false,cloud:false,error:'Editor access required'},{status:401});
 try{
  const state=await req.json() as unknown;
  const validation=validateTripState(state);
  if(!validation.valid)return NextResponse.json({ok:false,cloud:false,error:'Trip data failed validation.',details:validation.errors},{status:400});
  const saved=await saveState(state as TripState,tripId);
  return NextResponse.json({ok:true,cloud:saved,tripId});
 }catch(error){
  console.error('Trip state save failed; keeping device copy.',error);
  return NextResponse.json({ok:false,cloud:false,error:'Shared saving is temporarily unavailable. Your changes remain on this device.'},{status:503});
 }
}