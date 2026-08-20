import {describe,expect,it} from 'vitest';
import {buildTripReadiness} from '@/lib/trip-readiness';
import type {TripState} from '@/lib/types';

const state:TripState={
 days:[{date:'2026-09-25',label:'Fri 9/25',city:'Toronto',items:[
  {id:'fixed',time:'10:00 AM',title:'CN Tower reservation',fixed:true,type:'activity',placeId:'tower',done:false},
  {id:'missing',time:'Afternoon',title:'Coffee stop',done:false}
 ]}],
 places:[{id:'tower',name:'CN Tower',region:'Toronto',category:'Attraction',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'must',visited:false}],
 foods:[],packing:[]
};

describe('trip readiness actions',()=>{
 it('creates deep-linked actions for incomplete planning details',()=>{
  const readiness=buildTripReadiness(state);
  expect(readiness.actions).toEqual(expect.arrayContaining([
   expect.objectContaining({target:'Locations',anchorId:'location-missing'}),
   expect.objectContaining({target:'Hours',anchorId:'hours-tower'}),
   expect.objectContaining({target:'Itinerary',anchorId:'itinerary-fixed'}),
   expect.objectContaining({target:'Places',anchorId:'place-tower'})
  ]));
  const fixedAction=readiness.actions.find(action=>action.id==='fixed-fixed');
  expect(fixedAction?.detail).toContain('Key Info');
  expect(fixedAction?.detail).toContain('travel time');
  expect(fixedAction?.detail).toContain('route');
 });
});
