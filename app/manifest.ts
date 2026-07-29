import type {MetadataRoute} from 'next';

export default function manifest():MetadataRoute.Manifest{
 return{
  name:'Toronto Trip Hub',
  short_name:'Trip Hub',
  description:'Shared Toronto, Niagara Falls and Buffalo trip planner',
  start_url:'/',
  display:'standalone',
  background_color:'#f4f7f5',
  theme_color:'#103b2a',
  orientation:'portrait-primary',
  icons:[
   {src:'/icon',sizes:'512x512',type:'image/png',purpose:'any'},
   {src:'/icon',sizes:'512x512',type:'image/png',purpose:'maskable'},
  ],
 };
}
