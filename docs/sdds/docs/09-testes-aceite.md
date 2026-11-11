# SDD 09 — Estratégia de testes e critérios de aceite

## Pirâmide
Unitários (políticas de transição e cálculos), integração (Express/Prisma/MySQL real em ambiente de testes), concorrência (requisições paralelas), E2E (React mobile/desktop), segurança (RBAC/IDOR), acessibilidade (teclado/contraste), performance básica (listas paginadas).

## Cenários mínimos (48)
| ID | Caso | Resultado obrigatório |
|---|---|---|
| V01 | e-mail duplicado | único normalizado |
| V02 | usuário inativo como responsável | bloqueado |
| V03 | gestor fora da equipe | 403/404 |
| V04 | inativar usuário com histórico | histórico preservado |
| V05 | dois ciclos ativos | impossível |
| V06 | reabertura repetida | só um novo ciclo |
| V07 | editar ciclo encerrado | negado |
| V08 | número de ciclo duplicado | UNIQUE |
| V09 | atribuições simultâneas | só uma atual |
| V10 | aceite após reatribuição | 409 |
| V11 | rejeição repetida | não duplica |
| V12 | atribuir sem prazo | negado |
| V13 | subtarefa em ciclo errado | negado |
| V14 | subtarefa de subtarefa | negado |
| V15 | concluir principal com subtarefa aberta | negado |
| V16 | cancelar principal com subtarefas | tudo atômico |
| V17 | prazo inválido | negado |
| V18 | duas alterações de prazo | conflito por versão |
| V19 | aprovação de pedido obsoleto | negado |
| V20 | alteração de prazo | trilha anterior/novo |
| V21 | horários de expediente sobrepostos | negado |
| V22 | exceções conflitantes | precedência validada |
| V23 | editar versão de calendário histórica | negado |
| V24 | mudar equipe/calendário | tempo segmentado |
| V25 | duas pausas abertas | impossível |
| V26 | pausa negativa | impossível |
| V27 | tempo fora do expediente | não contabilizado |
| V28 | concluir durante devolução pendente | negado |
| V29 | devoluções pendentes duplicadas | impossível |
| V30 | gestor não autorizado decide pedido | negado |
| V31 | decisão sobre pedido encerrado | 409 |
| V32 | prorrogação e edição de prazo simultâneas | serializado |
| V33 | concluir/cancelar simultaneamente | apenas um terminal |
| V34 | concluir sem descrição | negado |
| V35 | cancelar/restaurar simultaneamente | ciclo consistente |
| V36 | alterar subtarefa enquanto principal cancela | estado consistente |
| V37 | upload MIME inválido | rejeitado |
| V38 | 11 uploads simultâneos | máximo 10 ativos |
| V39 | excluir imagem de outro autor | negado |
| V40 | rollback após upload | sem órfão permanente |
| V41 | rollback da tarefa | sem e-mail enviado |
| V42 | duplicidade de evento | dedupe |
| V43 | operação crítica sem auditoria | impossível |
| V44 | alterar evento histórico | negado |
| V45 | deadlock | retry limitado sem duplicidade |
| V46 | replay de requisição | resultado idempotente |
| V47 | dashboard com joins | contagem correta |
| V48 | excluir registro referenciado | FK/soft delete protege |

## E2E por perfil
Testar login, navegação, criação, atribuição, aceite, rejeição, devolução, prorrogação, conclusão, reabertura, cancelamento, notificações e histórico com cada papel. Testar telas 320/375/390/430/768/1024/1440 px, sem overflow horizontal, teclado e foco.

## Critérios de aprovação
`prisma validate` e migrações limpas em banco descartável; constraints testadas no MySQL real; testes de concorrência reproduzíveis; nenhum vazamento de escopo; auditoria e outbox consistentes; documentação API atualizada; backup/restauração testados. **Não declarar homologação antes da execução real.**
