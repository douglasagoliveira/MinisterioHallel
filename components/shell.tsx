'use client';
import Link from 'next/link';
import { useEffect,useState,type ReactNode } from 'react';
import { ArrowDownRight, ArrowLeft, ArrowRight, Bell, CalendarDays, ChevronDown, CircleHelp, Command, ExternalLink, LayoutDashboard, LogOut, Megaphone, Menu, Moon, MoreHorizontal, Music2, PanelsTopLeft, Search, Settings2, ShieldCheck, SlidersHorizontal, Sun, UsersRound, X } from 'lucide-react';
import { useApp,post } from '@/lib/client';
import { bandName, fold,manageBand,ROLES } from '@/lib/model';
import { Avatar,Brand,Button,Empty,Eyebrow,Modal,SearchField,Select } from './ui/primitives';

const general=[{path:'/',label:'Início',icon:LayoutDashboard},{path:'/escalas',label:'Escalas',icon:CalendarDays},{path:'/membros',label:'Membros e bandas',icon:UsersRound},{path:'/musicas',label:'Músicas',icon:Music2},{path:'/avisos',label:'Avisos',icon:Megaphone}];
const adminNav=[{path:'/administradores',label:'Administradores',icon:ShieldCheck},{path:'/configuracoes',label:'Configurações',icon:Settings2}];
const memberNav=[{path:'/minhas-escalas',label:'Minhas escalas',short:'Escalas',icon:CalendarDays},{path:'/musicas',label:'Músicas',short:'Músicas',icon:Music2},{path:'/disponibilidade',label:'Disponibilidade',short:'Disponibilidade',icon:SlidersHorizontal},{path:'/avisos',label:'Avisos',short:'Avisos',icon:Megaphone}];
export type Theme='dark'|'light'|'system';
export function applyTheme(theme:Theme){localStorage.setItem('hallel-theme',theme);document.documentElement.dataset.theme=theme==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):theme;window.dispatchEvent(new Event('hallel-theme'));}
export function Shell({area,children}:{area:string,children:ReactNode}){
 const {v,band,setBand,href,go,toast}=useApp();const member=v.viewer.role==='member';
 const [dialog,setDialog]=useState<'search'|'alerts'|'account'|'mobile'|null>(null);
 const active=(path:string)=>path==='/'?!area:path==='/minhas-escalas'?(!area||area.startsWith('escalas')||area.startsWith('minhas-escalas')):area===path.slice(1)||area.startsWith(path.slice(1)+'/');
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setDialog(d=>d==='search'?null:'search');}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 useEffect(()=>{const m=matchMedia('(prefers-color-scheme: light)');const sync=()=>{if(localStorage.getItem('hallel-theme')==='system')document.documentElement.dataset.theme=m.matches?'light':'dark';};m.addEventListener('change',sync);return()=>m.removeEventListener('change',sync);},[]);
 const close=()=>setDialog(null);
 const links=(items:typeof general)=>items.map(({path,label,icon:Icon})=><Link key={path} href={href(path)} onClick={close} className={`nav-link ${active(path)?'active':''}`} aria-current={active(path)?'page':undefined}><Icon size={19}/><span>{label}</span>{active(path)&&<span className="nav-indicator"/>}</Link>);
 const alerts=v.announcements.filter(n=>n.status==='published'&&(!n.expires_at||Date.parse(n.expires_at)>Date.now())).sort((a,b)=>(b.published_at||'').localeCompare(a.published_at||'')).slice(0,4);
 const signOut=async()=>{try{await post('/api/auth/logout',{});window.location.assign('/entrar');}catch{toast('Não foi possível sair.','error');}};
 const [orgName,orgTail]=v.org.name.startsWith('Congregação ')?[v.org.name.slice(12),'Congregação']: [v.org.name,member?'Área do membro':'Gestão do ministério'];
 return <div className={`shell ${member?'member-shell':''}`}>
  <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
  <aside className="sidebar">
   <Link className="sidebar-brand" href={href('/')}><Brand/></Link>
   <div className="org-mini"><span className="org-icon"><PanelsTopLeft size={15}/></span><span><strong>{orgName||'Har Tzion'}</strong><small>{orgTail}</small></span></div>
   <nav className="side-nav" aria-label="Navegação principal"><Eyebrow className="nav-label">{member?'ÁREA DO MEMBRO':'MINISTÉRIO'}</Eyebrow>{links(member?memberNav:general)}
    {!member&&<div className="nav-second"><Eyebrow className="nav-label">GESTÃO</Eyebrow>{links(adminNav.filter(x=>x.path!=='/administradores'||v.viewer.role==='admin'))}</div>}
   </nav>
   <div className="aside-bottom">{v.demo&&<button type="button" className="demo-indicator" onClick={()=>setDialog('account')}><i/> Modo demonstração <ArrowDownRight size={13}/></button>}
   <button className="account" onClick={()=>setDialog('account')} aria-label="Abrir opções da conta"><Avatar name={v.viewer.name} size={37}/><span><b>{v.viewer.name}</b><small>{ROLES[v.viewer.role]}</small></span><MoreHorizontal size={17}/></button></div>
  </aside>
  <div className="main-shell">
   <header className="topbar"><div className="topbar-inner">
    <button className="btn btn-ghost btn-icon mobile-menu" onClick={()=>setDialog('mobile')} aria-label="Abrir menu"><Menu size={23}/></button>
    <Link className="mobile-brand" href={href('/')}><Brand subtitle={false}/></Link>
    <button type="button" className="top-search" onClick={()=>setDialog('search')} aria-label="Buscar em todo o Hallel"><Search size={18}/><span>Buscar em todo o Hallel...</span><kbd><Command size={12}/> K</kbd></button>
    <div className="top-actions">{!member&&<label className="band-select"><UsersRound size={17}/><select aria-label="Seletor de banda" value={band} onChange={e=>setBand(e.target.value)}><option value="">Todas as bandas</option>{v.bands.filter(b=>manageBand(v,b.id)).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><ChevronDown size={14}/></label>}
     <button type="button" className="top-bell" aria-label="Notificações" onClick={()=>setDialog('alerts')}><Bell size={19}/>{alerts.length>0&&<i/>}</button>
     <button type="button" className="mobile-account plain-icon" onClick={()=>setDialog('account')} aria-label="Abrir opções da conta"><Avatar name={v.viewer.name} size={32}/></button>
    </div>
   </div></header>
   <main className="main-content" id="conteudo" tabIndex={-1}>{children}</main>
   <footer className="main-footer"><span>HALLEL <i/> {v.org.name}</span><span>Gestão do ministério de louvor</span></footer>
  </div>
  {member&&<nav className="bottom-nav" aria-label="Área do membro">{memberNav.map(({path,short,icon:Icon})=><Link key={path} href={href(path)} aria-current={active(path)?'page':undefined} className={active(path)?'active':''}><Icon size={22}/><span>{short}</span></Link>)}</nav>}
  {dialog==='search'&&<GlobalSearch onClose={close}/>}
  {dialog==='alerts'&&<Modal title="Notificações" description="Avisos recentes do ministério." onClose={close}>{alerts.length?<div className="dialog-list">{alerts.map(x=><Link key={x.id} href={href(`/avisos/${x.id}`)} onClick={close}><span className="tile tone-gold"><Megaphone size={18}/></span><span><strong>{x.title}</strong><small>{bandName(v,x.band_id)}</small></span><ArrowRight size={17}/></Link>)}</div>:<Empty icon={Bell} title="Nenhuma notificação por aqui"/>}<div className="modal-actions"><Button onClick={()=>{close();go('/avisos');}} variant="secondary">Ver todos os avisos <ArrowRight size={16}/></Button></div></Modal>}
  {dialog==='account'&&<Modal title="Minha conta" description={`${v.viewer.name} · ${ROLES[v.viewer.role]}`} onClose={close}>
   {v.demo&&<><div className="inline-alert info"><CircleHelp size={18}/><span>Você está na demonstração. Os dados são fictícios e nenhum e-mail é enviado.</span></div><div className="dialog-list spaced">{[{mode:'',path:'/',label:'Ver painel de administração',icon:ShieldCheck},{mode:'leader',path:'/?view=leader',label:'Ver painel de liderança',icon:UsersRound},{mode:'member',path:'/minhas-escalas?view=member',label:'Experimentar a área do membro',icon:CalendarDays}].map(({path,label,mode,icon:Icon})=><Link key={path} href={path} onClick={close}><Icon size={19}/><span>{label}</span>{(v.viewer.role===(mode||'admin'))?'Atual':<ArrowRight size={16}/>}</Link>)}</div></>}
   <div className="dialog-list spaced"><Link href={href('/configuracoes')} onClick={close}><Settings2 size={19}/><span>Aparência e configurações</span><ArrowRight size={16}/></Link><button onClick={signOut}><LogOut size={18}/><span>{v.demo?'Ver tela de entrada':'Sair da conta'}</span><ArrowRight size={16}/></button></div>
  </Modal>}
  {dialog==='mobile'&&<Modal title="Navegação" onClose={close}><nav className="mobile-links" aria-label="Menu">{links(member?memberNav:[...general,...adminNav.filter(x=>x.path!=='/administradores'||v.viewer.role==='admin')])}</nav>{!member&&<Select aria-label="Filtrar por banda" className="spaced" value={band} onChange={e=>{setBand(e.target.value);close();}}><option value="">Todas as bandas</option>{v.bands.filter(b=>manageBand(v,b.id)).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Modal>}
 </div>;
}
function GlobalSearch({onClose}:{onClose:()=>void}){
 const {v,href}=useApp();const [q,set]=useState('');const key=fold(q);
 const matches=(title:string,context:string)=>fold(title+' '+context).includes(key);
 const pages=[...v.schedules.map(x=>({id:x.id,title:x.title,context:`Escala · ${bandName(v,x.band_id)}`,icon:CalendarDays,path:`/escalas/${x.id}`})),...v.songs.map(x=>({id:x.id,title:x.title,context:'Biblioteca musical',icon:Music2,path:`/musicas/${x.id}`})),...v.announcements.map(x=>({id:x.id,title:x.title,context:'Aviso',icon:Megaphone,path:`/avisos/${x.id}`})),...(v.viewer.role==='member'?[]:v.profiles.map(x=>({id:x.id,title:x.full_name,context:'Membro',icon:UsersRound,path:`/membros?perfil=${x.id}`})))];
 const items=key.length?pages.filter(x=>matches(x.title,x.context)).slice(0,12):pages.slice(0,5);
 return <Modal title="Buscar no Hallel" description="Encontre escalas, músicas e avisos." onClose={onClose}><SearchField value={q} onChange={set} placeholder="O que você procura?"/><div className="dialog-list spaced">{items.map(({id,title,context,icon:Icon,path})=><Link className="search-result" key={id} href={href(path)} onClick={onClose}><Icon size={18}/><span><strong>{title}</strong><small>{context}</small></span><ArrowRight size={16}/></Link>)}{!items.length&&<Empty icon={Search} title="Nada encontrado" description="Tente outro título, nome ou termo."/>}</div></Modal>;
}
