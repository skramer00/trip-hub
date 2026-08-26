import type {TripState} from './types';

export const DEFAULT_TRIP_ID='toronto-niagara-buffalo-2026';
export const LEGACY_TRIP_ID='toronto-2026';

export type TripStatus='draft'|'upcoming'|'active'|'past'|'archived';
export type TripSummary={id:string;title:string;destinations:string;startDate:string;endDate:string;status:TripStatus};

export function normalizeTripId(value?:string|null){
 const cleaned=(value??'').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
 return cleaned||DEFAULT_TRIP_ID;
}

export function tripStatus(state:TripState,now=new Date()):TripStatus{
 const settings=state.settings;
 if(settings?.archived)return 'archived';
 if(!settings?.startDate||!settings?.endDate)return 'draft';
 const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
 if(today<settings.startDate)return 'upcoming';
 if(today>settings.endDate)return 'past';
 return 'active';
}

export function tripSummary(id:string,state:TripState):TripSummary{
 const settings=state.settings;
 return {id,title:settings?.title||'Untitled trip',destinations:settings?.destinations||'',startDate:settings?.startDate||'',endDate:settings?.endDate||'',status:tripStatus(state)};
}
