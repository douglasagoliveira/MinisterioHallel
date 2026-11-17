import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { addDays, defaultDeadline, humanTime, today,weekStart } from '../lib/dates';
import { previewCsv } from '../lib/csv';
import { parseCommand, type Action, type Input } from '../lib/validation';
import { demoCommand,demoGuest,demoGuestRespond,demoView } from '../lib/server/demo';
import { uid } from '../lib/server/seed-demo';

test('Datas use o fuso de São Paulo; semana inicia na segunda',()=>{
 assert.equal(today(new Date('2026-11-18T02:59:00Z')),'2026-11-17');
 assert.equal(weekStart('2026-11-22'),'2026-11-16');
 assert.equal(humanTime(defaultDeadline('2026-11-21','10:30',48)),'10h30');
});
test('Prévia CSV: separador, aspas, linhas, duplicidade e responsável',()=>{
 const rows=previewCsv('nome;email;banda;funcao;data_nascimento;responsavel_email\r\n"Ana; Souza";ana@example.com;Ahuvi;Vocal;;\r\nOutra;ana@example.com;;\nMenor;;Ahuvi;Vocal;'+(Number(today().slice(0,4))-4)+'-01-01;\n',[{id:uid(10),name:'Ahuvi',description:null}],[]);
 assert.equal(rows[0].name,'Ana; Souza'); assert.deepEqual(rows[0].errors,[]);assert.equal(rows[1].line,3);
 assert.match(rows[1].errors.join(' '),/E-mail já cadastrado/);assert.match(rows[2].errors.join(' '),/responsável/);
});
test('Modo demonstração: permissões, escala, links e duplicação',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hallel-domain-'));process.env.HALLEL_MODE='demo';process.env.HALLEL_DEMO_DIR=dir;
 const cmd=<K extends Action>(mode:string|null,action:K,payload:Input<K>)=>demoCommand(mode,parseCommand({action,payload}),'https://teste.example');
 try {
  const base=await demoView(null),m=await demoView('member'),l=await demoView('leader');
  assert.equal(base.viewer.role,'admin');assert.equal(m.viewer.role,'member');assert.equal(l.viewer.role,'leader');
  assert.ok(m.schedules.every(s=>s.status!=='draft'));assert.equal(m.profiles.find(p=>p.id===base.viewer.id)?.email,undefined);
  const date=addDays(today(),9),band_id=uid(10),assignments=[{profile_id:uid(101),instrument_role:'Vocal'},{profile_id:uid(112),instrument_role:'Guitarra'},{profile_id:uid(103),instrument_role:'Teclado'}];
  await assert.rejects(cmd('leader','scheduleSave',{band_id:uid(14),title:'Fora do escopo',time:'10:00',event_date:date,assignments:[],repertoire:[]}));
  const schedule=await cmd(null,'scheduleSave',{band_id,title:'Uma escala de teste',time:'10:00',event_date:date,assignments,repertoire:[{song_id:base.songs[0].id,notes:'Introdução curta'}]});const id=schedule.id!;
  assert.equal((await demoView('member')).schedules.find(x=>x.id===id),undefined);
  await cmd(null,'schedulePublish',{id});
  const scaleView=await demoView('member');assert.equal(scaleView.schedules.find(o=>o.id===id)?.status,'published');
  const guestLinks=(await cmd(null,'scheduleLinks',{id})).links!;assert.equal(guestLinks.length,2);assert.ok(guestLinks.every(l=>!l.name.includes('Ester')));
  const link=guestLinks.find(l=>l.name.startsWith('Raquel'))!;const token=link.url.split('/').pop()!;
  const first=await demoGuest(token);assert.equal(first.first_name,'Raquel');assert.ok(!('profile_id' in first)&&!('email' in first));
  const answer=await demoGuestRespond(token,{status:'declined',reason:'Viagem',substitute:'Ana'});assert.equal(answer.status,'declined');
  const child=scaleView.scheduleMembers.find(x=>x.schedule_id===id&&x.profile_id===uid(112))!;
  await cmd('member','scheduleRespond',{id:child.id,status:'confirmed'});
  assert.equal((await demoView(null)).scheduleMembers.find(x=>x.id===child.id)?.responded_by,m.viewer.id);
  const duplicate=(await cmd(null,'scheduleDuplicate',{id,title:'Escala seguinte',event_date:addDays(date,7),time:'10:00'})).id;
  const final=await demoView(null);assert.equal(final.schedules.find(x=>x.id===duplicate)?.duplicated_from,id);
  assert.ok(final.scheduleMembers.filter(x=>x.schedule_id===duplicate).every(x=>x.status==='pending'));
  await cmd(null,'scheduleClose',{id});await assert.rejects(demoGuest(token),/expirou/);
  await assert.rejects(cmd(null,'orgRole',{id:base.orgMembers.find(x=>x.org_role==='admin')!.id,org_role:'member'}),/último administrador/);
 } finally{await rm(dir,{recursive:true,force:true});}
});
