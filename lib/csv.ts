import { fold, type Band, type Profile } from './model';
import { isMinor } from './dates';
import { profileFields, type Input } from './validation';
export type PreviewRow={line:number;name:string;band:string;data?:Input<'profilesImport'>['rows'][number];errors:string[]};
function splitCsv(text:string,delimiter:string) {
  const rows:{ line:number; cells:string[] }[]=[]; let quoted=false, cell='', cells:string[]=[], line=1,start=1;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){ if(quoted&&text[i+1]==='"'){cell+='"';i++;} else if(quoted||!cell)quoted=!quoted; else cell+=c; }
    else if(!quoted&&c===delimiter){cells.push(cell);cell='';}
    else if(!quoted&&(c==='\n'||c==='\r')){ if(c==='\r'&&text[i+1]==='\n')i++; cells.push(cell); if(cells.some(x=>x.trim()))rows.push({line:start,cells}); cells=[];cell=''; start=++line;}
    else { if(c==='\n')line++; cell+=c; }
  }
  if(quoted)throw new Error('A última linha tem aspas sem fechamento.');
  cells.push(cell);if(cells.some(x=>x.trim()))rows.push({line:start,cells});return rows;
}
export const CSV_TEMPLATE='nome;email;telefone;whatsapp;data_nascimento;banda;funcao;responsavel_email\nAna Souza;ana@example.com;;;1995-04-18;Ahuvi;Vocal;\n';
export function previewCsv(text:string,bands:Band[],profiles:Profile[]) {
  text=text.replace(/^\uFEFF/,'');
  const delimiter=(text.split(/\r?\n/,1)[0].match(/;/g)||[]).length>0?';':',';
  const rows=splitCsv(text,delimiter); if(rows.length<2)throw new Error('O arquivo precisa de um cabeçalho e pelo menos uma linha.');
  if(rows.length>251)throw new Error('Importe até 250 linhas por vez.');
  const header=rows.shift()!.cells.map(c=>fold(c).replace(/[^\w]+/g,'_'));
  if(!header.some(c=>c==='nome'||c==='full_name'))throw new Error('Inclua a coluna “nome” no CSV.');
  const used=new Set(profiles.map(p=>p.email?.toLowerCase()).filter(Boolean));
  return rows.map(({line,cells}):PreviewRow=>{
    const row=Object.fromEntries(header.map((name,i)=>[name,cells[i]?.trim()||''])); const name=row.nome||row.full_name||'';
    const errors:string[]=[]; if(cells.length!==header.length)errors.push('Quantidade de colunas diferente do cabeçalho.');
    const band=bands.find(b=>fold(b.name)===fold(row.banda||'')); if(row.banda&&!band)errors.push('Banda não encontrada.');
    if(band&&!row.funcao)errors.push('Informe a função na banda.');
    const e=(row.email||'').toLowerCase(); if(e){ if(used.has(e))errors.push('E-mail já cadastrado ou repetido.'); used.add(e); }
    const guardian=profiles.find(p=>p.email?.toLowerCase()===row.responsavel_email?.toLowerCase()&&p.status==='active'&&!p.guardian_id);
    const birth=(row.data_nascimento||row.nascimento||'').replace(/^(\d\d)\/(\d\d)\/(\d{4})$/,'$3-$2-$1');
    if(row.responsavel_email&&!guardian)errors.push('Cadastre o responsável adulto antes de importar.');
    if(isMinor(birth)&&!guardian)errors.push('Menores de 13 anos precisam de responsável.');
    if(isMinor(birth)&&(e||row.telefone||row.whatsapp))errors.push('Não informe contato pessoal de menores de 13 anos.');
    const parsed=profileFields.safeParse({full_name:name,email:e,phone:row.telefone,whatsapp:row.whatsapp,birth_date:birth,band_id:band?.id,instrument_role:row.funcao,guardian_id:guardian?.id});
    if(!parsed.success)errors.push(...parsed.error.issues.map(i=>`${String(i.path[0])}: ${i.message}`));
    return {line,name,band:row.banda||'',errors,data:parsed.success?parsed.data:undefined};
  });
}
