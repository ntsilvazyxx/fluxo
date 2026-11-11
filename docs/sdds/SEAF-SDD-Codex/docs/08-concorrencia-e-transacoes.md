# SDD 08 — Concorrência, integridade e transações

## Estratégia
- **Controle otimista** (`version` e CAS) em edições de título, descrição, prioridade e prazos.
- **Bloqueio pessimista** (`SELECT ... FOR UPDATE`) em transições críticas de ciclo, atribuição, solicitação, conclusão/cancelamento, reabertura e subtarefas.
- **Constraints MySQL** para unicidade de ciclos/atribuições/pausas/pedidos ativos, via colunas geradas + UNIQUE onde necessário.
- **Idempotência** em mutações críticas; mesma chave + mesmo hash retorna resultado; mesma chave + payload diferente é conflito.
- **Transactional Outbox** para notificações/e-mail; não enviar externamente dentro da transação.

## Protocolo padrão
1. Autenticar, validar formato e idempotency key.
2. Iniciar transação curta (`READ COMMITTED` quando justificado, com isolamento explicitamente definido por operação).
3. Bloquear **tarefa raiz**, depois subtarefa(s) por ID ordenado, depois ciclo(s), atribuição(ões), solicitação(ões) conforme necessidade; não misturar ordem entre rotas.
4. Reconsultar dados após lock; validar versão, estado, equipe, responsável e pendências.
5. Aplicar alterações atômicas; inserir auditoria e outbox.
6. Commit; worker processa efeitos externos.
7. Deadlock/timeout transitório: retry limitado da **transação inteira**, com jitter, apenas quando operação for idempotente; conflitos de versão/negócio retornam 409 sem retry silencioso.

## Cenários que devem ser impossíveis
- Duas atribuições atuais no mesmo ciclo.
- Dois ciclos abertos da mesma tarefa.
- Aceite de atribuição já encerrada.
- Conclusão e cancelamento confirmados para o mesmo ciclo.
- Conclusão da principal com subtarefa aberta.
- Conclusão durante devolução pendente.
- Duas devoluções pendentes da mesma atribuição.
- Duas pausas abertas da mesma atribuição.
- Alteração de prazo que aprova pedido de atribuição obsoleta.
- Histórico de calendário alterado retroativamente.
- Notificação de transação revertida.
- Requisição duplicada criando dois ciclos/atribuições.

## Limites de Prisma/MySQL
Prisma não expõe diretamente todos os tipos de lock e índices de coluna gerada; usar `$queryRaw` parametrizado e migrations SQL versionadas. MySQL não oferece índice parcial; colunas geradas UNIQUE podem usar NULL para permitir múltiplos registros inativos. Validar compatibilidade com versão MySQL escolhida. A FK e a regra de negócio são complementares; nenhum `findFirst` isolado é proteção contra corrida.

## Arquivos de imagem
Upload externo não participa da transação MySQL: usar staging + commit de metadados + promoção/limpeza compensatória, com job de reconciliação de órfãos.

## Exemplo de conflito UX
Resposta `409 CONFLICT` com `code=TASK_VERSION_CONFLICT`, versão atual e mensagem amigável sem dados fora do escopo; frontend oferece atualizar detalhes antes de reenviar.
