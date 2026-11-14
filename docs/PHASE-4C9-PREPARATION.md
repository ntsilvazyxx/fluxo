# Fase 4C.9 — Preparação da segunda campanha de integração

Data: 2026-11-14. Branch `feature/kanban-refactor`. HEAD `1013cc623d459453f575c03c1311e9d1d07ac085`; alterações locais da Fase 4C.8 preservadas.

## 1. Estado e estratégia de isolamento

Esta etapa altera somente infraestrutura de testes e documentação. **Nenhum banco foi criado, consultado, migrado, limpo, restaurado ou reutilizado. Nenhuma campanha foi executada.** Não houve alteração de `.env`, credenciais reais, regras de negócio, RBAC, commit ou push.

| Banco | Tratamento |
|---|---|
| `seaf_gestao_dev` | Protegido; fora do runner |
| `seaf_gestao_test` | Protegido; fora do runner |
| `seaf_gestao_recovery` | Protegido; fora do runner |
| `seaf_gestao_integration` | Evidência integral da primeira campanha; runner/factories agora recusam sua reutilização com escrita |
| `seaf_gestao_integration_2` | Destino exclusivo de uma segunda campanha futura; não provisionado por esta etapa |

A existência atual de `_2` não foi consultada. Será necessário verificá-la antes de qualquer criação: se já existir, interromper e apresentar seu estado, sem sobrescrever. Não copiar dados de outro schema, não restaurar dumps, não usar bdseaf.sql e não reaproveitar contas da primeira campanha.

O banco original e seus artefatos de evidência não foram acessados ou alterados. A primeira campanha permanece com **71 aprovados, 31 reprovados e 6 cancelados**. Os logs privados existentes não foram substituídos. Nesta etapa não se apresenta uma nova comparação SQL de hashes, pois não houve conexão real.

## 2. Guard e seleção explícita

Implementado em `backend/scripts/integration-guard.js`:

- Lista fechada e congelada: somente `seaf_gestao_integration` e `seaf_gestao_integration_2`, por igualdade exata. Não usa startsWith, prefixo, substring ou expressão permissiva para escolher banco.
- Nova variável obrigatória **INTEGRATION_DATABASE_NAME**, sem default. Selecionar um nome e fornecer a URL de outro banco é erro, mesmo quando ambos os nomes pertencem à lista.
- RUN_DATABASE_INTEGRATION=1 continua obrigatório. DATABASE_URL e TEST_DATABASE_URL continuam explícitas e idênticas, incluindo credenciais/destino. Não há fallback para desenvolvimento.
- Host exato 127.0.0.1, porta explícita 3306, protocolo mysql, path do schema selecionado e ausência de query string/fragmento continuam obrigatórios.
- SELECT DATABASE(), versão/porta reais e as seis migrações/checksums são verificados contra **a seleção explícita**, não contra qualquer nome permitido. Se o cliente efetivo retornar a outra campanha, desconectar e bloquear antes de fixtures.
- Grants devem pertencer somente ao schema selecionado, com SELECT/INSERT/UPDATE/DELETE. DDL, privilégios administrativos globais, GRANT OPTION, roles não reconhecidas e acesso a outro schema são recusados. Ter permissão simultânea sobre os dois bancos autorizados também é recusado.
- O escopo de SHOW GRANTS deve ser literal, com underscores escapados; são aceitas as representações com escape simples ou escape citado pelo servidor. `%` e underscores não escapados não são aceitos como padrão de schema. A conta a provisionar deverá obedecer a isso.

### Reconhecimento não significa autorização para escrever na primeira campanha

As funções de preflight reconhecem ambos os nomes e realizam somente SELECT/SHOW. **writableIntegrationDatabase** adiciona a política de preservação: recusa `seaf_gestao_integration` para execução e aceita apenas `_2`. Essa verificação ocorre no runner **antes de abrir conexão** e no contexto **antes de criar cliente/perfis**.

`backend/testing/integration/context.js` agora registra por WeakMap o destino validado de cada cliente. APIs e factories verificam esse vínculo e o destino de execução atual. checkDatabase devolve o banco registrado, em vez de uma string fixa. Conexões extras e execução direta não contornam o guard.

As suítes mysql-integrity, phase7 e phase8 tinham asserções técnicas fixas para o nome antigo. Foram parametrizadas pela seleção validada. **As asserções de RBAC e os fluxos funcionais não foram alterados.** As demais suítes já utilizavam o contexto comum.

Não se modificaram scripts de provisionamento/evidência das fases anteriores em `.artifacts`. Eles possuem alvos/contratos antigos e não devem ser reutilizados para a nova campanha. A mudança de assinatura de validateIntegrationConnection exige informar explicitamente o schema esperado em futuros scripts de preflight.

### Configuração futura — não executada

Depois de autorização e provisionamento, exclusivamente no processo:

```powershell
$env:INTEGRATION_DATABASE_NAME='seaf_gestao_integration_2'
# DATABASE_URL e TEST_DATABASE_URL devem ser idênticas e usar a conta exclusiva de execução.
# RUN_DATABASE_INTEGRATION=1 somente após autorização explícita para a campanha.
```

Não inserir esses valores no `.env` atual. README e guia de continuidade foram atualizados para evitar a execução acidental de comandos históricos contra o primeiro banco.

## 3. Testes adicionais de segurança e validações

O guard passou de **36 para 60 testes**: **24 casos adicionais**. As verificações incluem:

1. Ambos os nomes reconhecidos em preflight simulado, somente com consultas de leitura.
2. Seleção ausente, vazia, aproximada, prefixada, com espaço, caixa diferente ou nome protegido recusada antes de conectar.
3. URLs divergentes entre campanhas e nomes como `_20`, `_3`, `_2_backup` recusados.
4. Banco efetivo da outra campanha recusado, mesmo que pertença à lista autorizada.
5. Conta de `_2` com privilégios sobre a primeira campanha, sobre ambas ou sobre padrão de schemas recusada.
6. Grants literais com escapes conferidos; DDL/global/insuficiência de privilégios e migrações incorretas continuam cobertos.
7. Preservação: primeira campanha bloqueada no caminho de API/factories/configuração; runner verifica essa política antes de conectar.
8. Allowlist imutável; todas as suítes continuam exigindo o contexto, inclusive conexões adicionais.

Resultados executados sem banco:

| Validação | Resultado |
|---|---|
| Testes backend finais | **156 aprovados, 0 falhas, 0 cancelados** |
| Guard, incluído nos 156 | **60 aprovados** |
| Testes frontend | **13 aprovados**, seis arquivos |
| Lint backend/frontend | **0 erros**, um aviso preexistente de Fast Refresh |
| git diff --check | Aprovado |
| Integração real | **Não executada** |

Executados npm.cmd test e, após o último ajuste de segurança, novamente npm.cmd run test --workspace backend; npm.cmd run lint aprovado. O último ajuste foi apenas no guard/testes backend, sem alteração de frontend. Typecheck, build e Prisma Validate aprovados na Fase 4C.8 não foram repetidos nesta etapa, que não alterou frontend/schema.

RUN_DATABASE_INTEGRATION=0 e MAIL_ENABLED=0 explícitos nos processos gerais de testes; URLs fictícias na porta 1. Os testes do guard usam mocks ou subprocessos com destino inválido, bloqueados antes de conexão/fixtures. Não houve credencial real usada para testes. As 13 suítes de integração sinalizadas SKIP no comando geral não entram nos 156 aprovados; seus 108 cenários não foram executados.

## 4. Estado da cobertura de integração

Mantidos **108 cenários em 13 arquivos**, conferidos por inventário estático. Não se adicionaram casos de negócio, retiraram falhas, criaram skips ou mudaram resultados esperados para aprovar a campanha. As correções da Fase 4C.8 continuam não homologadas em MariaDB.

| Fluxo | Cobertura preparada | Lacuna/risco para a segunda campanha |
|---|---|---|
| Anexos/staging | 7 casos: promoção, download, IDOR, ownership, expiração, replay, conteúdo e execução após aceite/versionamento | Prefixo corrigido; persistência ainda não reexecutada. Listagem usa BigInt/registro Prisma bruto e precisa avaliação de serialização/privacidade. Falta uma corrida dedicada de reivindicação do mesmo staging e verificação explícita de ausência de campos internos. |
| LEGACY_CALENDAR | Caso explícito em running-clock; dez cenários de subtarefas/ciclos em phase5; constraints/histórico em mysql-integrity | openedAt corrigido. Atribuição/reassociação legada pode continuar sem calendarVersionId; falta consolidar a versão histórica exigida após nova atribuição e verificar métricas/prazo na prorrogação legada. |
| Reabertura/restauração | Concorrência, preservação do ciclo anterior, não reutilização de atribuição e subtarefas antigas | O novo ciclo usa default LEGACY_CALENDAR. O caso de reabertura de RUNNING_CLOCK não percorre toda a nova execução. É necessário decidir a política e adicionar round-trip de atribuição/aceite/detalhe/conclusão para reabertura e restauração, sem inventar o esperado. |
| RUNNING_CLOCK | 11 casos específicos: criação atômica, rollback, durações/escopo, aceite/persistência, pausas, extensão, reatribuição, replay e histórico | Métricas corrigidas e testadas sem banco. Ainda validar HTTP/persistência reais após aceite, pausas e decisões; diferença documental sobre deslocamento de prazo na negativa de devolução permanece. |
| RBAC | Autenticação/IDOR, escopo das equipes, dashboard/relatórios e Kanban | Contrato ADMIN conflitante; o Kanban antes cancelado também contém expectativa de 403. Status HTTP sozinho não comprova escopo de dados. |
| Concorrência/idempotência | Duas conexões para unicidades; refresh, atribuição, aceite/reatribuição, conclusão/cancelamento, imagens e outbox | A segunda execução deve preservar as corridas internas. Fluxos antes bloqueados não têm aprovação nova e podem revelar outros defeitos. |

**Conclusão da revisão: cobertura suficiente para repetir o diagnóstico dos bloqueios anteriores, mas ainda insuficiente para homologação funcional integral desses fluxos.** As lacunas devem ser tratadas por escopo/decisão explícitos; não são resolvidas executando silenciosamente mais testes ou escolhendo políticas para obter verde. Os casos adicionais sugeridos acima ainda não foram implementados nesta fase.

## 5. ADMIN MASTER — duas falhas e alternativas

### Testes envolvidos

| Teste | Operações previstas | Expectativa | Evidência da primeira campanha |
|---|---|---|---|
| auth-stabilization: quatro perfis mantêm permissões… | Login de cada perfil; GET /dashboard e /reports; depois IDOR de equipe e bloqueio de criação de usuário por Gestor | ADMIN e Técnico 403 gerencial; Secretário e Gestor 200 | Falhou no primeiro GET /dashboard do ADMIN: **200 em vez de 403**. O restante do caso composto não foi alcançado. |
| phase8: bloqueia Técnico e ADMIN MASTER… | GET /dashboard e /reports autenticados para Técnico e ADMIN | Ambos 403 | As consultas do Técnico ultrapassaram suas asserções; falha no primeiro GET /dashboard do ADMIN: **200 em vez de 403**. |

Não foram repetidas requisições agora. Por leitura do código, os routers de dashboard/relatórios usam requireRoles(ADMIN_MASTER, SECRETARY, MANAGER). Isso explica a divergência de admissão nas rotas; não comprova que todos os endpoints e escopos funcionam como uma política global.

**Outro ponto da revisão:** scopedTasks em dashboard.service.js só trata SECRETARY como global; os demais atores recebem filtro de equipes geridas. Portanto, a rota admitir ADMIN com HTTP 200 não demonstra escopo global efetivo nos indicadores/relatórios. Já a consulta de tarefas/Kanban possui caminhos que tratam ADMIN como global. É necessário homologar linhas retornadas e isolamento, não apenas trocar a asserção de status.

### Documentos conflitantes

- SDD 07: Kanban administrativo por auditoria/escopo autorizado, intervenções excepcionais justificadas; SDD 02/decisões anteriores preservam quadro pessoal e restrição gerencial.
- Decisões da Fase 8, revisão de autenticação e navegação: dashboard/relatórios restritos a Secretário/Gestor.
- Registro posterior de 2026-11-13 em IMPLEMENTATION-DECISIONS: ADMIN MASTER com administração global permanente, incluindo módulos gerenciais.

### Alternativas para decisão do responsável

1. **Confirmar restrição gerencial:** formalizar a prevalência dos SDDs/política anterior e autorizar ajuste da implementação para bloquear as rotas administrativas gerenciais. Preservar funções técnicas/excepcionais documentadas, justificativas e auditoria.
2. **Confirmar administração global permanente:** formalizar a prevalência da decisão posterior, alinhar SDDs/testes e revisar o escopo efetivo de consultas por equipe, sem afrouxar responsabilidade atual, estado, expectedVersion, justificativas ou auditoria.
3. **Adiar a decisão:** manter as divergências registradas e, se autorizada uma campanha apenas diagnóstica, executar os testes sem mudar esperados ou aplicar skip. O resultado não poderá ser classificado como homologação RBAC completa.

Nenhuma alternativa foi implementada ou aprovada por inferência nesta fase. Não foi criado mecanismo de exceção, flag de privilégio ou permissão temporária. Em phase8, somente o preflight do nome do banco foi parametrizado; as asserções 403 permaneceram intactas.

## 6. Plano de provisionamento — depende de nova autorização

1. Inspecionar somente por leitura o servidor, versão/porta e schemas. Confirmar ausência de seaf_gestao_integration_2; se existir, interromper. Registrar novos snapshots de contagens/hashes de **dev, test, recovery e integration original**, além dos arquivos protegidos, antes de qualquer intervenção.
2. Criar exclusivamente `_2`, vazio, charset utf8mb4 e collation utf8mb4_unicode_ci compatíveis com as migrações. Não copiar dados e não reutilizar dumps. Não tocar no banco original da campanha.
3. Criar credenciais exclusivas para `_2`, preferencialmente contas distintas de migração e execução; nomes sugeridos `seaf_it2_migrate` e `seaf_it2_run`, ainda não criados. Somente host TCP 127.0.0.1 e grants no schema literal com underscores escapados. Sem grants nos quatro bancos protegidos, privilégios administrativos globais ou GRANT OPTION.
4. Conta de execução: somente SELECT, INSERT, UPDATE, DELETE em `_2`. Conta de migração: somente os privilégios de schema necessários ao DDL/DML das seis migrações (incluindo índices, FKs e triggers), distinta da conta que rodará os testes. Credenciais geradas somente após autorização, guardadas em canal/artefato privado, sem `.env`, logs ou Git. Observar o DEFINER dos triggers ao manter a conta de migração.
5. Confirmar SELECT DATABASE() e URL efetiva apontando para `_2` antes de usar prisma migrate deploy. Fornecer DATABASE_URL/TEST_DATABASE_URL explicitamente ao processo de migração, com RUN_DATABASE_INTEGRATION=0 e SMTP desligado; nenhuma config poderá redirecionar para outro schema. Aplicar exatamente as seis migrações existentes. Não usar db push, migrate reset ou migrate resolve. Parar no primeiro erro sem correção destrutiva ou tentativa automática.
6. Executar migrate status e conferir seis entradas concluídas/checksums, 31 tabelas, estruturas RUNNING_CLOCK/anexos, índices, FKs e triggers. Confirmar todas as tabelas de aplicação vazias; somente o histórico Prisma preenchido. Não chamar o contexto que cria roles ou seed administrativo nessa validação.
7. Com a conta de execução, validar a seleção `_2`, banco efetivo, grants literais e negar SELECT sobre cada um dos quatro bancos preservados. Usar apenas funções de preflight de leitura do guard, fornecendo o schema esperado explicitamente. Não iniciar o runner nesse provisionamento.
8. Comparar snapshots dos quatro bancos preservados. Entregar evidências reais e parar. **A autorização de provisionamento não autorizará automaticamente a campanha.**

Migrações planejadas, sem alteração de arquivos:

1. 20261111170000_init_persistence
2. 20261111171000_add_integrity_constraints
3. 20261112110000_calendar_history_guards
4. 20261112233000_auth_mfa_sessions
5. 20261113001000_retire_mfa_preserve_history
6. 20261113120000_running_clock_attachments

## 7. Riscos, alterações e próximo passo

- As correções da Fase 4C.8 têm testes unitários/serviço aprovados, mas não receberam nova validação MariaDB. Não se prevê um número de aprovações antes da campanha.
- A conta nova e a interpretação efetiva de SHOW GRANTS ainda precisam ser validadas no servidor, sem relaxar o guard se os grants forem excessivos ou usarem padrões.
- A ausência de seletor em comandos antigos agora bloqueia a execução. Atualizar conscientemente a configuração do processo; não recuperar compatibilidade por default no banco antigo.
- Low-level preflight não é uma sandbox para código arbitrário; a separação de contas e grants de `_2` é indispensável. As proteções do runner/contexto não alteram contas existentes da primeira campanha.
- E2E/carga em quality/ não fazem parte desta preparação e não devem ser executados nos bancos preservados.
- Persistem as lacunas de anexos, legado, reabertura e RBAC descritas acima. A segunda campanha poderá ser diagnóstica após autorização, mas não se deve afirmar prontidão para atualizar dev ou produção com esta preparação.

Arquivos da Fase 4C.9: integration-guard.js, run-integration.js, contexto de integração, teste unitário do guard, preflight de mysql-integrity/phase7/phase8, README, guia de continuidade, IMPLEMENTATION-DECISIONS e este relatório. Código de produção, schema, migrações e regras de negócio não foram alterados nesta fase. Alterações anteriores da Fase 4C.8 continuam locais e preservadas.

`.env` e bdseaf.sql mantêm seus SHA-256 anteriores (`a26660a0…f0f52` e `26b28e46…ed86`, respectivamente). Nenhuma credencial nova foi gerada. Não houve commit ou push.

**Próximo passo:** aguardar autorização específica para provisionar `_2`. A decisão ADMIN MASTER pode ser tratada em paralelo; é necessária para homologação RBAC, não para criar o banco isolado. Depois de validar o provisionamento, aguardar autorização separada antes de executar qualquer cenário com escrita.
