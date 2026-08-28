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

test('Food Nearby uses the same three clear dietary choices',async({page})=>{
 const editorState:TripState={...publicState,dietaryPreferences:['low-fodmap'],places:[
  {...publicState.places[0],ignoreHours:true,foodPlace:true,dietaryRatings:[{preference:'low-fodmap',fit:'easy'}]},
  {...publicState.places[1],ignoreHours:true,foodPlace:true,dietaryRatings:[{preference:'low-fodmap',fit:'difficult'}]}
 ]};
 await page.route('**/api/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:editorState,cloud:true,editor:true})}));
 await page.goto('/');
 await page.getByRole('button',{name:'Explore',exact:true}).click();
 await page.getByRole('button',{name:'Nearby',exact:true}).click();
 await page.getByRole('button',{name:'Food nearby',exact:true}).click();
 const dietaryFit=page.getByLabel('Dietary fit');
 await expect(dietaryFit.locator('option')).toHaveText(['Easy','Easy + Workable','Any']);
 await dietaryFit.selectOption('easy');
 await expect(page.getByText('St. Lawrence Market',{exact:true})).toBeVisible();
 await expect(page.getByText('CN Tower',{exact:true})).toHaveCount(0);
 await dietaryFit.selectOption('all');
 await expect(page.getByText('CN Tower',{exact:true})).toBeVisible();
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

test('Trip Board previews timing pressure and safely adjusts flexible stops',async({page})=>{
 const editorState:TripState={...publicState,days:[{...publicState.days[0],items:[
  {id:'tour',time:'10:00 AM',title:'Timed tour',done:false,fixed:true,estimatedDuration:60,locationNotNeeded:false},
  {id:'coffee',time:'10:30 AM',title:'Coffee stop',done:false,fixed:false,estimatedDuration:30,travelMinutes:15,locationNotNeeded:false}
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
 await expect(page.getByRole('heading',{name:'Build the whole trip at a glance'})).toBeVisible();
 await expect(page.getByText('→ 11:15 AM')).toBeVisible();
 await expect(page.getByLabel('Route from Timed tour to Coffee stop')).toContainText('45 min late');
 await page.getByRole('button',{name:'Adjust times'}).click();
 await expect.poll(()=>saved?.days[0].items[0].time).toBe('10:00 AM');
 await expect.poll(()=>saved?.days[0].items[1].time).toBe('11:15 AM');
});

test('Trip Board quick editor previews and saves stop changes without leaving the board',async({page})=>{
 const editorState:TripState={...publicState,days:[{...publicState.days[0],items:[
  {id:'tour',time:'10:00 AM',title:'Timed tour',destination:'CN Tower',done:false,fixed:true,estimatedDuration:60},
  {id:'coffee',time:'11:30 AM',title:'Coffee stop',destination:'Dineen Coffee',done:false,fixed:false,estimatedDuration:30,travelMinutes:15},
  {id:'dinner',time:'1:00 PM',title:'Lunch reservation',destination:'St. Lawrence Market',done:false,fixed:true,estimatedDuration:60,travelMinutes:20}
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
 await page.getByRole('button',{name:'Coffee stop',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Coffee stop'});
 await expect(editor).toBeVisible();
 await expect(editor.getByRole('button',{name:'Save stop'})).toBeDisabled();
 await editor.getByLabel('Time',{exact:true}).fill('12:00 PM');
 await editor.getByLabel('Type').selectOption('food');
 await editor.getByLabel('Destination').fill('St. Lawrence Market');
 await editor.getByLabel('Notes').fill('Try a light lunch nearby');
 await expect(editor.getByLabel('Route and schedule preview')).toContainText('Timed tour');
 await expect(editor.getByLabel('Route and schedule preview')).toContainText('Lunch reservation');
 await expect(editor.getByLabel('Preview route from Timed tour to Coffee stop').getByRole('link',{name:'Directions ↗'})).toHaveAttribute('href',/origin=CN\+Tower/);
 await expect(editor.getByLabel('Preview route from Coffee stop to Lunch reservation')).toContainText('min margin');
 await expect(editor.getByText('Unsaved changes',{exact:true})).toBeVisible();
 await editor.getByRole('button',{name:'Close quick editor'}).click();
 const discardDialog=page.getByRole('alertdialog',{name:'Discard your edits?'});
 await expect(discardDialog).toBeVisible();
 await discardDialog.getByRole('button',{name:'Keep editing'}).click();
 await expect(discardDialog).toHaveCount(0);
 await expect(editor.getByLabel('Notes')).toHaveValue('Try a light lunch nearby');
 await editor.getByRole('button',{name:'Save stop'}).click();
 await expect.poll(()=>saved?.days[0].items.find(item=>item.id==='coffee')?.time).toBe('12:00 PM');
 await expect.poll(()=>saved?.days[0].items.find(item=>item.id==='coffee')?.type).toBe('food');
 await expect.poll(()=>saved?.days[0].items.find(item=>item.id==='coffee')?.userNotes).toBe('Try a light lunch nearby');
 await expect(page.getByRole('heading',{name:'Build the whole trip at a glance'})).toBeVisible();
});

test('Trip Board quick editor only discards changed drafts after confirmation',async({page})=>{
 await page.route('**/api/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:publicState,cloud:true,editor:true})}));
 await page.goto('/');
 await page.getByRole('button',{name:'Plan',exact:true}).click();
 await page.getByRole('button',{name:'Arrive in Toronto',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Arrive in Toronto'});
 await editor.getByLabel('Notes').fill('Keep this draft safe');
 await page.keyboard.press('Escape');
 const discardDialog=page.getByRole('alertdialog',{name:'Discard your edits?'});
 await expect(discardDialog).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(discardDialog).toHaveCount(0);
 await expect(editor.getByLabel('Notes')).toHaveValue('Keep this draft safe');
 await editor.getByRole('button',{name:'Cancel'}).click();
 await discardDialog.getByRole('button',{name:'Discard changes'}).click();
 await expect(editor).toHaveCount(0);
});

test('Add to Day schedules saved places and custom stops from one flow',async({page})=>{
 const editorState:TripState={...publicState};
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
 await page.getByRole('button',{name:'+ Add to day'}).click();
 const dialog=page.getByRole('dialog',{name:'Add to day'});
 await dialog.getByPlaceholder('Search saved places…').fill('CN Tower');
 await dialog.locator('input[type="time"]').fill('15:15');
 await dialog.getByRole('button',{name:'Plan',exact:true}).click();
 await expect(dialog.getByLabel('Route preview')).toContainText('Route-aware placement');
 await expect(dialog.getByLabel('Stop position')).toContainText('Recommended');
 await expect(dialog.getByLabel('Day placement preview')).toContainText('CN Tower');
 await expect(dialog.getByLabel('Day placement preview').locator('li.candidate')).toContainText('Recommended spot');
 await dialog.getByRole('button',{name:'Use recommended position + time'}).click();
 await expect(dialog.getByRole('button',{name:'Recommended position and time applied'})).toBeDisabled();
 await dialog.locator('input[type="time"]').fill('15:15');
 await dialog.getByLabel('Stop position').selectOption('0');
 await expect(dialog.getByLabel('Day placement preview').locator('li').first()).toContainText('CN Tower');
 await dialog.getByRole('combobox',{name:'Travel by'}).selectOption('walking');
 await dialog.getByRole('button',{name:'Add to day',exact:true}).click();
 await expect.poll(()=>saved?.days[0].items.find(item=>item.placeId==='tower')?.time).toBe('3:15 PM');
 await expect.poll(()=>saved?.days[0].items.find(item=>item.placeId==='tower')?.estimatedDuration).toBe(60);
 await expect.poll(()=>saved?.days[0].items.find(item=>item.placeId==='tower')?.travelMode).toBe('walking');
 await expect.poll(()=>saved?.days[0].items[0].placeId).toBe('tower');

 await page.getByRole('button',{name:'+ Add to day'}).click();
 await page.getByRole('button',{name:'Custom stop'}).click();
 await page.getByPlaceholder('Lunch, scenic walk, hotel break…').fill('Waterfront break');
 await page.getByPlaceholder('Optional, but needed for directions').fill('Harbourfront Centre');
 await page.getByRole('button',{name:'Add custom stop'}).click();
 await expect.poll(()=>saved?.days[0].items.find(item=>item.title==='Waterfront break')?.mapUrl).toContain('Harbourfront%20Centre');
 await expect(page.getByRole('button',{name:'↶ Undo planning change'})).toBeVisible();
});

test('Add to Day saves a Google result with its hours and links the new stop',async({page})=>{
 let saved:TripState|undefined;
 await page.addInitScript(()=>sessionStorage.setItem('places-refresh-secret','test-secret'));
 await page.route('**/api/state',async route=>{
  if(route.request().method()==='PUT'){
   saved=route.request().postDataJSON() as TripState;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,cloud:true})});return;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:publicState,cloud:true,editor:true})});
 });
 await page.route('**/api/places/search',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:[{googlePlaceId:'google-aquarium',name:"Ripley's Aquarium",formattedAddress:'288 Bremner Blvd, Toronto',category:'Aquarium',weeklyHours:{thursday:{open:'09:00',close:'21:00'}}}]})}));
 await page.goto('/');
 await page.getByRole('button',{name:'Plan',exact:true}).click();
 await page.getByRole('button',{name:'Edit Itinerary',exact:true}).click();
 await page.getByRole('button',{name:'+ Add to day'}).click();
 const dialog=page.getByRole('dialog',{name:'Add to day'});
 await dialog.getByRole('button',{name:'Search Google'}).click();
 await dialog.getByPlaceholder('Restaurant, attraction, hotel…').fill('Ripley aquarium');
 await dialog.getByRole('button',{name:'Search',exact:true}).click();
 await dialog.getByRole('button',{name:'Plan',exact:true}).click();
 await expect(dialog.getByLabel('Route preview')).toBeVisible();
 await dialog.getByRole('button',{name:'Save place + add to day'}).click();
 await expect.poll(()=>saved?.places.find(place=>place.googlePlaceId==='google-aquarium')?.weeklyHours?.thursday?.close).toBe('21:00');
 const googlePlaceId=saved?.places.find(place=>place.googlePlaceId==='google-aquarium')?.id;
 await expect.poll(()=>saved?.days[0].items.find(item=>item.title==="Ripley's Aquarium")?.placeId).toBe(googlePlaceId);
});
