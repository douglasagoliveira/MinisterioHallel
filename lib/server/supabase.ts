import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { AppError,needed } from './config';
export async function sessionClient(){
  const jar=await cookies();
  return createServerClient(needed('SUPABASE_URL'),needed('SUPABASE_ANON_KEY'),{cookies:{getAll:()=>jar.getAll(),setAll:items=>{for(const {name,value,options} of items)jar.set(name,value,{...options,sameSite:'lax',secure:process.env.NODE_ENV==='production'&&process.env.HALLEL_BASE_URL?.startsWith('https://')});}}});
}
export const serviceClient=()=>createClient(needed('SUPABASE_URL'),needed('SUPABASE_SERVICE_ROLE_KEY'),{auth:{autoRefreshToken:false,persistSession:false}});
export const fail=(e:{code?:string;message?:string}|null)=>{
  if(!e)return;
  if(e.code==='42501')throw new AppError(e.message?.includes('permission denied')?'Você não tem permissão para esta ação.':e.message||'Acesso não autorizado.',403);
  if(e.code==='P0002')throw new AppError(e.message||'Item não encontrado.',404);
  if(e.code==='23505')throw new AppError('Este cadastro ou vínculo já existe.',409);
  if(e.code==='23503')throw new AppError('Não foi possível vincular estes dados. Confira as seleções.',409);
  if(e.code==='22P02'||e.code==='23502'||e.code==='22008')throw new AppError('Confira os dados do formulário.');
  if(e.code==='23514'||e.code==='22023'||e.code==='P0001')throw new AppError(e.message?.includes('check constraint')?'Confira os dados do formulário.':e.message||'Confira os dados do formulário.',400);
  console.error('Hallel: erro de integração',e.code??'sem código');
  throw new AppError('Não foi possível concluir agora. Tente novamente.',503);
};
export type Client = SupabaseClient;
