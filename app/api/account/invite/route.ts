import {createHash,randomBytes} from 'crypto';
import {NextResponse} from 'next/server';
import {accountIsOwner,accountStorageTripId,currentAccount} from '@/lib/account-auth';
import {db} from '@/lib/db';
import {normalizeTripId} from '@/lib/trips';

function hash(token:string){return createHash('sha256').update(token).digest('hex');}
export async function POST(req:Request){
 const account=await currentAccount();if(!account)return NextResponse.json({error:'Sign in first.'},{status:401});
 const {tripId:raw,email:rawEmail,role='editor'}=await req.json() as {tripId?:string;email?:string;role?:'editor'|'viewer'};const tripId=normalizeTripId(raw??'');const email=(rawEmail??'').trim().toLowerCase();
 if(!(await accountIsOwner(tripId)))return NextResponse.json({error:'Trip owner access required.'},{status:403});
 if(!/^\S+@\S+\.\S+$/.test(email))return NextResponse.json({error:'Enter a valid email address.'},{status:400});
 if(!['editor','viewer'].includes(role))return NextResponse.json({error:'Choose editor or viewer access.'},{status:400});
 const token=randomBytes(32).toString('base64url');const expiresAt=new Date(Date.now()+7*86400000).toISOString();const stored=accountStorageTripId(tripId);
 await db().from('trip_invitations').delete().eq('trip_id',stored).eq('email',email).is('accepted_at',null);
 const {error}=await db().from('trip_invitations').insert({trip_id:stored,email,role,token_hash:hash(token),invited_by:account.id,expires_at:expiresAt});if(error)throw error;
 const origin=new URL(req.url).origin;return NextResponse.json({ok:true,url:`${origin}/trips/${encodeURIComponent(tripId)}?accountInvite=${encodeURIComponent(token)}`,email,role,expiresAt});
}
