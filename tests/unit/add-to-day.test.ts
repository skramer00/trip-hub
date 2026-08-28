import {describe,expect,it} from 'vitest';
import {addToDayPlacementOptions,addToDayRoutePreview,categoryForGooglePlace,defaultDurationForCategory,formatTripTime,itemTypeForPlace,itineraryItemFromPlace,regionForTripDay,suggestedAddTime} from '@/lib/add-to-day';
import type {Place,TripDay} from '@/lib/types';

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

 it('previews both neighboring route legs before inserting a stop',()=>{
  const places:Place[]=[
   {id:'tower',name:'CN Tower',region:'Toronto',area:'Downtown',category:'Attraction',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'must',visited:false,latitude:43.6426,longitude:-79.3871},
   {id:'market',name:'St. Lawrence Market',region:'Toronto',area:'St. Lawrence',category:'Attraction',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'must',visited:false,latitude:43.6487,longitude:-79.3715},
   {id:'aquarium',name:"Ripley's Aquarium",region:'Toronto',area:'Downtown',category:'Attraction',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'possible',visited:false,latitude:43.6424,longitude:-79.386}
  ];
  const day:TripDay={date:'2026-09-25',label:'Fri',city:'Toronto',items:[
   {id:'tower-stop',time:'10:00 AM',title:'CN Tower',done:false,placeId:'tower',estimatedDuration:60},
   {id:'market-stop',time:'2:00 PM',title:'St. Lawrence Market',done:false,placeId:'market',fixed:true}
  ]};
  const preview=addToDayRoutePreview(day,places,places[2],'12:00 PM','walking',90);
  expect(preview.placementLabel).toBe('Between CN Tower and St. Lawrence Market');
  expect(preview.incoming?.directionsUrl).toContain('travelmode=walking');
  expect(preview.outgoing?.minutes).toBeGreaterThan(0);
 expect(preview.suggestedTime).toMatch(/AM|PM/);
 });

 it('recommends the route slot with the least detour',()=>{
  const places:Place[]=[
   {id:'tower',name:'CN Tower',region:'Toronto',area:'Downtown',category:'Attraction',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'must',visited:false,latitude:43.6426,longitude:-79.3871},
   {id:'market',name:'St. Lawrence Market',region:'Toronto',area:'St. Lawrence',category:'Attraction',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'must',visited:false,latitude:43.6487,longitude:-79.3715},
   {id:'aquarium',name:"Ripley's Aquarium",region:'Toronto',area:'Downtown',category:'Attraction',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'possible',visited:false,latitude:43.6424,longitude:-79.386}
  ];
  const day:TripDay={date:'2026-09-25',label:'Fri',city:'Toronto',items:[
   {id:'tower-stop',time:'10:00 AM',title:'CN Tower',done:false,placeId:'tower',estimatedDuration:60},
   {id:'market-stop',time:'2:00 PM',title:'St. Lawrence Market',done:false,placeId:'market',fixed:true}
  ]};
  const options=addToDayPlacementOptions(day,places,places[2],'12:00 PM','walking',90);
  expect(options).toHaveLength(3);
  expect(options.find(option=>option.recommended)?.index).toBe(1);
  expect(options.find(option=>option.recommended)?.label).toBe('Between CN Tower and St. Lawrence Market');
 });

 it('stores the chosen route mode and calculated incoming travel time',()=>{
  const place:Place={id:'museum',name:'Museum',region:'Toronto',category:'Attraction',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'possible',visited:false};
  const item=itineraryItemFromPlace(place,'1:00 PM',false,'walking',14);
  expect(item.travelMode).toBe('walking');
  expect(item.travelMinutes).toBe(14);
 });
});
