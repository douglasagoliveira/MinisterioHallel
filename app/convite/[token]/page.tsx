import { AuthScreen,InvalidLink } from '@/components/access';
import { demoMode } from '@/lib/server/config';
import { demoInvite } from '@/lib/server/demo';
import { liveInvite } from '@/lib/server/live';
export const dynamic='force-dynamic';
export const metadata={title:'Aceitar convite'};
export default async function InvitePage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;const demo=demoMode();
 try{if(await (demo?demoInvite(token):liveInvite(token)))return <AuthScreen demo={demo} token={token}/>;}catch{}
 return <InvalidLink kind="invite"/>;
}
