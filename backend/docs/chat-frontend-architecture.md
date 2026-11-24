# Arquitetura e Contratos do Frontend do Chat — SEAF (Fase 5.1.7)

Este documento descreve a arquitetura técnica, os contratos de integração, o fluxo de ciclo de vida de dados e os mecanismos de segurança implementados no frontend do módulo de Chat do **SEAF — Sistema de Gestão e Acompanhamento de Tarefas**, em estrita conformidade com os contratos homologados no backend (`chat-attachments-api-contract.md` e `chat.schemas.js`).

---

## 1. Visão Geral da Arquitetura

O frontend do Chat está localizado no pacote `frontend/src/tasks/chat` e integrado com a página de Kanban (`KanbanPage.tsx`) e o modal de detalhes de tarefa (`TaskDetailModal.tsx`).

### Árvore de Componentes

```
TaskDetailModal (ou KanbanPage)
└── TaskChatPanel
    ├── ChatHeader / StatusIndicator (indicador de bloqueio, participantes, metadados, botão de atualização manual)
    ├── ChatMessageList
    │   └── ChatMessageItem (renderização de mensagens, avatares, status PENDING / PUBLISHED / FAILED)
    │       └── ChatAttachmentMeta (chips com ícones MIME, tamanho formatado e botão de download autenticado)
    ├── ChatAttachmentQueue (fila de pré-visualização, progresso de upload, validações e descarte seguro)
    └── ChatComposer (composição textual, botão de anexo, drag-and-drop overlay, atalho Ctrl+Enter, reenvio)
```

---

## 2. Hooks Especializados e Separação de Responsabilidades

| Hook | Responsabilidade |
| :--- | :--- |
| `useTaskChat(taskId, enabled)` | Carrega e sincroniza o histórico de mensagens via ordenação monotônica por `sequenceNumber` (BigInt), gerencia metadados da conversa, participantes ativos e atualização incremental (`afterSequence` e `beforeSequence`). |
| `useChatMessageSender(options)` | Gerencia o congelamento de intenção (`SendIntent`), geração de `clientMessageId` (UUID v4), suporte a retry idempotente sem duplicação e publicação de mensagens de texto e/ou anexos. |
| `useChatAttachments(taskId, options)` | Gerencia a seleção de arquivos, validação client-side (tamanho individual de 20 MiB, formatos homologados, limite de 5 anexos e quota agregada por mensagem de 50 MiB), uploads temporários em staging com `AbortController`, e descarte controlado com confirmação. |

---

## 3. Contratos de API Integrados

### 3.1 Consulta Paginada de Mensagens
- **Método / Rota:** `GET /api/v1/tasks/:taskId/chat/messages`
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters Aceitos (Zod `.strict()`):**
  - `limit`: Número inteiro (1 a 100, padrão: 50).
  - `beforeSequence`: Número de sequência para paginação histórica (mensagens anteriores).
  - `afterSequence`: Número de sequência para sincronização incremental (novas mensagens).
  - `q`: Termo para pesquisa textual (opcional, 1 a 255 caracteres).
  - `status`: Enum `PUBLISHED`, `PENDING` ou `FAILED` (padrão: `PUBLISHED`).
- **Resposta Sucesso (`HTTP 200 OK`):**
  ```json
  {
    "data": {
      "items": [
        {
          "id": "uuid-msg",
          "conversationId": "uuid-conv",
          "sequenceNumber": 1,
          "content": "Texto da mensagem",
          "status": "PUBLISHED",
          "createdAt": "2026-11-24T12:00:00.000Z",
          "author": { "id": "uuid-user", "name": "Nome", "role": "TECHNICIAN" },
          "attachments": [
            {
              "id": "uuid-att",
              "originalName": "documento.pdf",
              "mimeType": "application/pdf",
              "fileSize": 1048576,
              "downloadUrl": "/api/v1/tasks/task-id/chat/messages/msg-id/attachments/att-id/download"
            }
          ]
        }
      ],
      "pagination": {
        "limit": 50,
        "cursor": null,
        "hasMore": false,
        "totalCount": 1
      }
    }
  }
  ```
  *(Nota técnica: O campo `cursor` é retornado na estrutura de metadados da resposta do backend para fins informativos; os parâmetros de entrada aceitos pelo backend para paginação são estritamente `beforeSequence` e `afterSequence`)*.

### 3.2 Upload Temporário (Staging)
- **Método / Rota:** `POST /api/v1/tasks/:taskId/chat/attachments/staged`
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`
- **Campos Multipart do Formulário:**
  - `attachment`: Arquivo binário a ser enviado (campo oficial do contrato).
  - `clientUploadId`: UUID v4 gerado pelo frontend (para idempotência).
- **Resposta Sucesso (`HTTP 201 Created`):**
  ```json
  {
    "data": {
      "id": "upl_uuid",
      "clientUploadId": "uuid-v4",
      "originalName": "relatorio.pdf",
      "mimeType": "application/pdf",
      "fileSize": 1048576,
      "status": "READY",
      "expiresAt": "2026-11-25T14:00:00.000Z"
    }
  }
  ```
- **Idempotência:** Reenvios com o mesmo `clientUploadId` e mesmo arquivo retornam o registro existente (`HTTP 200` ou `HTTP 201`). Divergências retornam `HTTP 409 Conflict`.

### 3.3 Cancelamento / Descarte de Anexo em Staging
- **Método / Rota:** `DELETE /api/v1/tasks/:taskId/chat/attachments/staged/:uploadId`
- **Headers:** `Authorization: Bearer <token>`
- **Resposta Sucesso (`HTTP 200 OK`):**
  ```json
  {
    "data": {
      "id": "upl_uuid",
      "status": "EXPIRED"
    }
  }
  ```
- **Comportamento Frontend:** Solicita confirmação explícita do usuário antes de disparar o descarte. Aborta requisição em andamento via `AbortController` se o upload ainda estiver ativo.

### 3.4 Publicação de Mensagem com Anexos
- **Método / Rota:** `POST /api/v1/tasks/:taskId/chat/messages`
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`
- **Payload:**
  ```json
  {
    "clientMessageId": "uuid-v4",
    "content": "Segue relatório anexo",
    "stagedAttachmentIds": ["upl_uuid1", "upl_uuid2"]
  }
  ```
- **Modalidades Homologadas:**
  1. *Somente texto:* `content` preenchido (mínimo 1 caractere não-espaço), `stagedAttachmentIds` omitido ou vazio.
  2. *Somente anexos:* `content` omitido ou `null`, `stagedAttachmentIds` com 1 a 5 IDs válidos em status `READY`.
  3. *Texto com anexos:* `content` preenchido e `stagedAttachmentIds` presente.
- **Respostas de Sucesso:**
  - `HTTP 201 Created`: Publicação imediata concluída com `status: "PUBLISHED"`.
  - `HTTP 202 Accepted`: Publicação aceita para processamento assíncrono de promoção com `status: "PENDING"`.
- **Tratamento de Estados Visuais:**
  - `PUBLISHED`: Mensagem confirmada com botões de download habilitados.
  - `PENDING`: Indicador de relógio com mensagem *"Processando publicação…"*, com botões de download temporariamente inativos até a promoção definitiva.
  - `FAILED`: Indicador de erro com alerta visual *"Falha no envio da mensagem"*.
- **Idempotência Estrita:** O frontend preserva o mesmo `clientMessageId` (UUID v4) durante tentativas de retry para o mesmo rascunho. O backend reconhece a chave e retorna a mensagem existente sem duplicação de linha no MariaDB.

### 3.5 Download Seguro de Anexos
- **Método / Rota:** `GET /api/v1/tasks/:taskId/chat/messages/:messageId/attachments/:attachmentId/download`
- **Headers:** `Authorization: Bearer <token>`
- **Comportamento do Frontend:**
  1. O arquivo **NUNCA** é exposto via URL pública ou links diretos `<a href="/api/...">`.
  2. A requisição é disparada com credenciais via cliente autenticado (`request`).
  3. O backend realiza streaming seguro do arquivo a partir do storage privado (`createReadStream.pipe(res)`).
  4. O frontend recebe a resposta como `Blob` em memória e extrai o nome sanitizado a partir do header `Content-Disposition` (respeitando RFC 5987 / UTF-8 `filename*=UTF-8''...`).
  5. Criação de URL de objeto temporária via `window.URL.createObjectURL(blob)`.
  6. Disparo do download nativo via elemento âncora programático.
  7. Revogação diferida da URL de objeto via `setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1500)` para compatibilidade total com o gerenciador de downloads do navegador.
  8. Prevenção de múltiplos cliques concorrentes através de estado de loading com spinner por anexo (`downloadingId`).

---

## 4. Matriz de Validações e Limites Canônicos

| Parâmetro | Limite Oficial | Comportamento no Frontend | Código Backend |
| :--- | :--- | :--- | :--- |
| **Extensões Permitidas** | `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`, `.docx`, `.xlsx`, `.txt` | Bloqueio imediato na seleção com feedback | `422 CHAT_ATTACHMENT_EXTENSION_NOT_ALLOWED` |
| **Formatos Proibidos** | `.svg`, `.gif`, `.csv`, `.pptx`, executáveis (`.exe`), scripts, ZIPs | Rejeição imediata antes do envio | `422 CHAT_ATTACHMENT_EXTENSION_NOT_ALLOWED` |
| **Tamanho por Arquivo** | 20 MiB (20.971.520 bytes) | Bloqueio antes do upload | `413 / 422 CHAT_ATTACHMENT_TOO_LARGE` |
| **Quantidade por Mensagem** | Máximo de 5 arquivos | Fila rejeita excedentes | `422 CHAT_ATTACHMENT_LIMIT_EXCEEDED` |
| **Quota Agregada por Mensagem** | 50 MiB (52.428.800 bytes) | Bloqueio acumulado com alerta visual | `422 CHAT_ATTACHMENT_MESSAGE_TOO_LARGE` |
| **Quota Staging (Usuário)** | 100 MiB (104.857.600 bytes) | Notificação em caso de erro 429 | `429 CHAT_ATTACHMENT_QUOTA_EXCEEDED` |
| **Quota Staging (Conversa)** | 250 MiB (262.144.000 bytes) | Notificação em caso de erro 429 | `429 CHAT_ATTACHMENT_QUOTA_EXCEEDED` |
| **Bloqueios do Chat** | `REQUEST_PENDING`, `CYCLE_CLOSED`, `ADMIN_MAINTENANCE` | Compositor e uploads desabilitados | `423 CHAT_LOCKED` |

---

## 5. Garantias de Idempotência e Resiliência

1. **UUID v4 Criptográfico:** `clientMessageId` e `clientUploadId` utilizam `crypto.randomUUID()`. A ordenação monotônica é de responsabilidade exclusiva do `sequenceNumber` gerado pelo MariaDB.
2. **Congelamento de Intenção (`SendIntent`):** Ao submeter o envio, a intenção com os dados e stagedAttachmentIds é congelada. Edições no formulário não afetam requisições em trânsito.
3. **Consumo de Anexos em Sucesso:** A fila local de anexos descarrega os uploads apenas após a confirmação HTTP (201 ou 202). Em caso de erro, os anexos permanecem na fila para reenvio sem necessidade de novo upload.
