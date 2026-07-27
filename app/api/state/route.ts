import {NextResponse} from 'next/server';
import {loadState,saveState} from '@/lib/db';
import {initialState} from '@/data/initial';

export async function GET(){
  try{
    const stored=await loadState();
    const state=stored?{...initialState,...stored,places:stored.places?.length?stored.places:initialState.places}:initialState;
    return NextResponse.json({state,cloud:true});
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
