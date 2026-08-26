'use client';

import {useEffect} from 'react';
import TripApp from '@/components/TripApp';
import {DEFAULT_TRIP_ID,normalizeTripId} from '@/lib/trips';
import {activeTripStorageKey} from '@/lib/active-trip';

export default function TripWorkspace({tripId=DEFAULT_TRIP_ID}:{tripId?:string}){
 const id=normalizeTripId(tripId);
 useEffect(()=>{sessionStorage.setItem(activeTripStorageKey,id);},[id]);
 return <TripApp/>;
}
