import Link from 'next/link';
import {cookies} from 'next/headers';
import CreateTripForm from '@/components/CreateTripForm';
import TripManager from '@/components/TripManager';
import MyTripsAccount from '@/components/MyTripsAccount';
import {currentAccount,membershipsForUser,type AccountRole} from '@/lib/account-auth';
import {validToken} from '@/lib/auth';
import {listTrips} from '@/lib/db';
import type {TripSummary} from '@/lib/trips';

export const dynamic='force-dynamic';

type TripWithRole=TripSummary&{accessRole:AccountRole|'owner-pin'};
function section(title:string,trips:TripWithRole[]){
 if(!trips.length)return null;
 return <section className="tripCatalogSection"><h2>{title}</h2><div className="tripCatalogGrid">{trips.map(trip=><article className="card tripCatalogCard" key={trip.id}><Link className="tripCatalogLink" href={`/trips/${trip.id}`}><div className="between"><span className={`tripStatus ${trip.status}`}>{trip.status}</span><span className="chip neutral tripRole">{trip.accessRole==='owner-pin'?'Owner access':trip.accessRole}</span></div><h3>{trip.title}</h3><p>{trip.destinations}</p><small>{trip.startDate}{trip.endDate&&trip.endDate!==trip.startDate?` → ${trip.endDate}`:''}</small></Link>{trip.accessRole!=='viewer'&&<TripManager trip={trip} canOwn={trip.accessRole==='owner'||trip.accessRole==='owner-pin'}/>}</article>)}</div></section>;
}

export default async function TripsPage(){
 const account=await currentAccount();
 const masterOwner=validToken((await cookies()).get('trip_auth')?.value);
 let trips:TripWithRole[]=[];let legacyTrips:TripSummary[]=[];
 try{
  const all=await listTrips();
  if(account){
   const memberships=await membershipsForUser(account.id);const roles=new Map(memberships.map(item=>[item.tripId,item.role]));
   trips=all.filter(trip=>roles.has(trip.id)).map(trip=>({...trip,accessRole:roles.get(trip.id)!}));
   if(masterOwner)legacyTrips=all.filter(trip=>!roles.has(trip.id));
  }else if(masterOwner){trips=all.map(trip=>({...trip,accessRole:'owner-pin' as const}));}
 }catch{}
 const current=trips.filter(trip=>trip.status==='active'||trip.status==='upcoming');
 const drafts=trips.filter(trip=>trip.status==='draft');
 const past=trips.filter(trip=>trip.status==='past');
 const archived=trips.filter(trip=>trip.status==='archived');
 const canCreate=Boolean(account||masterOwner);
 return <main className="tripCatalog"><header><div><div className="eyebrow">TRIP HUB</div><h1>My Trips</h1><p>{account?'Trips you own or have been invited to.':'Your private trip workspace and shared journeys.'}</p></div>{canCreate&&<CreateTripForm/>}</header><MyTripsAccount account={account?{email:account.email,name:account.name}:null} legacyTrips={legacyTrips.map(trip=>({id:trip.id,title:trip.title,destinations:trip.destinations}))}/>{canCreate?(trips.length?<>{section('Upcoming & active',current)}{section('Drafts',drafts)}{section('Past trips',past)}{section('Archived',archived)}</>:<div className="card tripCatalogEmpty"><h2>No trips on this account yet</h2><p>{account?'If you have an older Trip Hub trip, use account migration above to attach it. Otherwise create your first trip.':'Create a trip, or accept an invitation from another traveler.'}</p><CreateTripForm/></div>):null}</main>;
}
