import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {validToken} from '@/lib/auth';
import {createTripInvite,type TripAccessRole} from '@/lib/collaboration';
import {normalizeTripId} from '@/lib/trips';

export async function POST(req:Request){
 const owner=validToken((await cookies()).get('trip_auth')?.value);
 if(!owner)return NextResponse.json({error:'Owner access required to create invites.'},{status:401});
 try{
  const body=await req.json() as {tripId?:string;role?:TripAccessRole;label?:string;days?:number};
  const tripId=normalizeTripId(body.tripId);
  const role:TripAccessRole=body.role==='viewer'?'viewer':'editor';
  const token=createTripInvite(tripId,role,body.label,body.days??14);
  const base=new URL(req.url).origin;
  return NextResponse.json({ok:true,tripId,role,url:`${base}/api/collaboration/accept?token=${encodeURIComponent(token)}`,expiresInDays:Math.max(1,Math.min(body.days??14,30))});
 }catch{return NextResponse.json({error:'Could not create this invite.'},{status:400});}
}
