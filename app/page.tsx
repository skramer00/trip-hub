import TripApp from '@/components/TripApp';
import type {Metadata} from 'next';
import {loadState} from '@/lib/db';
import {resolvedTripSettings,tripDateLabel} from '@/lib/trip-settings';

export const dynamic='force-dynamic';

export async function generateMetadata():Promise<Metadata>{
 let settings=resolvedTripSettings();
 try{settings=resolvedTripSettings((await loadState())?.settings);}catch{}
 const description=settings.publicMessage||`${settings.destinations} · ${tripDateLabel(settings.startDate,settings.endDate)}`;
 return {title:settings.title,description,openGraph:{title:settings.title,description,type:'website',siteName:'Trip Hub'},twitter:{card:'summary_large_image',title:settings.title,description}};
}

export default function Page() {
  return <TripApp />;
}
