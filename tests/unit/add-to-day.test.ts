import {describe,expect,it} from 'vitest';
import {categoryForGooglePlace,defaultDurationForCategory,formatTripTime,itemTypeForPlace,regionForTripDay,suggestedAddTime} from '@/lib/add-to-day';
import type {TripDay} from '@/lib/types';

describe('Add to Day planning helpers',()=>{
 it('suggests a time after the final timed itinerary item',()=>{
  const day:TripDay={date:'2026-09-25',label:'Fri 9/25',city:'Toronto',items:[
   {id:'a',time:'10:00 AM',title:'Market',done:false,estimatedDuration:90,travelMinutes:20},
   {id:'b',time:'Flexible',title:'Coffee',done:false,estimatedDuration:30},
   {id:'c',time:'1:30 PM',title:'Museum',done:false,estimatedDuration:120,travelMinutes:15},
  ]};
  expect(suggestedAddTime(day)).toBe('3:45 PM');
 });

 it('formats time and infers useful categories',()=>{
  expect(formatTripTime(14*60+7)).toBe('2:05 PM');
  expect(itemTypeForPlace({category:'Seafood restaurant',tags:[]})).toBe('food');
  expect(categoryForGooglePlace({googlePlaceId:'1',name:'Union',category:'Train Station'})).toBe('Transit');
  expect(defaultDurationForCategory('Aquarium')).toBe(90);
  expect(regionForTripDay({date:'2026-10-01',label:'Thu',city:'Travel home',items:[]})).toBe('Other');
 });
});
