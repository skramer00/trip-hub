import {describe,expect,it} from 'vitest';
import {areaLabel,groupPlacesByArea} from '@/lib/place-areas';
import type {Place} from '@/lib/types';

function place(id:string,name:string,area?:string):Place{
 return {id,name,area,region:'Toronto',category:'Attraction',notes:'',mapUrl:'',menuUrl:'',websiteUrl:'',tags:[],priority:'possible',visited:false};
}

describe('place neighborhood grouping',()=>{
 it('uses compact labels for neighborhood headings',()=>{
  expect(areaLabel('Toronto — St. Lawrence / Distillery')).toBe('St. Lawrence / Distillery');
 });

 it('groups places alphabetically and leaves unassigned places last',()=>{
  const groups=groupPlacesByArea([
   place('3','Zed','Toronto — Waterfront'),
   place('1','Loose'),
   place('2','Alpha','Toronto — Waterfront')
  ]);
  expect(groups.map(group=>group.area)).toEqual(['Toronto — Waterfront','Unassigned']);
  expect(groups[0].places.map(item=>item.name)).toEqual(['Alpha','Zed']);
 });
});
