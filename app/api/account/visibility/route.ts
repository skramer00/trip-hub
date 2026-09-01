import {NextResponse} from 'next/server';
import {accountIsOwner,currentAccount,setTripVisibility,tripVisibility,type TripVisibility} from '@/lib/account-auth';
import {createTripShare} from '@/lib/collaboration';
import {normalizeTripId} from '@/lib/trips';

export async function GET(req:Request){
 const tripId=normalizeTripId(new URL(req.url).searchParams.get('tripId'));
 const account=await currentAccount();
 const visibility=await tripVisibility(tripId);
 const owner=Boolean(account&&await accountIsOwner(tripId));
 return NextResponse.json({ok:true,visibility,owner});
}

export async function POST(req:Request){
 const body=await req.json() as {tripId?:string;visibility?:TripVisibility};
 const tripId=normalizeTripId(body.tripId);
 if(!(await accountIsOwner(tripId)))return NextResponse.json({ok:false,error:'Only a trip owner can change visibility.'},{status:403});
 if(!body.visibility||!['private','shared','public'].includes(body.visibility))return NextResponse.json({ok:false,error:'Choose private, shared, or public visibility.'},{status:400});
 const visibility=await setTripVisibility(tripId,body.visibility);
 const shareToken=visibility==='shared'?createTripShare(tripId):undefined;
 const origin=new URL(req.url).origin;
 const shareUrl=shareToken?`${origin}/trips/${encodeURIComponent(tripId)}?share=${encodeURIComponent(shareToken)}`:undefined;
 return NextResponse.json({ok:true,visibility,shareUrl});
}
