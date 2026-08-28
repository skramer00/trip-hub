import {NextResponse} from 'next/server';
import {readTripInvite,tripAccessCookieName} from '@/lib/collaboration';

export async function GET(req:Request){
 const url=new URL(req.url);
 const token=url.searchParams.get('token');
 const invite=readTripInvite(token);
 if(!invite||!token)return NextResponse.redirect(new URL('/trips?invite=invalid',url.origin));
 const response=NextResponse.redirect(new URL(`/trips/${invite.tripId}?invite=accepted`,url.origin));
 response.cookies.set(tripAccessCookieName(invite.tripId),token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:Math.max(60,invite.exp-Math.floor(Date.now()/1000)),path:'/'});
 return response;
}
