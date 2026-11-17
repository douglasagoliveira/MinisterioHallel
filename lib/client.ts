'use client';
import { createContext,useContext } from 'react';
import type { View,Outcome } from './model';
import type { Action,Input } from './validation';
export class ApiError extends Error {constructor(message:string,public status:number){super(message);}}
export async function request<T>(url:string,init?:RequestInit):Promise<T>{
 const res=await fetch(url,{cache:'no-store',...init});const data=await res.json().catch(()=>null);
 if(!res.ok)throw new ApiError(data?.error||'Não foi possível concluir. Verifique sua conexão e tente novamente.',res.status);
 return data as T;
}
export const post=<T,>(url:string,data:unknown)=>request<T>(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
export async function copyText(text:string){
 try{if(navigator.clipboard){await navigator.clipboard.writeText(text);return;}}catch{}
 const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.left='-999px';document.body.append(input);input.select();const okay=document.execCommand('copy');input.remove();if(!okay)throw new Error('O navegador não permitiu copiar. Selecione o texto e copie manualmente.');
}
export type Ops={v:View;band:string;setBand:(b:string)=>void;viewMode:string;href:(url:string)=>string;go:(url:string)=>void;run:<K extends Action>(action:K,payload:Input<K>,success?:string)=>Promise<Outcome|undefined>;busy:boolean;refetch:()=>Promise<void>;toast:(msg:string,type?:'success'|'error')=>void};
export const OpsContext=createContext<Ops|null>(null);
export const useApp=()=>{const v=useContext(OpsContext);if(!v)throw new Error('A área do Hallel não foi carregada.');return v;};
