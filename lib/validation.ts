import { z } from 'zod';
import { CATEGORY } from './model';
import { today } from './dates';

const id = z.uuid();
const mail = z.email().max(254).transform(v=>v.toLowerCase());
const text = (max:number) => z.string().trim().max(max);
const optionalText = (max:number) => text(max).nullable().optional().transform(v=>v || null);
const required = (max:number) => text(max).min(1,'Preencha este campo.');
const date = z.iso.date();
const stamp = z.iso.datetime({offset:true});
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/,'Informe um horário válido.');
export const roles = z.enum(['admin','leader','member']);
const external = z.url({protocol:/^https$/}).max(2048).refine(v=>/^(www\.|m\.|music\.)?(youtube\.com|youtu\.be|vimeo\.com)$|^(player\.vimeo\.com|drive\.google\.com|docs\.google\.com)$/.test(new URL(v).hostname),'Use um link HTTPS do YouTube, Vimeo ou Google Drive.');
const contact = z.union([mail,z.literal(''),z.null()]).optional().transform(v=>v || null);
export const profileFields = z.object({
  id:id.optional(), full_name:required(120), email:contact, phone:optionalText(32), whatsapp:optionalText(32), birth_date:z.union([date,z.literal(''),z.null()]).optional().transform(v=>v || null).refine(v=>!v||v<=today(),'A data de nascimento não pode estar no futuro.'), guardian_id:id.nullable().optional().transform(v=>v || null), notes:optionalText(1200), status:z.enum(['active','inactive']).default('active'), band_id:id.nullable().optional().transform(v=>v||null), instrument_role:optionalText(75)
});
export const response = z.object({status:z.enum(['confirmed','declined']),reason:optionalText(800),substitute:optionalText(160)});
export const parseResponseNote = (p:z.output<typeof response>) => p.status === 'declined' ? ([p.reason,p.substitute ? `Sugestão de substituto: ${p.substitute}` : null].filter(Boolean).join('\n') || null) : null;
export const schemas = {
  scheduleSave:z.object({id:id.optional(),band_id:id,title:required(140),event_date:date,time,location:optionalText(180),notes:optionalText(1800),confirm_deadline:stamp.nullable().optional().transform(v=>v||null),assignments:z.array(z.object({profile_id:id,instrument_role:required(75)})).max(120),repertoire:z.array(z.object({song_id:id,notes:optionalText(400)})).max(100)}).refine(x=>new Set(x.assignments.map(y=>`${y.profile_id}:${y.instrument_role.toLowerCase()}`)).size===x.assignments.length,'Remova as funções repetidas na escala.').refine(x=>new Set(x.repertoire.map(y=>y.song_id)).size===x.repertoire.length,'Remova as músicas repetidas.'),
  scheduleDuplicate:z.object({id,event_date:date,time,title:required(140)}),
  schedulePublish:z.object({id}), scheduleClose:z.object({id}), scheduleDelete:z.object({id}), scheduleLinks:z.object({id,member_id:id.optional()}), scheduleReplace:z.object({id,profile_id:id}),
  scheduleRespond:response.extend({id,manager:z.boolean().default(false)}),
  profileSave:profileFields, profileContact:z.object({id,phone:optionalText(32),whatsapp:optionalText(32)}), profileDelete:z.object({id}), profilesImport:z.object({rows:z.array(profileFields.omit({id:true})).min(1).max(250),send_invites:z.boolean().default(false)}),
  bandSave:z.object({id:id.optional(),name:required(75),description:optionalText(600)}), bandDelete:z.object({id}),
  bandLink:z.object({id:id.optional(),band_id:id,profile_id:id,instrument_role:required(75),band_role:z.enum(['leader','member'])}), bandUnlink:z.object({id}),
  songSave:z.object({id:id.optional(),title:required(150),key:optionalText(16),bpm:z.number().int().min(20).max(400).nullable().optional().transform(v=>v??null),author:optionalText(120),category:z.string().nullable().optional().transform(v=>v||null).refine(v=>v===null||Object.hasOwn(CATEGORY,v),'Selecione uma categoria.'),notes:optionalText(1800)}),
  songDelete:z.object({id}), songLink:z.object({song_id:id,label:optionalText(100),url:external}), songFileDelete:z.object({id}),
  availabilitySet:z.object({profile_id:id,date,blocked:z.boolean(),reason:optionalText(300)}),
  noticeSave:z.object({id:id.optional(),band_id:id.nullable(),title:required(140),body:required(3000),expires_at:stamp.nullable(),send_email:z.boolean()}), noticePublish:z.object({id}), noticeDelete:z.object({id}), noticeExpire:z.object({id}),
  inviteCreate:z.object({email:mail,org_role:roles}), inviteRevoke:z.object({id}),
  orgRole:z.object({id,org_role:roles}), orgRemove:z.object({id}),
  orgSave:z.object({name:required(100),default_confirm_hours:z.number().int().min(1).max(336),email_sender:contact})
};
export type Action = keyof typeof schemas;
export type Input<K extends Action> = z.input<(typeof schemas)[K]>;
export type Parsed<K extends Action> = z.output<(typeof schemas)[K]>;
export type Command = { [K in Action]: { action: K; p: Parsed<K> } }[Action];
export function parseCommand(raw:unknown): Command {
  if(!raw||typeof raw!=='object'||!('action' in raw)||typeof raw.action!=='string'||!Object.hasOwn(schemas,raw.action))throw new Error('Esta ação não está disponível.');
  const action=raw.action as Action;
  const val=schemas[action].safeParse('payload' in raw?raw.payload:null);
  if(!val.success) throw new Error(val.error.issues[0]?.message || 'Confira os dados do formulário.');
  return { action,p:val.data } as Command;
}
