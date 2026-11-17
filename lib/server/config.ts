import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export class AppError extends Error { status: number; constructor(message:string,status=400){super(message); this.status=status;} }
export function needed(key:string){ const value=process.env[key]; if(!value) throw new AppError('O ambiente de produção ainda não foi configurado.',503); return value; }
export const demoMode=()=>process.env.HALLEL_MODE==='demo' || (!process.env.HALLEL_MODE && !process.env.VERCEL && !process.env.SUPABASE_URL);
export const orgSlug=()=>process.env.HALLEL_ORG_SLUG || 'har-tzion';
export const sha=(token:string)=>createHash('sha256').update(token).digest('hex');
export const demoPath = (name:string) => join(process.env.HALLEL_DEMO_DIR || join(process.cwd(),'.local'),name);
function demoSecret(){
  const file=demoPath('link-secret'); mkdirSync(dirname(file),{recursive:true});
  try{writeFileSync(file,randomBytes(48).toString('hex'),{flag:'wx',mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
  return readFileSync(file,'utf8');
}
export function tokenFor(kind:'schedule'|'invite',id:string){
  const secret=demoMode()?demoSecret():needed('HALLEL_LINK_SECRET');
  if(secret.length<32)throw new AppError('A chave de links deve ter pelo menos 32 caracteres.',503);
  return createHmac('sha256',secret).update(`hallel/v1/${kind}/${id}`).digest('base64url');
}
export const validToken=(t:string)=>/^[a-zA-Z0-9_-]{43}$/.test(t);
export const secureEqual=(a:string,b:string)=>timingSafeEqual(Buffer.from(sha(a)),Buffer.from(sha(b)));
export function baseUrl(req:Request){
  if(!demoMode())return new URL(needed('HALLEL_BASE_URL')).origin;
  const url=new URL(req.url); const host=req.headers.get('x-forwarded-host')?.split(',')[0]?.trim(); const proto=req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if(host&&/^(?:[a-z0-9.-]+\.e2b\.(?:app|dev)|localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?)$/i.test(host))return `${proto==='https'||/\.e2b\.(?:app|dev)$/i.test(host)?'https':'http'}://${host}`;
  const direct=req.headers.get('host'); if(direct&&/^[a-z0-9.-]+\.e2b\.(?:app|dev)$/i.test(direct))return `https://${direct}`;
  return url.origin;
}
export function sameOrigin(req:Request){
  const origin=req.headers.get('origin');
  if(!origin)return; // Non-browser clients may not send Origin. Browser writes require a non-simple JSON body.
  const requestOrigin=new URL(req.url).origin;
  if(origin!==baseUrl(req)&&(!demoMode()||origin!==requestOrigin))throw new AppError('Não foi possível validar a origem deste pedido.',403);
}
