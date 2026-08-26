'use client';

import {useEffect} from 'react';
import TripApp from '@/components/TripApp';
import {DEFAULT_TRIP_ID,normalizeTripId} from '@/lib/trips';

export const activeTripStorageKey='trip-active-id';

export default function TripWorkspace({tripId=DEFAULT_TRIP_ID}:{tripId?:string}){
 const id=normalizeTripId(tripId);
 useEffect(()=>{sessionStorage.setItem(activeTripStorageKey,id);return()=>{};},[id]);
 return <TripApp/>;
}
