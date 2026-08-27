import {describe,expect,it} from 'vitest';
import {analyzeDaySchedule,applySuggestedDayTimes} from '@/lib/day-schedule';
import type {TripDay} from '@/lib/types';

describe('route-aware day timing',()=>{
 it('keeps fixed plans anchored and flows flexible stops after them',()=>{
  const day:TripDay={date:'2026-09-25',label:'Friday',city:'Toronto',items:[
   {id:'fixed',time:'10:00 AM',title:'Timed tour',done:false,fixed:true,estimatedDuration:60},
   {id:'museum',time:'10:30 AM',title:'Museum',done:false,fixed:false,estimatedDuration:90,travelMinutes:15},
   {id:'lunch',time:'11:00 AM',title:'Lunch',done:false,fixed:false,estimatedDuration:60,travelMinutes:10}
  ]};
  const analysis=analyzeDaySchedule(day,[]);
  expect(analysis.entryById.get('fixed')?.suggestedTime).toBe('10:00 AM');
  expect(analysis.entryById.get('museum')?.suggestedTime).toBe('11:15 AM');
  expect(analysis.entryById.get('lunch')?.suggestedTime).toBe('12:55 PM');
  expect(analysis.adjustmentCount).toBe(2);
 });

 it('reports a late arrival to a fixed plan using current times',()=>{
  const day:TripDay={date:'2026-09-25',label:'Friday',city:'Toronto',items:[
   {id:'market',time:'12:00 PM',title:'Market',done:false,fixed:false,estimatedDuration:90},
   {id:'game',time:'1:00 PM',title:'Game',done:false,fixed:true,estimatedDuration:180,travelMinutes:20}
  ]};
  const analysis=analyzeDaySchedule(day,[]);
  expect(analysis.connections.get('game')?.gapMinutes).toBe(-50);
  expect(analysis.connections.get('game')?.status).toBe('overlap');
  expect(analysis.notices[0]).toContain('about 50 minutes late');
 });

 it('applies only flexible time suggestions',()=>{
  const day:TripDay={date:'2026-09-25',label:'Friday',city:'Toronto',items:[
   {id:'tour',time:'10:00 AM',title:'Tour',done:false,fixed:true,estimatedDuration:60},
   {id:'coffee',time:'10:15 AM',title:'Coffee',done:false,fixed:false,estimatedDuration:30,travelMinutes:15}
  ]};
  const adjusted=applySuggestedDayTimes(day,[]);
  expect(adjusted.items[0]).toEqual(day.items[0]);
  expect(adjusted.items[1].time).toBe('11:15 AM');
 });
});
