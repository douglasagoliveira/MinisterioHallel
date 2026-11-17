import { GuestCard,InvalidLink } from '@/components/access';
import { demoMode } from '@/lib/server/config';
import { demoGuest } from '@/lib/server/demo';
import { liveGuest } from '@/lib/server/live';
export const dynamic='force-dynamic';
export const metadata={title:'Responder escala'};
export default async function LinkPage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;const demo=demoMode();
 try{return <GuestCard initial={await (demo?demoGuest(token):liveGuest(token))} token={token} demo={demo}/>;}catch{return <InvalidLink kind="schedule"/>;}
}
