import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {loadState,saveState} from '@/lib/db';
import {initialState} from '@/data/initial';
import {applyDietaryGuidance} from '@/lib/dietary-guidance';
import {normalizeNearbyDietaryPresets} from '@/lib/dietary';
import {validToken} from '@/lib/auth';
import {publicTripState} from '@/lib/public-state';
import type {CheckItem,TripState} from '@/lib/types';
import {validateTripState} from '@/lib/trip-validation';

const checklistMigration:CheckItem[]=[
 {id:'p11',title:'Health insurance card/info',category:'Documents',done:false,checklistType:'packing'},
 {id:'p12',title:'Reservation confirmations',category:'Documents',done:false,checklistType:'packing'},
 {id:'p13',title:'Casual shirts',category:'Clothes',done:false,notes:'About 6–7 for the week.',checklistType:'packing'},
 {id:'p14',title:'Jeans / casual pants',category:'Clothes',done:false,notes:'Two pairs is likely enough.',checklistType:'packing'},
 {id:'p15',title:'Underwear and socks',category:'Clothes',done:false,notes:'Pack about 8 of each.',checklistType:'packing'},
 {id:'p16',title:'Sleepwear',category:'Clothes',done:false,checklistType:'packing'},
 {id:'p17',title:'Hoodie or sweatshirt',category:'Clothes',done:false,checklistType:'packing'},
 {id:'p18',title:'Chargers game-day gear',category:'Game Day',done:false,notes:'Jersey/shirt and any hat or layers you want at the Bills game.',checklistType:'packing'},
 {id:'p19',title:'Compact umbrella',category:'Weather',done:false,checklistType:'packing'},
 {id:'p20',title:'Sunglasses',category:'Weather',done:false,checklistType:'packing'},
 {id:'p21',title:'Sunscreen and lip balm',category:'Weather',done:false,checklistType:'packing'},
 {id:'p22',title:'Gas-X',category:'Health',done:false,checklistType:'packing'},
 {id:'p23',title:'Ibuprofen / usual OTC medications',category:'Health',done:false,checklistType:'packing'},
 {id:'p24',title:'Vitamins / other daily medications',category:'Health',done:false,checklistType:'packing'},
 {id:'p25',title:'Phone',category:'Tech',done:false,checklistType:'packing'},
 {id:'p26',title:'Apple Watch',category:'Tech',done:false,checklistType:'packing'},
 {id:'p27',title:'Charging cables and wall chargers',category:'Tech',done:false,checklistType:'packing'},
 {id:'p28',title:'Apple Watch charger',category:'Tech',done:false,checklistType:'packing'},
 {id:'p29',title:'Small day backpack',category:'Day Bag',done:false,checklistType:'packing'},
 {id:'p30',title:'Snacks for transit days',category:'Day Bag',done:false,checklistType:'packing'},
 {id:'p31',title:'Hand sanitizer and tissues',category:'Day Bag',done:false,checklistType:'packing'},
 {id:'p32',title:'Zip-top waterproof bag',category:'Niagara Falls',done:false,notes:'Useful for phone or small items on the boat.',checklistType:'packing'},
 {id:'p33',title:'Leave room for food and souvenirs',category:'Bags',done:false,notes:'Maple syrup, butter tarts, sponge candy, snacks, and other bring-home finds.',checklistType:'packing'},
 {id:'b1',title:'Try peameal bacon',category:'Food',done:false,notes:'Classic sandwich or a breakfast plate with eggs and potatoes.',checklistType:'bucket'},
 {id:'b2',title:'Try a good poutine',category:'Food',done:false,checklistType:'bucket'},
 {id:'b3',title:'Try one butter tart',category:'Food',done:false,checklistType:'bucket'},
 {id:'b4',title:"Try Mildred's blueberry pancakes with local maple syrup",category:'Food',done:false,notes:'Sampling one or two pancakes is enough.',checklistType:'bucket'},
 {id:'b5',title:'Try Montreal-style bagels',category:'Food',done:false,checklistType:'bucket'},
 {id:'b6',title:'Eat Buffalo wings',category:'Buffalo Food',done:false,checklistType:'bucket'},
 {id:'b7',title:'Try beef on weck',category:'Buffalo Food',done:false,checklistType:'bucket'},
 {id:'b8',title:'Go to Chargers at Bills',category:'Buffalo',done:false,checklistType:'bucket'},
 {id:'b9',title:'Take a Niagara Falls boat tour',category:'Niagara Falls',done:false,checklistType:'bucket'},
 {id:'b10',title:'See Horseshoe Falls from the Canadian side',category:'Niagara Falls',done:false,checklistType:'bucket'},
 {id:'b11',title:'Walk across Rainbow Bridge',category:'Niagara Falls',done:false,checklistType:'bucket'},
 {id:'b12',title:'Explore St. Lawrence Market',category:'Toronto',done:false,checklistType:'bucket'},
 {id:'b13',title:'Explore Kensington Market',category:'Toronto',done:false,checklistType:'bucket'},
 {id:'b14',title:'Get a Toronto skyline / waterfront view',category:'Toronto',done:false,notes:'CN Tower, islands, or waterfront depending on the day.',checklistType:'bucket'}
];

function migrateChecklist(stored:CheckItem[]){
 const ids=new Set(stored.map(item=>item.id));
 // Only run the seed migration on the older checklist shape. Once a migrated item is
 // saved or removed, we do not continually recreate it on later loads.
 const hasNewChecklistShape=stored.some(item=>item.checklistType==='bucket'||/^p(?:1[1-9]|[2-9]\d)$/.test(item.id));
 if(hasNewChecklistShape)return stored;
 return [...stored,...checklistMigration.filter(item=>!ids.has(item.id))];
}

function mergeState(stored:TripState):TripState{
 const storedDays=new Map(stored.days.map(day=>[day.date,day]));
 const days=initialState.days.map(day=>{
  const savedDay=storedDays.get(day.date);
  const savedItems=new Map(savedDay?.items.map(item=>[item.id,item])??[]);
  const initialIds=new Set(day.items.map(item=>item.id));
  const mergedInitialItems=day.items.map(item=>({
   ...item,
   ...savedItems.get(item.id),
   mapUrl:savedItems.get(item.id)?.mapUrl??item.mapUrl,
   routeText:savedItems.get(item.id)?.routeText??item.routeText
  }));
  const customItems=(savedDay?.items??[]).filter(item=>!initialIds.has(item.id));
  return {...day,...savedDay,items:[...mergedInitialItems,...customItems]};
 });

 const initialDates=new Set(initialState.days.map(day=>day.date));
 const customDays=stored.days.filter(day=>!initialDates.has(day.date));

 return normalizeNearbyDietaryPresets({
  ...initialState,
  ...stored,
  days:[...days,...customDays],
  packing:migrateChecklist(stored.packing?.length?stored.packing:initialState.packing),
  places:applyDietaryGuidance(stored.places?.length?stored.places:initialState.places)
 });
}

function freshState():TripState{return normalizeNearbyDietaryPresets({...initialState,packing:migrateChecklist(initialState.packing),places:applyDietaryGuidance(initialState.places)});}
async function editorRequest(){return validToken((await cookies()).get('trip_auth')?.value);}

export async function GET(){
 try{
  const stored=await loadState();
  const state=stored?mergeState(stored):freshState();
  const editor=await editorRequest();
  return NextResponse.json({state:editor?state:publicTripState(state),cloud:true,editor});
 }catch(error){
  console.error('Trip state load failed; using local fallback.',error);
  const state=freshState();
  const editor=await editorRequest();
  return NextResponse.json({state:editor?state:publicTripState(state),cloud:false,editor});
 }
}

export async function PUT(req:Request){
 if(!(await editorRequest()))return NextResponse.json({ok:false,cloud:false,error:'Editor access required'},{status:401});
 try{
  const state=await req.json() as unknown;
  const validation=validateTripState(state);
  if(!validation.valid)return NextResponse.json({ok:false,cloud:false,error:'Trip data failed validation.',details:validation.errors},{status:400});
  const saved=await saveState(state as TripState);
  return NextResponse.json({ok:true,cloud:saved});
 }catch(error){
  console.error('Trip state save failed; keeping device copy.',error);
  return NextResponse.json({ok:false,cloud:false,error:'Shared saving is temporarily unavailable. Your changes remain on this device.'},{status:503});
 }
}
