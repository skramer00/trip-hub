import {notFound} from 'next/navigation';
import {cookies} from 'next/headers';
import TripWorkspace from '@/components/TripWorkspace';
import {loadState} from '@/lib/db';
import {normalizeTripId} from '@/lib/trips';
import {validToken} from '@/lib/auth';
import {accountCanView,tripVisibility} from '@/lib/account-auth';
import {validTripShare} from '@/lib/collaboration';

export const dynamic='force-dynamic';

export default async function TripRoute({params,searchParams}:{params:Promise<{tripId:string}>;searchParams:Promise<{share?:string}>}){
 const {tripId}=await params;
 const {share}=await searchParams;
 const id=normalizeTripId(tripId);
 const state=await loadState(id).catch(()=>null);
 if(!state)notFound();
 const master=validToken((await cookies()).get('trip_auth')?.value);
 const member=await accountCanView(id);
 const visibility=await tripVisibility(id);
 const linkAllowed=visibility==='public'||(visibility==='shared'&&validTripShare(share,id));
 if(!master&&!member&&!linkAllowed)notFound();
 return <TripWorkspace tripId={id}/>;
}
