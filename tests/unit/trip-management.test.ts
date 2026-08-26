import {describe,expect,it} from 'vitest';
import {reshapeTripDays,resetTripCopy,tripDates} from '@/lib/trip-management';
import type {TripState} from '@/lib/types';

const source:TripState={
 settings:{version:3,title:'Toronto',destinations:'Toronto & Buffalo',startDate:'2026-09-24',endDate:'2026-09-25',publicMessage:'Hello',coverTheme:'forest',publicSections:['overview','today'],tripTimeZone:'America/Toronto',archived:true,onboardingCompleted:true},
 days:[
  {date:'2026-09-24',label:'Thu 9/24',city:'Toronto',items:[{id:'a',time:'10:00 AM',title:'Market',done:true,completedAt:'2026-09-24T15:00:00Z',skipped:true,skippedAt:'2026-09-24T14:00:00Z',lastRescheduledAt:'2026-09-20T12:00:00Z',rescheduledFromDate:'2026-09-23'}]},
  {date:'2026-09-25',label:'Fri 9/25',city:'Buffalo',items:[{id:'b',time:'6:00 PM',title:'Dinner',done:false}]}
 ],
 foods:[{id:'food',title:'Butter tart',category:'Try',done:true,triedAt:'2026-09-24',completedAt:'2026-09-24T18:00:00Z'}],
 packing:[{id:'pack',title:'Passport',category:'Essentials',done:true,completedAt:'2026-09-23T18:00:00Z'}],
 places:[{id:'place',name:'Market',region:'Toronto',category:'Attraction',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'must',visited:true,visitedAt:'2026-09-24T17:00:00Z'}],
 mealBalanceByDate:{'2026-09-24':{treatSampled:true}},journalNotesByDate:{'2026-09-24':'Great day'},journalMoments:[{id:'j',date:'2026-09-24',time:'1:00 PM',type:'memory',title:'Memory',createdAt:'2026-09-24T17:00:00Z'}],readinessIgnoredActionIds:['fixed-a']
};

describe('trip lifecycle helpers',()=>{
 it('builds inclusive date ranges and rejects invalid ranges',()=>{
  expect(tripDates('2027-10-01','2027-10-03')).toEqual(['2027-10-01','2027-10-02','2027-10-03']);
  expect(tripDates('2027-10-03','2027-10-01')).toEqual([]);
  expect(tripDates('bad','2027-10-01')).toEqual([]);
 });

 it('keeps itinerary content aligned by trip day when dates move',()=>{
  const reshaped=reshapeTripDays(source,'2027-10-10','2027-10-12','Boston');
  expect(reshaped.map(day=>day.date)).toEqual(['2027-10-10','2027-10-11','2027-10-12']);
  expect(reshaped[0].city).toBe('Toronto');
  expect(reshaped[0].items[0].title).toBe('Market');
  expect(reshaped[1].city).toBe('Buffalo');
  expect(reshaped[2]).toMatchObject({city:'Boston',items:[]});
 });

 it('duplicates planning content but clears trip-progress history',()=>{
  const copy=resetTripCopy(source,'Toronto again','2027-09-24','2027-09-25');
  expect(copy.settings).toMatchObject({title:'Toronto again',startDate:'2027-09-24',endDate:'2027-09-25',archived:false,onboardingCompleted:true});
  expect(copy.settings?.tripTimeZone).toBe('America/Toronto');
  expect(copy.days[0].items[0]).toMatchObject({title:'Market',done:false,skipped:false});
  expect(copy.days[0].items[0].completedAt).toBeUndefined();
  expect(copy.days[0].items[0].lastRescheduledAt).toBeUndefined();
  expect(copy.foods[0].done).toBe(false);
  expect(copy.foods[0].triedAt).toBeUndefined();
  expect(copy.packing[0].done).toBe(false);
  expect(copy.places[0].visited).toBe(false);
  expect(copy.mealBalanceByDate).toEqual({});
  expect(copy.journalNotesByDate).toEqual({});
  expect(copy.journalMoments).toEqual([]);
  expect(copy.readinessIgnoredActionIds).toEqual([]);
 });
});
