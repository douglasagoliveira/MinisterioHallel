import { z } from 'zod';
import { AppError,baseUrl,demoMode,sameOrigin,validToken } from '@/lib/server/config';
import { body,errorResponse,json,nextPath } from '@/lib/server/http';
import { checkEmail,liveInvite } from '@/lib/server/live';
import { sessionClient } from '@/lib/server/supabase';
export async function POST(req:Request,{params}:{params:Promise<{method:string}>}){try{
  sameOrigin(req);const {method}=await params;
  if(method==='logout'){
    if(!demoMode()){const c=await sessionClient();await c.auth.signOut({scope:'local'});}
    return json({});
  }
  if(!['magic','google'].includes(method))throw new AppError('Método indisponível.',404);
  const x=z.object({email:z.email().max(254).optional(),token:z.string().optional(),next:z.string().optional()}).safeParse(await body(req,12000));
  if(!x.success)throw new AppError('Informe um e-mail válido.');
  const {email,token,next}=x.data;
  if(demoMode())throw new AppError('O envio de links e o Google só funcionam no ambiente de produção.');
  if(token&&(!validToken(token)||!await liveInvite(token)))throw new AppError('Este convite não está mais disponível.',410);
  const redirect=new URL('/auth/callback',baseUrl(req));redirect.searchParams.set('next',nextPath(next));if(token)redirect.searchParams.set('invite',token);
  const c=await sessionClient();
  if(method==='google'){
    const {data,error}=await c.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect.href,skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}});
    if(error||!data.url)throw new AppError('Não foi possível iniciar o login com Google.');return json({url:data.url});
  }
  if(!email)throw new AppError('Informe o e-mail.');
  const eligible=await checkEmail(email.toLowerCase(),token);
  if(eligible){const {error}=await c.auth.signInWithOtp({email:email.toLowerCase(),options:{emailRedirectTo:redirect.href,shouldCreateUser:true}});
    if(error&&error.status!==429)throw new AppError('O serviço de e-mail não está disponível agora. Tente novamente.',503);
  }
  return json({sent:true});
}catch(e){return errorResponse(e);}}
