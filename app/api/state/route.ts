import {NextResponse} from 'next/server';
import {loadState,saveState} from '@/lib/db';
import {initialState} from '@/data/initial';
import type {TripState} from '@/lib/types';

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

 return {
  ...initialState,
  ...stored,
  days:[...days,...customDays],
  places:stored.places?.length?stored.places:initialState.places
 };
}

export async function GET(){
 try{
  const stored=await loadState();
  return NextResponse.json({state:stored?mergeState(stored):initialState,cloud:true});
 }catch(error){
  console.error('Trip state load failed; using local fallback.',error);
  return NextResponse.json({state:initialState,cloud:false});
 }
}

export async function PUT(req:Request){
 try{
  const state=await req.json();
  const saved=await saveState(state);
  return NextResponse.json({ok:true,cloud:saved});
 }catch(error){
  console.error('Trip state save failed; keeping device copy.',error);
  return NextResponse.json({ok:false,cloud:false},{status:200});
 }
}
