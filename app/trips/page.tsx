import Link from 'next/link';
import {cookies} from 'next/headers';
import CreateTripForm from '@/components/CreateTripForm';
import TripManager from '@/components/TripManager';
import MyTripsAccount from '@/components/MyTripsAccount';
import {currentAccount,membershipsForUser,tripVisibility,type AccountRole,type TripVisibility} from '@/lib/account-auth';
import {validToken} from '@/lib/auth';
import {listTrips,loadState} from '@/lib/db';
import {tripPlanningFocus,type TripPlanningFocus,type TripSummary} from '@/lib/trips';

export const dynamic='force-dynamic';

type TripWithRole=TripSummary&{accessRole:AccountRole|'owner-pin';visibility?:TripVisibility;focus?:TripPlanningFocus};
function updatedLabel(value?:string){if(!value)return'';const date=new Date(value);if(Number.isNaN(date.getTime()))return'';const diff=Date.now()-date.getTime();if(diff<3600000)return'Updated recently';if(diff<86400000)return`Updated ${Math.max(1,Math.round(diff/3600000))}h ago`;if(diff<604800000)return`Updated ${Math.max(1,Math.round(diff/86400000))}d ago`;return`Updated ${date.toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;}
function section(title:string,trips:TripWithRole[]){
 if(!trips.length)return null;
 return <section className="tripCatalogSection"><h2>{title}</h2><div className="tripCatalogGrid">{trips.map(trip=>{const focus=trip.focus??{tab:'Overview',label:'Open trip',detail:'Continue planning your trip.'};return <article className="card tripCatalogCard" key={trip.id}><Link className="tripCatalogLink" href={`/trips/${trip.id}`}><div className="between"><div className="tripCardBadges"><span className={`tripStatus ${trip.status}`}>{trip.status}</span>{trip.visibility&&<span className={`tripVisibilityBadge ${trip.visibility}`}>{trip.visibility==='shared'?'Shared by link':trip.visibility}</span>}</div><span className="chip neutral tripRole">{trip.accessRole==='owner-pin'?'Owner access':trip.accessRole}</span></div><h3>{trip.title}</h3><p>{trip.destinations}</p><div className="tripMeta"><small>{trip.startDate}{trip.endDate&&trip.endDate!==trip.startDate?` → ${trip.endDate}`:''}</small>{trip.updatedAt&&<small>{updatedLabel(trip.updatedAt)}</small>}</div></Link><div className="tripContinue"><div><span className="eyebrow">NEXT BEST STEP</span><strong>{focus.label}</strong><small>{focus.detail}</small></div><Link className="btn primary" href={`/trips/${trip.id}?tab=${encodeURIComponent(focus.tab)}`}>{focus.label} →</Link></div>{trip.accessRole!=='viewer'&&<TripManager trip={trip} canOwn={trip.accessRole==='owner'||trip.accessRole==='owner-pin'}/>}</article>;})}</div></section>;
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
  trips=await Promise.all(trips.map(async trip=>{try{const [state,visibility]=await Promise.all([loadState(trip.id),tripVisibility(trip.id)]);return {...trip,visibility,focus:state?tripPlanningFocus(state):undefined};}catch{return trip;}}));
 }catch{}
 const current=trips.filter(trip=>trip.status==='active'||trip.status==='upcoming');
 const drafts=trips.filter(trip=>trip.status==='draft');
 const past=trips.filter(trip=>trip.status==='past');
 const archived=trips.filter(trip=>trip.status==='archived');
 const canCreate=Boolean(account||masterOwner);
 const openTrip=trips.find(trip=>trip.status==='active')??trips.find(trip=>trip.status==='upcoming')??trips[0];
 return <main className="tripCatalog"><nav className="tripCatalogNav" aria-label="Trip Hub"><Link className="tripCatalogBrand" href="/trips">Trip Hub</Link><div><Link className="active" href="/trips">My Trips</Link>{openTrip&&<Link href={`/trips/${openTrip.id}`}>Open trip</Link>}</div></nav><header><div><div className="eyebrow">TRIP HUB</div><h1>My Trips</h1><p>{account?'Your trips, access, and the next useful planning step in one place.':'Your private trip workspace and shared journeys.'}</p></div>{canCreate&&<CreateTripForm/>}</header><MyTripsAccount account={account?{email:account.email,name:account.name}:null} legacyTrips={legacyTrips.map(trip=>({id:trip.id,title:trip.title,destinations:trip.destinations}))}/>{canCreate?(trips.length?<>{section('Upcoming & active',current)}{section('Drafts',drafts)}{section('Past trips',past)}{section('Archived',archived)}</>:<div className="card tripCatalogEmpty"><h2>No trips on this account yet</h2><p>{account?'Create your first trip to start planning.':'Create a trip, or accept an invitation from another traveler.'}</p><CreateTripForm/></div>):null}</main>;
}
