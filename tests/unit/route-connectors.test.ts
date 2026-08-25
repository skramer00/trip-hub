import {describe,expect,it} from 'vitest';
import {buildGoogleMapsLeg,itineraryStopQuery} from '@/lib/board-planner';
import type {ItineraryItem,Place} from '@/lib/types';

const places:Place[]=[
 {id:'cn',name:'CN Tower',region:'Toronto',category:'Attraction',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'must',visited:false,formattedAddress:'290 Bremner Blvd, Toronto, ON',latitude:43.6426,longitude:-79.3871},
 {id:'market',name:'St. Lawrence Market',region:'Toronto',category:'Market',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'must',visited:false,formattedAddress:'93 Front St E, Toronto, ON'}
];

function item(id:string,title:string,placeId?:string,destination?:string):ItineraryItem{
 return {id,title,time:'12:00 PM',done:false,placeId,destination};
}

describe('between-stop routes',()=>{
 it('prefers a linked place and coordinates for the route query',()=>{
  expect(itineraryStopQuery(item('a','Tower','cn'),places)).toBe('43.6426,-79.3871');
 });

 it('creates an exact origin-to-destination Google Maps leg with the selected mode',()=>{
  const url=buildGoogleMapsLeg(item('a','Tower','cn'),item('b','Market','market'),places,'walking');
  expect(url).toContain('origin=43.6426%2C-79.3871');
  expect(url).toContain('destination=93+Front+St+E%2C+Toronto%2C+ON');
  expect(url).toContain('travelmode=walking');
 });

 it('does not create a misleading route when either stop has no usable location',()=>{
  expect(buildGoogleMapsLeg(item('a','Unknown'),item('b','Market','market'),places)).toBeUndefined();
 });
});
