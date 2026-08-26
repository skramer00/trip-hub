import {redirect} from 'next/navigation';
import {DEFAULT_TRIP_ID,normalizeTripId} from '@/lib/trips';

export const dynamic='force-dynamic';

export default async function TripRoute({params}:{params:Promise<{tripId:string}>}){
 const {tripId}=await params;
 const id=normalizeTripId(tripId);
 // Stage 1 keeps the proven TripApp runtime at the root while establishing durable trip URLs.
 // The state API becomes trip-scoped in the next migration step.
 if(id===DEFAULT_TRIP_ID)redirect('/');
 redirect(`/trips?missing=${encodeURIComponent(id)}`);
}
