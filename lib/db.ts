import {createClient} from '@supabase/supabase-js';
import type {TripState} from './types';
import {normalizeItineraryOrder} from './state-order';

const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL??'https://eqkmhlimpcrbxfnqbmru.supabase.co';
const LOCAL_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY??'sb_publishable_EunOB6Ro5BIhPeAcE0JrHw_usx94FuG';

function databaseKey(){
 const elevated=process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(elevated)return elevated;
 if(process.env.NODE_ENV!=='production')return LOCAL_PUBLISHABLE_KEY;
 throw new Error('Server database credential is not configured.');
}

export function db(){
  return createClient(SUPABASE_URL,databaseKey(),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}

export async function loadState():Promise<TripState|null>{
  const {data,error}=await db().from('trip_state').select('state').eq('id','toronto-2026').maybeSingle();
  if(error)throw error;
  return data?.state?normalizeItineraryOrder(data.state as TripState):null;
}

export async function saveState(state:TripState){
  const ordered=normalizeItineraryOrder(state);
  const {error}=await db().from('trip_state').upsert({id:'toronto-2026',state:ordered,updated_at:new Date().toISOString()});
  if(error)throw error;
  return true;
}
