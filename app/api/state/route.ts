import {cookies} from 'next/headers';import {NextResponse} from 'next/server';import {validToken} from '@/lib/auth';import {loadState,saveState} from '@/lib/db';import {initialState} from '@/data/initial';
async function allowed(){return validToken((await cookies()).get('trip_auth')?.value)}
export async function GET(){if(!await allowed())return NextResponse.json({error:'Unauthorized'},{status:401});return NextResponse.json({state:(await loadState())||initialState,cloud:Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY)})}
export async function PUT(req:Request){if(!await allowed())return NextResponse.json({error:'Unauthorized'},{status:401});const state=await req.json();const saved=await saveState(state);return NextResponse.json({ok:true,cloud:saved})}
