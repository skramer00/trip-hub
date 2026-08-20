import {describe,expect,it} from 'vitest';
import {restoredTripState,tripBackup} from '@/lib/trip-export';
import type {TripState} from '@/lib/types';

const trip:TripState={days:[{date:'2026-09-24',label:'Thu',city:'Toronto',items:[]}],places:[],foods:[],packing:[]};

describe('trip backup and restore',()=>{
 it('round-trips a full backup',()=>{
  const restored=restoredTripState(JSON.parse(tripBackup(trip)));
  expect(restored).toEqual(trip);
 });

 it('accepts a legacy raw trip export',()=>{
  expect(restoredTripState(trip)).toEqual(trip);
 });

 it('rejects incomplete or malformed backups',()=>{
  expect(()=>restoredTripState({format:'trip-hub-backup',state:{days:[]}})).toThrow('missing required trip information');
  expect(()=>restoredTripState({...trip,days:[{date:42,items:[]}]})).toThrow('invalid itinerary');
 });
});
