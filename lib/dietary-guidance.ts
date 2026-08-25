import type {DietaryFit,Place} from '@/lib/types';

type Guidance={fit:DietaryFit;tip:string};

// Practical ordering guidance, not a claim that a restaurant or dish is medically safe.
// Names are normalized so this also applies to matching places already stored in Supabase.
const lowFodmapGuidance:Record<string,Guidance>={
 "buster's sea cove":{fit:'easy',tip:'Best bet: grilled fish with potatoes or another simple side. Ask about garlic/onion seasoning and request sauce separately.'},
 "table rock house restaurant":{fit:'easy',tip:'Best bet: grilled fish or another simply prepared protein with potatoes or rice. Ask about garlic/onion seasoning and request sauce separately.'},
 "red coach inn":{fit:'easy',tip:'Best bet: eggs with potatoes at breakfast, or simply prepared fish or meat with potatoes or rice. Ask about garlic/onion seasoning and keep sauces separate.'},
 "avenue open kitchen":{fit:'easy',tip:'Best bet: peameal bacon with eggs and potatoes instead of a large sandwich. Ask whether the potatoes contain onion or garlic.'},
 "paddington's pump":{fit:'easy',tip:'Best bet: peameal bacon with eggs and potatoes. This is an easier way to sample peameal without making the bun the center of the meal.'},
 "swiss chalet":{fit:'workable',tip:'Rotisserie chicken with a simple side may be the most straightforward order. Ask about seasoning and keep dipping sauce separate.'},
 "the griffon gastropub":{fit:'workable',tip:'Look for grilled fish, chicken, or another simple protein with potatoes or rice. Ask about seasoning and order sauces or dressings separately.'},
 "stacked pancake & breakfast house":{fit:'workable',tip:'Eggs with plain potatoes are a simpler choice. If trying pancakes, choose the portion and toppings that work for you.'},
 "mildred's temple kitchen":{fit:'workable',tip:'Eggs or another simple protein may be easier. If sampling the pancakes and local syrup, consider sharing or ordering a smaller portion.'},
 "l'avenue":{fit:'workable',tip:'Best bet: eggs, bacon or another simple protein with potatoes. The oversized sweet brunch dishes are better treated as a sample than the whole meal.'},
 "l'avenue at the well":{fit:'workable',tip:'Best bet: eggs, bacon or another simple protein with potatoes. The oversized sweet brunch dishes are better treated as a sample than the whole meal.'},
 "bagels on fire":{fit:'workable',tip:'A wheat bagel can add a larger fructan serving. An egg, meat, and cheese filling with fewer onion-heavy toppings is the simpler choice; consider sharing if you only want to sample the bagel.'},
 "carousel bakery | order online carouselbakery.ca":{fit:'workable',tip:'Peameal itself may be simpler than the full sandwich. Consider splitting the classic sandwich, or get peameal with eggs elsewhere if you want a lower-bread option.'},
 "carousel bakery":{fit:'workable',tip:'Peameal itself may be simpler than the full sandwich. Consider splitting the classic sandwich, or get peameal with eggs elsewhere if you want a lower-bread option.'},
 "charlie the butcher's carvery":{fit:'workable',tip:'The roast beef may be simpler than the full sandwich. Consider splitting a beef on weck and go lightly on horseradish or other toppings.'},
 "charlie the butcher's kitchen":{fit:'workable',tip:'The roast beef may be simpler than the full sandwich. Consider splitting a beef on weck and go lightly on horseradish or other toppings.'},
 "lobster burger bar":{fit:'workable',tip:'Look for simply prepared seafood with rice or potatoes. Ask about garlic/onion seasoning and request sauces separately.'},
 "earls kitchen + bar - financial district (king & university)":{fit:'workable',tip:'Choose a simply prepared fish, chicken, or steak with potatoes or rice. Ask about seasoning and request sauce or dressing separately.'},
 "piano piano":{fit:'difficult',tip:'Pizza combines a wheat crust with sauce that may contain garlic or onion. If this is the day’s treat, consider a smaller portion and keep the rest of the meal simple.'},
 "nomnomnom poutine":{fit:'difficult',tip:'Fries and curds can be workable, but gravy is the wildcard because it may contain onion, garlic, or wheat. Consider sharing or sampling a smaller portion.'},
 "smoke's poutinerie adelaide":{fit:'difficult',tip:'Fries and curds can be workable, but gravy is the wildcard because it may contain onion, garlic, or wheat. Consider sharing or sampling a smaller portion.'},
 "anchor bar":{fit:'difficult',tip:'Wings themselves can be workable, but sauces, seasoning, heat, and portion size can stack up. Choose a straightforward Buffalo sauce and the portion that works for you.'},
 "jim's steakout":{fit:'difficult',tip:'A Stinger combines steak, breaded chicken, cheese, sauce, and a large roll. Sampling or sharing may be more workable.'},
 "victor's on north":{fit:'difficult',tip:'A Stinger combines steak, breaded chicken, cheese, sauce, and a large roll. Sampling or sharing may be more workable.'},
 "fresco's fish and chips":{fit:'difficult',tip:'Fried batter, seasoning, and a larger serving may be harder to adjust. Consider sharing or ask whether simply prepared fish is available.'}
};

function normalizeName(name:string){return name.trim().toLocaleLowerCase('en-US');}

function guidanceFor(place:Place){
 const normalized=normalizeName(place.name);
 const exact=lowFodmapGuidance[normalized];
 if(exact)return exact;
 const partial=Object.entries(lowFodmapGuidance).find(([name])=>normalized.includes(name)||name.includes(normalized));
 return partial?.[1];
}

export function applyDietaryGuidance(places:Place[]):Place[]{
 return places.map(place=>{
  const guidance=guidanceFor(place);
  if(!guidance||place.dietaryRatings?.some(rating=>rating.preference==='low-fodmap'))return place;
  return {...place,dietaryRatings:[...(place.dietaryRatings??[]),{preference:'low-fodmap',...guidance}]};
 });
}
