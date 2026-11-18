import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCommentService } from '../../src/modules/comments/comment.service.js';

describe('chat de comentários e atividades (TaskComment)', () => {
  const makeMockPrisma = () => {
    const tasks = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        teamId: 'team-alpha',
        deletedAt: null,
        currentCycle: {
          id: 'cycle-1',
          status: 'IN_PROGRESS',
          closedAt: null,
          version: 1,
          assignments: [{ userId: 'tech-1', endedAt: null }],
        },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        teamId: 'team-beta',
        deletedAt: null,
        currentCycle: {
          id: 'cycle-2',
          status: 'COMPLETED',
          closedAt: new Date('2026-11-15T12:00:00Z'),
          version: 2,
          assignments: [{ userId: 'tech-2', endedAt: new Date('2026-11-15T12:00:00Z'), endReason: 'COMPLETED' }],
        },
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        teamId: 'team-alpha',
        deletedAt: null,
        currentCycle: {
          id: 'cycle-3',
          status: 'CANCELLED',
          closedAt: new Date('2026-11-14T10:00:00Z'),
          version: 1,
          assignments: [{ userId: 'tech-1', endedAt: new Date('2026-11-14T10:00:00Z'), endReason: 'CANCELLED' }],
        },
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        teamId: 'team-gamma',
        deletedAt: new Date(),
        currentCycle: {
          id: 'cycle-4',
          status: 'IN_PROGRESS',
          closedAt: null,
          version: 1,
          assignments: [{ userId: 'tech-1', endedAt: null }],
        },
      },
    ];

    const users = {
      'admin-1': { id: 'admin-1', name: 'Administrador Master', role: { code: 'ADMIN_MASTER', label: 'Admin Master' } },
      'sec-1': { id: 'sec-1', name: 'Secretário Executivo', role: { code: 'SECRETARY', label: 'Secretário' } },
      'mgr-alpha': { id: 'mgr-alpha', name: 'Gestor Alpha', role: { code: 'MANAGER', label: 'Gestor' } },
      'mgr-beta': { id: 'mgr-beta', name: 'Gestor Beta', role: { code: 'MANAGER', label: 'Gestor' } },
      'tech-1': { id: 'tech-1', name: 'Técnico Um', role: { code: 'TECHNICIAN', label: 'Técnico' } },
      'tech-2': { id: 'tech-2', name: 'Técnico Dois', role: { code: 'TECHNICIAN', label: 'Técnico' } },
    };

    let comments = [
      {
        id: 'comm-1',
        taskId: '11111111-1111-4111-8111-111111111111',
        authorId: 'mgr-alpha',
        content: 'Primeiro comentário inicial.',
        clientMessageId: 'msg-init-1',
        createdAt: new Date('2026-11-14T09:00:00Z'),
        updatedAt: new Date('2026-11-14T09:00:00Z'),
      },
      {
        id: 'comm-2',
        taskId: '11111111-1111-4111-8111-111111111111',
        authorId: 'tech-1',
        content: 'Resposta do técnico no chat.',
        clientMessageId: 'msg-init-2',
        createdAt: new Date('2026-11-14T10:00:00Z'),
        updatedAt: new Date('2026-11-14T10:00:00Z'),
      },
      {
        id: 'comm-3',
        taskId: '22222222-2222-4222-8222-222222222222',
        authorId: 'mgr-beta',
        content: 'Comentário em tarefa completada.',
        clientMessageId: null,
        createdAt: new Date('2026-11-15T09:00:00Z'),
        updatedAt: new Date('2026-11-15T09:00:00Z'),
      },
    ];

    return {
      task: {
        async findFirst({ where }) {
          return tasks.find((t) => {
            if (t.deletedAt) return false;
            if (where.id && t.id !== where.id) return false;

            // Escopo de equipes e papéis
            if (where.team?.managers?.some) {
              const cond = where.team.managers.some;
              if (cond.userId === 'mgr-alpha' && t.teamId !== 'team-alpha') return false;
              if (cond.userId === 'mgr-beta' && t.teamId !== 'team-beta') return false;
            }

            if (where.currentCycle?.assignments?.some) {
              const cond = where.currentCycle.assignments.some;
              const hasAssignment = t.currentCycle.assignments.some((a) => {
                if (a.userId !== cond.userId) return false;
                if (cond.OR) {
                  return cond.OR.some((clause) => {
                    if (clause.endedAt === null) return a.endedAt === null;
                    if (clause.endReason) return a.endReason === clause.endReason;
                    return false;
                  });
                }
                return true;
              });
              if (!hasAssignment) return false;
            }

            return true;
          }) || null;
        },
      },
      taskComment: {
        async findMany({ where }) {
          const matched = comments.filter((c) => c.taskId === where.taskId);
          return matched.map((c) => ({
            ...c,
            author: users[c.authorId] || { id: c.authorId, name: 'Usuário', role: null },
          }));
        },
        async findUnique({ where }) {
          if (where.clientMessageId) {
            const found = comments.find((c) => c.clientMessageId === where.clientMessageId);
            if (!found) return null;
            return {
              ...found,
              author: users[found.authorId] || { id: found.authorId, name: 'Usuário', role: null },
            };
          }
          return null;
        },
        async findFirst({ where }) {
          const found = comments.find((c) => {
            if (c.taskId !== where.taskId) return false;
            if (c.authorId !== where.authorId) return false;
            if (c.content !== where.content) return false;
            if (where.createdAt?.gte && c.createdAt < where.createdAt.gte) return false;
            return true;
          });
          if (!found) return null;
          return {
            ...found,
            author: users[found.authorId] || { id: found.authorId, name: 'Usuário', role: null },
          };
        },
        async create({ data }) {
          const item = {
            id: data.id,
            taskId: data.taskId,
            authorId: data.authorId,
            content: data.content,
            clientMessageId: data.clientMessageId || null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          comments.push(item);
          return {
            ...item,
            author: users[item.authorId] || { id: item.authorId, name: 'Usuário', role: null },
          };
        },
      },
    };
  };

  it('1. lista comentários persistidos de uma tarefa na ordem cronológica', async () => {
    const prisma = makeMockPrisma();
    const service = createCommentService({ prisma });
    const actor = { userId: 'mgr-alpha', roleCode: 'MANAGER' };

    const result = await service.list(actor, '11111111-1111-4111-8111-111111111111');
    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'comm-1');
    assert.equal(result[0].content, 'Primeiro comentário inicial.');
    assert.equal(result[0].author.name, 'Gestor Alpha');
    assert.equal(result[1].id, 'comm-2');
    assert.equal(result[1].author.name, 'Técnico Um');
  });

  it('2. cria comentário válido vinculado à tarefa e ao autor autenticado', async () => {
    const prisma = makeMockPrisma();
    const service = createCommentService({ prisma });
    const request = { auth: { userId: 'tech-1', roleCode: 'TECHNICIAN' } };

    const comment = await service.create(request, '11111111-1111-4111-8111-111111111111', {
      content: 'Mensagem de atualização com quebra de linha:\nLinha 2 de teste.',
      clientMessageId: 'msg-unique-123',
    });

    assert.ok(comment.id);
    assert.equal(comment.content, 'Mensagem de atualização com quebra de linha:\nLinha 2 de teste.');
    assert.equal(comment.author.id, 'tech-1');
    assert.equal(comment.author.name, 'Técnico Um');
    assert.equal(comment.clientMessageId, 'msg-unique-123');

    // Confirma que agora a lista contém 3 comentários
    const list = await service.list({ userId: 'tech-1', roleCode: 'TECHNICIAN' }, '11111111-1111-4111-8111-111111111111');
    assert.equal(list.length, 3);
  });

  it('3. impede acesso e criação de comentário em tarefa fora do escopo de equipe (404)', async () => {
    const prisma = makeMockPrisma();
    const service = createCommentService({ prisma });
    // Gestor Beta não gerencia team-alpha (tarefa 1)
    const actorBeta = { userId: 'mgr-beta', roleCode: 'MANAGER' };

    await assert.rejects(
      async () => service.list(actorBeta, '11111111-1111-4111-8111-111111111111'),
      (err) => err.status === 404 && err.code === 'TASK_NOT_FOUND',
    );

    await assert.rejects(
      async () => service.create({ auth: actorBeta }, '11111111-1111-4111-8111-111111111111', { content: 'Tentativa indevida' }),
      (err) => err.status === 404 && err.code === 'TASK_NOT_FOUND',
    );
  });

  it('4. impede criação de novos comentários em tarefas concluídas (409 TASK_CYCLE_CLOSED), mas permite leitura', async () => {
    const prisma = makeMockPrisma();
    const service = createCommentService({ prisma });
    const actorBeta = { userId: 'mgr-beta', roleCode: 'MANAGER' };

    // Leitura é permitida
    const comments = await service.list(actorBeta, '22222222-2222-4222-8222-222222222222');
    assert.equal(comments.length, 1);
    assert.equal(comments[0].content, 'Comentário em tarefa completada.');

    // Envio de novo comentário é bloqueado
    await assert.rejects(
      async () => service.create({ auth: actorBeta }, '22222222-2222-4222-8222-222222222222', {
        content: 'Tentando comentar em tarefa fechada',
      }),
      (err) => err.status === 409 && err.code === 'TASK_CYCLE_CLOSED',
    );
  });

  it('5. impede criação de novos comentários em tarefas canceladas (409 TASK_CYCLE_CLOSED)', async () => {
    const prisma = makeMockPrisma();
    const service = createCommentService({ prisma });
    const actorAlpha = { userId: 'mgr-alpha', roleCode: 'MANAGER' };

    await assert.rejects(
      async () => service.create({ auth: actorAlpha }, '33333333-3333-4333-8333-333333333333', {
        content: 'Tentando comentar em tarefa cancelada',
      }),
      (err) => err.status === 409 && err.code === 'TASK_CYCLE_CLOSED',
    );
  });

  it('6. previne comentários duplicados por clientMessageId (idempotência)', async () => {
    const prisma = makeMockPrisma();
    const service = createCommentService({ prisma });
    const request = { auth: { userId: 'tech-1', roleCode: 'TECHNICIAN' } };

    const first = await service.create(request, '11111111-1111-4111-8111-111111111111', {
      content: 'Mensagem com retentativa',
      clientMessageId: 'idempotent-key-456',
    });

    // Segunda tentativa (ex: timeout de rede ou retry do cliente)
    const second = await service.create(request, '11111111-1111-4111-8111-111111111111', {
      content: 'Mensagem com retentativa',
      clientMessageId: 'idempotent-key-456',
    });

    assert.equal(first.id, second.id);
    assert.equal(first.content, second.content);

    // Garante que não foi inserido duas vezes
    const list = await service.list({ userId: 'tech-1', roleCode: 'TECHNICIAN' }, '11111111-1111-4111-8111-111111111111');
    const matched = list.filter((c) => c.clientMessageId === 'idempotent-key-456');
    assert.equal(matched.length, 1);
  });

  it('7. previne duplicação acidental imediata de conteúdo idêntico pelo mesmo usuário', async () => {
    const prisma = makeMockPrisma();
    const service = createCommentService({ prisma });
    const request = { auth: { userId: 'tech-1', roleCode: 'TECHNICIAN' } };

    const first = await service.create(request, '11111111-1111-4111-8111-111111111111', {
      content: 'Conteúdo repetido rapidamente',
    });

    const second = await service.create(request, '11111111-1111-4111-8111-111111111111', {
      content: 'Conteúdo repetido rapidamente',
    });

    assert.equal(first.id, second.id);
  });

  it('8. valida schemas Zod de listagem e criação de comentários com suporte a safeParse', async () => {
    const { listCommentsSchema, createCommentSchema } = await import(
      '../../src/modules/comments/comment.schemas.js'
    );

    // Validação de listagem
    assert.equal(typeof listCommentsSchema.safeParse, 'function');
    const validList = listCommentsSchema.safeParse({
      params: { id: '11111111-1111-4111-8111-111111111111' },
      query: {},
      body: {},
    });
    assert.equal(validList.success, true);

    const invalidList = listCommentsSchema.safeParse({
      params: { id: 'not-a-uuid' },
      query: {},
      body: {},
    });
    assert.equal(invalidList.success, false);

    // Validação de criação
    assert.equal(typeof createCommentSchema.safeParse, 'function');
    const validCreate = createCommentSchema.safeParse({
      params: { id: '11111111-1111-4111-8111-111111111111' },
      query: {},
      body: {
        content: 'Comentário válido',
        clientMessageId: 'msg-valid-123',
      },
    });
    assert.equal(validCreate.success, true);

    // Rejeita conteúdo vazio
    const emptyCreate = createCommentSchema.safeParse({
      params: { id: '11111111-1111-4111-8111-111111111111' },
      query: {},
      body: { content: '   ' },
    });
    assert.equal(emptyCreate.success, false);

    // Rejeita conteúdo maior que 2000 caracteres
    const tooLong = createCommentSchema.safeParse({
      params: { id: '11111111-1111-4111-8111-111111111111' },
      query: {},
      body: { content: 'a'.repeat(2001) },
    });
    assert.equal(tooLong.success, false);
  });
});


