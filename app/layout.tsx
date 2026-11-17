import type { Metadata,Viewport } from 'next';
import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource-variable/space-grotesk/index.css';
import './globals.css';
import { Providers } from '@/components/providers';
export const metadata:Metadata={title:{default:'Hallel — Gestão do Ministério',template:'%s · Hallel'},description:'Gestão de escalas, repertório e avisos do ministério de louvor Hallel.',manifest:'/manifest.webmanifest',applicationName:'Hallel',robots:{index:false,follow:false},icons:{icon:[{url:'/brand/icon-48.png',sizes:'48x48'}],apple:[{url:'/brand/icon-180.png',sizes:'180x180'}]},appleWebApp:{capable:true,title:'Hallel',statusBarStyle:'black-translucent'}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#0A0E1F'};
export default function RootLayout({children}:{children:React.ReactNode}){
 const theme='try{var m=localStorage.getItem("hallel-theme")||"dark";document.documentElement.dataset.theme=m==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m}catch(e){}';
 return <html lang="pt-BR" data-theme="dark" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:theme}}/></head><body><Providers>{children}</Providers></body></html>;
}
