import type { MetadataRoute } from 'next';
export default function manifest():MetadataRoute.Manifest{
 return {id:'/',name:'Hallel · Gestão do Ministério',short_name:'Hallel',lang:'pt-BR',description:'Escalas, repertório e comunicação do ministério de louvor.',start_url:'/',scope:'/',display:'standalone',background_color:'#0A0E1F',theme_color:'#0A0E1F',icons:[{src:'/brand/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/brand/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/brand/icon-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]};
}
