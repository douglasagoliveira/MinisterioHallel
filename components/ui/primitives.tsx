'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { Slot } from '@radix-ui/react-slot';
import { LoaderCircle, Search, X, ArrowLeft, CalendarDays, MapPin, Clock3, ChevronLeft, ChevronRight, TriangleAlert, type LucideIcon } from 'lucide-react';
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type ReactElement, cloneElement, isValidElement, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { idColor,initials,STATUS } from '@/lib/model';
import { dateAndTime } from '@/lib/dates';

export function Button({asChild=false,variant='primary',size='md',busy=false,className,children,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{asChild?:boolean,variant?:'primary'|'secondary'|'ghost'|'danger'|'success',size?:'sm'|'md'|'lg'|'icon',busy?:boolean}){
 const css=cn('btn',`btn-${variant}`,`btn-${size}`,className);
 if(asChild)return <Slot className={css} {...props}>{children}</Slot>;
 return <button type="button" {...props} disabled={props.disabled||busy} aria-busy={busy||undefined} className={css}>{busy&&<LoaderCircle className="spin" size={17}/>} {children}</button>;
}
export function Card({children,className}:{children:ReactNode,className?:string}){return <div className={cn('panel',className)}>{children}</div>;}
export function Badge({status}:{status:string}){const [label,kind]=STATUS[status]||[status,'neutral'];return <span className={`badge ${kind}`}><i aria-hidden="true"/>{label}</span>;}
export const Pill=({children}:{children:ReactNode})=><span className="pill">{children}</span>;
export function BandDot({id,name}:{id:string,name:string}){return <span className="band-dot"><i className={`tone-${idColor(id)}`} aria-hidden="true"/>{name}</span>;}
export function Avatar({name,id,size=36}:{name:string,id?:string,size?:number}){return <span aria-hidden="true" className={`avatar tone-${idColor(id||name)}`} style={{width:size,height:size}}>{initials(name)}</span>;}
export function Brand({subtitle=true}:{subtitle?:boolean}){return <div className="brand" aria-label="Hallel — Louvor e Adoração Judaico-Messiânico"><img width="39" height="37" src="/brand/mark.png" alt=""/><span><strong>HALLEL</strong>{subtitle&&<small>MINISTÉRIO DE LOUVOR</small>}</span></div>;}
export function Eyebrow({children,className}:{children:ReactNode,className?:string}){return <div className={cn('eyebrow',className)}>{children}</div>;}
export function PageTitle({eyebrow,title,accent,description,action,back}:{eyebrow?:string,title:string,accent?:string,description?:string,action?:ReactNode,back?:()=>void}){
 return <div className="page-title">{back&&<button className="text-btn page-back" onClick={back}><ArrowLeft size={16}/> Voltar</button>}{eyebrow&&<Eyebrow><i className="eyebrow-line"/>{eyebrow}</Eyebrow>}<div className="page-title-row"><div><h1>{title}{accent&&<> <span className="ink">{accent}</span></>}</h1>{description&&<p>{description}</p>}</div>{action&&<div className="title-actions">{action}</div>}</div></div>;
}
export function Empty({icon:Icon,title,description,action}:{icon:LucideIcon,title:string,description?:string,action?:ReactNode}){return <div className="empty"><span className="tile tone-indigo"><Icon size={23}/></span><h3>{title}</h3>{description&&<p>{description}</p>}{action}</div>;}
export function Field({label,note,error,children,className}:{label:string,note?:string,error?:string,children:ReactNode,className?:string}){
 const generated=useId();const child=isValidElement(children)?children as ReactElement<{id?:string;'aria-describedby'?:string;'aria-invalid'?:boolean}>:null;const id=child?.props.id||generated;const hint=note||error?`${id}-hint`:undefined;
 return <div className={cn('field',className)}><label htmlFor={id}>{label}</label>{child?cloneElement(child,{id,'aria-describedby':hint||child.props['aria-describedby'],'aria-invalid':error?true:child.props['aria-invalid']}):children}{hint&&<small id={hint} className={error?'error-text':''}>{error||note}</small>}</div>;
}
export const Input=({className,...props}:InputHTMLAttributes<HTMLInputElement>)=><input className={cn('input',className)} {...props}/>;
export const Select=({className,...props}:SelectHTMLAttributes<HTMLSelectElement>)=><select className={cn('input select',className)} {...props}/>;
export const SearchField=({value,onChange,placeholder='Buscar…',label}:{value:string,onChange:(s:string)=>void,placeholder?:string,label?:string})=><label className="search-field"><Search size={18}/><input data-autofocus aria-label={label||placeholder} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>{value&&<button type="button" className="plain-icon" onClick={()=>onChange('')} aria-label="Limpar busca"><X size={15}/></button>}</label>;
export function Modal({title,description,children,onClose,wide=false}:{title:string,description?:string,children:ReactNode,onClose:()=>void,wide?:boolean}){
 const [prev]=useState(()=>typeof document==='undefined'?null:document.activeElement instanceof HTMLElement?document.activeElement:null);
 return <Dialog.Root open onOpenChange={v=>{if(!v)onClose();}}><Dialog.Portal><Dialog.Overlay className="modal-overlay"/><Dialog.Content className={cn('modal',wide&&'modal-wide')} onCloseAutoFocus={e=>{if(prev?.isConnected){e.preventDefault();prev.focus();}}} onOpenAutoFocus={e=>{const target=(e.currentTarget as HTMLElement|null)?.querySelector<HTMLElement>('[data-autofocus], input:not([type=checkbox]):not([disabled]), textarea:not([disabled]), select:not([disabled])');if(target){e.preventDefault();target.focus();}}}>
  <div className="modal-head"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description className={description?undefined:'sr-only'}>{description||title}</Dialog.Description></div><Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="Fechar janela"><X size={20}/></Button></Dialog.Close></div>{children}
 </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function ModalActions({children}:{children:ReactNode}){return <div className="modal-actions">{children}</div>;}
export function Confirm({title,description,onClose,onConfirm,busy=false,label='Confirmar',danger=false}:{title:string,description:string,onClose:()=>void,onConfirm:()=>void,busy?:boolean,label?:string,danger?:boolean}){
 return <Modal title={title} description={description} onClose={onClose}><ModalActions><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant={danger?'danger':'primary'} onClick={onConfirm} busy={busy}>{label}</Button></ModalActions></Modal>;
}
export function InlineError({message}:{message?:string|null}){return message?<div className="inline-alert error" role="alert"><TriangleAlert size={17}/><span>{message}</span></div>:null;}
export function DateInfo({starts,location,deadline}:{starts:string,location?:string|null,deadline?:string}){return <div className="date-info"><span><CalendarDays size={18}/> {dateAndTime(starts)}</span>{location&&<span><MapPin size={18}/> {location}</span>}{deadline&&<span><Clock3 size={18}/> Responda até {dateAndTime(deadline)}</span>}</div>;}
export function Pagination({current,total,size=25,onChange}:{current:number,total:number,size?:number,onChange:(n:number)=>void}){
 const pages=Math.max(1,Math.ceil(total/size));if(!total)return null;const page=Math.min(pages,current);
 return <div className="pagination"><span>{(page-1)*size+1}–{Math.min(total,page*size)} de {total}</span>{pages>1&&<div><Button size="icon" variant="ghost" aria-label="Página anterior" disabled={page<=1} onClick={()=>onChange(page-1)}><ChevronLeft size={17}/></Button><span>{page} / {pages}</span><Button size="icon" variant="ghost" aria-label="Próxima página" disabled={page>=pages} onClick={()=>onChange(page+1)}><ChevronRight size={17}/></Button></div>}</div>;
}
export function Segment({items,value,onChange,label}:{items:{id:string,label:string}[],value:string,onChange:(s:string)=>void,label:string}){return <div className="segmented" role="group" aria-label={label}>{items.map(x=><button type="button" key={x.id} aria-pressed={x.id===value} onClick={()=>onChange(x.id)}>{x.label}</button>)}</div>;}
