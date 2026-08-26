import {describe,expect,it} from 'vitest';
import {normalizeNearbyDietaryMode,normalizeNearbyDietaryPresets,placeMatchesDietaryFilter} from '@/lib/dietary';
import {findNearbyPlaces} from '@/lib/assistant';
import type {DietaryFit,Place,TripState} from '@/lib/types';

function foodPlace(fit?:DietaryFit):Place{
 return {id:'food',name:'Test restaurant',region:'Toronto',category:'Food',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'possible',visited:false,foodPlace:true,dietaryRatings:fit?[{preference:'low-fodmap',fit}]:[]};
}

describe('place dietary filters',()=>{
 it('groups easy and workable places as recommended',()=>{
  expect(placeMatchesDietaryFilter(foodPlace('easy'),'low-fodmap','recommended')).toBe(true);
  expect(placeMatchesDietaryFilter(foodPlace('workable'),'low-fodmap','recommended')).toBe(true);
  expect(placeMatchesDietaryFilter(foodPlace('difficult'),'low-fodmap','recommended')).toBe(false);
 });

 it('keeps difficult and unevaluated places in the any view',()=>{
  expect(placeMatchesDietaryFilter(foodPlace(),'low-fodmap','any')).toBe(true);
  expect(placeMatchesDietaryFilter(foodPlace('difficult'),'low-fodmap','any')).toBe(true);
 });

 it('limits the easy view to easy places',()=>{
  expect(placeMatchesDietaryFilter(foodPlace('easy'),'low-fodmap','easy')).toBe(true);
  expect(placeMatchesDietaryFilter(foodPlace('workable'),'low-fodmap','easy')).toBe(false);
 });
});

describe('nearby dietary filter migration',()=>{
 it('maps the former recommended mode to Easy + Workable',()=>{
  expect(normalizeNearbyDietaryMode('easier')).toBe('recommended');
  expect(normalizeNearbyDietaryMode('recommended')).toBe('recommended');
 });

 it('maps removed hybrid and difficult-only modes to Any',()=>{
  expect(normalizeNearbyDietaryMode('easier-or-unknown')).toBe('all');
  expect(normalizeNearbyDietaryMode('difficult')).toBe('all');
 });

 it('updates modes inside saved presets',()=>{
  const state={days:[],places:[],foods:[],packing:[],nearbyPresets:[{id:'old',name:'Old preset',foodOnly:true,query:'',region:'Toronto',area:'All',category:'All',priority:'All' as const,availableMinutes:60,maxDistanceKm:2,openNowOnly:true,includeVisited:false,dietaryMode:'easier' as never}]};
  expect(normalizeNearbyDietaryPresets(state).nearbyPresets?.[0].dietaryMode).toBe('recommended');
 });
});

describe('nearby dietary filtering',()=>{
 const places=(['easy','workable','difficult',undefined] as const).map((fit,index)=>({...foodPlace(fit),id:`food-${index}`,name:fit??'Unknown restaurant'}));
 const state={days:[{date:'2026-09-25',label:'Fri 9/25',city:'Toronto',items:[]}],places,foods:[],packing:[],dietaryPreferences:['low-fodmap']} satisfies TripState;
 const day=state.days[0];
 const now=new Date('2026-09-25T12:00:00');
 function names(dietaryMode:'all'|'recommended'|'easy'){
  return findNearbyPlaces(state,day,now,undefined,{foodOnly:true,dietaryMode,openNowOnly:false,includeVisited:true},10).map(result=>result.place.name);
 }

 it('includes every rating and unknown places in Any',()=>{
  expect(names('all')).toEqual(expect.arrayContaining(['easy','workable','difficult','Unknown restaurant']));
 });

 it('includes only easy and workable places in Easy + Workable',()=>{
  expect(names('recommended')).toEqual(expect.arrayContaining(['easy','workable']));
  expect(names('recommended')).toHaveLength(2);
 });

 it('includes only easy places in Easy',()=>{
  expect(names('easy')).toEqual(['easy']);
 });
});
