import './globals.css';
import type {Metadata,Viewport} from 'next';

export const metadata:Metadata={
 title:'Toronto Trip Hub',
 description:'Shared Toronto, Niagara Falls and Buffalo trip planner',
 applicationName:'Trip Hub',
 appleWebApp:{capable:true,statusBarStyle:'default',title:'Trip Hub'},
};
export const viewport:Viewport={themeColor:'#103b2a'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
