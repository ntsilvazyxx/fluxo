# Decisões de implementação

## 2026-11-13 — Consolidação do Kanban com TypeScript

A base oficial de continuidade é `feature/kanban-refactor` (`5fa1487`), que contém as Fases 0 a 9 e a reformulação mais recente do Kanban. O frontend foi convertido nesta base de `.js/.jsx` para `.ts/.tsx`, sem substituir a lógica do quadro ou os contratos HTTP existentes. Vite, Vitest e ESLint foram configurados para TypeScript; `tsc --noEmit` integra build e o script `typecheck`. A checagem é efetiva, sem `noCheck`, enquanto `strict: false` permanece temporariamente para evolução incremental. O backend continua em JavaScript ESM.


## 2026-11-12 — Reformulação do Kanban autorizada após a Fase 9

- A tela Kanban centraliza acompanhamento/execução. Secretário e Gestor usam quatro colunas: Minhas tarefas, Pendente, Aguardando aceite, Em andamento. Técnico e ADMIN MASTER usam somente quadro pessoal com Aguardando aceite, Em andamento e Concluídas. A coluna pessoal reutiliza `GET /my-tasks`; não é novo status nem duplica registros. As colunas gerenciais continuam usando `GET /kanban` apenas para Secretário/Gestor na interface.
- Não foram ampliadas autorizações dos endpoints gerenciais. O endpoint `/kanban` mantém a matriz técnica anterior, inclusive o bloqueio do Técnico; o ADMIN MASTER não é consultado por esse endpoint na nova tela. Seus recursos técnicos/excepcionais existentes permanecem, sem nova permissão operacional ou mecanismo alternativo. Dashboard/relatórios continuam restritos a Secretário/Gestor.
- `/minhas-tarefas` redireciona para `/kanban`. Detalhes reutilizados em `/kanban/tarefas/:id`, com compatibilidade para `/tarefas/:id`; notificações e retorno após rejeição usam o novo destino. Parâmetros da consulta/paginação e rolagem horizontal são preservados. Removido somente o componente da página independente; serviços, dados e histórico pessoal permanecem.
- O menu do cartão navega para detalhes/histórico e execução permitida no componente existente. Nenhuma transição é feita por arrastar cartões; justificativas, locks, expectedVersion, idempotência e auditoria continuam nos formulários/serviços atuais. Não são oferecidas ações diretas de conclusão sem conhecer pedidos e subtarefas pendentes.
- Corrigida a composição de filtros da listagem: escopo, modo, responsável, estado, atraso e prazo são interseções. Antes, filtros sobrescreviam parte dessas condições; responsável corrente considera atribuição ativa ou encerrada por conclusão, sem ressuscitar visibilidade após rejeição/reatribuição. `useTasks` descarta respostas antigas e aceita consulta desativada, evitando carga gerencial para perfis pessoais.
- A validação de navegação a partir de uma notificação real encontrou incompatibilidade anterior: o produtor de eventos de atribuição/aceite/rejeição não fornecia `assignmentId`, obrigatório para o consumidor já existente da outbox. Corrigido somente esse payload (incluindo reatribuição), sem novos tipos/destinatários, alteração de regras ou reescrita de eventos históricos. Regressão usa os eventos reais, verifica entrega interna/deduplicação, sem SMTP externo. Eventos antigos incompatíveis continuam preservados e exigem análise/replay operacional autorizado; não foram reparados em massa.
- Barra compacta com filtros avançados recolhidos; equipe/responsável consultados sob demanda pelos perfis gerenciais, via serviços escopados existentes. Paginação explícita por fonte evita truncamento silencioso em 100 registros. Fim de prazo selecionado inclui o dia local inteiro.
- Nenhuma migração, dependência nova ou alteração em `seaf_gestao_dev`. Testes usam somente `seaf_gestao_test`; nenhum registro histórico ou arquivo `bdseaf.sql` é removido/utilizado. A prontidão institucional continua NÃO APTO conforme a Fase 9. Validação visual/funcional final e commit dependem do usuário.

## 2026-11-12 — Revisão de política: retirada do TOTP solicitada pelo responsável

- Substitui a autorização técnica anterior de MFA abaixo: o usuário solicitou explicitamente login somente por e-mail e senha, inclusive ADMIN MASTER, sem TOTP/aplicativos/QR/códigos de segundo fator. A implementação foi autorizada, mas a exceção ao SDD 07 depende de aprovação institucional formal. Não registrar MFA como requisito cumprido. Produção permanece NÃO APTO.
- Serviços, endpoints, estados frontend e geradores/validadores de TOTP foram removidos. Recuperação de senha por e-mail, AES-GCM/outbox, Argon2id, rate limiting, JWT, refresh/cookies, revogação, RBAC e auditoria permanecem. Dashboard/relatórios continuam negados a ADMIN MASTER e Técnico.
- A migração `20261112233000_auth_mfa_sessions` não foi editada. A compensatória `20261113001000_retire_mfa_preserve_history`, aplicada somente em `seaf_gestao_test`, renomeia tabelas/coluna para arquivo legado e preserva dados, índices e FKs. Modelos/coluna ignorados no Prisma, sem uso em autenticação. Descarte de dados reais não foi autorizado; não foi executado nenhum descarte.
- A comparação pré/pós migração preservou todas as linhas de 28 tabelas de aplicação e os checksums anteriores. Permanecem 32 credenciais e 95 desafios arquivados. Evidências locais em `.artifacts/mfa-retirement-result.json`. O banco de desenvolvimento e seu `.env` não foram alterados.
- Proposta e riscos documentados em `AUTHENTICATION-SECURITY.md` e nos SDDs 03/04/07/10/12, nas duas cópias. As decisões anteriores a seguir são históricas quando conflitarem com esta revisão; não se presume aceite institucional.

## 2026-11-12 — Fase 9: estabilização de autenticação e recuperação

- O usuário aprovou explicitamente TOTP por aplicativo e códigos de recuperação para ADMIN MASTER. A exigência ocorre antes de emitir a sessão normal, protegendo todas as operações desse perfil. Demais perfis não receberam nova exigência nem permissões adicionais. Troca de senha não remove MFA.
- TOTP segue RFC 6238 (SHA-1, seis dígitos, período 30 s, tolerância de um passo), com vetores oficiais em testes e rejeição de replay por passo persistido. Não se usa e-mail como segundo fator. O cadastro usa chave manual/URI `otpauth` e exige prova do código antes de gravar a credencial ativa.
- Desafios são opacos, só o hash é persistido, expiram em cinco minutos e permitem cinco falhas. Não servem como bearer/refresh. Locks por usuário serializam cadastro, verificação, recuperação e revogação. Dez códigos de recuperação aleatórios de 128 bits são exibidos uma vez e armazenados somente como hashes; seu uso consome o código e revoga as outras sessões.
- A migração aditiva `20261112233000_auth_mfa_sessions` acrescenta comprovação MFA na sessão e a tabela de desafios. Foi aplicada somente em `seaf_gestao_test`. Sessões antigas de ADMIN MASTER e sessões de usuário promovido sem MFA não são aceitas por JWT nem refresh. Revogar o fator revoga sessões/desafios; novo cadastro volta a exigir senha e TOTP. Não existe bypass de suporte por e-mail; perda simultânea de autenticador e todos os códigos exige processo institucional separado, ainda não definido.
- Uma chave independente `AUTH_DATA_ENCRYPTION_KEY` de 32 bytes cifra segredos TOTP e tokens de recuperação na outbox com AES-256-GCM e contexto autenticado por ID. Não é derivada do JWT; não há chave padrão ou em repositório. Testes usam chaves efêmeras e contas exclusivas. O desenvolvimento não recebeu migração, chave ou cadastro MFA.
- Recuperação agora usa outbox transacional por padrão, token opaco cifrado na mensagem e hash no registro de reset. O worker valida validade/uso/conta antes de entregar; mensagens obsoletas são descartadas. SMTP desativado não é considerado entrega de recuperação. Respostas de solicitação são genéricas, com duração mínima de 200 ms; o transporte não é chamado no request HTTP.
- Reset bloqueia usuário e token, consome os tokens/desafios pendentes, revoga sessões e registra auditoria na transação. O link usa fragmento para evitar token em logs HTTP; a página remove o fragmento da URL e mantém o token somente em memória. O notifier injetável permanece apenas como mecanismo explícito de teste/integração.
- SMTP exige certificado válido e TLS >=1.2 (TLS direto em 465; STARTTLS obrigatório nas outras portas), timeouts de conexão/saudação/socket e logs sem credenciais. Nodemailer JSON transport foi usado em testes; nenhum serviço externo foi acionado.
- Restore lê exclusivamente o banco de testes e cria nome imprevisível `seaf_restore_test_<UUID>`, confirmado ausente. Não há parâmetro de destino nem DROP DATABASE. Comparação cobre hashes das linhas, índices, constraints, FKs compostas e definições de triggers, normalizando somente CRLF/LF destas últimas. Bancos descartáveis e dumps locais são retidos em área ignorada para inspeção, sem alterar bancos existentes.

## 2026-11-12 — Fase 9: homologação e preparação operacional

- Playwright e Axe foram adicionados em JavaScript, com Chromium local, uma worker, sem retries silenciosos e serviços exclusivos nas portas 3109/4179. Os serviços não reutilizam processos existentes; conexão de banco, fixtures e carga recusam destino diferente de `seaf_gestao_test`.
- O runner de integração agora exige flag explícita e o nome exato do banco e também aponta o `DATABASE_URL` do processo filho a testes. A configuração de desenvolvimento não é reescrita. Fixtures usam UUID e senhas aleatórias; históricos do banco de testes são preservados. Artefatos sensíveis ficam em `.artifacts/`, ignorado pelo Git.
- O frontend compartilha uma única renovação de sessão em andamento para evitar corrida com refresh rotativo em StrictMode ou consultas paralelas. O protocolo JWT/refresh, revogação e permissões não mudaram.
- Todas as páginas operacionais passam a ser carregadas sob demanda. O dashboard respeita movimento reduzido; corrigidos componente `Cell`, textos escapados/double encoding, nomes acessíveis, foco dos modais, contraste do texto secundário e overflow do calendário em 320 px. A logomarca original não foi alterada.
- Os formulários omitem justificativa opcional vazia; rejeição bem-sucedida redireciona a Minhas Tarefas em vez de reler um recurso que deixou de estar visível ao Técnico. A galeria atualiza permissões quando a versão do ciclo muda.
- Conclusão com prorrogação pendente foi alinhada ao SDD 02 tanto na UI quanto no serviço: encerra o pedido como `CLOSED_BY_COMPLETION` na transação existente. Devolução pendente continua bloqueando. Não é uma regra nova; a divergência foi reproduzida por E2E e corrigida com regressão MariaDB para idempotência, auditoria/outbox e preservação do bloqueio de devolução.
- Os seletores de período da interface convertem início/fim do dia local em instantes ISO UTC, incluindo `23:59:59.999` no dia final. O contrato de período inclusivo da API permanece inalterado. A mesma regra se aplica ao dashboard e relatório e possui regressão unitária e de navegador.
- Relatórios deixam de carregar calendários/pausas não usados na apresentação. O recorte temporal histórico é enviado também ao SQL, preservando as fórmulas homologadas. A agregação atual e o cálculo de expediente ainda ocorrem em memória; carga local não constitui dimensionamento institucional.
- CORS recusado retorna 403, JSON inválido 400 e payload excessivo 413. Falhas internas são registradas sem stack/query/payload; o adaptador de e-mail de testes não registra destinatário nem corpo. Em produção, segredo curto/modelo, cookie inseguro e URLs HTTP são recusados no startup.
- `file-type` foi atualizado de 20.5 para 22.3 para tratar os advisories de parsing de conteúdo hostil; imagem/MIME/limite continuam iguais e foram retestados. O mínimo de Node documentado passa a 22.12 para suportar a dependência atualizada. As dependências de desenvolvimento ESLint/minimatch ainda têm quatro avisos moderados; não foi aplicado downgrade automático ou override de major sem homologação.
- MFA, integração de recuperação de senha com canal institucional, SMTP real, infraestrutura e ensaio de restauração não foram inventados nem considerados concluídos. O runbook explicita esses bloqueios; não houve migração nova, implantação, commit ou push nesta fase.

## 2026-11-12 — Fase 4: solicitações, calendários e controle de tempo

- O usuário definiu que feriado prevalece sobre qualquer período excepcional: a data local inteira contabiliza zero tempo. Um período `WORKING_PERIOD`, quando não há feriado, substitui o expediente semanal daquela data.
- O usuário confirmou que versões futuras permanecem como rascunho; a publicação é manual e somente ocorre quando `effectiveFrom` tiver sido alcançado.
- Datas são persistidas em UTC. O cálculo converte os intervalos para o timezone IANA do calendário histórico da atribuição com Luxon.
- Espera é tempo corrido até aceite/encerramento. Responsabilidade é tempo corrido desde o aceite; tempo efetivo intersecta a responsabilidade com o expediente e desconta pausas.
- Devolução cria pausa transacional; aprovação encerra atribuição, limpa responsável/prazo e retorna a `PENDING`; negativa fecha a pausa. Prorrogação não pausa e, quando aprovada, cria `DeadlineChange`.
- Solicitações e decisões usam locks, `expectedVersion`, idempotência, auditoria e outbox transacionais. Uma solicitação pendente bloqueia outra incompatível no ciclo.
- A migração `20261112110000_calendar_history_guards` protege versões publicadas, horários e exceções, e adiciona unicidade de feriado por data local.
- ADMIN MASTER consulta calendários; configuração permanece restrita a Secretário e Gestor autorizado no escopo da equipe.

## 2026-11-12 — Fase 5: subtarefas e ciclos de execução

- A criação de subtarefa exige responsável e prazo e cria, atomicamente, a identidade, o ciclo 1 em `AWAITING_ACCEPTANCE`, a atribuição e o histórico inicial. Isso concretiza o requisito atual de que cada subtarefa tenha execução própria desde a criação.
- Reabertura/restauração copiam título, descrição e prioridade do ciclo terminal anterior. Responsável, prazo, atribuições, solicitações e subtarefas não são copiados.
- Uma subtarefa pode ser reaberta/restaurada manualmente apenas enquanto o ciclo principal ao qual está vinculada permanecer aberto. Subtarefas antigas nunca são reativadas pela reabertura da principal.
- Secretário opera globalmente, Gestor no escopo da equipe e ADMIN MASTER somente com justificativa. Técnico não reabre, restaura ou cria subtarefas.
- A criação de subtarefa incrementa a versão do ciclo principal, serializando-a com conclusão e cancelamento. Reabertura/restauração usam a versão do ciclo terminal e a unicidade já existente de ciclo ativo.
- Operações sobre subtarefas resolvem primeiro a tarefa principal e seguem a ordem de locks principal → subtarefas por ID → ciclos → atribuições → solicitações, inclusive ao reutilizar devolução e prorrogação.
- O schema da Fase 1 já possui FK de `parentCycleId`, trigger de apenas um nível, unicidade de ciclo ativo e triggers de imutabilidade dos ciclos encerrados. Nenhuma nova migração foi necessária.

Este registro contém somente decisões técnicas reversíveis. Regras de negócio permanecem definidas pelos SDDs.

## 2026-11-12 — Fase 8: dashboard e relatórios gerenciais

- Dashboard e relatórios são autorizados somente para `SECRETARY` e `MANAGER`. O backend bloqueia diretamente `TECHNICIAN` e `ADMIN_MASTER`; o último permanece desabilitado por padrão até existir autorização administrativa formal prevista nos SDDs.
- A situação atual agrega somente tarefas principais (`parentCycleId = null`) por sua identidade permanente e ciclo atual. Subtarefas não são somadas aos indicadores da tarefa principal; permanecem visíveis como registros independentes no relatório detalhado.
- Indicadores históricos usam ciclos: criação por `openedAt` e conclusão/cancelamento por `closedAt`, ambos dentro do período filtrado. A taxa de conclusão é `ciclos concluídos / (ciclos concluídos + cancelados)`, sem misturar esses números com as contagens atuais.
- Atraso e prazo próximo são derivados no instante da consulta; tempo médio reaproveita o cálculo de expediente, pausas e versão histórica de calendário da Fase 4.
- Na revisão da Fase 8, os filtros de estado e situação de prazo passaram a ser combinados por interseção, inclusive quando incompatíveis (resultado vazio), sem sobrescrever o estado solicitado.
- Filtros históricos são aplicados ao próprio ciclo consultado, não ao ciclo atual da tarefa. O filtro de responsável histórico considera vínculos daquele ciclo, inclusive encerrados; na situação atual e no relatório, considera somente a atribuição vigente. Isso preserva a pesquisa dos ciclos concluídos após o encerramento da atribuição.
- A verificação adicional MariaDB usa dados isolados em transação revertida ao final, sem necessidade de migração de schema para esta revisão.
- Consultas atuais e relatório excluem tarefas sem `currentCycleId` antes da contagem e paginação. A suíte de integridade cria identidades sem ciclo para testar constraints; esses registros não devem provocar erro 500 no relatório.

## 2026-11-12 — Provisionamento local autorizado

- Após confirmar que não havia bancos `seaf*` nesta instalação do XAMPP, o usuário autorizou criar e inicializar `seaf_gestao_dev` e `seaf_gestao_test`.
- Ambos foram criados com `utf8mb4` e collation `utf8mb4_unicode_ci`, receberam as três migrações versionadas via `db:migrate:deploy` e o seed dos quatro perfis. Nenhum banco existente foi apagado ou recriado.
- O arquivo local `bdseaf.sql` não foi importado. Não foram criados usuários administrativos nem tarefas no desenvolvimento; dados automatizados foram gravados somente em `seaf_gestao_test`.

## 2026-11-11 — Fase 0: base

- Organização em workspaces npm com `frontend/` e `backend/`, preservando a documentação em `docs/sdds/`.
- Backend em JavaScript ESM, Express e monólito modular. O módulo `health` é apenas infraestrutura operacional.
- API versionada em `/api/v1` e contrato inicial de resposta conforme SDD 04.
- Prisma 7.10.1 fixado junto ao `@prisma/client` para manter compatibilidade entre CLI e client. A configuração usa `prisma.config.js`, formato JavaScript oficialmente suportado, sem introduzir TypeScript. Nenhuma entidade de domínio foi criada nesta fase.
- Frontend em React, Vite e Tailwind CSS 4, com tokens SEAF declarados via `@theme` no CSS.
- Configuração local centralizada em `.env` na raiz. Vite usa `envDir` e o backend carrega esse arquivo por caminho explícito.
- Testes básicos com `node:test`/Supertest no backend e Vitest/Testing Library no frontend.
- Docker Compose não foi incluído porque o SDD 11 condiciona sua adoção a aprovação e esta fase não exige banco em execução.

## 2026-11-11 — Fase 1: persistência

- IDs de domínio usam UUID em `CHAR(36)` e eventos usam `DATETIME(3)`. A aplicação persiste timestamps em UTC; o timezone IANA permanece no calendário para apresentação e cálculo futuro.
- O gerador `prisma-client-js` foi escolhido para o Prisma 7 porque o gerador padrão `prisma-client` emite código-fonte TypeScript. O gerador legado continua suportado no Prisma 7 e mantém o backend integralmente em JavaScript, embora esteja depreciado para remoção futura.
- O runtime do Prisma 7 usa `@prisma/adapter-mariadb`, adaptador oficial do Prisma para MySQL/MariaDB, conectado a um datasource `provider = "mysql"`.
- Dias da semana em `work_schedules.weekday` seguem ISO-8601: 1 (segunda-feira) a 7 (domingo).
- Códigos de encerramento de atribuição e solicitação são enums técnicos derivados dos resultados descritos nos SDDs. Eles não adicionam transições de negócio.
- Colunas geradas com valor `NULL` fora do estado ativo implementam unicidade de vínculo ativo, gestor ativo, ciclo aberto, atribuição atual, pausa aberta e solicitação pendente por tipo.
- FKs compostas garantem que o ciclo atual pertença à tarefa, a versão ativa pertença ao calendário, o calendário pertença à equipe e a solicitação pertença à mesma atribuição/ciclo.
- `publishedAt` distingue rascunhos de versões de calendário publicadas. Depois de publicada, a versão é imutável, exceto pelo fechamento único de `effectiveTo` para encerrar sua vigência.
- Triggers MySQL limitam subtarefas a uma camada, impedem sobreposição de versões/horários e protegem estruturas append-only.
- O limite de arquivo individual foi fixado em 10 MiB e MIME em JPEG/PNG/WEBP conforme SDD 02. O limite de dez imagens ativas por ciclo não foi codificado porque a granularidade ainda está pendente no SDD 12 e pertence ao fluxo de evidências da Fase 5.
- A precedência exata entre feriado e expediente excepcional permanece pendente; nesta fase a constraint valida apenas a forma de cada exceção, sem inventar precedência funcional.
- Testes MySQL exigem banco descartável cujo nome contenha `test`, flag explícita e servidor MySQL 8. O servidor local encontrado em 11/11/2026 é MariaDB 10.11.16; nenhuma migração foi aplicada nele.
- Transações críticas usam `READ COMMITTED`, retry limitado somente para deadlock/lock timeout e ordem fixa de locks: tarefa raiz, subtarefas por ID, ciclos, atribuições e solicitações.

## 2026-11-11 — Alteração autorizada do banco de desenvolvimento

- Por autorização explícita do usuário, MariaDB 10.11.16 do XAMPP substitui MySQL 8 como banco homologado do projeto.
- O datasource Prisma permanece `provider = "mysql"`, pois este é o conector Prisma utilizado para MySQL e MariaDB; URLs também mantêm o protocolo `mysql://`.
- Os bancos isolados do projeto são `seaf_gestao_dev` e `seaf_gestao_test`. Nenhum schema preexistente do XAMPP pode ser alterado.
- As migrações complementares passam a ser validadas diretamente no MariaDB 10.11.16 antes de aplicação no banco de desenvolvimento.

## 2026-11-11 — Fase 2: autenticação, usuários e permissões

- Senhas usam Argon2id; não há credencial administrativa fixa. O bootstrap inicial recebe dados somente do ambiente e recusa uma segunda conta ADMIN MASTER.
- Access tokens JWT HS256 têm vida curta e ficam somente em memória no React. Refresh tokens opacos ficam em cookie HttpOnly/SameSite Strict e apenas seu SHA-256 é persistido.
- A rotação bloqueia a sessão com `SELECT ... FOR UPDATE`, permitindo somente um consumidor concorrente do token anterior.
- Logout, inativação e redefinição de senha revogam sessões. A recuperação responde genericamente para não enumerar contas.
- ADMIN MASTER administra todos os perfis. Secretário cria apenas Gestor e Técnico. Gestor e Técnico recebem consultas filtradas por vínculos ativos; recursos fora do escopo retornam 404.
- Usuários não são excluídos fisicamente. Alterações geram auditoria na mesma transação.
- O schema da Fase 1 já continha as estruturas necessárias; nenhuma migração adicional foi necessária.
- MFA para perfis críticos permanece pendente de definição operacional aprovada.

## 2026-11-11 — Fase 3: tarefas e Kanban

- O usuário confirmou que a rejeição antes do aceite encerra a atribuição, limpa o prazo ativo e retorna o ciclo para `PENDING`. Necessidade de mais tempo após o aceite continua sendo prorrogação e permanece fora desta fase.
- O usuário autorizou intervenções excepcionais do ADMIN MASTER nesta fase. Criação, edição, atribuição, reatribuição e cancelamento exigem justificativa auditada; conclusão continua exclusiva do responsável atual.
- Tarefas usam as estruturas já homologadas na Fase 1; nenhuma migração adicional foi necessária.
- Criação e transições críticas exigem `Idempotency-Key` persistida. Edições usam CAS por `version`; transições usam locks na ordem tarefa raiz, subtarefas, ciclos, atribuições e solicitações.
- Toda mutação de tarefa registra auditoria e evento de outbox na mesma transação. O worker e o envio externo permanecem para a Fase 6.
- Uma atribuição exige calendário e versão ativa da equipe, pois `calendarVersionId` é histórico obrigatório. A API retorna regra explícita quando a equipe ainda não foi configurada, sem criar calendário implícito.
- Secretário tem escopo global; Gestor opera equipes sob gestão; Técnico acessa somente tarefas próprias. Recursos fora do escopo retornam 404 e os filtros nunca ampliam o escopo do ator.
- O Kanban mantém somente `PENDING`, `AWAITING_ACCEPTANCE` e `IN_PROGRESS`; `COMPLETED` e `CANCELLED` são apresentados no histórico separado.

