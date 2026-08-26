import {createClient} from '@supabase/supabase-js';
import type {TripState} from './types';
import {normalizeItineraryOrder} from './state-order';
import {DEFAULT_TRIP_ID,LEGACY_TRIP_ID,normalizeTripId,tripSummary,type TripSummary} from './trips';

const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL??'https://eqkmhlimpcrbxfnqbmru.supabase.co';
const LOCAL_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY??'sb_publishable_EunOB6Ro5BIhPeAcE0JrHw_usx94FuG';

function databaseKey(){
 const elevated=process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(elevated)return elevated;
 if(process.env.NODE_ENV!=='production')return LOCAL_PUBLISHABLE_KEY;
 throw new Error('Server database credential is not configured.');
}

export function db(){return createClient(SUPABASE_URL,databaseKey(),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});}

async function stateForId(id:string):Promise<TripState|null>{
 const {data,error}=await db().from('trip_state').select('state').eq('id',id).maybeSingle();
 if(error)throw error;
 return data?.state?normalizeItineraryOrder(data.state as TripState):null;
}

export async function loadState(tripId=DEFAULT_TRIP_ID):Promise<TripState|null>{
 const id=normalizeTripId(tripId);
 const direct=await stateForId(id);
 if(direct)return direct;
 // Seamless migration: the existing production trip still lives under toronto-2026.
 if(id===DEFAULT_TRIP_ID)return stateForId(LEGACY_TRIP_ID);
 return null;
}

export async function saveState(state:TripState,tripId=DEFAULT_TRIP_ID){
 const id=normalizeTripId(tripId);
 const ordered=normalizeItineraryOrder(state);
 const {error}=await db().from('trip_state').upsert({id,state:ordered,updated_at:new Date().toISOString()});
 if(error)throw error;
 return true;
}

export async function listTrips():Promise<TripSummary[]>{
 const {data,error}=await db().from('trip_state').select('id,state,updated_at').order('updated_at',{ascending:false});
 if(error)throw error;
 const rows=(data??[]) as {id:string;state:TripState}[];
 const summaries=rows.filter(row=>row.state?.settings).map(row=>tripSummary(row.id===LEGACY_TRIP_ID?DEFAULT_TRIP_ID:row.id,normalizeItineraryOrder(row.state)));
 const unique=new Map<string,TripSummary>();
 summaries.forEach(summary=>{if(!unique.has(summary.id))unique.set(summary.id,summary);});
 return [...unique.values()].sort((a,b)=>(a.startDate||'9999').localeCompare(b.startDate||'9999'));
}
