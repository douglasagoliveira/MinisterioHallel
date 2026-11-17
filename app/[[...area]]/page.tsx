import { HallelApp } from '@/components/hallel-app';
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{area?:string[]}>}){
 const {area=[]}=await params;
 return <HallelApp area={area.join('/')}/>;
}
