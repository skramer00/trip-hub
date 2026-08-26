import {notFound} from 'next/navigation';
import TripWorkspace from '@/components/TripWorkspace';
import {loadState} from '@/lib/db';
import {normalizeTripId} from '@/lib/trips';

export const dynamic='force-dynamic';

export default async function TripRoute({params}:{params:Promise<{tripId:string}>}){
 const {tripId}=await params;
 const id=normalizeTripId(tripId);
 const state=await loadState(id).catch(()=>null);
 if(!state)notFound();
 return <TripWorkspace tripId={id}/>;
}
