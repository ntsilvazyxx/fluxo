# Plano de implementação — prazos corridos e anexos

> Estado: preparado para revisão; não aplicado em banco.

## Compatibilidade histórica

- Todo ciclo existente recebe `deadlinePolicy = LEGACY_CALENDAR` pelo valor padrão da migração.
- Nenhum valor de `deadlineAt`, `calendarVersionId`, `TaskImage`, calendário ou versão é alterado.
- Métricas históricas continuam usando `calendarVersionId` e o serviço de calendário.
- Somente ciclos criados depois da implantação usarão `RUNNING_CLOCK`; nesses ciclos `calendarVersionId` será nulo.

## Contrato preparado para criação e encaminhamento

`POST /api/v1/tasks` passará a receber uma única operação idempotente:

```json
{
  "teamId": "uuid",
  "userId": "uuid",
  "title": "string",
  "description": "string",
  "priority": "NORMAL",
  "acceptanceDurationMinutes": 240,
  "executionDurationMinutes": 1440,
  "reason": "obrigatória para intervenção ADMIN MASTER"
}
```

- Aceite permitido: 60, 120, 240, 480, 720 ou 1440 minutos.
- Execução permitida inicialmente: 720, 1440, 2880, 4320 ou 7200 minutos.
- `assignedAt` inicia o prazo de aceite; `acceptanceDeadlineAt` é gravado no ciclo e na atribuição.
- Ao aceitar, `acceptedAt` inicia a execução e `executionDeadlineAt = acceptedAt + executionDurationMinutes`.
- Rejeição e reatribuição encerram a atribuição anterior, preservam seu prazo de aceite e criam nova atribuição com prazo de aceite integralmente reiniciado.
- Extensão aprovada altera somente `executionDeadlineAt` e grava `DeadlineChange.kind = EXECUTION_EXTENSION`.
- Uma devolução pendente abre uma pausa. Ao ser decidida, a pausa é fechada e seu intervalo é somado ao `executionDeadlineAt`, com `DeadlineChange.kind = RETURN_PAUSE`; a operação ocorre sob o lock já usado para solicitações.

## Contratos preparados para anexos

Os uploads usarão uma área privada de staging e serão promovidos somente após a transação da tarefa. A API proposta terá endpoints específicos para anexos, sem alterar os endpoints históricos de imagens:

- `POST /api/v1/task-uploads/staged`: envia um arquivo autenticado ao staging e devolve um identificador efêmero.
- `POST /api/v1/tasks`: recebe os identificadores efêmeros em `initialAttachmentIds` e os vincula atomicamente ao ciclo recém-criado como `INITIAL`.
- `POST /api/v1/tasks/:id/attachments`: anexo de execução, criado como `EXECUTION` com `Idempotency-Key` e `expectedVersion`.
- `GET /api/v1/tasks/:id/attachments` e `GET /api/v1/attachments/:id/content`: listagem e streaming autenticado.
- `DELETE /api/v1/attachments/:id`: exclusão lógica autorizada.

Tipos aceitos por inspeção de conteúdo: JPEG, PNG, WEBP, PDF, DOC e DOCX. O nome do usuário é normalizado para apresentação; a chave física é aleatória e privada. Não há limite funcional de tamanho ou quantidade.

## Proteções operacionais configuráveis

Os limites de infraestrutura não são regra de negócio. A implementação posterior deverá receber configuração externa para tamanho por requisição, duração máxima de upload, quantidade de streams paralelos, espaço mínimo livre e idade máxima do staging. Nenhum valor será gravado como limite funcional do SEAF. O upload será por streaming para não manter arquivos grandes na memória.

## Sequência de implantação proposta

1. Aplicar a migração somente em `seaf_gestao_test`, após backup e `prisma migrate status`.
2. Gerar Prisma Client e validar o schema.
3. Implementar os serviços de prazo corrido, criação/encaminhamento atômico e compatibilidade de leitura.
4. Implementar staging, anexos genéricos e reconciliação/limpeza.
5. Atualizar frontend, Kanban e detalhes; remover o acesso frontend a calendários.
6. Executar testes unitários, integração MariaDB e validações de frontend.
7. Aplicar em desenvolvimento somente mediante autorização específica e backup verificado.

## Comandos previstos antes de aplicação

```powershell
npm.cmd run prisma:validate
npm.cmd run db:check
npm.cmd exec -- prisma migrate status --schema backend/prisma/schema.prisma
# após backup confirmado e autorização explícita, somente no banco de testes:
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm.cmd run db:migrate:deploy
npm.cmd run prisma:generate
$env:RUN_DATABASE_INTEGRATION='1'; npm.cmd run test:integration
$env:DATABASE_URL = $null
```

`db:migrate:deploy` lê `DATABASE_URL`; sem a atribuição temporária acima ele pode
apontar para desenvolvimento. A URL deve ser conferida com `db:check` antes de
qualquer aplicação, e a variável é removida ao fim da sessão.

## Riscos e recuperação

- `ALTER TABLE` pode adquirir locks: executar em janela controlada, primeiro no banco de testes.
- A migração não remove dados; sua recuperação preferida é restaurar o backup anterior caso a implantação seja interrompida antes da aplicação de código compatível.
- Não usar `prisma migrate reset`, `prisma db push` ou exclusão de tabelas como recuperação.
- Uploads em staging sem vínculo devem ser removidos pelo reconciliador, nunca por exclusão indiscriminada de objetos definitivos.
