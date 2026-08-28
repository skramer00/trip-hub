import './globals.css';
import './settings.css';
import './mobile.css';
import './trips/trips.css';
import './itinerary-import.css';
import './planning-health.css';
import './collaboration.css';
import type {Metadata,Viewport} from 'next';
import FoodListEditor from '@/components/FoodListEditor';

export const metadata:Metadata={
 metadataBase:new URL('https://www.skramer.app'),
 title:{default:'Trip Hub',template:'%s | Trip Hub'},
 description:'A shared trip itinerary, guide, and travel companion.',
 applicationName:'Trip Hub',
 appleWebApp:{capable:true,statusBarStyle:'default',title:'Trip Hub'},
};
export const viewport:Viewport={themeColor:'#103b2a'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}<FoodListEditor/></body></html>}
