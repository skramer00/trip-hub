import {createClient} from '@supabase/supabase-js';
import type {TripState} from './types';

const SUPABASE_URL='https://eqkmhlimpcrbxfnqbmru.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_EunOB6Ro5BIhPeAcE0JrHw_usx94FuG';

export function db(){
  return createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
}

export async function loadState():Promise<TripState|null>{
  const {data,error}=await db().from('trip_state').select('state').eq('id','toronto-2026').maybeSingle();
  if(error)throw error;
  return data?.state||null;
}

export async function saveState(state:TripState){
  const {error}=await db().from('trip_state').upsert({id:'toronto-2026',state,updated_at:new Date().toISOString()});
  if(error)throw error;
  return true;
}