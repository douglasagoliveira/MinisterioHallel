import { AuthScreen } from '@/components/access';
import { demoMode } from '@/lib/server/config';
import { nextPath } from '@/lib/server/http';
export const dynamic='force-dynamic';
export const metadata={title:'Entrar'};
export default async function Login({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {erro,next}=await searchParams;
 return <AuthScreen demo={demoMode()} initialError={erro==='convite'?'Não foi possível aceitar este convite. Use o e-mail convidado ou peça um novo.':erro==='acesso'?'Não foi possível entrar. Verifique o link ou fale com a administração.':undefined} next={nextPath(next)}/>;
}
