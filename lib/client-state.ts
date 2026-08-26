import type {TripState} from '@/lib/types';
import {normalizeNearbyDietaryPresets} from '@/lib/dietary';

export const localStateKey='trip-state';
export const pendingSyncKey='trip-state-pending-sync';
export const lastSyncKey='trip-last-synced-at-v1';

type StorageReader=Pick<Storage,'getItem'>;
type StorageWriter=Pick<Storage,'setItem'|'removeItem'>;
type TripStorage=StorageReader&StorageWriter;
type Fetcher=typeof fetch;

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

export async function pushCloudState(next:TripState,fetcher:Fetcher=fetch){
 const response=await fetcher('/api/state',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(next)});
 const result=await response.json().catch(()=>({})) as {cloud?:boolean;error?:string};
 if(!response.ok||!result.cloud)throw new Error(result.error??'Shared saving is temporarily unavailable.');
 return true;
}
