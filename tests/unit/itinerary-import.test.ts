import {describe,expect,it} from 'vitest';
import {applyItinerarySuggestions,parseItineraryText} from '@/lib/itinerary-import';
import type {TripState} from '@/lib/types';

const state:TripState={settings:{version:3,title:'Toronto',destinations:'Toronto',startDate:'2026-09-24',endDate:'2026-09-26',publicMessage:'',coverTheme:'forest',publicSections:['overview']},days:[{date:'2026-09-24',label:'Thu 9/24',city:'Toronto',items:[]},{date:'2026-09-25',label:'Fri 9/25',city:'Toronto',items:[]},{date:'2026-09-26',label:'Sat 9/26',city:'Toronto',items:[]}],foods:[],packing:[],places:[]};

describe('itinerary text import',()=>{
 it('extracts trip-date plans without turning metadata into extra items',()=>{
  const result=parseItineraryText(`Sep 24, 2026\n8:15 PM Porter flight arrives YYZ\nConfirmation: ABC123\n\nSep 25, 2026\n7:00 PM Dinner at Canoe\nLocation: 66 Wellington St W`,state);
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({date:'2026-09-24',time:'8:15 PM',type:'travel',title:'Porter flight arrives YYZ',keyInfo:'Confirmation: ABC123'});
  expect(result[1]).toMatchObject({date:'2026-09-25',time:'7:00 PM',type:'food',destination:'66 Wellington St W'});
 });

 it('ignores plans that are outside the trip date range',()=>{
  expect(parseItineraryText('Oct 4, 2026\n7:00 PM Dinner reservation',state)).toEqual([]);
 });

 it('applies only selected suggestions to their matching trip days',()=>{
  const parsed=parseItineraryText('9/24/2026 6:00 PM Airport train\n9/25/2026 7:30 PM Dinner reservation',state);
  parsed[1].selected=false;
  const next=applyItinerarySuggestions(state,parsed);
  expect(next.days[0].items).toHaveLength(1);
  expect(next.days[1].items).toHaveLength(0);
  expect(next.days[0].items[0]).toMatchObject({type:'travel',fixed:true,travelMode:'transit'});
 });
});
