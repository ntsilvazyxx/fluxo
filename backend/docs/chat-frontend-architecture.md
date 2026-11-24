# Arquitetura e Contratos do Frontend do Chat — SEAF (Fase 5.1.7)

Este documento descreve a arquitetura técnica, os contratos de integração, o fluxo de ciclo de vida de dados e os mecanismos de segurança implementados no frontend do módulo de Chat do **SEAF — Sistema de Gestão e Acompanhamento de Tarefas**.

---

## 1. Visão Geral da Arquitetura

O frontend do Chat está localizado no pacote `frontend/src/tasks/chat` e integrado com a página de Kanban (`KanbanPage.tsx`) e o modal de detalhes de tarefa (`TaskDetailModal.tsx`).

### Árvore de Componentes

```
TaskDetailModal (ou KanbanPage)
└── TaskChatPanel
    ├── ChatHeader / StatusIndicator (indicador de bloqueio, participantes, metadados)
    ├── ChatMessageList
    │   └── ChatMessageItem (renderização de mensagens, avatares, status PENDING/PUBLISHED/FAILED)
    │       └── ChatAttachmentMeta (chips com ícones MIME, tamanho formatado e botão de download autenticado)
    ├── ChatAttachmentQueue (fila de pré-visualização, progresso de upload, validações e descarte seguro)
    └── ChatComposer (composição textual, botão de anexo, drag-and-drop overlay, atalho Ctrl+Enter, reenvio)
```

---

## 2. Hooks Especializados e Separação de Responsabilidades

| Hook | Responsabilidade |
| :--- | :--- |
| `useTaskChat(taskId)` | Carrega e sincroniza o histórico de mensagens, paginação monotônica, metadados da conversa e participantes ativos. |
| `useChatMessageSender(taskId, options)` | Gerencia o congelamento de intenção (`SendIntent`), geração do `clientMessageId` idempotente, suporte a reenvio sem duplicação e publicação de texto com/sem anexos. |
| `useChatAttachments(taskId, options)` | Gerencia a seleção de arquivos, validação client-side (tamanho individual, extensão, quota por mensagem de 5 anexos / 25 MB), uploads temporários em staging com `AbortController`, e descarte controlado com modal de confirmação. |

---

## 3. Contratos de API Integrados

### 3.1 Upload Temporário (Staging)
- **Método / Rota:** `POST /api/v1/tasks/:taskId/chat/attachments/upload`
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`
- **Body:** `file` (binário), `clientUploadId` (UUID v4)
- **Resposta Sucesso:** `HTTP 201 Created`
  ```json
  {
    "id": "upl_uuid",
    "clientUploadId": "uuid",
    "originalName": "relatorio.pdf",
    "mimeType": "application/pdf",
    "fileSize": 1048576,
    "status": "READY",
    "expiresAt": "2026-11-25T14:00:00.000Z"
  }
  ```
- **Idempotência:** Reenvios com o mesmo `clientUploadId` e mesmo arquivo retornam o registro existente (`HTTP 200` ou `201`). Divergências retornam `HTTP 409 Conflict`.

### 3.2 Descarte de Anexo Temporário
- **Método / Rota:** `DELETE /api/v1/tasks/:taskId/chat/attachments/upload/:uploadId`
- **Resposta Sucesso:** `HTTP 204 No Content`
- **Comportamento Frontend:** Solicita confirmação explícita do usuário antes de disparar o descarte. Aborta requisição em andamento via `AbortController` se o upload ainda estiver ativo.

### 3.3 Publicação de Mensagem com Anexos
- **Método / Rota:** `POST /api/v1/tasks/:taskId/chat/messages`
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`
- **Payload:**
  ```json
  {
    "clientMessageId": "uuid-v4",
    "content": "Segue relatório anexo", // Opcional se stagedAttachmentIds estiver presente
    "stagedAttachmentIds": ["upl_uuid1", "upl_uuid2"]
  }
  ```
- **Modalidades Suportadas:**
  1. *Somente texto:* `content` preenchido (mínimo 1 caractere não-espaço), `stagedAttachmentIds` omitido ou vazio.
  2. *Somente anexos:* `content` omitido ou `null`, `stagedAttachmentIds` com 1 a 5 IDs válidos em status `READY`.
  3. *Texto com anexos:* `content` preenchido e `stagedAttachmentIds` presente.
- **Resposta Sucesso:** `HTTP 201 Created` ou `HTTP 202 Accepted` (se houver promoção em background com reconciliação).
- **Idempotência Estrita:** O frontend mantém o `clientMessageId` intacto durante tentativas de retry para o mesmo rascunho. O backend retorna a mensagem existente sem duplicação de linha no MariaDB.

### 3.4 Download Seguro de Anexos
- **Método / Rota:** `GET /api/v1/tasks/:taskId/chat/messages/:messageId/attachments/:attachmentId/download`
- **Headers:** `Authorization: Bearer <token>`
- **Comportamento Frontend:**
  1. O arquivo **NUNCA** é acessado por URL pública ou tags `<a href="/api/...">`.
  2. A requisição é feita via fetch autenticado com streaming de Blob.
  3. O header `Content-Disposition` é inspecionado para extração segura do filename codificado em UTF-8 (`filename*=UTF-8''...`).
  4. Criação de objeto temporário via `URL.createObjectURL(blob)`.
  5. Acionamento do download programático via elemento âncora em memória.
  6. Revogação imediata da URL de objeto via `URL.revokeObjectURL(blobUrl)` no bloco `finally`.
  7. Prevenção de múltiplos cliques concorrentes através de estado de loading com spinner por anexo.

---

## 4. Matriz de Validações Client-Side

| Regra | Limite / Política | Feedback Visual |
| :--- | :--- | :--- |
| Extensões Permitidas | `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.csv`, `.txt`, `.png`, `.jpg`, `.jpeg` | Rejeição imediata antes do upload |
| Extensões Bloqueadas | Executáveis, scripts, arquivos compactados (.exe, .bat, .zip, .rar, etc.) | Notificação de erro vermelha |
| Tamanho por Arquivo | Máximo 10 MB | Bloqueio antes do upload |
| Quota por Mensagem | Máximo 5 arquivos / Máximo 25 MB acumulados | Alerta de estouro de quota |
| Bloqueio do Chat | Conversa bloqueada (`REQUEST_PENDING`, `CYCLE_CLOSED`, `ADMIN_MAINTENANCE`) | Seletor e drag-and-drop desabilitados |
| Participação | Usuário inativo ou não participante | Compositor bloqueado |

---

## 5. Garantias de Idempotência e Resiliência

1. **Congelamento de Intenção (`SendIntent`):**
   Ao acionar o envio (botão Enviar ou atalho `Ctrl+Enter`), o estado da mensagem e os IDs dos anexos prontos são congelados em um objeto imutável. Edições subsequentes no campo de texto não afetam a requisição em trânsito.
2. **Replay Seguro:**
   Se ocorrer falha de rede (ex: timeout transitório), a mensagem é marcada como `FAILED` na interface com um botão explícito de "Tentar novamente". O retry reutiliza rigorosamente o mesmo `clientMessageId` e os mesmos `stagedAttachmentIds`.
3. **Consumo de Anexos:**
   A fila local de anexos só remove os itens quando a resposta HTTP de publicação retorna sucesso (201/202). Em caso de erro, os anexos permanecem na fila para reenvio sem necessidade de novo upload.
