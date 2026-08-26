import {describe,expect,it} from 'vitest';
import {hydrateStoredState} from '@/lib/state-migrations';
import type {TripState} from '@/lib/types';

function savedState():TripState{return {days:[],places:[],foods:[],packing:[]};}

describe('saved trip hydration',()=>{
 it('does not recreate deleted seeded itinerary days or items',()=>{
  const stored=savedState();
  const hydrated=hydrateStoredState(stored);
  expect(hydrated.days).toEqual([]);
 });

 it('respects deliberately empty food and place lists',()=>{
  const hydrated=hydrateStoredState(savedState());
  expect(hydrated.foods).toEqual([]);
  expect(hydrated.places).toEqual([]);
 });

 it('preserves custom saved itinerary content exactly',()=>{
  const stored=savedState();
  stored.days=[{date:'2027-01-02',label:'Sat 1/2',city:'Boston',items:[{id:'custom',time:'9:00 AM',title:'Custom plan',done:false}]}];
  const hydrated=hydrateStoredState(stored);
  expect(hydrated.days).toEqual(stored.days);
  expect(hydrated.days[0].items).toHaveLength(1);
  expect(hydrated.days[0].items[0].id).toBe('custom');
 });
});
