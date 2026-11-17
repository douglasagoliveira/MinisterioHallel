'use client';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode } from 'react';
type Type='success'|'error';
const ToastContext=createContext<(msg:string,type?:Type)=>void>(()=>{});
export const useToast=()=>useContext(ToastContext);
export function Providers({children}:{children:ReactNode}){
 const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{staleTime:15000,refetchOnWindowFocus:true,retry:false}}}));
 const [data,set]=useState<{msg:string,type:Type}|null>(null);const t=useRef<ReturnType<typeof setTimeout>|null>(null);
 const toast=useCallback((msg:string,type:Type='success')=>{if(t.current)clearTimeout(t.current);set({msg,type});t.current=setTimeout(()=>set(null),4500);},[]);
 useEffect(()=>{if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('/sw.js').catch(()=>{});return()=>{if(t.current)clearTimeout(t.current);};},[]);
 return <QueryClientProvider client={client}><ToastContext.Provider value={toast}>{children}<div className="toast-area" aria-live="polite">{data&&<div className={`toast ${data.type}`} role="status">{data.type==='success'?<CheckCircle2 size={20}/>:<CircleAlert size={20}/>}<span>{data.msg}</span><button type="button" className="plain-icon toast-close" onClick={()=>set(null)} aria-label="Dispensar mensagem"><X size={16}/></button></div>}</div></ToastContext.Provider></QueryClientProvider>;
}
