import Link from 'next/link';
import CreateTripForm from '@/components/CreateTripForm';
import {listTrips} from '@/lib/db';
import type {TripSummary} from '@/lib/trips';

export const dynamic='force-dynamic';

function section(title:string,trips:TripSummary[]){
 if(!trips.length)return null;
 return <section className="tripCatalogSection"><h2>{title}</h2><div className="tripCatalogGrid">{trips.map(trip=><Link className="card tripCatalogCard" href={`/trips/${trip.id}`} key={trip.id}><span className={`tripStatus ${trip.status}`}>{trip.status}</span><h3>{trip.title}</h3><p>{trip.destinations}</p><small>{trip.startDate}{trip.endDate&&trip.endDate!==trip.startDate?` → ${trip.endDate}`:''}</small></Link>)}</div></section>;
}

export default async function TripsPage(){
 let trips:TripSummary[]=[];
 try{trips=await listTrips();}catch{}
 const current=trips.filter(trip=>trip.status==='active'||trip.status==='upcoming');
 const drafts=trips.filter(trip=>trip.status==='draft');
 const past=trips.filter(trip=>trip.status==='past');
 return <main className="tripCatalog"><header><div><div className="eyebrow">TRIP HUB</div><h1>My Trips</h1><p>Every journey gets its own itinerary, places, food list, checklists, and assistant.</p></div><CreateTripForm/></header>{trips.length?<>{section('Upcoming & active',current)}{section('Drafts',drafts)}{section('Past trips',past)}</>:<div className="card tripCatalogEmpty"><h2>No trips yet</h2><p>Create your first trip to get a fresh itinerary, food list, saved places, packing list, and trip assistant.</p><CreateTripForm/></div>}</main>;
}
