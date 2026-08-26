import type {TripState} from '@/lib/types';
import {normalizeNearbyDietaryPresets} from '@/lib/dietary';
import {DEFAULT_TRIP_ID,normalizeTripId} from '@/lib/trips';

export const localStateKey='trip-state';
export const pendingSyncKey='trip-state-pending-sync';
export const lastSyncKey='trip-last-synced-at-v1';
export function scopedStorageKey(base:string,tripId=DEFAULT_TRIP_ID){return `${base}:${normalizeTripId(tripId)}`;}

type StorageReader=Pick<Storage,'getItem'>;
type StorageWriter=Pick<Storage,'setItem'|'removeItem'>;
type TripStorage=StorageReader&StorageWriter;
type Fetcher=typeof fetch;

let saveQueue:Promise<void>=Promise.resolve();
let latestSaveRequest=0;

export function readLocalState(storage:StorageReader,tripId=DEFAULT_TRIP_ID):TripState|null{
 try{
  const scoped=storage.getItem(scopedStorageKey(localStateKey,tripId));
  const legacy=tripId===DEFAULT_TRIP_ID?storage.getItem(localStateKey):null;
  const value=scoped??legacy;
  return value?normalizeNearbyDietaryPresets(JSON.parse(value) as TripState):null;
 }catch{return null;}
}

export function stageDeviceState(storage:StorageWriter,next:TripState,tripId=DEFAULT_TRIP_ID){
 storage.setItem(scopedStorageKey(localStateKey,tripId),JSON.stringify(next));
 storage.setItem(scopedStorageKey(pendingSyncKey,tripId),'true');
}

export function markCloudSynced(storage:TripStorage,syncedAt=new Date().toISOString(),tripId=DEFAULT_TRIP_ID){
 storage.removeItem(scopedStorageKey(pendingSyncKey,tripId));
 storage.setItem(scopedStorageKey(lastSyncKey,tripId),syncedAt);
 return syncedAt;
}

export function pushCloudState(next:TripState,fetcher:Fetcher=fetch,tripId=DEFAULT_TRIP_ID):Promise<boolean>{
 const requestId=++latestSaveRequest;
 const id=normalizeTripId(tripId);
 const url=id===DEFAULT_TRIP_ID?'/api/state':`/api/state?tripId=${encodeURIComponent(id)}`;
 const run=saveQueue.catch(()=>{}).then(async()=>{
  const response=await fetcher(url,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(next)});
  const result=await response.json().catch(()=>({})) as {cloud?:boolean;error?:string};
  if(!response.ok||!result.cloud)throw new Error(result.error??'Shared saving is temporarily unavailable.');
  return requestId===latestSaveRequest;
 });
 saveQueue=run.then(()=>undefined,()=>undefined);
 return run;
}
