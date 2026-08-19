import type {CheckItem,Place} from '@/lib/types';

const aliases:[RegExp,RegExp][]=[
 [/poutine/i,/poutine/i],
 [/peameal/i,/peameal|carousel bakery/i],
 [/beef on (?:weck|wrek)/i,/beef on (?:weck|wrek)|charlie the butcher|schwabl|red coach/i],
 [/stinger/i,/stinger|jim'?s steakout/i],
 [/\bwings?\b/i,/\bwings?\b|anchor bar|bar-bill|duff'?s/i],
 [/sponge candy/i,/sponge candy|watson'?s|parkside candy/i],
 [/butter tart/i,/butter tart|ba noi|circle.*squares|future bakery/i],
 [/montreal.*bagel|bagel/i,/bagel|st[. ]urbain/i],
 [/beaver.?tail/i,/beaver.?tail/i],
 [/maple syrup/i,/maple syrup/i]
];

function placeText(place:Place){return `${place.name} ${place.category} ${place.notes} ${place.tags.join(' ')}`;}

export function placeSpecialtyFoodIds(place:Place,foods:CheckItem[]){
 const explicit=place.specialtyFoodIds?.filter(id=>foods.some(food=>food.id===id))??[];
 if(place.specialtyFoodIds!==undefined)return explicit;
 const text=placeText(place);
 return foods.filter(food=>aliases.some(([foodPattern,placePattern])=>foodPattern.test(food.title)&&placePattern.test(text))).map(food=>food.id);
}

export function placeSpecialtyFoods(place:Place,foods:CheckItem[]){
 const ids=new Set(placeSpecialtyFoodIds(place,foods));
 return foods.filter(food=>ids.has(food.id));
}
