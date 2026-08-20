import {describe,expect,it,vi} from 'vitest';
import {lastSyncKey,localStateKey,markCloudSynced,pendingSyncKey,pushCloudState,readLocalState,stageDeviceState} from '@/lib/client-state';
import type {TripState} from '@/lib/types';

const trip={days:[],places:[],foods:[],packing:[]} satisfies TripState;

describe('client trip persistence',()=>{
 it('recovers a valid device copy',()=>{
  const storage={getItem:vi.fn(key=>key===localStateKey?JSON.stringify(trip):null)};
  expect(readLocalState(storage)).toEqual(trip);
 });

 it('ignores a damaged device copy',()=>{
  expect(readLocalState({getItem:()=>'{not json'})).toBeNull();
 });

 it('keeps an edit queued on-device until cloud saving succeeds',()=>{
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)};
  stageDeviceState(storage,trip);
  expect(values.get(localStateKey)).toBe(JSON.stringify(trip));
  expect(values.get(pendingSyncKey)).toBe('true');
  expect(markCloudSynced(storage,'2026-08-19T17:00:00.000Z')).toBe('2026-08-19T17:00:00.000Z');
  expect(values.has(pendingSyncKey)).toBe(false);
  expect(values.get(lastSyncKey)).toBe('2026-08-19T17:00:00.000Z');
 });

 it('sends the complete trip to the protected state route',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({cloud:true}),{status:200,headers:{'content-type':'application/json'}}));
  await expect(pushCloudState(trip,fetcher)).resolves.toBe(true);
  expect(fetcher).toHaveBeenCalledWith('/api/state',expect.objectContaining({method:'PUT',body:JSON.stringify(trip)}));
 });

 it('preserves the friendly server error when cloud saving fails',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({cloud:false,error:'Changes remain on this device.'}),{status:503,headers:{'content-type':'application/json'}}));
  await expect(pushCloudState(trip,fetcher)).rejects.toThrow('Changes remain on this device.');
 });
});
