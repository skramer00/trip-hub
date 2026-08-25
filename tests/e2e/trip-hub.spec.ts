import {expect,test} from '@playwright/test';
import type {TripState} from '../../lib/types';

const publicState:TripState={
 settings:{version:2,title:'Toronto Test Trip',destinations:'Toronto',startDate:'2026-09-24',endDate:'2026-09-25',publicMessage:'Welcome to the test trip.',coverTheme:'forest',publicSections:['overview','today','explore','food']},
 days:[{date:'2026-09-24',label:'Thu 9/24',city:'Toronto',items:[{id:'arrival',time:'8:00 PM',title:'Arrive in Toronto',details:'Take UP Express downtown.',done:false}]}],
 places:[
  {id:'market',name:'St. Lawrence Market',region:'Toronto',area:'Toronto — St. Lawrence / Distillery',category:'Attraction',notes:'Browse the market.',mapUrl:'https://maps.example/market',menuUrl:'',websiteUrl:'',tags:[],priority:'must',visited:false},
  {id:'tower',name:'CN Tower',region:'Toronto',area:'Toronto — Downtown / Entertainment',category:'Attraction',notes:'City views.',mapUrl:'https://maps.example/tower',menuUrl:'',websiteUrl:'',tags:[],priority:'possible',visited:false}
 ],
 foods:[{id:'tart',title:'Butter tart',category:'Try',done:false}],packing:[]
};

test('public trip loads with useful navigation and no editor-only details',async({page})=>{
 await page.route('**/api/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:publicState,cloud:true,editor:false})}));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Toronto Test Trip'})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Trip sections'})).toBeVisible();
 await expect(page.getByText('Welcome to the test trip.')).toBeVisible();
 await expect(page.getByText('CONFIRM-123')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Trip',exact:true})).toBeVisible();
 await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
});

test('saved places are organized into neighborhood sections',async({page})=>{
 await page.route('**/api/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:publicState,cloud:true,editor:false})}));
 await page.goto('/');
 await page.getByRole('button',{name:'Explore',exact:true}).click();
 await page.getByRole('button',{name:'Saved Places',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Downtown / Entertainment'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'St. Lawrence / Distillery'})).toBeVisible();
 await expect(page.getByText('CN Tower',{exact:true})).toBeVisible();
 await expect(page.getByText('St. Lawrence Market',{exact:true})).toBeVisible();
});

test('place dietary filters clearly distinguish easy, recommended, and unfiltered results',async({page})=>{
 const editorState:TripState={...publicState,dietaryPreferences:['low-fodmap'],places:[
  {...publicState.places[0],foodPlace:true,dietaryRatings:[{preference:'low-fodmap',fit:'easy'}]},
  {...publicState.places[1],foodPlace:true,dietaryRatings:[{preference:'low-fodmap',fit:'difficult'}]}
 ]};
 await page.route('**/api/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:editorState,cloud:true,editor:true})}));
 await page.goto('/');
 await page.getByRole('button',{name:'Explore',exact:true}).click();
 await page.getByRole('button',{name:'Saved Places',exact:true}).click();
 await page.getByRole('button',{name:'Low-FODMAP',exact:true}).click();
 await expect(page.getByText('St. Lawrence Market',{exact:true})).toBeVisible();
 await expect(page.getByText('CN Tower',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Easy',exact:true}).click();
 await expect(page.getByText('St. Lawrence Market',{exact:true})).toBeVisible();
 await expect(page.getByText('CN Tower',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Any',exact:true}).last().click();
 await expect(page.getByText('CN Tower',{exact:true})).toBeVisible();
 await expect(page.getByText('St. Lawrence Market',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await expect(page.getByText('CN Tower',{exact:true})).toBeVisible();
 await expect(page.getByText('St. Lawrence Market',{exact:true})).toBeVisible();
});

test('editor itinerary changes are sent to shared saving',async({page})=>{
 const editorState:TripState={...publicState,days:[{...publicState.days[0],items:[{...publicState.days[0].items[0],keyInfo:'Private confirmation'}]}]};
 let saved:TripState|undefined;
 await page.route('**/api/state',async route=>{
  if(route.request().method()==='PUT'){
   saved=route.request().postDataJSON() as TripState;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,cloud:true})});
   return;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:editorState,cloud:true,editor:true})});
 });
 await page.goto('/');
 await page.getByRole('button',{name:'Plan',exact:true}).click();
 await page.getByRole('button',{name:'Edit Itinerary',exact:true}).click();
 await page.getByRole('button',{name:'Edit',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Notes'}).fill('Meet by the main entrance');
 await page.getByRole('button',{name:'Save changes'}).click();
 await expect.poll(()=>saved?.days[0].items[0].userNotes).toBe('Meet by the main entrance');
 await expect(page.getByText('Saved',{exact:true})).toBeVisible();
});

test('readiness queue opens the exact itinerary item to fix',async({page})=>{
 const editorState:TripState={...publicState,places:publicState.places.map(place=>({...place,ignoreHours:true})),days:[{...publicState.days[0],items:[{...publicState.days[0].items[0],fixed:true,placeId:'market',keyInfo:'Ticket saved'}]}]};
 await page.route('**/api/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:editorState,cloud:true,editor:true})}));
 await page.goto('/');
 const action=page.locator('.readinessAction').filter({hasText:'Arrive in Toronto'});
 await expect(action).toContainText('travel time');
 await action.getByRole('button',{name:'Review'}).click();
 await expect(page.getByRole('heading',{name:'Edit the trip without touching code'})).toBeVisible();
 await expect(page.locator('#itinerary-arrival')).toBeVisible();
});

test('readiness items can be dismissed and restored',async({page})=>{
 const editorState:TripState={...publicState,places:publicState.places.map(place=>({...place,ignoreHours:true})),days:[{...publicState.days[0],items:[{...publicState.days[0].items[0],fixed:true,placeId:'market',keyInfo:'Ticket saved'}]}]};
 let saved:TripState|undefined;
 await page.route('**/api/state',async route=>{
  if(route.request().method()==='PUT'){
   saved=route.request().postDataJSON() as TripState;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,cloud:true})});
   return;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:editorState,cloud:true,editor:true})});
 });
 await page.goto('/');
 const action=page.locator('.readinessAction').filter({hasText:'Arrive in Toronto'});
 await action.getByRole('button',{name:'Not needed'}).click();
 await expect.poll(()=>saved?.readinessIgnoredActionIds).toContain('fixed-arrival');
 await page.getByText('1 intentionally dismissed item').click();
 await page.getByRole('button',{name:'Restore'}).click();
 await expect.poll(()=>saved?.readinessIgnoredActionIds).toEqual([]);
 await expect(page.locator('.readinessAction').filter({hasText:'Arrive in Toronto'})).toBeVisible();
});

test('before-you-go suggestions save and surface the next preparation task',async({page})=>{
 const editorState:TripState={...publicState,packing:[]};
 let saved:TripState|undefined;
 await page.route('**/api/state',async route=>{
  if(route.request().method()==='PUT'){
   saved=route.request().postDataJSON() as TripState;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,cloud:true})});
   return;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:editorState,cloud:true,editor:true})});
 });
 await page.goto('/');
 await page.getByRole('button',{name:'Lists',exact:true}).click();
 await page.getByRole('button',{name:'Checklist',exact:true}).click();
 await page.getByRole('button',{name:'Add 5 suggestions'}).click();
 await expect.poll(()=>saved?.packing.filter(item=>item.checklistType==='prep').length).toBe(5);
 await page.getByRole('button',{name:'Trip',exact:true}).click();
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 await expect(page.getByText('Confirm local and event transportation')).toBeVisible();
 await expect(page.getByRole('button',{name:'Open checklist'})).toBeVisible();
});

test('itinerary shows exact between-stop directions and saves the travel mode',async({page})=>{
 const editorState:TripState={...publicState,days:[{...publicState.days[0],items:[
  {id:'tower-stop',time:'10:00 AM',title:'CN Tower',done:false,placeId:'tower',destination:'CN Tower'},
  {id:'market-stop',time:'12:00 PM',title:'St. Lawrence Market',done:false,placeId:'market',destination:'St. Lawrence Market',travelMinutes:14,travelMode:'transit'}
 ]}]};
 let saved:TripState|undefined;
 await page.route('**/api/state',async route=>{
  if(route.request().method()==='PUT'){
   saved=route.request().postDataJSON() as TripState;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,cloud:true})});
   return;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:editorState,cloud:true,editor:true})});
 });
 await page.goto('/');
 await page.getByRole('button',{name:'Plan',exact:true}).click();
 await page.getByRole('button',{name:'Edit Itinerary',exact:true}).click();
 const connector=page.getByLabel('Route from CN Tower to St. Lawrence Market');
 await expect(connector).toContainText('14 min');
 const directions=connector.getByRole('link',{name:'Directions ↗'});
 await expect(directions).toHaveAttribute('href',/origin=CN\+Tower/);
 await expect(directions).toHaveAttribute('href',/destination=St\.\+Lawrence\+Market/);
 await connector.getByRole('combobox').selectOption('walking');
 await expect.poll(()=>saved?.days[0].items[1].travelMode).toBe('walking');
});
