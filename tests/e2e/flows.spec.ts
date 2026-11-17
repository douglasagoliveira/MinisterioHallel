import { expect,test } from '@playwright/test';
import { addDays,today } from '../../lib/dates';

test('painel: cria, publica, compartilha, recebe resposta e encerra',async({page,context})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'Shalom, Daniel!'})).toBeVisible();
 await page.getByRole('link',{name:'Nova escala'}).click();await expect(page.getByRole('heading',{name:'Nova escala',exact:true})).toBeVisible();
 await page.getByLabel('Título da escala').fill('Escala de verificação');await page.getByLabel('Banda',{exact:true}).selectOption({label:'Ahuvi'});
 await page.getByLabel('Data',{exact:true}).fill(addDays(today(),8));await page.getByLabel('Local',{exact:true}).fill('Salão principal');
 await page.getByLabel('Selecionar membro').selectOption({label:'Raquel Lima'});await page.getByRole('button',{name:'Adicionar participante'}).click();
 await page.getByLabel('Escolher música').selectOption({label:'Hine Ma Tov · Em'});await page.getByRole('button',{name:'Adicionar',exact:true}).click();
 await page.getByRole('button',{name:'Salvar rascunho'}).click();await expect(page.getByRole('heading',{name:'Escala de verificação'})).toBeVisible();
 const url=page.url();await page.getByRole('button',{name:'Publicar escala'}).click();await page.getByRole('dialog').getByRole('button',{name:'Publicar escala'}).click();
 await expect(page.getByText('Publicada',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Copiar para WhatsApp'}).click();
 const share=page.getByRole('dialog');await expect(share.getByText('Raquel Lima',{exact:true})).toBeVisible();
 const guestUrl=await share.getByRole('link',{name:'Abrir link'}).getAttribute('href');expect(guestUrl).toMatch(/\/s\/[a-z0-9_-]{43}$/i);
 const guest=await context.newPage();await guest.goto(guestUrl!);await expect(guest.getByRole('heading',{name:'Escala de verificação'})).toBeVisible();
 await guest.getByRole('button',{name:'Confirmar presença'}).click();await expect(guest.locator('.badge').filter({hasText:'Confirmado'})).toBeVisible();
 await page.goto(url);await expect(page.locator('.roster-row').filter({hasText:'Raquel Lima'}).getByText('Confirmado',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Fechar escala',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Fechar escala',exact:true}).click();await expect(page.getByText('Fechada',{exact:true})).toBeVisible();
 await guest.reload();await expect(guest.getByRole('heading',{name:'Link indisponível'})).toBeVisible();
});

test('área móvel: calendário do dependente, aviso e biblioteca',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/minhas-escalas?view=member');await expect(page.getByRole('heading',{name:'Shalom, Sara!'})).toBeVisible();
 const nav=page.getByRole('navigation',{name:'Área do membro',exact:true});await expect(nav).toBeVisible();
 await nav.getByRole('link',{name:'Disponibilidade'}).click();await page.getByLabel('Mostrar disponibilidade de').selectOption({label:'Ester Mendes (dependente)'});
 const day=page.locator('.calendar-grid button').nth(2);const label=await day.getAttribute('aria-label');await day.click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByText(/Ester Mendes/)).toBeVisible();await dialog.getByLabel(/Observação/).fill('Compromisso de verificação');await dialog.getByRole('button',{name:'Marcar data'}).click();
 await expect(page.getByText('Compromisso de verificação',{exact:true})).toBeVisible();await expect(day).toHaveAttribute('aria-pressed','true');
 await day.click();await dialog.getByRole('button',{name:'Liberar data'}).click();await expect(day).toHaveAttribute('aria-label',label!);
 await nav.getByRole('link',{name:'Músicas'}).click();await page.getByLabel('Buscar título ou autor…').fill('Hine Ma Tov');await page.getByRole('link',{name:/^Hine Ma Tov/}).click();await expect(page.getByRole('heading',{name:'Hine Ma Tov'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Adicionar recurso'})).toHaveCount(0);
 await nav.getByRole('link',{name:'Avisos'}).click();await expect(page.getByRole('heading',{name:'Avisos do ministério'})).toBeVisible();
 const fits=await page.evaluate(()=>document.documentElement.scrollWidth===window.innerWidth);expect(fits).toBe(true);
});

test('painel: prévia CSV, busca, trava de administrador e tema',async({page})=>{
 await page.goto('/membros');await page.getByRole('button',{name:'Importar CSV'}).click();let d=page.getByRole('dialog');
 await d.locator('input[type=file]').setInputFiles({name:'membros.csv',mimeType:'text/csv',buffer:Buffer.from('nome;email;banda;funcao\nIntegrante Teste;pessoa.teste@example.com;Ahuvi;Vocal\n')});
 await expect(d.getByText('Pronta para importar',{exact:true})).toBeVisible();await d.getByRole('button',{name:'Confirmar importação'}).click();
 await page.getByLabel('Buscar nome ou e-mail…').fill('Integrante Teste');await expect(page.getByText('Integrante Teste',{exact:true})).toBeVisible();
 await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Administradores'}).click();
 await page.getByRole('button',{name:'Editar acesso de Daniel Almeida'}).click();d=page.getByRole('dialog');await d.getByLabel('Papel na organização').selectOption('member');await d.getByRole('button',{name:'Salvar papel'}).click();
 await expect(page.getByRole('status')).toContainText('último administrador');await page.keyboard.press('Escape');await expect(d).toHaveCount(0);
 await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Configurações'}).click();await page.getByRole('button',{name:'Claro',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.keyboard.press('Control+k');d=page.getByRole('dialog');await expect(d.getByRole('heading',{name:'Buscar no Hallel'})).toBeVisible();await d.getByLabel('O que você procura?').fill('Repertório atualizado');await d.getByRole('link',{name:/Repertório atualizado/}).click();await expect(page.getByRole('heading',{name:'Repertório atualizado'})).toBeVisible();
});
