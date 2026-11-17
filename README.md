# Hallel · Gestão do Ministério de Louvor

MVP responsivo em português para a Congregação Har Tzion. O painel de gestão é pensado para computador; a área do membro tem navegação inferior no celular. O projeto foi construído a partir do PRD, da especificação do MVP, do CRUD e do sistema visual fornecidos, sem antecipar a leitura por IA da Fase 2.

## Experimente sem serviços externos

Use Node.js 22 LTS (mínimo compatível: 20.19) e npm. Extraia o ZIP e, no terminal, entre na pasta `hallel`:

```bash
npm ci
npm run dev
```

Abra **http://localhost:3000**. Sem variáveis de produção, você entra no modo demonstração, como Daniel (administrador). Use o menu do perfil no rodapé da barra lateral para alternar para Gabriel (líder), Sara (membro e responsável) ou para a tela de entrada. No celular, esse menu fica no avatar do cabeçalho.

1. Em **Nova escala**, escolha a banda, uma data futura, os participantes e as músicas; salve como rascunho.
2. Abra a escala, clique em **Publicar escala** e, depois, em **Copiar para WhatsApp**. Abra um link individual em outra aba, confirme ou recuse e retorne ao painel.
3. Use **Fechar escala** e reabra o link para verificar que ele deixou de funcionar.
4. Na área de Sara, abra **Disponibilidade**, escolha o dependente e marque uma data. Ao editar uma escala nessa data, a gestão verá o alerta, mas ainda poderá incluir a pessoa.

A demonstração contém nomes e e-mails fictícios. A persistência fica em `hallel/.local/`, compartilhada pelos papéis **na mesma instância**. Ela **não é apropriada para dados reais**. Nenhum e-mail é enviado, o login externo fica desabilitado e o aceite de convites reais depende de autenticação. Para restaurar os exemplos, pare a aplicação e apague **apenas a pasta `.local/` desta cópia de demonstração**. `HALLEL_DEMO_DIR` permite escolher outro diretório local.

## O que está no pacote

- **Escalas:** rascunho, publicação, edição, encerramento, duplicação, equipe e repertório ordenado, alerta de data bloqueada, confirmação e recusa, substituição, visualização de pendências e mensagens individuais para WhatsApp. A exportação de links não envia mensagens pelo WhatsApp.
- **Pessoas e bandas:** cadastro e arquivo, papéis e funções por equipe, importação CSV com prévia por linha, proteção do último administrador e vínculos de responsáveis. Menores de 13 anos não têm conta, foto, notas ou contatos próprios; não recebem link público.
- **Músicas:** categorias, filtros por título, tom e categoria; links HTTPS de YouTube, Vimeo e Google Drive; PDFs privados de até 4 MB, com assinatura válida por 120 segundos. A permissão de um link externo continua sob o controle do serviço externo.
- **Avisos e disponibilidade:** publicação geral ou por banda, expiração e histórico, opcionalmente e-mail; calendário próprio e dos dependentes.
- **Acesso e operação:** integração Supabase Auth (link mágico e Google), convites de uso único (7 dias), RLS, registros de auditoria, fila Resend, lembretes e PWA. Modo claro, escuro e automático. O cache offline contém apenas recursos públicos, não escalas, tokens, PDFs ou perfis.

### CSV de membros

Use UTF-8, delimitador `;` ou `,` e cabeçalhos como:

```csv
nome;email;telefone;whatsapp;data_nascimento;banda;funcao;responsavel_email
Ana Souza;ana@example.com;;;1995-04-18;Ahuvi;Vocal;
```

O nome é obrigatório. Se informar banda, informe também a função. Cadastre responsáveis adultos antes de importar seus dependentes. Para menores de 13 anos, preencha nascimento e `responsavel_email` e deixe contatos pessoais em branco. Até 250 linhas por arquivo; corrija todos os erros antes de confirmar. A importação é transacional em produção.

## Configurar ambiente de piloto

O **Google Drive armazena o pacote, não hospeda o aplicativo**. Crie um ambiente de homologação antes de usar dados reais.

### 1. Supabase: banco, Storage e perfis

- Crie ou selecione o projeto Supabase PostgreSQL. Com a CLI autenticada, na pasta `hallel`, execute `supabase link --project-ref SEU_PROJECT_REF` e `supabase db push`. Alternativamente, aplique os arquivos em `supabase/migrations/` **em ordem numérica**, uma única vez, pelo SQL Editor. As migrações criam o esquema, as políticas e os buckets privados.
- Edite `supabase/seed-piloto.sql` com e-mail e nome do primeiro administrador. Execute uma vez, depois das migrações. O seed usa o slug `har-tzion` e cria Ahuvi, Hineni, Simchá, Shoresh e Hallel Delas, nomes editáveis no painel. Se mudar o slug, ajuste `HALLEL_ORG_SLUG`.
- O primeiro login associa o e-mail autenticado ao perfil ativo. Cadastre os outros perfis pelo painel; para lideranças, defina o papel organizacional em **Administradores** e o papel na banda em **Membros e bandas → Bandas → Gerenciar banda**.

### 2. Autenticação sem senha e e-mail

- Em **Supabase → Authentication → URL Configuration**, informe o domínio HTTPS de produção como Site URL e autorize o retorno `https://SEU-DOMINIO/auth/callback` com query string. Inclua `http://localhost:3000/auth/callback` somente no ambiente de desenvolvimento, se necessário. O caminho de retorno dentro do app é validado.
- Ative o provedor Google e complete o cliente OAuth no Google Cloud. Em **URIs de redirecionamento autorizados** do cliente, use o callback exibido pelo Supabase (`https://SEU-PROJETO.supabase.co/auth/v1/callback`, sem trocar pelo callback Next.js). Habilite cadastro via provedores e verificação de e-mail; usuários autenticados que não têm perfil ou convite válido não recebem acesso ao ministério.
- Para o link mágico, configure SMTP próprio no Supabase Auth. Pode usar o SMTP do Resend. No Resend, verifique o domínio, o remetente e os registros DNS indicados (SPF/DKIM). O SMTP do Auth é usado para entrar; os e-mails de escala e convites do ministério usam a API Resend no servidor.
- Para aceitar o link mágico em outro navegador, configure os modelos de link mágico e de confirmação de cadastro com a URL baseada em `TokenHash` abaixo. O app cria `RedirectTo` sempre com `?next=...`; preserve esse `next` e, quando houver, o parâmetro `invite`. Desative o rastreamento de cliques nos links de acesso. Homologue os dois modelos antes do piloto.

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email">Entrar no Hallel</a>
```

### 3. Vercel: deploy e variáveis

Envie o código para um **repositório privado** e importe na Vercel como Next.js, usando o diretório em que está `package.json` e Node.js 22. Use `npm ci` e `npm run build`, sem `output: export`: as rotas precisam de Node.js. Defina as variáveis no painel da Vercel antes do deploy (ou em `.env.local` para execução local com serviços reais):

| Variável | Valor |
| --- | --- |
| `HALLEL_MODE` | `production` |
| `HALLEL_BASE_URL` | URL canônica HTTPS do aplicativo, sem caminho |
| `HALLEL_ORG_SLUG` | `har-tzion` se não mudou o seed |
| `SUPABASE_URL` | URL do projeto |
| `SUPABASE_ANON_KEY` | Chave publishable/anon do projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave privilegiada **somente no servidor** |
| `HALLEL_LINK_SECRET` | Segredo aleatório exclusivo com 32 caracteres ou mais, por exemplo `openssl rand -hex 32` |
| `HALLEL_CRON_SECRET` | Outro segredo aleatório, diferente do de links |
| `RESEND_API_KEY` | Chave de envio do Resend, só no servidor |
| `RESEND_FROM` | Remetente verificado, por exemplo `Hallel <escalas@SEU-DOMINIO>` |

Nunca use prefixo `NEXT_PUBLIC_` para os segredos. Não guarde as chaves no Drive ou no Git. Use o domínio canônico nos testes (a origem das gravações é validada). A configuração de sender no painel, se usada, também precisa estar autorizada no Resend. Se trocar `HALLEL_LINK_SECRET`, reemita os links e convites ainda pendentes pelo painel; para revogar imediatamente os links antigos após vazamento, limpe os hashes pendentes via banco e revogue os convites antigos antes de reemitir.

### 4. Lembretes e fila

- Defina `HALLEL_CRON_SECRET` e `HALLEL_BASE_URL` como secrets da Edge Function Supabase e publique `supabase functions deploy reminders --no-verify-jwt`. Ela verifica seu próprio segredo no cabeçalho, usado também na rota Next.js.
- Ative `pg_cron` e `pg_net`, cadastre no Vault os nomes descritos em `supabase/cron-exemplo.sql` e aplique o script. A seleção de lembretes roda de hora em hora; há rodadas adicionais para entregar e-mails enfileirados. O mesmo par escala/destinatário recebe no máximo um lembrete. Escala fechada, prazo vencido e resposta já recebida não geram lembrete.
- Confirme na homologação: uma publicação enfileira e entrega notificações; uma recusa chega à liderança; um aviso sem a opção de e-mail não envia; o lembrete roda no fuso e na janela esperados. Verifique `notification_log` (tentativas, `queued`, `sending`, `sent`, `failed`) e o histórico de envio do Resend. A fila usa chave de idempotência por envio e tentativas limitadas.

## Validação, operação e manutenção

```bash
npm run typecheck
npm test                 # domínio e migrações/RLS em PostgreSQL embarcado (PGlite)
npm run build
npx playwright install chromium
npm run test:e2e          # navegador com instância demo isolada na porta 3101
```

Os testes cobrem o fluxo de publicação e resposta, expiração ao fechar, visibilidade de rascunhos, isolamento organizacional, gestão de dependentes, convites de uso único, permissão para PDFs, trava do último admin, CSV, navegação móvel e tema. O PGlite simula os papéis e os esquemas Auth/Storage para testar regras SQL; **não substitui testes com as integrações reais**. No piloto, verifique os e-mails nos provedores usados pela equipe, provisione duas contas de administração, confira políticas por papel e teste instalação em Android e iPhone. Confirme o tempo de carregamento no 4G do local. O ambiente real não foi provisionado nesta entrega.

**Backup:** confirme a retenção e a restauração do plano Supabase. Se a retenção for insuficiente, use exportação periódica do banco pelo mecanismo suportado (backup do projeto ou `supabase db dump --linked --data-only` para dados, mais migrações para o esquema). Um dump limitado a `public` não contém contas Auth nem arquivos de Storage. Planeje a restauração das identidades e copie separadamente os PDFs privados e o inventário dos objetos. Faça uma restauração de teste em projeto isolado seguindo o procedimento do plano; proteja backups com criptografia e acesso restrito. Para métricas do piloto veja `supabase/metricas-piloto.sql`.

**Privacidade:** use somente os dados necessários, verifique o acordo de tratamento com a congregação e limite o acesso à pasta e aos backups. Itens da Fase 2 (IA em arquivos de disponibilidade e extração de metadados de músicas) e recursos das fases seguintes não foram ativados.

### Mapa rápido do código

| Caminho | Conteúdo |
| --- | --- |
| `app/`, `components/` | App Router, painel, membro, login e rotas públicas restritas |
| `app/api/state`, `app/api/actions` | Consultas autenticadas e comandos validados por papel |
| `app/api/s`, `app/api/files`, `app/auth/callback` | Respostas por hash, PDFs privados e validação da sessão |
| `lib/server/demo.ts`, `lib/server/live.ts` | Adaptadores local e Supabase; envio Resend separado da interface |
| `supabase/migrations/` | Schema relacional, RLS, operações transacionais e fila de notificações |
| `tests/` | Testes de domínio, PostgreSQL e navegação com Chromium |

A identidade visual utiliza as artes fornecidas pelo ministério (símbolo e capa da Torá), as fontes Bebas Neue e Space Grotesk distribuídas via Fontsource, e uma fotografia ilustrativa gerada para o banner. O banner não representa uma pessoa real da congregação.
