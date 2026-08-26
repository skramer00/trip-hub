import Link from 'next/link';
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
 return <main className="tripCatalog"><header><div><div className="eyebrow">TRIP HUB</div><h1>My Trips</h1><p>Every journey gets its own itinerary, places, food list, checklists, and assistant.</p></div><button className="btn primary" disabled title="Trip creation is the next step">+ Create Trip</button></header>{trips.length?<>{section('Upcoming & active',current)}{section('Drafts',drafts)}{section('Past trips',past)}</>:<div className="card"><h2>No trips found</h2><p>Your existing trip will appear here once the database is available.</p></div>}</main>;
}
