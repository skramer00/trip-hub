import {createClient} from '@supabase/supabase-js';
import type {TripState} from './types';
export function db(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return null;return createClient(url,key,{auth:{persistSession:false}})}
export async function loadState():Promise<TripState|null>{const c=db();if(!c)return null;const {data,error}=await c.from('trip_state').select('state').eq('id','toronto-2026').maybeSingle();if(error)throw error;return data?.state||null}
export async function saveState(state:TripState){const c=db();if(!c)return false;const {error}=await c.from('trip_state').upsert({id:'toronto-2026',state,updated_at:new Date().toISOString()});if(error)throw error;return true}
