import {createHmac,timingSafeEqual} from 'crypto';
const secret=()=>process.env.AUTH_SECRET||'development-secret-change-me';
export function tokenForPassword(password:string){return createHmac('sha256',secret()).update(password).digest('hex')}
export function validToken(token?:string){const expected=tokenForPassword(process.env.TRIP_PASSWORD||'trip');if(!token||token.length!==expected.length)return false;return timingSafeEqual(Buffer.from(token),Buffer.from(expected))}
