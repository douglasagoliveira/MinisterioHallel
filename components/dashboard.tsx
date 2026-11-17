'use client';
import Link from 'next/link';
import { ArrowDownRight, ArrowRight, CalendarDays, ChevronRight, CircleCheck, Clock3, Megaphone, Plus } from 'lucide-react';
import { useApp } from '@/lib/client';
import { bandName,manageBand,roster, type Announcement,type Schedule,type View } from '@/lib/model';
import { addDays,humanTime,prettyDate,shortMonth,today,weekStart } from '@/lib/dates';
import { Badge,BandDot,Button,Card,Empty,Eyebrow } from './ui/primitives';

export function Dashboard(){
 const {v,band,href,go}=useApp();
 const now=today(),start=weekStart(now),end=addDays(start,6);
 const events=v.schedules.filter(s=>manageBand(v,s.band_id)&&s.event_date>=start&&s.event_date<=end&&(!band||s.band_id===band)).sort((a,b)=>a.event_date.localeCompare(b.event_date)||Date.parse(a.starts_at)-Date.parse(b.starts_at));
 const published=events.filter(e=>e.status==='published'),drafts=events.filter(e=>e.status==='draft');
 const replies=published.flatMap(s=>roster(v,s.id));const pending=replies.filter(m=>m.status==='pending').length,confirmed=replies.filter(m=>m.status==='confirmed').length;
 const pendingSchedules=published.filter(s=>roster(v,s.id).some(m=>m.status==='pending')).length;
 const notices=v.announcements.filter(n=>n.status==='published'&&(!n.expires_at||Date.parse(n.expires_at)>Date.now())&&(!band||!n.band_id||n.band_id===band)).sort((a,b)=>(b.published_at||'').localeCompare(a.published_at||'')).slice(0,2);
 const range=`${Number(start.slice(-2))}–${Number(end.slice(-2))} ${shortMonth(end)}`;
 const stats=[
  {icon:CalendarDays,tone:'indigo',label:'Escalas da semana',value:events.length,desc:events.length?`${published.length} publicadas · ${drafts.length} em rascunho${events.some(e=>e.status==='closed')?` · ${events.filter(e=>e.status==='closed').length} fechadas`:''}`:'Nenhum encontro na semana',link:'/escalas'},
  {icon:Clock3,tone:'gold',label:'Confirmações pendentes',value:pending,desc:pendingSchedules?`Em ${pendingSchedules} ${pendingSchedules===1?'escala publicada':'escalas publicadas'}`:'Nenhuma resposta pendente',link:'/escalas?status=published'},
  {icon:CircleCheck,tone:'mint',label:'Presenças confirmadas',value:confirmed,desc:'Nas escalas publicadas desta semana',link:'/escalas?status=published'},
 ];
 return <div className="dashboard">
  <div className="dashboard-kicker"><Eyebrow><span className="kicker-dot"/> Visão geral</Eyebrow><span className="today-label"><CalendarDays size={15}/>{prettyDate(now,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span></div>
  <section className="home-hero" aria-labelledby="title-home"><div className="hero-copy">
   <Eyebrow><span className="eyebrow-line"/> Painel do ministério</Eyebrow>
   <h1 id="title-home">SHALOM, <span>{v.viewer.name.split(' ')[0]}!</span></h1>
   <p>Organize as escalas, acompanhe as confirmações<br className="wide-only"/> e prepare o próximo encontro do ministério.</p>
   <div className="hero-actions"><Button asChild><Link href={href('/escalas/nova')}><Plus size={18}/> Nova escala</Link></Button><Button variant="secondary" className="hero-secondary" asChild><Link href={href('/escalas')}>Ver escalas <ArrowRight size={16}/></Link></Button></div>
  </div><span className="hero-corner" aria-hidden="true"/><div className="hero-index" aria-hidden="true"><span/> HALLEL <i/> HAR TZION</div></section>
  <div className="stats-grid">{stats.map(({icon:Icon,tone,label,value,desc,link})=><Link className="stat-card panel" href={href(link)} key={label}><div className="stat-top"><span className={`tile tone-${tone}`}><Icon size={21}/></span><ArrowDownRight className="stat-arrow" size={16}/></div><div className="stat-content"><div className="stat-name">{label}</div><strong>{String(value).padStart(2,'0')}</strong><div className="stat-note">{desc}</div></div></Link>)}</div>
  <div className="home-grid">
    <section className="home-schedules" aria-labelledby="week-title"><div className="section-head"><div><h2 id="week-title">Escalas da <span className="ink">semana</span></h2><span className="section-meta">{range} · {band?bandName(v,band):'Todas as bandas'}</span></div><Link className="text-btn" href={href('/escalas?periodo=todas')}>Ver todas <ArrowRight size={15}/></Link></div>
     {events.length?<ScheduleTable events={events} v={v} href={href} compact/>:<Card><Empty icon={CalendarDays} title="Nenhuma escala nesta semana" description="Crie a primeira ou duplique uma escala anterior." action={<Button onClick={()=>go('/escalas/nova')}><Plus size={17}/> Nova escala</Button>}/></Card>}
    </section>
    <section className="home-notices" aria-labelledby="notices-title"><div className="section-head"><div><h2 id="notices-title">Avisos <span className="ink">recentes</span></h2><span className="section-meta">Comunicados do ministério</span></div><Link className="text-btn" href={href('/avisos')}>Ver todos <ArrowRight size={15}/></Link></div>
     {notices.length?<div className="notice-stack">{notices.map((n,i)=><CompactNotice key={n.id} n={n} v={v} path={href(`/avisos/${n.id}`)} index={i}/>)}</div>:<Card><Empty icon={Megaphone} title="Sem avisos recentes"/></Card>}
     <Link className="new-notice-link" href={href('/avisos/novo')}><Plus size={17}/> Criar aviso</Link>
    </section>
  </div>
 </div>;
}
export function CompactNotice({n,v,path,index=0}:{n:Announcement,v:View,path:string,index?:number}){
 const dt=n.published_at||n.created_at;const published=today(new Date(dt));const when=published===today()?'Hoje':published===addDays(today(),-1)?'Ontem':`${Number(published.slice(-2))} ${shortMonth(published)}`;
 return <Link href={path} className={`compact-notice panel ${index%2===0?'notice-gold':'notice-blue'}`}><span className={`tile ${index%2===0?'tone-gold':'tone-indigo'}`}><Megaphone size={18}/></span><div><div className="notice-tiny"><span>{n.band_id?bandName(v,n.band_id):'Geral'}</span><time dateTime={dt}>{when}</time></div><h3>{n.title}</h3><p>{n.body}</p></div><ChevronRight className="notice-arrow" size={16}/></Link>;
}
export function ScheduleTable({events,v,href,compact=false}:{events:Schedule[],v:View,href:(url:string)=>string,compact?:boolean}){
 return <div className={`panel table-panel ${compact?'compact-table':''}`}><div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela de escalas"><table className="data-table schedule-table"><thead><tr><th scope="col">Evento</th><th scope="col">Banda</th><th scope="col">Respostas</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Detalhes</span></th></tr></thead><tbody>{events.map(s=>{
  const rs=roster(v,s.id),confirmed=rs.filter(r=>r.status==='confirmed').length,declined=rs.filter(r=>r.status==='declined').length,replied=confirmed+declined;
  const m=rs.length;
  return <tr key={s.id}><td><Link className="event-cell" href={href(`/escalas/${s.id}`)}><span className="date-tag"><b>{s.event_date.slice(-2)}</b><small>{shortMonth(s.event_date)}</small></span><span><strong>{s.title}</strong><small>{humanTime(s.starts_at)}{s.location&&<>{' '}<i/> {s.location}</>}</small></span></Link></td><td><BandDot id={s.band_id} name={bandName(v,s.band_id)}/></td><td>{s.status==='draft'?<span className="muted">—</span>:<div className="response-bar" title={`${confirmed} confirmados, ${declined} recusados, ${m-replied} pendentes`}><span><b>{replied}</b> / {m}</span><div aria-hidden="true"><i style={{width:`${m?100*confirmed/m:0}%`}}/><i style={{width:`${m?100*declined/m:0}%`}}/></div></div>}</td><td><Badge status={s.status}/></td><td><Link className="row-arrow" href={href(`/escalas/${s.id}`)} aria-label={`Ver escala: ${s.title}`}><ChevronRight size={18}/></Link></td></tr>;
 })}</tbody></table></div></div>;
}
