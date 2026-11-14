# Continuar o SEAF em outro computador

## Bloqueio atual — Fase 4C.10 (2026-11-14)

`seaf_gestao_integration_2` **já foi criado e está vazio, com zero tabelas/migrações**. Foram criadas as contas seaf_it2_migrate/seaf_it2_run, mas o provisionamento foi interrompido por erro 1044 decorrente do escape excessivo no GRANT e por acesso preexistente a test/test\_% que impede certificar exclusividade. Não recriar, limpar ou repetir automaticamente os scripts locais. Nenhuma migração ou campanha foi executada. Os quatro bancos protegidos e `.env` foram preservados. Consulte [PHASE-4C10-PROVISIONING.md](PHASE-4C10-PROVISIONING.md) para evidências e a intervenção de permissões que precisa de nova autorização. Credenciais permanecem cifradas localmente fora do Git. Alterações locais continuam sem commit/push.

## Preparação local — Fase 4C.9 (2026-11-14)

A primeira campanha em `seaf_gestao_integration` é evidência preservada e não pode ser reutilizada. O guard exige `INTEGRATION_DATABASE_NAME` explícito: reconhece os dois nomes exatos, mas runner/factories só permitem a futura campanha em `seaf_gestao_integration_2`. O novo banco não foi provisionado nem consultado nesta etapa. Não reutilizar contas/scripts locais antigos ou executar comandos de integração automaticamente. O plano, os testes de segurança e as alternativas da política ADMIN MASTER estão em [PHASE-4C9-PREPARATION.md](PHASE-4C9-PREPARATION.md). Alterações de 4C.8/4C.9 permanecem locais, sem commit/push; aguardar autorização para provisionamento e, separadamente, campanha.

## Checkpoint local — Fase 4C.8 (2026-11-14)

Correções de prefixos dos testes, openedAt das factories e métricas RUNNING_CLOCK por ciclo implementadas localmente. Resultado sem banco: **132 testes backend (incluindo 36 do guard) e 13 frontend aprovados**; lint, typecheck, build e Prisma Validate aprovados. Nenhum banco ou `.env` foi alterado e nenhuma nova integração foi executada. ADMIN MASTER permanece com divergência documental não resolvida. Consulte [PHASE-4C8-VALIDATION.md](PHASE-4C8-VALIDATION.md) para alterações, riscos e plano da segunda campanha. Estas alterações ainda não foram commitadas nem enviadas nesta etapa; aguardar autorização para correções adicionais, integração com escrita, commit ou push. Os últimos resultados MariaDB continuam os 71/31/6 da Fase 4C.7 abaixo.

## Checkpoint de continuidade — Fase 4C.7

- Branch: `feature/kanban-refactor`. As alterações das Fases 4C.5–4C.7 acompanham este guia.
- Na máquina atual, `seaf_gestao_integration` foi provisionado e recebeu uma única campanha: **71 aprovados, 31 reprovados, 6 cancelados e 0 ignorados**, entre 108 cenários registrados. Não repetir automaticamente.
- Bancos `dev`, `test` e `recovery` preservados. Desenvolvimento **não está apto para atualização**. Nenhuma correção das falhas foi autorizada ou aplicada.
- Próximo trabalho, após autorização: corrigir prefixo dos testes de anexos, openedAt das factories, métricas RUNNING_CLOCK sem calendário e consolidar a política ADMIN MASTER. Reabertura e compatibilidade histórica ainda têm lacunas. Consultar [PHASE-4C7-VALIDATION.md](PHASE-4C7-VALIDATION.md) para falhas individuais, evidências e plano.
- Código e relatórios estão no Git. Bancos, `.env`, dumps, logs e credenciais não são distribuídos pelo repositório. Na máquina atual, as evidências privadas e os ponteiros das fases estão em `.artifacts/`. As credenciais do banco estão cifradas por Windows DPAPI e dependem do usuário Windows original; não presumir que serão utilizáveis em outro computador.
- Em outra máquina, o clone não recria bancos nem credenciais. Qualquer provisionamento, transferência privada, correção ou nova campanha depende de autorização específica. Não usar bdseaf.sql, não executar migrações ou testes com escrita automaticamente.

> Atualização Fase 4C.5 (nova máquina): as instruções históricas abaixo não autorizam escrita em `seaf_gestao_test`. Preserve `dev`, `test` e `recovery`. O runner de integração agora exige exclusivamente `seaf_gestao_integration`, seis migrações e conta restrita a esse banco. Não restaure dumps para a campanha sintética. O provisionamento e a execução real ainda dependem de autorização. Consulte [PHASE-4C5-VALIDATION.md](PHASE-4C5-VALIDATION.md).

## Repositório e branch

- Repositório: `https://github.com/ntsilvazyxx/fluxo.git`
- Branch de continuidade: `feature/kanban-refactor`
- Atualize a branch com `git fetch origin` e `git pull --ff-only origin feature/kanban-refactor`.

## Requisitos locais

- Node.js 26.13.0 (o projeto requer Node.js >= 22.12.0).
- npm 11.20.0 (o projeto requer npm >= 10.0.0).
- MariaDB 10.11.16 (XAMPP) ou servidor MariaDB/MySQL compatível.
- Prisma ORM 7.10.1, instalado pelas dependências do projeto.

## Instalação e ambiente

```powershell
git clone --branch feature/kanban-refactor https://github.com/ntsilvazyxx/fluxo.git
cd fluxo
npm ci
```

Crie `.env` local a partir de `.env.example` ou transfira o arquivo por canal privado. Não versionar valores de conexão, segredos JWT, chaves de cifragem ou credenciais SMTP. Configure bancos diferentes para `DATABASE_URL` (desenvolvimento) e `TEST_DATABASE_URL` (homologação).

Gere o Prisma Client e valide o schema:

```powershell
npm.cmd run prisma:generate
npm.cmd run prisma:validate
```

## Bancos e restauração

Os dumps locais não são enviados ao Git. Transfira-os por meio privado e protegido. Para restaurar, primeiro crie ou escolha um banco descartável autorizado, valide o nome do destino e use o cliente MariaDB com um dump correspondente. Nunca restaure sobre um banco existente sem backup e autorização.

Antes de aplicar qualquer migração, execute:

```powershell
npx.cmd prisma migrate status --config backend/prisma.config.js
```

O banco `seaf_gestao_test` recebeu as migrações da Fase 4B.5, incluindo `RUNNING_CLOCK` e anexos. O banco `seaf_gestao_dev` ainda não recebeu essas migrações e só deve ser atualizado após homologação autorizada.

## Executar localmente

Em dois terminais:

```powershell
npm.cmd run dev:backend
npm.cmd run dev:frontend
```

No Windows, os auxiliares `iniciar_seaf.bat` e `parar_seaf.bat` iniciam ou encerram somente os terminais identificados do SEAF; não executam migrações.

Valide o Kanban autenticando-se com uma conta local autorizada e conferindo:

- `GET /api/v1/kanban` para perfis gerenciais.
- `GET /api/v1/my-tasks` para tarefas pessoais.
- Detalhe de tarefa em `/kanban/tarefas/:id`.

## Situação atual

- Fase 4B.5 concluída: as três migrações pendentes foram aplicadas em `seaf_gestao_test`.
- O smoke test do Kanban em homologação retornou HTTP 200, sem o erro Prisma P2022.
- Foram aprovados 91 testes unitários/frontend (78 backend e 13 frontend), além de typecheck, lint sem erros, build e Prisma Validate.
- A integração com escrita permanece pendente: parte da suíte cria fixtures no banco sem rollback ou limpeza confiável.

## Próxima etapa: Fase 4C.1

Provisionar, somente após autorização, `seaf_gestao_integration` vazio com seis migrações versionadas e conta restrita ao schema. A infraestrutura da Fase 4C.5 prepara fixtures sintéticas e recusa os bancos preservados. A campanha real de RUNNING_CLOCK, anexos, RBAC, Kanban e compatibilidade `LEGACY_CALENDAR` depende de uma autorização posterior; não limpar dados nem restaurar backups nos bancos existentes.

Não aplicar as migrações em `seaf_gestao_dev` antes dessa homologação e de autorização específica.
