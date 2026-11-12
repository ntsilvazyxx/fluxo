# Fase 9 — Homologação Final, Segurança, Desempenho e Preparação para Implantação

Data: 2026-11-12, America/Cuiaba. Base: `de43c2f4575262f7f11d2213e8f1722647e41c75`.

> Estado mais recente: **seção 14 — retirada técnica do TOTP solicitada pelo responsável, com exceção de segurança pendente de aprovação institucional formal**. Login agora usa somente e-mail/senha, inclusive ADMIN MASTER. Seções 1–13 preservam execuções e políticas anteriores; não representam exigência atual de TOTP nem aprovação institucional. Prontidão permanece **NÃO APTO para produção**.

## 1. Resumo e limites da homologação

A revisão executou testes reais contra MariaDB e Chromium, corrigiu problemas reproduzidos de interface, sessão, tratamento de erros e segurança de logs, reduziu o bundle e produziu o procedimento operacional. As permissões homologadas da Fase 8 foram preservadas: somente Secretário/Gestor acessam dashboard e relatórios; ADMIN MASTER e Técnico continuam bloqueados.

Ambiente efetivo: Windows/PowerShell, Node 24.16.0, npm 11.13.0, Prisma 7.10.1, MariaDB `10.11.16-MariaDB` do XAMPP em `127.0.0.1:3306`. Todos os testes de banco e a carga usaram **exclusivamente `seaf_gestao_test`**. E2E executou API em 3109 e frontend em 4179; o servidor de desenvolvimento não foi reutilizado. O `.env` e as configurações de desenvolvimento não foram modificados.

Não foram executados reset, `db push`, migração nova, importação de `bdseaf.sql`, implantação, publicação, commit ou push. O dump local permaneceu não rastreado. A numeração 0–9 segue a sequência aprovada pelo usuário; o plano original SDD 11 usa outra divisão de fases. Não foram encontrados relatórios próprios das Fases 0 e 6 em `docs/`; as decisões da base e a suíte de imagens existente foram revisadas sem inventar relatórios históricos.

## 2. Comandos executados e resultados

| Verificação | Aprovados | Reprovados | Ignorados | Evidência |
| --- | --- | --- | --- | --- |
| Backend sem integração | 38 | 0 | Ver nota | `npm.cmd run check` / `node --test` |
| Frontend | 7 | 0 | 0 | Vitest, cinco arquivos; repetido após a última correção de interface |
| Integração MariaDB | 75 | 0 | 0 | `RUN_DATABASE_INTEGRATION=1 npm.cmd run test:integration`, nove suítes |
| E2E Chromium | 26 | 0 | 0 | `npm.cmd run test:e2e`, uma worker, sem retries |
| ESLint backend/frontend | — | — | — | Aprovado; repetido após a última alteração de componente |
| ESLint das ferramentas de homologação | — | — | — | `npm.cmd run lint:quality`, aprovado |
| Prisma Validate | — | — | — | Schema válido em `npm.cmd run check` |
| Build produção | — | — | — | Aprovado, sem aviso de chunk acima de 500 kB |
| Carga HTTP controlada | 200 | 0 | 0 | Quatro endpoints × 50 requisições, concorrência 5 |
| Outbox sob concorrência | 100 eventos | 0 | 0 | 100 notificações, três consumidores, sem SMTP real |
| Auditoria de schema | — | — | — | Três checksums compatíveis, 19 triggers presentes, sem inconsistência no vínculo tarefa/ciclo |
| `git diff --check` | — | — | — | Aprovado no fechamento |
| `npm.cmd audit --omit=dev --json` | — | — | — | Zero vulnerabilidades conhecidas reportadas para runtime |

No comando de testes sem banco, nove suítes MariaDB aparecem como `SKIP` por configuração; o resumo Node informa zero testes ignorados porque seus testes internos não são enumerados. Essas suítes **não** foram contadas como aprovadas nesse comando: foram executadas separadamente e aprovaram os 75 testes reais acima.

Os primeiros ciclos de investigação tiveram falhas e foram corrigidos antes das execuções finais: corrida de refresh, payload opcional vazio, interface após rejeição, galeria desatualizada, overflow, contraste e labels. Também houve ajustes nas próprias fixtures E2E: esperar confirmação real do upload em vez da prévia local, vincular membro antes de inativá-lo e fornecer `assignmentId` no evento de teste. A correção de encoding exigiu atualizar a expectativa textual de um teste frontend. Resultados preliminares não foram apresentados como aprovação.

Artefatos reproduzíveis locais: `.artifacts/e2e-results.json`, `.artifacts/screenshots/`, `.artifacts/performance.json`, `.artifacts/schema-audit.json`. Esses arquivos são ignorados pelo Git; traces de falha podem conter cookies/tokens e exigem acesso restrito e descarte após análise. Não há credencial de teste fixa de produção: fixtures geram usuários e senhas aleatórios por execução e preservam os históricos existentes do banco de testes.

## 3. Cenários E2E validados

Todos utilizam navegador real e respostas reais da API/MariaDB. Apenas o cenário de carregamento segura temporariamente a requisição e depois a encaminha à API; não fabrica uma resposta de sucesso.

| Fluxo | Perfil / forma de execução | Resultado |
| --- | --- | --- |
| Login, cookie, renovação e expiração | Técnico; access token de 4 segundos no servidor de teste, espera de expiração real | Login, refresh, reload, logout e novo reload aprovados |
| Criação, edição, atribuição | Secretário pelo formulário | Dados persistidos e nova versão exibida |
| Aceite e conclusão | Técnico pelo formulário | Conclusão real; histórico preservado |
| Reabertura | Gestor pelo formulário | Novo ciclo 2 sem atribuição e com ciclo anterior preservado |
| Rejeição, cancelamento e restauração | Técnico/Gestor pelo navegador | Rejeição devolve a lista; restauração cria ciclo novo |
| Devolução aprovada e negada | Técnico solicita, Gestor decide pelo navegador | Dois cenários reais aprovados |
| Prorrogação aprovada e negada | Técnico solicita, Gestor decide pelo navegador | Dois cenários reais aprovados |
| Conclusão com prorrogação pendente | Técnico pelo navegador | Tarefa `COMPLETED`, pedido `CLOSED_BY_COMPLETION` |
| Subtarefa e cascata | Gestor cria e cancela principal pelo navegador | Bloqueio de conclusão exibido e subtarefa encerrada atomicamente |
| Upload e acesso protegido | Técnico, PNG real | Upload persistido, leitura sem bearer retorna 401, modal abre/fecha por Escape e remoção lógica funciona |
| Usuários e equipes | ADMIN MASTER: criação/vínculo/inativação pela API e consulta de telas no navegador | APIs autorizadas funcionam; dashboard continua inacessível ao perfil |
| Notificações internas | Evento com vínculos reais processado pelo serviço de outbox; Técnico usa a tela | Notificação renderizada e marcada como lida no banco |
| Dashboard e relatórios | Gestor | Telas reais, gráficos não vazios, tabela e filtros acessíveis; limites de dia enviados como instantes UTC |
| Responsividade | Gestor em 320/375/390/430/768/1024/1440 px | Oito rotas em cada largura sem overflow da página, com screenshots e menu móvel |
| Perfis técnicos | ADMIN MASTER e Técnico em 320/768/1440 px | Usuários, equipes e detalhe da tarefa sem overflow; Técnico redirecionado ao tentar dashboard |
| Acessibilidade automatizada | Login, dashboard, relatórios, nova tarefa e Kanban | Axe WCAG 2 A/AA sem violações nos estados examinados |
| XSS, erro e carregamento | Gestor/Técnico | HTML exibido como texto; recurso inexistente mostra erro; carregamento possui feedback antes de resposta real |

As telas de usuários e equipes existentes são de **consulta**: não há formulários de gestão nelas. A mutação desses recursos foi testada pela API, e não alegada como E2E de formulário inexistente. Recuperação de senha tem cobertura de API na integração, não fluxo completo de e-mail/navegador. Renovação concorrente, JWT adulterado e revogação também são verificados em backend.

Limites: Chromium apenas; viewports simulam tamanhos, não são aparelhos físicos. Não foram executados Firefox, WebKit, leitor de tela, teste assistivo humano ou validação com usuários institucionais. Screenshots de manager cobrem 56 combinações de rota/largura, com cobertura adicional de usuários/equipes/detalhe para perfis técnicos. A inspeção visual direta incluiu calendário mobile e dashboard desktop com gráficos renderizados.

## 4. Problemas encontrados e corrigidos

1. **Corrida de refresh:** StrictMode/consultas paralelas podiam rotacionar o mesmo cookie duas vezes e perder a navegação. Uma única promise de renovação é compartilhada; não houve mudança no protocolo ou na duração da sessão real.
2. **Justificativa opcional vazia:** o formulário enviava `reason: ''` na atribuição/subtarefa e recebia 400. Agora omite o valor vazio; motivos obrigatórios continuam validados pelo backend.
3. **Tela após rejeição:** o Técnico relia um recurso cujo escopo havia mudado. Agora retorna a Minhas Tarefas após a mutação confirmada.
4. **Permissão de upload desatualizada:** a galeria não recarregava ao aceitar a tarefa. A versão do ciclo integra a dependência de recarga.
5. **Conclusão durante prorrogação:** a interface e o backend bloqueavam todo pedido pendente, embora o SDD 02 bloqueie conclusão somente na devolução. Ambos foram alinhados ao contrato: a prorrogação é encerrada como `CLOSED_BY_COMPLETION` na mesma transação. Recebeu E2E e dois testes MariaDB, cobrindo conclusão idempotente com auditoria/outbox únicas e a permanência do bloqueio/pausa na devolução.
6. **Encoding e gráficos:** corrigidos caracteres double encoded na galeria, escapes Unicode literais no JSX e uso de `cell` HTML em vez de `Cell` do Recharts. Gráficos respeitam movimento reduzido.
7. **Acessibilidade/layout:** nomes de campos, foco/retorno de foco e Escape nos modais, foco visível, contraste do texto secundário e grid do calendário em 320 px.
8. **Período dos formulários:** data final selecionada era enviada à meia-noite e excluía o restante do dia. Agora a interface envia começo/fim do dia local, convertidos a UTC; o contrato de instantes inclusivos da API não foi modificado.
9. **CORS e parser:** origem recusada passa a retornar 403; JSON malformado retorna 400 e corpo excessivo 413, sem eco do conteúdo sensível.
10. **Logs:** removidos stack/query/payload de falhas internas e destinatário/corpo no adaptador de e-mail de teste. Worker registra tipo de falha sem mensagem potencialmente sensível.
11. **Configuração de produção:** startup rejeita segredo JWT curto/modelo, cookie sem Secure e URLs HTTP/vazio de CORS.
12. **Upload hostil:** `file-type` 20.5 foi substituído por 22.3.0 para tratar advisories de parsing. Regressões de MIME, tamanho, concorrência e compensação passaram. Isso exige Node >=22; mínimo do projeto ajustado para 22.12, mantendo JavaScript/ESM.
13. **Consultas:** relatório não carrega mais calendários/pausas que não usa; seleção histórica envia também o intervalo ao SQL antes da agregação.
14. **Isolamento de testes:** runner de integração exige flag e nome exato de banco, e configura o processo filho para testes; há teste de recusa do destino de desenvolvimento sem conexão.

Arquivos principais de revisão: `backend/src/app.js`, `config/env.js`, `config/production-policy.js`, `middlewares/error-handler.js`, serviços de tarefas/dashboard/outbox; `frontend/src/App.jsx`, `auth/AuthContext.jsx`, páginas operacionais e componentes de galeria/ciclo/período; testes de segurança, integração e frontend; `playwright.config.js` e `quality/`; manifests/lockfile, `.gitignore`, `.env.example`, README, decisões e documentos desta fase. O schema Prisma e as migrações existentes não foram alterados. `.env.example` contém somente modelos, sem credenciais reais.

## 5. Avaliação de segurança

| Área | Evidência e conclusão |
| --- | --- |
| Senha/JWT/refresh | Argon2id, access token em memória, refresh opaco somente como hash no banco; expiração, adulteração, cookie HttpOnly/Strict, rotação concorrente e revogação aprovados |
| Recuperação | Token temporário, uso único e revogação de sessões aprovados na integração; **entrega do token não implementada pelo notifier padrão de produção** |
| RBAC/IDOR | Isolamento por equipe, responsável e destinatário; Tentativas fora de escopo negadas; dashboard bloqueia Técnico e ADMIN MASTER diretamente |
| Validação/SQL injection | Schemas Zod, paginação e ordenação allowlist, pesquisa maliciosa tratada como texto; revisão não encontrou `$queryRawUnsafe` ou concatenação de entrada em SQL no runtime |
| XSS | React escapa conteúdo; título malicioso não executou no Chromium. Não equivale a pentest completo de todos os contextos |
| CSRF/CORS | Cookies Strict, bearer nas mutações de negócio e rejeição de Origin não aprovado antes dos handlers, inclusive refresh/logout. Requisições sem Origin continuam permitidas para clientes não navegador; não foram afrouxados cookies |
| Rate limit | 429 reproduzido em testes; limiter é local em memória. Topologia de proxy e múltiplas instâncias ainda requer homologação |
| Headers/erros/logs | Helmet, CSP da API, HSTS e nosniff conferidos; sem `x-powered-by`; falhas não expõem detalhes e logs saneados. HTTPS e headers da SPA precisam ser configurados na infraestrutura |
| Upload/storage | Assinatura real, extensão, limite, máximo concorrente, autoria, acesso autenticado e path traversal testados. Não há antivírus ou reconciliador periódico de órfãos após crash |
| Concorrência | Locks, CAS, idempotência, reaberturas concorrentes, conclusão/cancelamento e cascata preservados pela integração |
| Auditoria | Registros críticos e triggers append-only examinados/testados. Não foi criada nova permissão administrativa de consulta |
| Dependências | Runtime: zero advisories no `npm audit --omit=dev`; árvore completa: quatro moderados em ESLint/minimatch de desenvolvimento, sem downgrade/override automático |
| MFA | **Pendente**, obrigatório no SDD 07 para operações críticas do ADMIN MASTER; tabela existente não fornece o mecanismo |

A atualização do detector considera o [advisory do mantenedor sobre ZIP malicioso](https://github.com/advisories/GHSA-j47w-4g3g-c36v) e as [releases oficiais de file-type](https://github.com/sindresorhus/file-type/releases). O isolamento E2E utiliza a configuração de serviços descrita na [documentação oficial do Playwright](https://playwright.dev/docs/test-webserver). Não foram executados envios externos, scanners contra domínio institucional ou pentest independente.

## 6. Avaliação de desempenho e banco

Metodologia: `npm.cmd run test:performance`, HTTP real em loopback com API própria e pool de dez conexões, dataset exclusivo por UUID. Foram adicionadas 300 tarefas principais/ciclos, sendo 100 pendentes, 100 em andamento com atribuição/calendário e 100 concluídas. Os registros preexistentes do banco foram preservados; o filtro do Gestor isola a nova equipe. Após três warmups por rota, executaram-se 50 requisições por endpoint, cinco simultâneas, com token real. A medição final foi separada da execução E2E. São resultados exploratórios de máquina pessoal, sem SLA institucional assumido.

| Endpoint | Requisições | p50 (ms) | p95 (ms) | Máximo (ms) | SQL/requisição | Falhas |
| --- | --- | --- | --- | --- | --- | --- |
| `/tasks` (20 linhas) | 50 | 17,35 | 27,81 | 29,16 | 9 | 0 |
| `/reports` (20 linhas) | 50 | 15,22 | 19,65 | 23,07 | 9 | 0 |
| `/dashboard` (300 tarefas) | 50 | 124,71 | 178,00 | 213,26 | 14 | 0 |
| `/notifications` (lista inicialmente vazia do Gestor) | 50 | 10,04 | 12,17 | 13,08 | 6 | 0 |

As contagens incluem SQL de autenticação e consultas de relações do Prisma, não só uma consulta de agregação. Probe de relatório retornou exatamente 20 e 100 linhas com **nove comandos SQL em ambos**, sem crescimento N+1 nesse caminho. `EXPLAIN` da seleção por equipe/exclusão utilizou `tasks_teamId_deletedAt_idx`, tipo `ref`, `Using where; Using index`. Não se generaliza esse plano a todas as combinações de filtros.

Memória do processo de benchmark: RSS antes ~200,79 MiB; pico amostrado ~338,00 MiB; heap ao final ~158,20 MiB. Inclui API, Prisma, fixtures e alocações transitórias; sem GC forçado. Não é ensaio de longa duração nem prova de ausência de leak. Dashboard ainda carrega estado e relações para agregação/cálculo de expediente em memória; séries sem período e grande histórico precisam de carga representativa e possível agregação SQL/paginação interna antes de escalar.

Outbox: 100 eventos `TASK_ASSIGNED` com vínculos reais, três consumidores com claim CAS filtrado ao prefixo exclusivo da execução, 100 processados e 100 notificações em ~505,84 ms. E-mail foi explicitamente desabilitado por preferência e o sender lança erro se chamado; **não é teste de SMTP nem de exatamente uma entrega externa**. Backoff, dedupe e recuperação de órfãos foram também executados na integração da Fase 7.

Inventário de banco, somente por leitura: três migrações com checksum compatível, 106 índices distintos (164 linhas/colunas no inventário), 19 triggers esperados presentes, 46 FKs, 31 constraints UNIQUE, 36 CHECK e sete colunas geradas. Nenhum vínculo `tasks.currentCycleId` apontou para ciclo de outra tarefa. Os testes reais confirmaram unicidade de ativos, FKs compostas, imutabilidade de ciclos/calendários/auditoria e concorrência; nenhuma restrição foi removida.

O catálogo V01–V48 do SDD continua sendo referência de aceite. A quantidade de testes não demonstra, por si só, correspondência individual a todos os 48 casos: por exemplo, mudança de equipe/calendário no mesmo ciclo não foi homologada como fluxo de interface e crash abrupto de storage não foi exercitado como recuperação periódica. Não se declara aprovação integral desses cenários por inferência de schema ou por testes correlatos.

Limitações: volume moderado, loopback sem latência de rede/TLS, sem pool institucional, sem carga de milhares de usuários, sem anexos grandes simultâneos na medição HTTP, sem benchmark de login Argon2 em massa, sem soak test. Fixtures são preservadas; execuções sucessivas aumentam o banco de testes, sem limpeza global ou reset.

## 7. Responsividade e acessibilidade

Viewports 320, 375, 390, 430, 768, 1024 e 1440 px aprovados nas páginas gerenciais examinadas. Em 320 px, o calendário usa duas colunas por linha de expediente; em telas maiores mantém o grid completo. Tabelas usam rolagem interna; não foi ocultado overflow da página para mascarar falhas. Menus móveis, formulários e páginas técnicas foram navegados no Chromium. Galeria recebeu controle de foco, Escape e retorno de foco.

Axe não encontrou violações WCAG 2 A/AA nos estados de login/dashboard/relatório/nova tarefa/Kanban examinados. Isso não é certificação global de acessibilidade. Modais, todos os estados possíveis, leitores de tela e dispositivos físicos ainda precisam de revisão assistiva institucional. A identidade visual e o arquivo original da marca foram preservados; o token secundário foi escurecido para contraste.

## 8. Bundle frontend

Na homologação anterior: principal **578,47 kB** antes de gzip. Após lazy loading das páginas: principal **459,96 kB**, dashboard separado **405,75 kB** e demais páginas sob demanda. O build final terminou sem o aviso de chunk >500 kB. Redução do principal ~20,5%; o total de JavaScript não caiu nessa proporção, e o dashboard ainda carrega a biblioteca de gráficos ao ser acessado. Não se alega melhoria de LCP/INP medida em rede móvel: esse ensaio não foi executado.

## 9. MFA, SMTP e infraestrutura

- MFA do ADMIN MASTER permanece sem mecanismo implementado e exige definição/homologação antes das ações críticas em produção.
- SMTP institucional, autenticação, TLS, remetente e entrega real não foram configurados nem testados. O adaptador de testes marcar uma entrega como simulada não comprova recebimento.
- A recuperação de senha tem serviço e testes, mas o notifier padrão é no-op: integrar e testar canal de entrega, sem registrar o token.
- Domínio, HTTPS, proxy confiável, conta MariaDB de menor privilégio, volume de imagens, retenção/LGPD, antivírus quando exigido, RPO/RTO e monitoramento dependem da instituição.
- Gestão de usuários/equipes possui API, mas os formulários administrativos não existem na interface atual; isso deve integrar o aceite operacional, sem inventar nova funcionalidade nesta fase.

## 10. Riscos residuais

Além dos bloqueios acima: rate limiting em memória e proxy não homologado; outbox embutida, SMTP pelo menos uma vez e encerramento sem espera explícita de todos os efeitos; ausência de reconciliação periódica de imagens após crash; cálculos gerenciais em memória para grandes históricos; quatro advisories moderados de ferramentas de desenvolvimento; cobertura apenas Chromium; ausência de restore ensaiado e de certificação V01–V48 individual completa. Nenhum desses pontos foi ocultado por skip ou alteração de regra para passar teste.

## 11. Checklist e procedimentos de implantação

Procedimento completo em [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md), com infraestrutura, variáveis, HTTPS/proxy, SMTP, storage, worker, backup/recuperação, observabilidade, implantação e rollback. Nenhum desses comandos de produção foi executado.

- [x] Executar suítes locais e corrigir falhas reproduzidas.
- [x] Confirmar isolamento, migrações e integridade do banco de testes.
- [x] Validar fluxos de navegador e larguras previstas no ambiente local.
- [x] Reduzir chunk principal abaixo do aviso e registrar resultados de carga.
- [x] Documentar configuração e rollback sem segredos.
- [ ] Resolver MFA e entrega de recuperação de senha.
- [ ] Homologar SMTP real, HTTPS, proxy e infraestrutura institucional.
- [ ] Ensaiar backup + restore consistente de banco/imagens, com RPO/RTO.
- [ ] Completar aceite funcional/assistivo institucional e cenários contratuais ainda sem evidência individual.
- [ ] Aprovar release, janela de mudança e implantação explicitamente.

## 12. Classificação da execução inicial (histórico)

**NÃO APTO para implantação em produção neste momento.**

Os testes locais executados aprovaram a versão corrigida para continuidade da homologação, mas não eliminam requisitos obrigatórios do SDD 07 (MFA), a ausência de canal funcional de recuperação de senha e de infraestrutura/restore homologados. Classificar como pronto para produção sem resolver esses pontos seria incorreto. A Fase 9 entrega código corrigido, evidências e runbook; não libera publicação e não inicia outra fase.

Não houve commit ou push. A continuidade depende da autorização do usuário e das definições institucionais acima.

## 13. Estabilização — 2026-11-12 (histórico, política substituída pela seção 14)

Esta seção substitui a avaliação de ausência de MFA, notifier no-op e falta de ensaio SQL do relatório inicial. A política TOTP + códigos de recuperação para ADMIN MASTER foi apresentada ao usuário e **aprovada explicitamente** antes da implementação. Outros perfis e a restrição gerencial da Fase 8 não foram ampliados.

### 13.1 Pendências de código corrigidas

- **MFA:** senha válida de ADMIN MASTER gera desafio opaco de cinco minutos e não cria sessão normal. O cadastro exige TOTP correto antes de ativar o fator. São seis dígitos, SHA-1, passo de 30 s e janela de um passo, com vetores do RFC 6238 testados. O último passo aceito fica persistido para impedir replay. Há cinco tentativas por desafio, rate limit HTTP e serialização por lock do usuário.
- **Recuperação MFA:** dez códigos aleatórios de 128 bits, exibidos uma única vez no cadastro e persistidos somente como hashes. Uso consome um código e revoga as outras sessões/desafios; disputa concorrente produz um sucesso e uma recusa. Não existe fallback por e-mail. Sem autenticador e sem códigos, permanece necessário um procedimento institucional de comprovação de identidade, sem bypass implementado.
- **Sessões e contorno:** `mfaVerifiedAt` persistido na sessão é conferido em cada autenticação e refresh de ADMIN MASTER. JWT antigo, desafio usado como bearer, sessão legada e promoção de perfil sem segundo fator não contornam a exigência. Metadados próprios são consultáveis sem expor segredo/hash; revogação do fator pelo titular autenticado revoga sessões e desafios e obriga novo cadastro no próximo login.
- **Proteção de segredos:** AES-256-GCM, nonce aleatório e AAD por ID para segredo TOTP e token de reset na outbox. A chave independente `AUTH_DATA_ENCRYPTION_KEY` não tem padrão e não deriva do JWT. Testes usam chaves efêmeras. Produção recusa startup sem chave válida; o `.env` pessoal e o banco de desenvolvimento não receberam chave ou migração.
- **Recuperação de senha completa:** hash de token aleatório, temporário e de uso único; evento de entrega cifrado na mesma transação; resposta genérica com duração mínima de 200 ms. Novo pedido invalida o anterior. O worker descarta pedidos expirados/usados/inativos. Reset bloqueia usuário/token, revoga sessões e desafios, registra auditoria e mantém MFA. Login normal também revalida usuário/versão/senha sob lock para não criar sessão a partir de senha alterada concorrentemente.
- **Interface de recuperação:** solicitação de link, redefinição de senha e apresentação do erro de token usado/expirado. Link com fragmento removido da URL e mantido somente em memória. A navegação de um novo link enquanto a tela já está aberta também foi corrigida e retestada.
- **SMTP:** TLS direto em 465 ou STARTTLS obrigatório nas demais portas, certificado validado, TLS >=1.2, timeouts de conexão/saudação/socket, autenticação configurável, logs sem credenciais e acesso a arquivo/URL desativado no transporte. Falha conserva estado FAILED da entrega e retry/backoff da outbox. SMTP desativado não gera falsa entrega de recuperação.
- **Auditoria:** registros de login, desafio/cadastro/verificação/falha/recuperação/revogação MFA e pedido/reset de senha sem códigos, tokens ou segredos em payloads de auditoria.

### 13.2 Migração necessária e implantação futura

Foi criada e aplicada **somente em `seaf_gestao_test`** a migração aditiva `20261112233000_auth_mfa_sessions`:

1. Adiciona `user_sessions.mfaVerifiedAt`, inicialmente nulo.
2. Cria `auth_challenges` com hash único do token, vínculo FK ao usuário, versão do usuário, segredo pendente cifrado, limite de tentativas, expiração e consumo.

Nenhum trigger ou constraint existente foi removido. As três migrações anteriores permanecem intactas. A quarta migração e seus procedimentos estão no runbook. Outros bancos precisam de autorização específica antes de aplicar essa atualização. O código desta revisão não deve ser executado no schema antigo de desenvolvimento antes dessa autorização; sessões antigas de ADMIN MASTER precisam passar por MFA após a migração.

### 13.3 Testes executados nesta estabilização

| Verificação | Aprovados | Reprovados | Ignorados |
| --- | --- | --- | --- |
| Backend sem banco | 49 | 0 | Dez suítes MariaDB desabilitadas aqui e executadas separadamente |
| Frontend | 7 | 0 | 0 |
| Integração MariaDB completa | 84 | 0 | 0 |
| E2E Chromium completo | 28 | 0 | 0 |
| ESLint backend/frontend e `lint:quality` | Aprovados | — | — |
| Build, Prisma Validate e `git diff --check` | Aprovados | — | — |

Os 49 testes backend incluem seis vetores TOTP do RFC 6238, rejeição de replay/formato/tempo, autenticação da cifra por contexto/chave, opções SMTP seguras, montagem real da mensagem via Nodemailer JSON transport e saneamento de falha. Um módulo auxiliar de login foi movido para `quality/` para não ser contado como teste implícito pelo Node.

A nova suíte MariaDB tem nove cenários: ausência de sessão antes do segundo fator; refresh MFA e sessão legada; código de recuperação de uso único/replay; expiração/excesso de tentativas/promoção de perfil; entrega cifrada e reset preservando MFA; revogação; invalidação/expiração de token; falha/retry da outbox; verificação MFA concorrente. Os testes anteriores de ADMIN MASTER passaram a usar os endpoints reais de MFA e códigos de recuperação, sem bypass. A limpeza de fixtures da Fase 8 usa inativação lógica para preservar a nova auditoria.

Os 28 E2Es incluem cadastro do fator, entrega única dos códigos, recuperação com código de uso único, solicitação de senha, composição/consumo real da mensagem Nodemailer local, novo login e recusa da reutilização do link. O transporte JSON não abre conexão SMTP nem envia para destinatário real; testa montagem e integração de código. O SMTP institucional continua sem teste de entrega externa.

Comandos: `npm.cmd run check`, `npm.cmd run lint:quality`, `RUN_DATABASE_INTEGRATION=1 npm.cmd run test:integration`, `npm.cmd run test:e2e`, `node quality/restore-rehearsal.js`, `git diff --check`. Durante desenvolvimento houve falhas corrigidas de auditoria sem correlationId, fixture de expiração incompatível com CHECK e sincronização do fragmento da URL no navegador; nenhuma restrição foi removida para acomodá-las.

Build mais recente nesta estabilização: principal ~464,60 kB e dashboard ~405,75 kB, sem aviso de chunk >500 kB. Não se reutiliza o valor histórico 459,96 kB após as novas telas de segurança. A carga da execução inicial não foi repetida como benchmark de MFA/Argon2 e não demonstra capacidade institucional desses fluxos.

### 13.4 Evidências do ensaio de restauração

Origem lida: `seaf_gestao_test`, MariaDB 10.11.16 em 127.0.0.1:3306. Destino final do ensaio: **`seaf_restore_test_cb4de6e71ec543cbae3b3c43fc39bac1`**, gerado pelo script, confirmado ausente e criado exclusivamente para o ensaio. Nunca foi usado como destino `seaf_gestao_dev`, `seaf_gestao_test` ou outro banco preexistente. `bdseaf.sql` não foi lido/importado.

| Evidência | Resultado |
| --- | --- |
| Dump novo | 6.760.428 bytes, `--single-transaction --routines --events --triggers --hex-blob --skip-add-drop-table`, sem seleção de outro banco |
| SHA-256 do dump | `e346b70c00acbe6ebeff3b5395b16bee00bae8477e96207e02d914d4ebf42468` |
| Tempo de backup | ~411,18 ms |
| Restore + verificações | ~2.691,49 ms no host local; não é RTO institucional |
| Dados | 29 tabelas com contagens e hashes de todas as linhas equivalentes ao snapshot de origem |
| Histórico incluído | 1.350 tarefas, 1.416 ciclos, 2.949 eventos de auditoria e 132 versões de calendário no snapshot |
| Autenticação incluída | 25 credenciais MFA, 72 desafios, 991 sessões e 25 tokens de recuperação, com conteúdo cifrado/hash preservado |
| Triggers | 19 presentes e definições equivalentes após normalizar somente CRLF/LF; UPDATE na auditoria restaurada foi bloqueado |
| Integridade | Hashes iguais de índices e 144 constraints; 52 colunas de FKs verificadas em grupos compostos; zero órfãos |

Relatório integral por tabela: `.artifacts/restore-result.json`; dumps em `.artifacts/restore/`, ambos ignorados pelo Git e não publicados. As contagens referem-se ao snapshot naquele instante, não ao banco de testes depois de novas execuções. O script retém o clone para inspeção e não contém DROP DATABASE. Clones intermediários de investigação também foram preservados, sem limpeza destrutiva.

As primeiras comparações identificaram duas necessidades do verificador: respeitar a semântica de NULL de FKs compostas e normalizar CRLF/LF na definição dos triggers após o cliente SQL. Dados, constraints e índices já eram equivalentes; não se alterou nenhum trigger para passar a comparação. O ensaio foi repetido com dados de MFA/recuperação após os testes.

**Limite:** isso comprova restore local de SQL e integridade do banco. Não restaura arquivos privados de imagens nem cofre institucional, e os fatores sintéticos usam chaves efêmeras de testes. Backup coordenado de banco + arquivos + chaves, criptografia/off-host, agendamento e recuperação em host independente continuam pendentes de infraestrutura.

### 13.5 Arquivos modificados nesta continuação

- Banco: `backend/prisma/schema.prisma`, `backend/prisma/migrations/20261112233000_auth_mfa_sessions/migration.sql`.
- Autenticação: `auth.service.js`, `auth.controller.js`, `auth.routes.js`, novos `mfa.service.js` e `session.service.js`, `middlewares/authenticate.js`, novo `shared/security/auth-secrets.js`.
- Integração/configuração: `app.js`, `config/env.js`, `config/production-policy.js`, serviços/sender/worker de outbox, `.env.example`, runner de integração.
- Frontend: `AuthContext.jsx`, `LoginPage.jsx`, `App.jsx`, nova `PasswordRecoveryPage.jsx`.
- Testes: novos `auth-stabilization.test.js`, `auth-secrets.test.js`, ajustes de política de produção e dos logins reais de autenticação/tarefas/Fases 5 e 8; `quality/mfa-test-login.js`, fixtures de E2E, configuração Playwright e servidor/carga isolados.
- Ensaio: novo `quality/restore-rehearsal.js`.
- Documentação: este relatório, `DEPLOYMENT-RUNBOOK.md`, `IMPLEMENTATION-DECISIONS.md` e README.

Essas alterações se somam às alterações ainda não commitadas da execução inicial da Fase 9, que foram preservadas. Credenciais, `.env`, dumps, traces e backups não foram adicionados ao Git.

### 13.6 Dependências institucionais e riscos residuais

Ainda devem ser fornecidos/homologados: domínio e URL pública; certificados e cadeia CA; proxy e limites por cliente; host/porta/método de autenticação SMTP, credenciais em cofre, remetente e políticas SPF/DKIM/DMARC; conta MariaDB de menor privilégio; volume privado; chave independente persistente de criptografia e plano de rotação/recifragem; backup de chaves separado do dump; RPO/RTO; agendamento, retenção, monitoramento e simulado de recuperação completa no host institucional.

Não foi definido atendimento para perda simultânea do autenticador e todos os códigos; nenhum bypass foi inventado. Códigos e chave precisam de custódia segura. TOTP depende de relógio sincronizado e não fornece a resistência a phishing de WebAuthn. Perder a chave impede recuperar fatores cifrados. As demais limitações já registradas — Chromium apenas, rate limiting em memória, ausência de reconciliação periódica de arquivos, outbox pelo menos uma vez, teste integral V01–V48 ainda não certificado e advisories de ferramentas de desenvolvimento — permanecem relevantes.

### 13.7 Nova classificação de prontidão

**NÃO APTO para liberação imediata em produção; pendências críticas de código desta continuação resolvidas e validadas localmente.**

MFA, recuperação e SMTP configurável deixaram de ser lacunas de código, e o restore SQL local está comprovado. A falta de configuração/homologação institucional de HTTPS, SMTP real, custódia de chaves e recuperação coordenada ainda impede classificar a instalação como pronta para produção. O próximo aceite é operacional/institucional, sem autorização implícita para publicar ou alterar desenvolvimento.

Não houve envio externo, implantação, commit ou push. O banco de desenvolvimento permaneceu sem migração/alteração nesta continuação. Aguardar autorização do usuário.

## 14. Revisão da autenticação e retirada segura do TOTP — 2026-11-12

Esta seção registra a revisão solicitada pelo responsável e prevalece sobre a política técnica anterior da seção 13. Não é homologação institucional da exceção.

**Política técnica solicitada:** autenticação do ADMIN MASTER somente por e-mail e senha.

**Risco residual:** ausência de autenticação multifator em contas administrativas críticas.

**Situação institucional:** exceção de segurança pendente de aprovação formal.

**Prontidão para produção:** NÃO APTO enquanto permanecerem requisitos institucionais ou controles críticos não homologados.

### 14.1 Escopo e proposta nos SDDs

O SDD 07 exige MFA para ações críticas de ADMIN MASTER. SDD 03 prevê suas credenciais e SDD 10 inclui sua homologação operacional. Foram anotados os SDDs 03, 04, 07, 10 e 12, **nas duas cópias** (`docs/sdds/docs` e `docs/sdds/SEAF-SDD-Codex/docs`), com a proposta de autenticação por e-mail/senha e o aceite institucional ainda pendente. O requisito anterior não foi marcado como cumprido. A proposta completa, matriz de controles/limites, impacto nas ações críticas e condições de aprovação estão em `AUTHENTICATION-SECURITY.md`.

Permissões não foram ampliadas: ADMIN MASTER/Técnico continuam recebendo 403 no dashboard e nos relatórios, Secretário/Gestor mantêm o acesso gerencial no escopo permitido. Intervenções críticas continuam autorizadas e auditadas, com justificativa quando exigida; deixam de ter prova de posse do segundo fator.

### 14.2 Componentes retirados e controles mantidos

- Excluídos `backend/src/modules/auth/mfa.service.js` e `quality/mfa-test-login.js`, arquivos introduzidos e ainda não commitados na estabilização anterior.
- Removidos geração Base32/TOTP, validação RFC 6238/replay, emissão/consumo de códigos MFA, desafios de login e cadastro por URI/chave de autenticador. Não havia renderizador de QR Code independente nem dependência de pacote TOTP a remover.
- Removidos handlers de `POST /auth/mfa/verify`, `GET /auth/mfa` e `DELETE /auth/mfa/:id`. Não há endpoints ativos de cadastro/ativação/recuperação de segundo fator. GET/POST/DELETE dos caminhos antigos e variantes retornam 404 com e sem autenticação (36 combinações HTTP verificadas).
- LoginPage/AuthContext não apresentam segredo/códigos nem estados intermediários; todos os perfis recebem sessão após e-mail/senha válidos. Middleware/refresh não consultam MFA.
- Testes específicos de TOTP foram retirados; fixtures voltaram a autenticar pela rota normal, sem bypass. Regressões verificam ausência do segundo fator e preservação das restrições.
- Mantidos Argon2id, comparação de senha com hash fictício para conta inexistente, rate limiting, mensagens genéricas, JWT curto, refresh opaco em hash com rotação, cookies HttpOnly/SameSite=Strict/Secure em HTTPS, revogação, auditoria e autorização backend. Locks/versionamento contra corrida de login/reset foram preservados.
- Recuperação **de senha por e-mail** continua funcional e independente: token temporário de uso único, respostas genéricas, hash persistido, ciphertext na outbox, AES-GCM com chave independente, transporte SMTP configurável, falha/backoff e revogação de sessões no reset. Nenhum e-mail externo foi enviado.

### 14.3 Migração compensatória e evidência de preservação

Servidor confirmado: **10.11.16-MariaDB**, XAMPP em `127.0.0.1:3306`; único banco migrado/testado: **seaf_gestao_test**. Migração `20261112233000_auth_mfa_sessions` preservada byte a byte, checksum SHA-256 `364dbd98df3440577d732e904a0ad67d75064049df0c4fe40089fed625bac259`.

Nova migração aplicada: **20261113001000_retire_mfa_preserve_history**, checksum `cdaa45f6754630db3343adfc41660b992aa8aca74ad5d42c532f9b873caf0634`. Ela renomeia as tabelas para `legacy_mfa_auth_challenges`/`legacy_mfa_credentials` e o campo de sessão para `legacyMfaVerifiedAt`. Não contém exclusões de linhas/tabelas/bancos. Dados reais de MFA não foram classificados e **nenhum descarte foi autorizado ou executado**. A retenção inclui segredos cifrados, hashes de códigos e timestamps, sem exposição em relatório/log. Modelos/coluna ignorados no Prisma não são gerados como delegates ativos.

| Verificação real | Resultado |
| --- | --- |
| Antes/depois imediato da compensatória | Contagens e SHA-256 iguais em todas as **28 tabelas de aplicação**, incluindo sessões, tarefas, ciclos, auditoria, calendários e recuperação de senha; apenas nomes normalizados para comparação |
| Arquivo de credenciais | **32 linhas**, SHA-256 `c3c8f121984c34aa86a6919450f372b4fa41a8d989465f721f847a3f51dafb2c` |
| Arquivo de desafios | **95 linhas**, SHA-256 `2452eebca84c278e8c06054219df12363e104d5dc4a4c1ad6e7f95c3d8dd87d0` |
| Histórico Prisma | Cinco migrações concluídas, sem rollback/falha e com checksums de arquivos compatíveis; quatro checksums anteriores intactos |
| Após integração/E2E | Contagens e hashes dos dois arquivos legados continuam iguais; autenticação/recuperação não os modificaram |
| Auditoria estrutural | 19 triggers esperados presentes; 36 CHECKs, 47 FKs, 29 PKs e 32 UNIQUEs preservados; charset utf8mb4/utf8mb4_unicode_ci |

Comandos executados: `node quality/mfa-retirement-check.js before`, conexão/destino com `npm.cmd run db:check`, `npm.cmd run db:migrate:deploy` com `DATABASE_URL` explicitamente de testes, `node quality/mfa-retirement-check.js after`, `npm.cmd run prisma:generate`, e após as suítes `node quality/mfa-retirement-check.js verify-archives` e `node quality/schema-audit.js`. Evidências locais: `.artifacts/mfa-retirement-before.json`, `mfa-retirement-result.json`, `mfa-retirement-post-tests.json` e `schema-audit.json`, sem conteúdo de segredos e ignoradas pelo Git.

O ensaio de restore da seção 13 permanece evidência histórica do snapshot anterior, não teste de restauração desta nova revisão. Nenhum banco foi criado, apagado ou recriado nesta revisão; `seaf_gestao_dev` e `.env` local permaneceram intactos. `bdseaf.sql` não foi utilizado. Rollback para código MFA exige procedimento DBA autorizado e compatível, não retorno cego de código nem edição das migrações executadas.

### 14.4 Resultados finais executados

| Validação | Aprovados | Reprovados | Ignorados |
| --- | --- | --- | --- |
| Backend sem banco (`npm.cmd run check`) | **42** | 0 | Ver nota |
| Frontend (Vitest) | **7** | 0 | 0 |
| Integração MariaDB (`RUN_DATABASE_INTEGRATION=1 npm.cmd run test:integration`) | **84** | 0 | 0 |
| E2E Chromium (`npm.cmd run test:e2e`) | **28** | 0 | 0 |
| Lint backend/frontend, ferramentas (`npm.cmd run lint:quality`) | Aprovado | — | — |
| Build de produção | Aprovado | — | — |
| Prisma Validate | Aprovado | — | — |
| `git diff --check` | Aprovado | — | — |

Em `check`, dez suítes MariaDB são explicitamente ignoradas por flag desativada e **não** contadas como aprovação; foram executadas em separado com os 84 testes acima. Os 42 testes unitários substituem os 49 anteriores porque sete casos exclusivos de TOTP foram retirados. Integração foi repetida após acrescentar a verificação de compatibilidade das migrações. O novo conjunto de estabilização tem nove casos reais: cadeia de checksums/arquivo ignorado, login ADMIN sem MFA, rotação/replay/logout ADMIN, endpoints ausentes, rate limiting/respostas genéricas, quatro perfis/IDOR, reset com transporte Nodemailer local, invalidação/expiração de tokens e falha/retry de entrega. Regressões anteriores continuam cobrindo auditoria/justificativa de operações críticas, concorrência e isolamento.

E2E valida login direto ADMIN sem tela/campo/chamada de segundo fator, logout, recuperação por e-mail e os fluxos/escopos dos quatro perfis. Testes de renovação/expiração real, acessibilidade e larguras 320–1440 px permanecem aprovados. Nenhum sucesso HTTP foi fabricado. Bundle principal no build pré-commit: **461,76 kB** antes de gzip, sem aviso acima de 500 kB. Métricas antigas de carga permanecem históricas; não houve nova carga nesta revisão.

### 14.5 Arquivos desta revisão

- Backend: `src/modules/auth/auth.service.js`, `auth.controller.js`, `auth.routes.js`, `session.service.js`; `src/middlewares/authenticate.js`; `src/shared/security/auth-secrets.js` (AES mantido, TOTP removido). Excluído `mfa.service.js`.
- Persistência: `backend/prisma/schema.prisma`; nova `backend/prisma/migrations/20261113001000_retire_mfa_preserve_history/migration.sql`. Migração MFA anterior mantida sem edição.
- Frontend: `frontend/src/pages/LoginPage.jsx`, `frontend/src/auth/AuthContext.jsx`. `PasswordRecoveryPage.jsx` preservada, com mensagem de sucesso alinhada ao login por e-mail/senha na revisão pré-commit; testes frontend, lint e build repetidos após esse ajuste textual.
- Testes/ferramentas: `backend/test/integration/auth-stabilization.test.js`, logins de `auth-authorization.test.js`, `tasks.test.js`, `phase5.test.js`, `phase8.test.js`; `backend/test/security/auth-secrets.test.js`; `quality/e2e/system.spec.js`; novo `quality/mfa-retirement-check.js`. Excluído helper `quality/mfa-test-login.js`.
- Configuração/documentação: `.env.example` (comentário da chave); `README.md`; `docs/AUTHENTICATION-SECURITY.md` (novo), `IMPLEMENTATION-DECISIONS.md`, `PERSISTENCE-ERD.md`, `DEPLOYMENT-RUNBOOK.md`, este relatório e SDDs 03/04/07/10/12 nas duas cópias.

Demais alterações não commitadas da Fase 9 anterior foram preservadas. Não foi executado staging, commit, push ou implantação; artefatos de testes, dumps e `.env` não foram adicionados ao Git.

### 14.6 Riscos residuais, aprovações e classificação

Autenticação administrativa de fator único é vulnerável ao uso de senha válida por terceiros (phishing, reutilização, compartilhamento e ataques distribuídos). Argon2id, rate limiting, sessão curta, revogação, RBAC e auditoria reduzem aspectos do risco, mas **não substituem MFA**. Recuperação também depende da segurança do e-mail. Dados MFA arquivados precisam de acesso restrito e política de retenção/descarte aprovada; não foram apagados.

Pendente: aprovação formal institucional da exceção com responsável, escopo, risco aceito, prazo/revisão e controles homologados; SMTP real/HTTPS/domínio/proxy; cofre e menor privilégio; backups coordenados com imagens/chaves; RPO/RTO, alertas, navegadores e carga institucional. Permanecem os demais limites operacionais documentados nas seções anteriores.

**Classificação final: NÃO APTO para produção.** Implementação técnica por e-mail/senha validada localmente; requisito MFA foi alterado por solicitação técnica e sua exceção institucional ainda não foi aprovada. Não avançar para implantação ou novas fases. Aguardar autorização do usuário.
