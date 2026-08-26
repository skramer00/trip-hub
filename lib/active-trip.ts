import {DEFAULT_TRIP_ID,normalizeTripId} from './trips';

export const activeTripStorageKey='trip-active-id';
export function activeTripId(){
 if(typeof window==='undefined')return DEFAULT_TRIP_ID;
 const path=window.location.pathname.match(/^\/trips\/([^/]+)/)?.[1];
 return normalizeTripId(path||sessionStorage.getItem(activeTripStorageKey)||DEFAULT_TRIP_ID);
}
export function stateApiUrl(){return `/api/state?tripId=${encodeURIComponent(activeTripId())}`;}
