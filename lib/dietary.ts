import type {DietaryFit,DietaryPreference,Place} from '@/lib/types';

export type DietaryPlaceFitFilter='any'|'recommended'|'easy';

export const dietaryPreferences: {id:DietaryPreference;label:string;active:boolean}[]=[
 {id:'low-fodmap',label:'Low-FODMAP',active:true},
 {id:'gluten-free',label:'Gluten-free',active:true},
 {id:'vegetarian',label:'Vegetarian',active:true},
 {id:'vegan',label:'Vegan',active:true},
 {id:'dairy-free',label:'Dairy-free',active:true},
 {id:'pescatarian',label:'Pescatarian',active:true},
 {id:'nut-aware',label:'Nut-aware',active:true}
];

export const activeDietaryPreferences=dietaryPreferences.filter(preference=>preference.active);

export const dietaryFits: {id:DietaryFit;label:string;description:string}[]=[
 {id:'easy',label:'Easy',description:'Straightforward options available'},
 {id:'workable',label:'Workable',description:'Reasonable with ordering or portion adjustments'},
 {id:'difficult',label:'Difficult',description:'Likely harder to modify'},
 {id:'unknown',label:'Unknown',description:'Not evaluated yet'},
 {id:'not-applicable',label:'Not applicable',description:'Dietary guidance is not useful for this place'}
];

export function dietaryPreferenceLabel(preference:DietaryPreference){return dietaryPreferences.find(item=>item.id===preference)?.label??preference;}
export function dietaryFitLabel(fit:DietaryFit){return dietaryFits.find(item=>item.id===fit)?.label??fit;}
export function dietaryRating(place:Place,preference:DietaryPreference){return place.dietaryRatings?.find(rating=>rating.preference===preference);}
export function placeMatchesDietaryFilter(place:Place,preference:DietaryPreference,filter:DietaryPlaceFitFilter){
 const rating=dietaryRating(place,preference);
 if(filter==='any')return true;
 if(filter==='recommended')return rating?.fit==='easy'||rating?.fit==='workable';
 return rating?.fit==='easy';
}
export type FoodPlaceClassification='food'|'not-food'|'uncertain';
export function foodPlaceClassification(place:Place):FoodPlaceClassification{
 if(place.foodPlace===true)return 'food';
 if(place.foodPlace===false)return 'not-food';
 const text=`${place.name} ${place.category} ${place.tags.join(' ')}`.toLowerCase();
 const foodSignal=/restaurant|food|bakery|coffee|cafe|dessert|candy|chocolate|pizzeria|pizza|deli|diner|taco|burger|poutine|steakout|gastropub|kitchen|grill|bar\b/.test(text);
 const ambiguous=/\b(other|shopping|grocery|supermarket|market|souvenir|convenience)\b/.test(place.category.toLowerCase())||/\b(grocery|supermarket|souvenir|market)\b/.test(text);
 if(foodSignal&&ambiguous)return 'uncertain';
 return foodSignal?'food':'not-food';
}
export function isFoodPlace(place:Place){
 return foodPlaceClassification(place)==='food';
}
export function setDietaryRating(place:Place,preference:DietaryPreference,fit:DietaryFit,tip=''){
 const ratings=(place.dietaryRatings??[]).filter(rating=>rating.preference!==preference);
 return [...ratings,{preference,fit,tip:tip||undefined}];
}
