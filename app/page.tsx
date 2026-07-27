import {cookies} from 'next/headers';import {validToken} from '@/lib/auth';import TripApp from '@/components/TripApp';import Login from '@/components/Login';
export default async function Page(){const ok=validToken((await cookies()).get('trip_auth')?.value);return ok?<TripApp/>:<Login/>}
