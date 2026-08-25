import {describe,expect,it} from 'vitest';
import {placeMatchesDietaryFilter} from '@/lib/dietary';
import type {DietaryFit,Place} from '@/lib/types';

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
