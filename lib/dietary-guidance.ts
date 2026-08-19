import type {DietaryFit,Place} from '@/lib/types';

type Guidance={fit:DietaryFit;tip:string};

// Practical ordering guidance, not a claim that a restaurant or dish is medically safe.
// Names are normalized so this also applies to matching places already stored in Supabase.
const lowFodmapGuidance:Record<string,Guidance>={
 "buster's sea cove":{fit:'easy',tip:'Best bet: grilled fish with potatoes or another simple side. Ask about garlic/onion seasoning and request sauce separately.'},
 "table rock house restaurant":{fit:'easy',tip:'Best bet: grilled fish or another simply prepared protein with potatoes or rice. Ask about garlic/onion seasoning and request sauce separately.'},
 "swiss chalet":{fit:'workable',tip:'Rotisserie chicken with a simple side may be the most straightforward order. Ask about seasoning and keep dipping sauce separate.'},
 "the griffon gastropub":{fit:'workable',tip:'Look for grilled fish, chicken, or another simple protein with potatoes or rice. Ask about seasoning and order sauces or dressings separately.'},
 "stacked pancake & breakfast house":{fit:'workable',tip:'Eggs with plain potatoes are a simpler choice. If trying pancakes, choose the portion and toppings that work for you.'},
 "mildred's temple kitchen":{fit:'workable',tip:'Eggs or another simple protein may be easier. If sampling the pancakes, consider sharing or choosing a smaller portion.'},
 "carousel bakery | order online carouselbakery.ca":{fit:'workable',tip:'Peameal itself may be simpler than the full sandwich. Consider splitting the classic sandwich or choosing a smaller portion.'},
 "carousel bakery":{fit:'workable',tip:'Peameal itself may be simpler than the full sandwich. Consider splitting the classic sandwich or choosing a smaller portion.'},
 "charlie the butcher's carvery":{fit:'workable',tip:'The roast beef may be simpler than the full sandwich. Consider splitting a beef on weck and go lightly on horseradish or other toppings.'},
 "charlie the butcher's kitchen":{fit:'workable',tip:'The roast beef may be simpler than the full sandwich. Consider splitting a beef on weck and go lightly on horseradish or other toppings.'},
 "nomnomnom poutine":{fit:'difficult',tip:'Poutine combines a large serving of fries, cheese curds, and gravy. Consider sharing it or sampling a smaller portion.'},
 "smoke's poutinerie adelaide":{fit:'difficult',tip:'Poutine combines a large serving of fries, cheese curds, and gravy. Consider sharing it or sampling a smaller portion.'},
 "anchor bar":{fit:'difficult',tip:'Wings, breading, and sauces can combine several potential triggers. Choose the portion and sauce level that work for you.'},
 "jim's steakout":{fit:'difficult',tip:'A Stinger combines steak, breaded chicken, cheese, sauce, and a large roll. Sampling or sharing may be more workable.'},
 "victor's on north":{fit:'difficult',tip:'A Stinger combines steak, breaded chicken, cheese, sauce, and a large roll. Sampling or sharing may be more workable.'},
 "fresco's fish and chips":{fit:'difficult',tip:'Fried batter, seasoning, and a larger serving may be harder to adjust. Consider sharing or ask whether simply prepared fish is available.'},
 "lobster burger bar":{fit:'workable',tip:'Look for simply prepared seafood with rice or potatoes. Ask about garlic/onion seasoning and request sauces separately.'},
 "earls kitchen + bar - financial district (king & university)":{fit:'workable',tip:'Choose a simply prepared fish, chicken, or steak with potatoes or rice. Ask about seasoning and request sauce or dressing separately.'}
};

function normalizeName(name:string){return name.trim().toLocaleLowerCase('en-US');}

export function applyDietaryGuidance(places:Place[]):Place[]{
 return places.map(place=>{
  const guidance=lowFodmapGuidance[normalizeName(place.name)];
  if(!guidance||place.dietaryRatings?.some(rating=>rating.preference==='low-fodmap'))return place;
  return {...place,dietaryRatings:[...(place.dietaryRatings??[]),{preference:'low-fodmap',...guidance}]};
 });
}
