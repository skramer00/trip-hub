import type {TripState} from '@/lib/types';
import {normalizeNearbyDietaryPresets} from '@/lib/dietary';

export const localStateKey='trip-state';
export const pendingSyncKey='trip-state-pending-sync';
export const lastSyncKey='trip-last-synced-at-v1';

type StorageReader=Pick<Storage,'getItem'>;
type StorageWriter=Pick<Storage,'setItem'|'removeItem'>;
type TripStorage=StorageReader&StorageWriter;
type Fetcher=typeof fetch;

let saveQueue:Promise<void>=Promise.resolve();
let latestSaveRequest=0;

export function readLocalState(storage:StorageReader):TripState|null{
 try{
  const value=storage.getItem(localStateKey);
  return value?normalizeNearbyDietaryPresets(JSON.parse(value) as TripState):null;
 }catch{return null;}
}

export function stageDeviceState(storage:StorageWriter,next:TripState){
 storage.setItem(localStateKey,JSON.stringify(next));
 storage.setItem(pendingSyncKey,'true');
}

export function markCloudSynced(storage:TripStorage,syncedAt=new Date().toISOString()){
 storage.removeItem(pendingSyncKey);
 storage.setItem(lastSyncKey,syncedAt);
 return syncedAt;
}

/**
 * Saves are intentionally serialized. Several Trip Hub controls can save in quick
 * succession (checkboxes, notes, itinerary edits). Without a queue, an older PUT
 * can finish after a newer PUT and overwrite the newest trip state in Supabase.
 *
 * The boolean return value is true only for the newest queued save. Callers use
 * that signal before clearing the device's pending-sync marker, so an earlier save
 * cannot briefly mark a newer edit as fully synced.
 */
export function pushCloudState(next:TripState,fetcher:Fetcher=fetch):Promise<boolean>{
 const requestId=++latestSaveRequest;
 const run=saveQueue.catch(()=>{}).then(async()=>{
  const response=await fetcher('/api/state',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(next)});
  const result=await response.json().catch(()=>({})) as {cloud?:boolean;error?:string};
  if(!response.ok||!result.cloud)throw new Error(result.error??'Shared saving is temporarily unavailable.');
  return requestId===latestSaveRequest;
 });
 saveQueue=run.then(()=>undefined,()=>undefined);
 return run;
}
