import {describe,expect,it} from 'vitest';
import {publicTripState} from '@/lib/public-state';
import type {TripState} from '@/lib/types';

function privateTrip():TripState{return {
 days:[{date:'2026-09-24',label:'Thu 9/24',city:'Toronto',items:[{id:'flight',time:'2:00 PM',title:'Flight',done:false,keyInfo:'CONFIRM-123',confirmationNumber:'ABC123',userNotes:'Private note'}]}],
 places:[{id:'dinner',name:'Dinner',region:'Toronto',category:'Food',notes:'Public note',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'must',visited:false,dietaryRatings:[{preference:'low-fodmap',fit:'easy',tip:'Private ordering guidance'}]}],
 foods:[],packing:[{id:'passport',title:'Passport',category:'Documents',done:false}],dietaryPreferences:['low-fodmap'],
 mealBalanceByDate:{'2026-09-24':{treatSampled:true,note:'Private meal note'}},journalNotesByDate:{'2026-09-24':'Private journal note'},
 journalMoments:[{id:'moment',date:'2026-09-24',time:'8:00 PM',type:'memory',title:'Public memory',note:'Private memory note',createdAt:'2026-09-24T20:00:00Z'}]
};}

describe('public trip projection',()=>{
 it('removes every private planning field without mutating the editor state',()=>{
  const source=privateTrip();
  const result=publicTripState(source);
  expect(result.days[0].items[0]).not.toHaveProperty('keyInfo');
  expect(result.days[0].items[0]).not.toHaveProperty('confirmationNumber');
  expect(result.days[0].items[0]).not.toHaveProperty('userNotes');
  expect(result.packing).toEqual([]);
  expect(result.dietaryPreferences).toEqual([]);
  expect(result.mealBalanceByDate).toEqual({});
  expect(result.journalNotesByDate).toEqual({});
  expect(result.journalMoments?.[0]).not.toHaveProperty('note');
  expect(result.places[0].dietaryRatings).toEqual([]);
  expect(source.days[0].items[0].keyInfo).toBe('CONFIRM-123');
 });
});
