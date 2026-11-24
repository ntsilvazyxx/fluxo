import type {
  ChatConversation,
  ChatMessage,
  ChatMessagesResponse,
  SendMessagePayload,
} from './chat.types.ts';
import type { StagedAttachmentResponse } from './chat-attachment.types.ts';

export class ChatApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ChatApiError';
    this.status = status;
    this.code = code;
  }
}

export type RequestFn = (path: string, options?: RequestInit) => Promise<Response>;

export type UploadFn = (
  path: string,
  form: FormData,
  options?: { headers?: Record<string, string>; onProgress?: (value: number) => void },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Consulta os metadados da conversa do Chat de uma tarefa.
 * GET /api/v1/tasks/:taskId/chat
 */
export async function fetchTaskConversation(
  request: RequestFn,
  taskId: string,
): Promise<ChatConversation> {
  const response = await request(`/tasks/${taskId}/chat`);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const status = response.status;
    const code = body?.error?.code || (
      status === 403 ? 'FORBIDDEN' :
      status === 404 ? (body?.error?.code === 'CHAT_NOT_INITIALIZED' ? 'CHAT_NOT_INITIALIZED' : 'NOT_FOUND') :
      'API_ERROR'
    );
    const message = body?.error?.message || (
      status === 403
        ? 'Acesso negado ao chat desta tarefa.'
        : status === 404
        ? (code === 'CHAT_NOT_INITIALIZED'
            ? 'Conversa ainda não inicializada para esta tarefa.'
            : 'Conversa indisponível para esta tarefa.')
        : 'Erro ao consultar conversa.'
    );
    throw new ChatApiError(status, code, message);
  }

  return body.data as ChatConversation;
}

export interface ListMessagesOptions {
  limit?: number;
  beforeSequence?: number | string | null;
  afterSequence?: number | string | null;
  q?: string;
  status?: 'PUBLISHED' | 'PENDING' | 'FAILED';
}

/**
 * Consulta a lista paginada de mensagens do Chat de uma tarefa.
 * GET /api/v1/tasks/:taskId/chat/messages
 * Alinhado estritamente com listMessagesRouteSchema no backend (Zod .strict()).
 */
export async function fetchTaskMessages(
  request: RequestFn,
  taskId: string,
  options: ListMessagesOptions = {},
): Promise<ChatMessagesResponse> {
  const params = new URLSearchParams();
  if (options.limit !== undefined && options.limit !== null) {
    params.set('limit', String(options.limit));
  }
  if (options.beforeSequence !== undefined && options.beforeSequence !== null) {
    params.set('beforeSequence', String(options.beforeSequence));
  }
  if (options.afterSequence !== undefined && options.afterSequence !== null) {
    params.set('afterSequence', String(options.afterSequence));
  }
  if (options.q && options.q.trim()) {
    params.set('q', options.q.trim());
  }
  if (options.status) {
    params.set('status', options.status);
  }

  const qs = params.toString();
  const url = `/tasks/${taskId}/chat/messages${qs ? `?${qs}` : ''}`;

  const response = await request(url);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const status = response.status;
    const code = body?.error?.code || (status === 403 ? 'FORBIDDEN' : 'API_ERROR');
    const message = body?.error?.message || (
      status === 403
        ? 'Acesso negado às mensagens desta conversa.'
        : 'Não foi possível carregar as mensagens.'
    );
    throw new ChatApiError(status, code, message);
  }

  const items = Array.isArray(body?.data?.items) ? body.data.items : [];
  const pagination = body?.data?.pagination || {
    limit: options.limit ?? 50,
    cursor: null,
    hasMore: false,
    totalCount: items.length,
  };

  return { items, pagination };
}

/**
 * Envia uma mensagem de texto para o Chat de uma tarefa.
 * POST /api/v1/tasks/:taskId/chat/messages
 * Alinhado estritamente com sendMessageRouteSchema no backend (Zod .strict()).
 */
export async function sendTaskMessage(
  request: RequestFn,
  taskId: string,
  payload: SendMessagePayload,
): Promise<ChatMessage> {
  const url = `/tasks/${taskId}/chat/messages`;
  const bodyPayload: { clientMessageId: string; content?: string | null; stagedAttachmentIds?: string[] } = {
    clientMessageId: payload.clientMessageId,
  };
  if (payload.content !== undefined && payload.content !== null) {
    bodyPayload.content = payload.content;
  }
  if (Array.isArray(payload.stagedAttachmentIds) && payload.stagedAttachmentIds.length > 0) {
    bodyPayload.stagedAttachmentIds = payload.stagedAttachmentIds;
  }

  const response = await request(url, {
    method: 'POST',
    body: JSON.stringify(bodyPayload),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const status = response.status;
    const code = body?.error?.code || (
      status === 400 ? 'INVALID_PAYLOAD' :
      status === 403 ? 'FORBIDDEN' :
      status === 404 ? 'CHAT_NOT_FOUND' :
      status === 409 ? 'IDEMPOTENCY_CONFLICT' :
      status === 422 ? 'UNPROCESSABLE_ENTITY' :
      status === 423 ? 'CHAT_LOCKED' :
      'API_ERROR'
    );
    const message = body?.error?.message || (
      status === 400
        ? 'Dados da mensagem inválidos.'
        : status === 403
        ? 'Você não possui autorização funcional para enviar mensagens nesta conversa.'
        : status === 409
        ? 'Conflito de envio detectado. O identificador já foi utilizado com conteúdo diferente.'
        : status === 423
        ? 'O chat desta tarefa está temporariamente bloqueado para envio de mensagens.'
        : 'Erro ao enviar mensagem.'
    );
    throw new ChatApiError(status, code, message);
  }

  return body.data as ChatMessage;
}

/**
 * Envia um arquivo temporário para staging do Chat.
 * POST /api/v1/tasks/:taskId/chat/attachments/staged
 */
export async function stageTaskAttachment(
  upload: UploadFn,
  taskId: string,
  clientUploadId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<StagedAttachmentResponse> {
  const formData = new FormData();
  formData.append('clientUploadId', clientUploadId);
  formData.append('attachment', file);

  const url = `/tasks/${taskId}/chat/attachments/staged`;
  const response = await upload(url, formData, {
    onProgress,
  });

  const body = (await response.json().catch(() => ({}))) as any;

  if (!response.ok) {
    const status = response.status;
    const code = body?.error?.code || (
      status === 400 ? 'INVALID_ATTACHMENT' :
      status === 403 ? 'FORBIDDEN' :
      status === 404 ? 'NOT_FOUND' :
      status === 409 ? 'UPLOAD_IDEMPOTENCY_CONFLICT' :
      status === 413 ? 'CHAT_ATTACHMENT_TOO_LARGE' :
      status === 422 ? 'CHAT_ATTACHMENT_REJECTED' :
      status === 423 ? 'CHAT_LOCKED' :
      status === 429 ? 'CHAT_ATTACHMENT_QUOTA_EXCEEDED' :
      status === 503 ? 'CHAT_ATTACHMENT_SCANNER_UNAVAILABLE' :
      'API_ERROR'
    );
    const message = body?.error?.message || (
      status === 400
        ? 'Dados de upload de anexo inválidos.'
        : status === 403
        ? 'Participação ativa é obrigatória para enviar anexos.'
        : status === 409
        ? 'Conflito de upload: identificador já utilizado com conteúdo diferente.'
        : status === 413
        ? 'O arquivo selecionado excede o limite máximo permitido de 20 MB.'
        : status === 422
        ? 'O arquivo não foi aceito pelas regras de segurança e formato.'
        : status === 423
        ? 'O chat desta tarefa está temporariamente bloqueado para envio de anexos.'
        : status === 429
        ? 'Limite temporário de anexos (quota) excedido. Tente novamente mais tarde.'
        : status === 503
        ? 'Serviço de validação e antivírus de arquivos temporariamente indisponível.'
        : 'Erro ao enviar anexo temporário.'
    );
    throw new ChatApiError(status, code, message);
  }

  return body.data as StagedAttachmentResponse;
}

/**
 * Consulta os metadados oficiais de um anexo em staging.
 * GET /api/v1/tasks/:taskId/chat/attachments/staged/:uploadId
 */
export async function getStagedTaskAttachment(
  request: RequestFn,
  taskId: string,
  uploadId: string,
): Promise<StagedAttachmentResponse> {
  const url = `/tasks/${taskId}/chat/attachments/staged/${uploadId}`;
  const response = await request(url);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const status = response.status;
    const code = body?.error?.code || 'CHAT_ATTACHMENT_UPLOAD_NOT_FOUND';
    const message = body?.error?.message || 'Upload temporário não encontrado.';
    throw new ChatApiError(status, code, message);
  }

  return body.data as StagedAttachmentResponse;
}

/**
 * Cancela/remove um anexo em staging antes da publicação.
 * DELETE /api/v1/tasks/:taskId/chat/attachments/staged/:uploadId
 */
export async function cancelStagedTaskAttachment(
  request: RequestFn,
  taskId: string,
  uploadId: string,
): Promise<{ id: string; status: 'EXPIRED' }> {
  const url = `/tasks/${taskId}/chat/attachments/staged/${uploadId}`;
  const response = await request(url, {
    method: 'DELETE',
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const status = response.status;
    const code = body?.error?.code || 'CHAT_ATTACHMENT_CANCEL_FAILED';
    const message = body?.error?.message || 'Falha ao remover upload temporário.';
    throw new ChatApiError(status, code, message);
  }

  return body.data as { id: string; status: 'EXPIRED' };
}

/**
 * Realiza o download autenticado e seguro de um anexo publicado.
 * GET /api/v1/tasks/:taskId/chat/messages/:messageId/attachments/:attachmentId/download
 */
export async function downloadTaskAttachment(
  request: RequestFn,
  taskId: string,
  messageId: string,
  attachmentId: string,
  fallbackFilename: string = 'anexo',
): Promise<void> {
  const url = `/tasks/${taskId}/chat/messages/${messageId}/attachments/${attachmentId}/download`;
  const response = await request(url);

  if (!response.ok) {
    const status = response.status;
    const body = (await response.json().catch(() => ({}))) as any;
    const code =
      body?.error?.code ||
      (status === 401
        ? 'UNAUTHORIZED'
        : status === 403
        ? 'FORBIDDEN'
        : status === 404
        ? 'CHAT_ATTACHMENT_NOT_FOUND'
        : status === 503
        ? 'CHAT_STORAGE_UNAVAILABLE'
        : 'DOWNLOAD_FAILED');
    const message =
      body?.error?.message ||
      (status === 401
        ? 'Sessão expirada. Faça login novamente.'
        : status === 403
        ? 'Você não possui autorização para baixar este anexo.'
        : status === 404
        ? 'Anexo não encontrado ou inacessível.'
        : status === 503
        ? 'Armazenamento de arquivos temporariamente indisponível.'
        : 'Erro ao realizar download do anexo.');
    throw new ChatApiError(status, code, message);
  }

  // Extrai nome de arquivo do Content-Disposition se fornecido pelo backend
  let filename = fallbackFilename;
  const disposition = response.headers?.get?.('content-disposition');
  if (disposition) {
    const matchUtf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (matchUtf8?.[1]) {
      try {
        filename = decodeURIComponent(matchUtf8[1]);
      } catch {
        // fallback
      }
    } else {
      const matchStandard = disposition.match(/filename="?([^";]+)"?/i);
      if (matchStandard?.[1]) {
        filename = matchStandard[1];
      }
    }
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);

  try {
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // Revoga a URL temporária do Blob após o disparo seguro
    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 1500);
  }
}


