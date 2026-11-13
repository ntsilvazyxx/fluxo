# SDD 02 — Regras de negócio e máquinas de estado

## Estados persistidos por ciclo
`PENDING` (Pendente), `AWAITING_ACCEPTANCE` (Aguardando aceite), `IN_PROGRESS` (Em andamento), `COMPLETED` (Concluída), `CANCELLED` (Cancelada). **Atrasada não é status**: `deadlineAt < now()` e ciclo não terminal; pode ocorrer inclusive fora do expediente.

## Transições
| Origem | Ação | Destino | Ator / validações |
|---|---|---|---|
| PENDING | atribuir | AWAITING_ACCEPTANCE | Secretário/Gestor no escopo; responsável ativo/elegível; prazo obrigatório, mesmo vencido com justificativa |
| AWAITING_ACCEPTANCE | aceitar | IN_PROGRESS | responsável atual; registra `acceptedAt` |
| AWAITING_ACCEPTANCE | rejeitar | PENDING | responsável atual; motivo obrigatório; encerra atribuição e remove prazo vigente conforme política de ciclo |
| AWAITING_ACCEPTANCE ou IN_PROGRESS | reatribuir | AWAITING_ACCEPTANCE | gestão autorizada; motivo; encerra atribuição anterior, cria outra, novo aceite |
| IN_PROGRESS | concluir | COMPLETED | responsável atual; descrição de entrega obrigatória; sem subtarefas abertas; sem devolução pendente |
| PENDING / AWAITING_ACCEPTANCE / IN_PROGRESS | cancelar | CANCELLED | gestão autorizada; motivo; fecha pedidos e atribuições; cascata de cancelamento de subtarefas abertas |
| COMPLETED | reabrir | novo ciclo PENDING | ator autorizado; motivo; ciclo anterior imutável |
| CANCELLED | restaurar | novo ciclo PENDING | ator autorizado; motivo; ciclo anterior imutável |

**Reabertura**: mantém `task.id`, incrementa `cycleNumber`, inicia sem responsável e sem prazo; não reativa subtarefas antigas. Um ciclo ativo por tarefa.

## Solicitações
- **Prorrogação**: responsável em `IN_PROGRESS` propõe prazo posterior ao atual e motivo; um pedido pendente por tipo/atribuição; prazo não muda até aprovação. Indeferimento exige justificativa. Aprovação atualiza prazo e registra valor anterior/novo. Conclusão encerra prorrogação pendente como `CLOSED_BY_COMPLETION`; alteração administrativa de prazo encerra como `CLOSED_BY_ADMIN_CHANGE`.
- **Devolução**: responsável em `IN_PROGRESS` apresenta motivo; pausa relógio de responsabilidade imediatamente; estado do ciclo permanece `IN_PROGRESS` enquanto análise pendente. Aprovação encerra atribuição e volta para `PENDING`; indeferimento fecha pausa e retoma tempo, excluindo intervalo pausado. Enquanto pendente, bloquear conclusão e pedidos incompatíveis.
- Reatribuição/cancelamento encerram solicitações pendentes com resultado específico e auditável.

## Subtarefas
Uma camada apenas. Cada subtarefa é uma tarefa com ciclos/atribuições/prazos próprios, ligada ao **ciclo** da principal (`parentCycleId`). A principal só pode ser concluída se todas as subtarefas do ciclo atual estiverem `COMPLETED` ou `CANCELLED`; canceladas não contam como concluídas nos indicadores. Cancelar principal cancela atomicamente todas as subtarefas abertas.

## Prioridades e prazo
`LOW`, `NORMAL` (padrão), `HIGH`, `URGENT`; prioridade não altera automaticamente prazo/estado. Prazos são datetime exatos e podem vencer fora do expediente. Tarefa PENDING pode não ter prazo; atribuir exige prazo. Alterar prazo após atribuição exige justificativa e auditoria.

## Tempo e calendário
Armazenar timestamps reais de atribuição, aceite, pausa, decisão, conclusão e encerramento. Tempo de responsabilidade contabilizado é a interseção dos intervalos ativos com expediente da versão de calendário aplicável, excluindo pausas. Tempo de espera por aceite e tempo corrido total são métricas distintas. Fuso configurado na apresentação; persistência em UTC.

## Evidências
Na conclusão, texto obrigatório e imagens opcionais JPG/JPEG/PNG/WEBP, até 10 imagens ativas por ciclo/tarefa conforme configuração (padrão 10), 10 MB por arquivo. Exclusão lógica com autoria, autorização e auditoria. Após conclusão, somente nota de correção administrativa autorizada, sem reescrever a entrega histórica.

## Kanban e pesquisa
Revisão de navegação autorizada pelo responsável após a Fase 9: Kanban Secretário global/Gestor por equipe apresenta primeiro "Minhas tarefas" (visualização pessoal, sem status novo), depois PENDING, AWAITING_ACCEPTANCE e IN_PROGRESS. A primeira coluna reutiliza atribuições próprias e entregas disponíveis no serviço pessoal; os demais terminais continuam no histórico. Técnico usa Kanban pessoal com AWAITING_ACCEPTANCE, IN_PROGRESS e COMPLETED, sem tarefas alheias ou pendentes sem atribuição. ADMIN MASTER usa somente o quadro pessoal nesta interface, mantendo suas funções técnicas/excepcionais existentes. Duas visualizações da mesma tarefa referenciam o mesmo ID; não se criam cópias no banco. Filtros são interseções, com paginação e escopo no backend. Nenhum fluxo de atribuição, execução ou histórico foi alterado.

## Notificações
Internas e por e-mail: atribuição, reatribuição, pedidos/decisões, alterações, conclusão, cancelamento, reabertura, prazo próximo e vencimento. Lembretes padrão 24h antes e no vencimento, configuráveis, sem duplicidade. Falha de e-mail não reverte transação da tarefa.

## Regras transversais
Justificativas obrigatórias onde especificadas; trilha de auditoria com antes/depois sem expor segredos; autorização por papel, equipe, responsável atual e ciclo; erros de conflito explícitos. Proibido concluir tarefa de outro usuário apenas por ter perfil de gestor.
