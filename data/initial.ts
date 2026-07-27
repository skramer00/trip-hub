import {gunzipSync} from 'node:zlib';
import {compressedPlaces} from './placesCompressed';
import type {ItineraryItem,Place,TripDay,TripState} from '@/lib/types';

type CompactPlace=[string,0|1,string,string,string,string[],'must'|'possible'|'backup',string[]];
const compact=JSON.parse(gunzipSync(Buffer.from(compressedPlaces,'base64')).toString('utf8')) as CompactPlace[];
const places:Place[]=compact.map((p,index)=>({id:`place-${String(index+1).padStart(3,'0')}`,name:p[0],region:p[1]===0?'Toronto':'Niagara & Buffalo',category:p[2],notes:p[3],mapUrl:p[4].startsWith('http')?p[4]:`https://www.google.com/maps/place/${p[4]}`,menuUrl:'',websiteUrl:'',tags:p[5],priority:p[6],visited:false,recommendedDates:p[7]}));

const transit=(destination:string,routeText:string)=>({mapUrl:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=transit`,routeText});
const routeById:Record<string,Pick<ItineraryItem,'mapUrl'|'routeText'>>={
 'd1-1':transit('Los Angeles International Airport','Open transit directions from your current location to LAX.'),
 'd1-2':transit('Los Angeles International Airport','Use the LAX route above; this item is the flight itself.'),
 'd1-3':transit('Toronto Pearson International Airport','Arrival point: Toronto Pearson Terminal 3.'),
 'd1-4':transit('Hilton Toronto, 145 Richmond St W, Toronto, ON','Take UP Express from Pearson to Union Station, then subway or walk to the hotel.'),
 'd2-1':transit('Nathan Phillips Square, Toronto, ON','Use TTC to Osgoode or Queen station, then walk to Nathan Phillips Square.'),
 'd2-2':transit('Toronto Railway Museum, 255 Bremner Blvd, Toronto, ON','Take TTC to Union or St Andrew, then walk toward Roundhouse Park and the waterfront.'),
 'd2-3':transit('NomNomNom Poutine, 707 Dundas St W, Toronto, ON','Transit directions to a saved poutine option; adjust the destination if dinner changes.'),
 'd3-1':transit('Union Station, Toronto, ON','Take TTC or walk to Union Station with luggage.'),
 'd3-2':transit('Niagara Falls GO, Niagara Falls, ON','GO Transit route from your current location to Niagara Falls GO.'),
 'd3-3':transit('Rainbow International Bridge, Niagara Falls, ON','Use WEGO or local transit toward the falls, then walk across Rainbow Bridge.'),
 'd3-4':transit('Queen Victoria Park, Niagara Falls, ON','WEGO or local transit to the main falls viewing area for fireworks.'),
 'd4-1':transit('Highmark Stadium, Orchard Park, NY','Use your reserved game shuttle. Google Maps is included as a backup only.'),
 'd4-2':transit('Highmark Stadium, Orchard Park, NY','Use the reserved game shuttle to Highmark Stadium.'),
 'd4-3':transit('Anchor Bar, 1047 Main St, Buffalo, NY','NFTA transit toward downtown Buffalo; choose the exact restaurant based on shuttle timing.'),
 'd5-1':transit('Maid of the Mist, Niagara Falls, NY','Walk or take local transit to the Maid of the Mist entrance at Niagara Falls State Park.'),
 'd5-2':transit('Horseshoe Falls Lookout, Niagara Falls, ON','Walk across Rainbow Bridge, then use WEGO south toward Table Rock and Horseshoe Falls.'),
 'd5-3':transit('Revery Toronto Downtown, Curio Collection by Hilton','Take GO or VIA/Amtrak toward Toronto, then TTC or walk from Union to Revery.'),
 'd6-1':transit("Mildred's Temple Kitchen, 85 Hanna Ave, Toronto, ON",'Take TTC to Exhibition or King, then walk into Liberty Village.'),
 'd6-2':transit('St. Lawrence Market, Toronto, ON','Take TTC to King station, then walk east on Front Street.'),
 'd6-3':transit('Kensington Market, Toronto, ON','Take TTC to Spadina or Queen, then walk into Kensington Market and Chinatown.'),
 'd7-1':transit('Royal Ontario Museum, Toronto, ON','Take Line 1 to Museum station.'),
 'd7-2':transit('Casa Loma, Toronto, ON','Take Line 1 to Dupont, then walk or use a short bus connection to Casa Loma.'),
 'd7-3':transit('Loblaws Lower Jarvis Street, Toronto, ON','Transit to a central grocery option for Canadian snacks and bring-home shopping.'),
 'd8-1':transit('Union Station, Toronto, ON','Take TTC or walk from the hotel to Union Station with luggage.'),
 'd8-2':transit('Toronto Pearson International Airport','Take UP Express from Union Station to Pearson Airport.'),
 'd8-3':transit('Toronto Pearson International Airport','Use the Pearson route above; this item is the flight itself.')
};

const rawDays:TripDay[]=[
 {date:'2026-09-24',label:'Thu 9/24',city:'Toronto',items:[{id:'d1-1',time:'10:30 AM',title:'Leave for LAX',details:'Bring lunch or buy food after TSA.',done:false},{id:'d1-2',time:'2:20 PM',title:'Porter flight to Toronto Pearson',done:false},{id:'d1-3',time:'10:00 PM',title:'Arrive and clear customs',done:false},{id:'d1-4',time:'Late',title:'UP Express to Union and hotel check-in',done:false}]},
 {date:'2026-09-25',label:'Fri 9/25',city:'Toronto',items:[{id:'d2-1',time:'Morning',title:'City Hall and Toronto sign',done:false},{id:'d2-2',time:'Afternoon',title:'Waterfront, railway museum, CN Tower or islands',done:false},{id:'d2-3',time:'Evening',title:'Dinner and poutine',done:false}]},
 {date:'2026-09-26',label:'Sat 9/26',city:'Niagara Falls',items:[{id:'d3-1',time:'Morning',title:'Check out and head to Union',done:false},{id:'d3-2',time:'11:00 AM',title:'GO train to Niagara Falls',done:false},{id:'d3-3',time:'Afternoon',title:'Canadian views and Rainbow Bridge crossing',done:false},{id:'d3-4',time:'10:00 PM',title:'Falls fireworks',optional:true,done:false}]},
 {date:'2026-09-27',label:'Sun 9/27',city:'Buffalo',items:[{id:'d4-1',time:'Morning',title:'Game shuttle',done:false},{id:'d4-2',time:'1:00 PM',title:'Chargers at Bills — Section 139',done:false},{id:'d4-3',time:'Evening',title:'Wings, beef on weck, or Stinger',done:false}]},
 {date:'2026-09-28',label:'Mon 9/28',city:'Niagara → Toronto',items:[{id:'d5-1',time:'Morning',title:'Maid of the Mist',done:false},{id:'d5-2',time:'Afternoon',title:'Cross to Canada and visit Horseshoe Falls',done:false},{id:'d5-3',time:'Later',title:'Train to Toronto and Revery check-in',done:false}]},
 {date:'2026-09-29',label:'Tue 9/29',city:'Toronto',items:[{id:'d6-1',time:'Morning',title:"Mildred's Temple Kitchen",done:false},{id:'d6-2',time:'Lunch',title:'St. Lawrence Market',done:false},{id:'d6-3',time:'Afternoon',title:'Kensington Market and Chinatown',done:false}]},
 {date:'2026-09-30',label:'Wed 9/30',city:'Toronto',items:[{id:'d7-1',time:'Morning',title:'Royal Ontario Museum',done:false},{id:'d7-2',time:'Afternoon',title:'Toronto Reference Library or Casa Loma',done:false},{id:'d7-3',time:'Later',title:'Butter tarts and bring-home shopping',done:false}]},
 {date:'2026-10-01',label:'Thu 10/1',city:'Travel home',items:[{id:'d8-1',time:'7:30 AM',title:'Check out and head to Union',done:false},{id:'d8-2',time:'8:00 AM',title:'UP Express to Pearson',done:false},{id:'d8-3',time:'11:00 AM',title:'Flight to LAX',done:false}]}
];
const days=rawDays.map(day=>({...day,items:day.items.map(item=>({...item,...routeById[item.id]}))}));

export const initialState:TripState={
 days,
 foods:[{id:'f1',title:'Peameal bacon sandwich',category:'Try',done:false,notes:'Carousel Bakery'},{id:'f2',title:'Poutine',category:'Try',done:false},{id:'f3',title:'Butter tart',category:'Try',done:false},{id:'f4',title:'Montreal-style bagel',category:'Try',done:false},{id:'f5',title:'Buffalo wings',category:'Try',done:false},{id:'f6',title:'Beef on weck',category:'Try',done:false},{id:'f7',title:'Stinger sub',category:'Try',done:false},{id:'f8',title:'Sponge candy',category:'Bring home',done:false},{id:'f9',title:'Maple syrup',category:'Bring home',done:false},{id:'f10',title:'Coffee Crisp and Aero bars',category:'Bring home',done:false},{id:'f11',title:'All-Dressed or ketchup chips',category:'Bring home',done:false}],
 packing:[{id:'p1',title:'Passports and IDs',category:'Documents',done:true},{id:'p2',title:'Flight, hotel, and game confirmations',category:'Documents',done:false},{id:'p3',title:'Nexium and eye drops',category:'Health',done:false},{id:'p4',title:'Chargers and power banks',category:'Tech',done:false},{id:'p5',title:'iPad and headphones',category:'Tech',done:false},{id:'p6',title:'Chargers jerseys',category:'Clothes',done:false},{id:'p7',title:'Jacket and rain layer',category:'Clothes',done:false},{id:'p8',title:'Comfortable non-slip shoes',category:'Clothes',done:false},{id:'p9',title:'Packable duffel',category:'Bags',done:false},{id:'p10',title:'Empty water bottle',category:'Travel',done:false}],
 places
};