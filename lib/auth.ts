import {createHmac,timingSafeEqual} from 'crypto';
const secret=()=>process.env.AUTH_SECRET||'development-secret-change-me';
export const editorPassword=()=>process.env.TRIP_PASSWORD||(process.env.NODE_ENV==='development'?'trip':'');
export function tokenForPassword(password:string){return createHmac('sha256',secret()).update(password).digest('hex')}
export function validToken(token?:string){const password=editorPassword();if(!password)return false;const expected=tokenForPassword(password);if(!token||token.length!==expected.length)return false;return timingSafeEqual(Buffer.from(token),Buffer.from(expected))}
