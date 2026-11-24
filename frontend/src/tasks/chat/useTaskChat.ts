import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext.tsx';
import { ChatApiError, fetchTaskConversation, fetchTaskMessages } from './chat.api.ts';
import type {
  ChatConversation,
  ChatMessage,
  ChatMessagesPagination,
  PendingChatMessage,
} from './chat.types.ts';

export interface UseTaskChatResult {
  conversation: ChatConversation | null;
  messages: ChatMessage[];
  pendingMessage: PendingChatMessage | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  forbidden: boolean;
  chatNotInitialized: boolean;
  hasMore: boolean;
  totalCount: number;
  isLocked: boolean;
  lockReason: string | null;
  canSendMessage: boolean;
  isParticipantActive: boolean;
  setPendingMessage: (msg: PendingChatMessage | null) => void;
  onMessageSent: (msg: ChatMessage) => void;
  syncNewMessages: () => Promise<void>;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Ordena mensagens crescentemente pelo sequenceNumber oficial do backend.
 */
function sortMessagesBySequence(items: ChatMessage[]): ChatMessage[] {
  return [...items].sort((a, b) => {
    try {
      const seqA = BigInt(a.sequenceNumber ?? 0);
      const seqB = BigInt(b.sequenceNumber ?? 0);
      if (seqA < seqB) return -1;
      if (seqA > seqB) return 1;
      return 0;
    } catch {
      return (Number(a.sequenceNumber) || 0) - (Number(b.sequenceNumber) || 0);
    }
  });
}

/**
 * Mescla duas listas de mensagens deduplicando por ID e clientMessageId.
 */
function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const result = new Map<string, ChatMessage>();
  const clientToId = new Map<string, string>();

  const add = (m: ChatMessage) => {
    const key = m.id || m.clientMessageId || 'tmp';
    if (m.clientMessageId && clientToId.has(m.clientMessageId)) {
      const prevKey = clientToId.get(m.clientMessageId)!;
      if (prevKey !== key) {
        result.delete(prevKey);
      }
    }
    result.set(key, m);
    if (m.clientMessageId) {
      clientToId.set(m.clientMessageId, key);
    }
  };

  for (const m of existing) add(m);
  for (const m of incoming) add(m);

  return sortMessagesBySequence(Array.from(result.values()));
}

export function useTaskChat(taskId: string, enabled = true): UseTaskChatResult {
  const { user, request } = useAuth();
  const currentUserId = user?.id;

  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingMessage, setPendingMessage] = useState<PendingChatMessage | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(enabled && taskId));
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState<boolean>(false);
  const [chatNotInitialized, setChatNotInitialized] = useState<boolean>(false);
  const [pagination, setPagination] = useState<ChatMessagesPagination>({
    limit: 50,
    cursor: null,
    hasMore: false,
    totalCount: 0,
  });

  // Identificador da requisição em trânsito para cancelamento defensivo
  const sequenceRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Limpeza de estado atômica (usada em logout, troca de tarefa ou perda de autorização)
  const wipeState = useCallback(() => {
    sequenceRef.current++;
    setConversation(null);
    setMessages([]);
    setPendingMessage(null);
    setPagination({ limit: 50, cursor: null, hasMore: false, totalCount: 0 });
    setLoading(false);
    setLoadingMore(false);
    setError(null);
    setForbidden(false);
    setChatNotInitialized(false);
  }, []);

  const loadInitial = useCallback(async () => {
    if (!taskId || !enabled || !currentUserId) {
      wipeState();
      return;
    }

    const currentSeq = ++sequenceRef.current;
    setLoading(true);
    setError(null);
    setForbidden(false);
    setChatNotInitialized(false);

    try {
      // 1. Consulta metadados da conversa
      const conv = await fetchTaskConversation(request, taskId);
      if (sequenceRef.current !== currentSeq) return;
      setConversation(conv);

      // 2. Consulta página inicial de mensagens (limit 50)
      const msgsResponse = await fetchTaskMessages(request, taskId, { limit: 50 });
      if (sequenceRef.current !== currentSeq) return;

      setMessages((prev) => {
        // Preserva mensagens locais PENDING ainda não reconciliadas pelo backend
        const pendingToKeep = prev.filter(
          (m) =>
            m.status === 'PENDING' &&
            !msgsResponse.items.some(
              (pub) => pub.id === m.id || (m.clientMessageId && pub.clientMessageId === m.clientMessageId),
            ),
        );
        return sortMessagesBySequence([...msgsResponse.items, ...pendingToKeep]);
      });
      setPagination(msgsResponse.pagination);
    } catch (err) {
      if (sequenceRef.current !== currentSeq) return;

      if (err instanceof ChatApiError) {
        if (err.status === 403) {
          setForbidden(true);
          setMessages([]);
          setConversation(null);
          setError('Acesso restrito. Você não possui autorização para acessar o chat desta tarefa.');
        } else if (err.status === 401) {
          setMessages([]);
          setConversation(null);
          setError('Sessão expirada. Faça login novamente.');
        } else if (err.status === 404) {
          if (err.code === 'CHAT_NOT_INITIALIZED') {
            setChatNotInitialized(true);
            setError('Chat não inicializado ou indisponível para esta tarefa.');
          } else {
            setChatNotInitialized(false);
            setError('Conversa indisponível para esta tarefa.');
          }
          setMessages([]);
          setConversation(null);
        } else {
          setError(err.message || 'Erro ao carregar o chat da tarefa.');
        }
      } else {
        const msg = err instanceof Error ? err.message : 'Falha na comunicação com o servidor.';
        setError(msg);
      }
    } finally {
      if (sequenceRef.current === currentSeq) {
        setLoading(false);
      }
    }
  }, [taskId, enabled, currentUserId, request, wipeState]);

  // Efeito disparado na montagem ou alteração de taskId, enabled ou currentUserId
  useEffect(() => {
    void loadInitial();
    return () => {
      sequenceRef.current++;
    };
  }, [loadInitial]);

  // Sincronização incremental com afterSequence
  const syncNewMessages = useCallback(async () => {
    if (!taskId || !enabled || !currentUserId) return;
    const currentSeq = sequenceRef.current;

    let maxSeq: string | null = null;
    for (const m of messagesRef.current) {
      if (m.sequenceNumber !== undefined && m.sequenceNumber !== null) {
        try {
          const curr = BigInt(m.sequenceNumber);
          if (maxSeq === null || curr > BigInt(maxSeq)) {
            maxSeq = curr.toString();
          }
        } catch {
          // fallback
        }
      }
    }

    if (maxSeq === null) return;

    try {
      const response = await fetchTaskMessages(request, taskId, {
        afterSequence: maxSeq,
        limit: 50,
      });
      if (sequenceRef.current !== currentSeq) return;

      if (response.items.length > 0) {
        setMessages((prev) => mergeMessages(prev, response.items));
      }
    } catch {
      // Sincronização incremental secundária
    }
  }, [taskId, enabled, currentUserId, request]);

  // Inserção e reconciliação imediata de mensagem enviada com sucesso
  const onMessageSent = useCallback((newMessage: ChatMessage) => {
    setMessages((prev) => mergeMessages(prev, [newMessage]));
    setPendingMessage((prev) => (prev?.clientMessageId === newMessage.clientMessageId ? null : prev));
    void syncNewMessages();
  }, [syncNewMessages]);

  // Carregamento de mensagens anteriores (retroativo com beforeSequence)
  const loadMore = useCallback(async () => {
    if (!taskId || !enabled || !currentUserId || loadingMore || !pagination.hasMore) {
      return;
    }

    const oldestMessage = messages[0];
    if (!oldestMessage || oldestMessage.sequenceNumber === undefined) {
      return;
    }

    const currentSeq = ++sequenceRef.current;
    setLoadingMore(true);

    try {
      const older = await fetchTaskMessages(request, taskId, {
        limit: 50,
        beforeSequence: oldestMessage.sequenceNumber,
      });

      if (sequenceRef.current !== currentSeq) return;

      setMessages((prev) => mergeMessages(older.items, prev));
      setPagination(older.pagination);
    } catch (err) {
      if (sequenceRef.current !== currentSeq) return;

      if (err instanceof ChatApiError && (err.status === 403 || err.status === 401)) {
        setMessages([]);
        setConversation(null);
        setForbidden(err.status === 403);
        setError(err.message);
      } else {
        const msg = err instanceof Error ? err.message : 'Falha ao carregar mensagens anteriores.';
        setError(msg);
      }
    } finally {
      if (sequenceRef.current === currentSeq) {
        setLoadingMore(false);
      }
    }
  }, [taskId, enabled, currentUserId, loadingMore, pagination.hasMore, messages, request]);

  const isLocked = Boolean(conversation?.lockState?.isLocked);
  const lockReason = conversation?.lockState?.reason ?? null;
  const isParticipantActive = Boolean(conversation?.myParticipation?.isActive);
  const canSendMessage = Boolean(!isLocked && isParticipantActive);

  return {
    conversation,
    messages,
    pendingMessage,
    loading,
    loadingMore,
    error,
    forbidden,
    chatNotInitialized,
    hasMore: pagination.hasMore,
    totalCount: pagination.totalCount,
    isLocked,
    lockReason,
    canSendMessage,
    isParticipantActive,
    setPendingMessage,
    onMessageSent,
    syncNewMessages,
    loadMore,
    refetch: loadInitial,
  };
}
