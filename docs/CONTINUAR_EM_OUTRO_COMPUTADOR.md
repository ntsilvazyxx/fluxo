# Continuar o SEAF em outro computador

## Repositório e branch

- Repositório: `https://github.com/ntsilvazyxx/fluxo.git`
- Branch de continuidade: `feature/kanban-refactor`
- Atualize a branch com `git fetch origin` e `git pull --ff-only origin feature/kanban-refactor`.

## Requisitos locais

- Node.js 26.13.0 (o projeto requer Node.js >= 22.12.0).
- npm 10 ou superior.
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

Isolar os testes de integração antes de executá-los em `seaf_gestao_test`. A alternativa recomendada é limpar exclusivamente os fixtures identificados por UUID/prefixo próprio ao final de cada suíte, ou usar um banco descartável restaurado de backup. Depois, executar a homologação completa de RUNNING_CLOCK, anexos, RBAC, Kanban e compatibilidade `LEGACY_CALENDAR`.

Não aplicar as migrações em `seaf_gestao_dev` antes dessa homologação e de autorização específica.
