import {DEFAULT_TRIP_ID,normalizeTripId} from './trips';

export const activeTripStorageKey='trip-active-id';
export function activeTripId(){
 if(typeof window==='undefined')return DEFAULT_TRIP_ID;
 const path=window.location.pathname.match(/^\/trips\/([^/]+)/)?.[1];
 return normalizeTripId(path||sessionStorage.getItem(activeTripStorageKey)||DEFAULT_TRIP_ID);
}
export function stateApiUrl(tripId=activeTripId()){
 const id=normalizeTripId(tripId);
 const params=new URLSearchParams();
 if(id!==DEFAULT_TRIP_ID)params.set('tripId',id);
 if(typeof window!=='undefined'){
  const share=new URLSearchParams(window.location.search).get('share');
  if(share)params.set('share',share);
 }
 const query=params.toString();
 return query?`/api/state?${query}`:'/api/state';
}
