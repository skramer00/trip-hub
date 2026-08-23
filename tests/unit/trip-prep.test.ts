import {describe,expect,it} from 'vitest';
import {nextPrepTask,packingItems,prepDueStatus,prepTasks,suggestedPrepChecklist} from '@/lib/trip-prep';
import type {CheckItem,TripState} from '@/lib/types';

const packing:CheckItem[]=[
 {id:'passport',title:'Passport',category:'Documents',done:false},
 {id:'weather',title:'Check weather',category:'Final checks',done:false,checklistType:'prep',dueDate:'2026-09-21'},
 {id:'tickets',title:'Review tickets',category:'Reservations',done:false,checklistType:'prep',dueDate:'2026-09-10'},
];

describe('trip preparation checklist',()=>{
 it('keeps preparation tasks separate from packing',()=>{
  expect(prepTasks({packing}).map(item=>item.id)).toEqual(['weather','tickets']);
  expect(packingItems({packing}).map(item=>item.id)).toEqual(['passport']);
 });

 it('prioritizes overdue and upcoming preparation tasks',()=>{
  const state={packing} as TripState;
  expect(nextPrepTask(state,new Date(2026,8,15))?.id).toBe('tickets');
  expect(prepDueStatus(packing[1],new Date(2026,8,15))).toBe('soon');
  expect(prepDueStatus(packing[2],new Date(2026,8,15))).toBe('overdue');
 });

 it('builds reusable suggestions from the trip start date without duplicates',()=>{
  const suggestions=suggestedPrepChecklist('2026-09-24',[{id:'existing',title:'Review reservations and ticket access',category:'Reservations',done:false}]);
  expect(suggestions).toHaveLength(4);
  expect(suggestions.find(item=>item.id==='prep-transport')?.dueDate).toBe('2026-09-03');
  expect(suggestions.some(item=>item.id==='prep-reservations')).toBe(false);
  expect(suggestions.every(item=>item.checklistType==='prep')).toBe(true);
 });
});
