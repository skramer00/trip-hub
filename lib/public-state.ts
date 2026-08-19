import type {TripState} from '@/lib/types';

export function publicTripState(state:TripState):TripState{
 return {
  ...state,
  days:state.days.map(day=>({...day,items:day.items.map(({keyInfo:_,confirmationNumber:__,userNotes:___,...item})=>item)})),
  packing:[],
  dietaryPreferences:[],
  mealBalanceByDate:{},
  journalNotesByDate:{},
  journalMoments:(state.journalMoments??[]).map(({note:_,...moment})=>moment),
  places:state.places.map(place=>({...place,dietaryRatings:[]}))
 };
}
