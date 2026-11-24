# Plano Técnico de Implantação Operacional do Módulo de Chat — SEAF
## Preparação Documental, Migrações, Segurança e Ativação Gradual (Fase 5.1.7 / Prompt 50 Master)

---

> [!IMPORTANT]
> **ESTE DOCUMENTO É ESTRITAMENTE DE PLANEJAMENTO TÉCNICO.**
> Nenhuma operação de deploy, execução de migrations operacionais, alteração de banco de produção ou ativação de workers está autorizada ou foi executada neste ciclo.

---

### 1. Inventário de Pré-Requisitos e Ambiente

| Componente | Versão / Configuração Requerida | Estado Atual / Observações |
| :--- | :--- | :--- |
| **Node.js** | $\ge 26.0.0$ (Atualmente: v26.13.0) | Homologado e compatível com ES Modules. |
| **MariaDB** | 10.11 LTS | Banco operacional: `seaf_gestao_functional` (42 tabelas, 37 triggers). |
| **Prisma ORM** | Prisma 7 | Schemas validados (`npx prisma validate`). |
| **Storage Privado** | Diretório local ou volume dedicado com permissões restritas | `storage/chat-attachments/` (subdiretórios: `staging/`, `objects/`, `quarantine/`). |
| **Antivírus (ClamAV)** | Binário `clamscan` acessível via PATH ou caminho absoluto configurado | **PROVISIONADO E HOMOLOGADO (Fase 5.1.7 - Bloco B):** ClamAV 1.5.5 oficial (Cisco Talos) instalado em `C:\Program Files\ClamAV\clamscan.exe` com assinaturas atualizadas em `C:\ProgramData\ClamAV\db` (`main.cvd`, `daily.cvd`, `bytecode.cvd`). Suíte de 5 testes unitários e homologação real no MariaDB e navegador aprovadas com 100% de sucesso. |
| **Variáveis de Ambiente** | Configurações mínimas em `.env` | Listadas na Seção 2 abaixo. |

---

### 2. Variáveis de Ambiente e Configurações

As seguintes variáveis controlam a ativação e os limites do módulo de Chat:

```env
# Ativação do módulo e storage
CHAT_ATTACHMENT_STORAGE_ENABLED=false     # Manter 'false' até aprovação final da homologação do scanner
CHAT_ATTACHMENT_STORAGE_PATH=storage/chat-attachments
CHAT_ATTACHMENT_STORAGE_MAX_BYTES=20971520 # 20 MiB por arquivo

# Quotas de Staging
CHAT_ATTACHMENT_USER_QUOTA_BYTES=104857600       # 100 MiB por usuário
CHAT_ATTACHMENT_CONVERSATION_QUOTA_BYTES=262144000 # 250 MiB por conversa
CHAT_ATTACHMENT_STAGING_TTL_MINUTES=1440         # 24 horas

# Antivírus
CLAMSCAN_PATH=clamscan                            # Caminho do executável ClamAV
```

---

### 3. Análise Detalhada da Migration Pendente

**Migration:** `20261123010000_add_chat_attachment_staging`

#### 3.1 Alterações Estruturais no Banco de Dados
1. **Criação da Tabela `chat_attachment_uploads` (Staging):**
   - Chave Primária: `id` (CHAR 36).
   - Vínculos FK: `conversationId` $\rightarrow$ `chat_conversations(id)` e `uploadedById` $\rightarrow$ `users(id)`.
   - Vínculo Composto: `(messageId, conversationId)` $\rightarrow$ `chat_messages(id, conversationId)` com `ON DELETE RESTRICT`.
   - Índices de Idempotência: `UNIQUE INDEX (conversationId, uploadedById, clientUploadId)`.
   - Índices de Expiração e Quota: `(status, expiresAt)`, `(uploadedById, status, expiresAt)`, `(conversationId, status, expiresAt)`.
2. **Alteração na Tabela `chat_message_attachments` (Definitivos):**
   - Adição de colunas anuláveis (`NULL`): `sourceUploadId` (CHAR 36), `uploadedById` (CHAR 36), `position` (SMALLINT UNSIGNED).
   - Adição de restrições de unicidade: `sourceUploadId_key`, `(messageId, position)`.
   - Adição de FK: `sourceUploadId` $\rightarrow$ `chat_attachment_uploads(id)` e `uploadedById` $\rightarrow$ `users(id)`.

#### 3.2 Avaliação de Compatibilidade e Riscos
- **Compatibilidade Retroativa:** Total. Todas as colunas adicionadas à tabela existente são anuláveis (`NULL`), não interferindo nos registros prévios do Chat.
- **Risco de Bloqueio (*Table Lock*):** O `ALTER TABLE` em MariaDB 10.11 para adição de colunas `NULL` e índices secundários é executado via *Instant/Online DDL* (`ALGORITHM=INPLACE, LOCK=NONE`), resultando em impacto operacional mínimo durante janela programada.
- **Validação Pré-Migration:** Verificar que `_prisma_migrations` em `seaf_gestao_functional` está íntegro e que a tabela `chat_attachment_uploads` não existe previamente.
- **Validação Pós-Migration:** Confirmar que a contagem de tabelas passa de 42 para 43 e que as 37 triggers permanecem inalteradas.

---

### 4. Estratégia de Backup Coordenado

Antes de qualquer intervenção em produção:

1. **Snapshot Lógico do MariaDB:**
   ```bash
   mysqldump -u root -p --single-transaction --routines --triggers --databases seaf_gestao_functional > backup_seaf_pre_migration_$(date +%Y%m%d_%H%M%S).sql
   ```
2. **Snapshot do Storage Privado:**
   - Efetuar cópia tar/zip de `storage/chat-attachments/` preservando permissões e timestamps:
   ```bash
   tar -czf backup_chat_storage_$(date +%Y%m%d_%H%M%S).tar.gz storage/chat-attachments/
   ```
3. **Teste de Restauração em Ambiente Isolado:**
   - Restaurar o dump lógico em instância de teste descartável para assegurar que a integridade dos dados, triggers e constraints é 100% preservada antes de autorizar a migration.

---

### 5. Estratégia Realista de Rollback

> [!WARNING]
> No MariaDB, instruções DDL (`CREATE TABLE`, `ALTER TABLE`) executam *implicit commit*, não sendo transacionais. O rollback deve ser realizado mediante procedimento explícito documentado.

1. **Falha na Execução da Migration:**
   - Se ocorrer erro durante o script SQL, executar o script de desfazimento manual:
   ```sql
   ALTER TABLE `chat_message_attachments`
     DROP FOREIGN KEY `chat_message_attachments_sourceUploadId_fkey`,
     DROP FOREIGN KEY `chat_message_attachments_uploadedById_fkey`,
     DROP INDEX `chat_message_attachments_messageId_position_key`,
     DROP INDEX `chat_message_attachments_sourceUploadId_key`,
     DROP INDEX `chat_message_attachments_uploadedById_idx`,
     DROP COLUMN `position`,
     DROP COLUMN `uploadedById`,
     DROP COLUMN `sourceUploadId`;

   DROP TABLE IF EXISTS `chat_attachment_uploads`;
   DELETE FROM `_prisma_migrations` WHERE `migration_name` = '20261123010000_add_chat_attachment_staging';
   ```
2. **Falha do Scanner ou Storage em Operação:**
   - Manter `CHAT_ATTACHMENT_STORAGE_ENABLED=false`. O backend rejeita imediatamente novas requisições de upload com código `503 CHAT_ATTACHMENT_SCANNER_UNAVAILABLE` (fail-closed), preservando o envio de mensagens de texto e a leitura de mensagens existentes sem necessidade de rollback do banco de dados.

---

### 6. Roteiro de Ativação Gradual (16 Etapas)

1. **Aprovação Técnica Formal:** Apresentação deste plano e do relatório de homologação.
2. **Abertura de Janela de Manutenção:** Comunicação prévia aos usuários operacionais.
3. **Execução do Backup Coordenado:** Dump do MariaDB e arquivamento do storage.
4. **Instalação e Homologação do ClamAV:** Provisionamento do executável `clamscan` no host com assinaturas atualizadas (`freshclam`).
5. **Teste de Detecção com EICAR em Ambiente Isolado:** Comprovar detecção de arquivo benigno e rejeição do arquivo padrão de teste.
6. **Criação e Permissões dos Diretórios de Storage:** Garantir permissões restritas (apenas usuário da aplicação) em `storage/chat-attachments/`.
7. **Aplicação Autorizada da Migration:** Execução controlada via `prisma migrate deploy` em janela de manutenção.
8. **Verificação Estrutural Pós-Deploy:** Confirmar 43 tabelas e integridade dos índices.
9. **Deploy da Nova Versão do Backend e Frontend:** Atualização dos artefatos estáticos e reinicialização controlada dos processos Node.js.
10. **Validação das Funcionalidades Gerais do SEAF:** Garantir ausência de regressões em Kanban, Tarefas, Prazos e Subtarefas.
11. **Validação do Chat Textual:** Confirmar leitura de histórico existente e envio de mensagens de texto puro.
12. **Ativação Parcial da Flag de Anexos:** Configurar `CHAT_ATTACHMENT_STORAGE_ENABLED=true`.
13. **Teste Funcional Controlado de Anexo:** Envio de documento PDF sintético em tarefa de homologação dedicada.
14. **Validação do Download:** Testar download autenticado via navegador real.
15. **Ativação da Rotina de Reconciliação:** Iniciar worker periódico de limpeza de staging expirado com lease atômico.
16. **Monitoramento Ativo:** Acompanhamento dos logs e indicadores durante as primeiras 48 horas.

---

### 7. Indicadores e Monitoramento Operacional Recomendados

- **Taxa de Sucesso de Uploads:** Contagem de requisições `POST /attachments/staged` retornando 201 vs 4xx/5xx.
- **Alertas de Fail-Closed do Scanner:** Disparar notificação crítica caso ocorram erros com código `CHAT_ATTACHMENT_SCANNER_UNAVAILABLE`.
- **Mensagens com Status `PENDING`:** Alerta caso mensagens permaneçam em estado `PENDING` por mais de 5 minutos (indicativo de atraso na promoção).
- **Ocupação do Storage:** Monitorar espaço em disco do volume `storage/chat-attachments/`.
- **Tentativas de Acesso Não Autorizado:** Monitorar respostas HTTP 403 / 404 em rotas de download para detecção de anomalias de segurança.
- **Privacidade Estrita:** É terminantemente proibido registrar em logs o conteúdo textual de mensagens ou hashes sensíveis.
