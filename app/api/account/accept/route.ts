import {createHash} from 'crypto';
import {NextResponse} from 'next/server';
import {accountStorageTripId,currentAccount} from '@/lib/account-auth';
import {db} from '@/lib/db';
import {normalizeTripId} from '@/lib/trips';
function hash(token:string){return createHash('sha256').update(token).digest('hex');}
export async function POST(req:Request){
 const account=await currentAccount();if(!account)return NextResponse.json({error:'Sign in before accepting this invite.'},{status:401});
 const {tripId:raw,token}=await req.json() as {tripId?:string;token?:string};const tripId=normalizeTripId(raw??'');if(!token)return NextResponse.json({error:'Invite token missing.'},{status:400});
 const stored=accountStorageTripId(tripId);const client=db();const {data:invite,error}=await client.from('trip_invitations').select('id,email,role,expires_at,accepted_at').eq('trip_id',stored).eq('token_hash',hash(token)).maybeSingle();
 if(error||!invite)return NextResponse.json({error:'This invitation is invalid.'},{status:404});if(invite.accepted_at)return NextResponse.json({error:'This invitation has already been used.'},{status:410});if(new Date(invite.expires_at).getTime()<Date.now())return NextResponse.json({error:'This invitation has expired.'},{status:410});if(invite.email.toLowerCase()!==account.email.toLowerCase())return NextResponse.json({error:`This invitation was sent to ${invite.email}. Sign in with that email to accept it.`},{status:403});
 const {error:memberError}=await client.from('trip_members').upsert({trip_id:stored,user_id:account.id,role:invite.role},{onConflict:'trip_id,user_id'});if(memberError)throw memberError;await client.from('trip_invitations').update({accepted_at:new Date().toISOString()}).eq('id',invite.id);
 return NextResponse.json({ok:true,role:invite.role});
}
