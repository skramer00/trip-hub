import {describe,expect,it,vi} from 'vitest';
import {lastSyncKey,localStateKey,markCloudSynced,pendingSyncKey,pushCloudState,readLocalState,scopedStorageKey,stageDeviceState} from '@/lib/client-state';
import {DEFAULT_TRIP_ID} from '@/lib/trips';
import type {TripState} from '@/lib/types';

const trip={days:[],places:[],foods:[],packing:[]} satisfies TripState;

describe('client trip persistence',()=>{
 it('recovers a legacy device copy for the original trip',()=>{
  const storage={getItem:vi.fn(key=>key===localStateKey?JSON.stringify(trip):null)};
  expect(readLocalState(storage)).toEqual(trip);
 });

 it('recovers a trip-scoped device copy',()=>{
  const key=scopedStorageKey(localStateKey,'boston-2027');
  const storage={getItem:vi.fn(value=>value===key?JSON.stringify(trip):null)};
  expect(readLocalState(storage,'boston-2027')).toEqual(trip);
 });

 it('ignores a damaged device copy',()=>{
  expect(readLocalState({getItem:()=>'{not json'})).toBeNull();
 });

 it('keeps an edit queued on-device until cloud saving succeeds',()=>{
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)};
  const localKey=scopedStorageKey(localStateKey,DEFAULT_TRIP_ID);
  const pendingKey=scopedStorageKey(pendingSyncKey,DEFAULT_TRIP_ID);
  const syncedKey=scopedStorageKey(lastSyncKey,DEFAULT_TRIP_ID);
  stageDeviceState(storage,trip);
  expect(values.get(localKey)).toBe(JSON.stringify(trip));
  expect(values.get(pendingKey)).toBe('true');
  expect(markCloudSynced(storage,'2026-08-19T17:00:00.000Z')).toBe('2026-08-19T17:00:00.000Z');
  expect(values.has(pendingKey)).toBe(false);
  expect(values.get(syncedKey)).toBe('2026-08-19T17:00:00.000Z');
 });

 it('sends the complete trip to the trip-scoped protected state route',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({cloud:true}),{status:200,headers:{'content-type':'application/json'}}));
  await expect(pushCloudState(trip,fetcher)).resolves.toBe(true);
  expect(fetcher).toHaveBeenCalledWith(`/api/state?tripId=${DEFAULT_TRIP_ID}`,expect.objectContaining({method:'PUT',body:JSON.stringify(trip)}));
 });

 it('can save a second trip without using the original trip id',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({cloud:true}),{status:200,headers:{'content-type':'application/json'}}));
  await expect(pushCloudState(trip,fetcher,'boston-2027')).resolves.toBe(true);
  expect(fetcher).toHaveBeenCalledWith('/api/state?tripId=boston-2027',expect.objectContaining({method:'PUT'}));
 });

 it('preserves the friendly server error when cloud saving fails',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({cloud:false,error:'Changes remain on this device.'}),{status:503,headers:{'content-type':'application/json'}}));
  await expect(pushCloudState(trip,fetcher)).rejects.toThrow('Changes remain on this device.');
 });

 it('serializes rapid saves and only marks the newest request as current',async()=>{
  const calls:string[]=[];
  const fetcher=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
   calls.push(String(init?.body));
   await new Promise(resolve=>setTimeout(resolve,5));
   return new Response(JSON.stringify({cloud:true}),{status:200,headers:{'content-type':'application/json'}});
  });
  const first={...trip,journalNotesByDate:{'2026-09-25':'first'}};
  const second={...trip,journalNotesByDate:{'2026-09-25':'second'}};
  const firstSave=pushCloudState(first,fetcher);
  const secondSave=pushCloudState(second,fetcher);
  await expect(firstSave).resolves.toBe(false);
  await expect(secondSave).resolves.toBe(true);
  expect(calls).toEqual([JSON.stringify(first),JSON.stringify(second)]);
 });
});
