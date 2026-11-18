import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createTaskSchema,
  updateTaskSchema,
} from '../../src/modules/tasks/task.schemas.js';
import { presentTask } from '../../src/modules/tasks/task.presenter.js';

describe('vínculo com processos SIGADOC', () => {
  describe('validação de schema Zod (createTaskSchema)', () => {
    const validBase = {
      teamId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      title: 'Tarefa com SIGADOC',
      description: 'Descrição completa da tarefa',
      priority: 'NORMAL',
      acceptanceDurationMinutes: 120,
      executionDurationMinutes: 1440,
      initialAttachmentIds: [],
    };

    const parseCreate = (body) =>
      createTaskSchema.safeParse({ body, params: {}, query: {} });

    it('1. permite criar tarefa sem vínculo SIGADOC (campos omitidos)', () => {
      const parsed = parseCreate(validBase);
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.body.sigadocProcessNumber, undefined);
      assert.equal(parsed.data.body.sigadocProcessLink, undefined);
    });

    it('2. permite criar tarefa com número e link válidos', () => {
      const parsed = parseCreate({
        ...validBase,
        sigadocProcessNumber: '123456/2026',
        sigadocProcessLink: 'https://sigadoc.mt.gov.br/processo/123456',
      });
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.body.sigadocProcessNumber, '123456/2026');
      assert.equal(parsed.data.body.sigadocProcessLink, 'https://sigadoc.mt.gov.br/processo/123456');
    });

    it('3. rejeita vínculo incompleto: número informado sem link', () => {
      const parsed = parseCreate({
        ...validBase,
        sigadocProcessNumber: '123456/2026',
      });
      assert.equal(parsed.success, false);
      assert.ok(parsed.error.issues.some((i) => i.path.includes('sigadocProcessLink')));
    });

    it('4. rejeita vínculo incompleto: link informado sem número', () => {
      const parsed = parseCreate({
        ...validBase,
        sigadocProcessLink: 'https://sigadoc.mt.gov.br/processo/123456',
      });
      assert.equal(parsed.success, false);
    });

    it('5. rejeita número de processo vazio ou composto somente por espaços', () => {
      const parsed = parseCreate({
        ...validBase,
        sigadocProcessNumber: '   ',
        sigadocProcessLink: 'https://sigadoc.mt.gov.br/processo/123456',
      });
      assert.equal(parsed.success, false);
    });

    it('6. rejeita protocolos proibidos (ex: javascript:, ftp:)', () => {
      const jsParsed = parseCreate({
        ...validBase,
        sigadocProcessNumber: '123456/2026',
        sigadocProcessLink: 'javascript:alert(1)',
      });
      assert.equal(jsParsed.success, false);

      const ftpParsed = parseCreate({
        ...validBase,
        sigadocProcessNumber: '123456/2026',
        sigadocProcessLink: 'ftp://files.mt.gov.br/processo',
      });
      assert.equal(ftpParsed.success, false);
    });

    it('7. rejeita URL inválida ou malformada', () => {
      const parsed = parseCreate({
        ...validBase,
        sigadocProcessNumber: '123456/2026',
        sigadocProcessLink: 'isto-nao-e-uma-url',
      });
      assert.equal(parsed.success, false);
    });

    it('8. aceita tanto HTTP quanto HTTPS', () => {
      const httpParsed = parseCreate({
        ...validBase,
        sigadocProcessNumber: '123456/2026',
        sigadocProcessLink: 'http://sigadoc.mt.gov.br/processo/123456',
      });
      assert.equal(httpParsed.success, true);
    });
  });

  describe('validação de schema Zod (updateTaskSchema)', () => {
    it('1. permite atualizar o vínculo SIGADOC com número e link válidos', () => {
      const parsed = updateTaskSchema.safeParse({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        body: {
          sigadocProcessNumber: '999999/2026',
          sigadocProcessLink: 'https://sigadoc.mt.gov.br/processo/999999',
          expectedVersion: 1,
          reason: 'Atualizando processo vinculado por equívoco',
        },
        query: {},
      });
      assert.equal(parsed.success, true);
    });

    it('2. permite remover o vínculo SIGADOC passando null em ambos os campos', () => {
      const parsed = updateTaskSchema.safeParse({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        body: {
          sigadocProcessNumber: null,
          sigadocProcessLink: null,
          expectedVersion: 1,
          reason: 'Removendo processo SIGADOC desvinculado',
        },
        query: {},
      });
      assert.equal(parsed.success, true);
    });

    it('3. rejeita alteração assimétrica (ex: passa número mas omite link)', () => {
      const parsed = updateTaskSchema.safeParse({
        params: { id: '11111111-1111-4111-8111-111111111111' },
        body: {
          sigadocProcessNumber: '999999/2026',
          expectedVersion: 1,
          reason: 'Tentativa de alteração incompleta',
        },
        query: {},
      });
      assert.equal(parsed.success, false);
    });
  });

  describe('apresentação de tarefa (presentTask)', () => {
    it('inclui campos sigadocProcessNumber e sigadocProcessLink na serialização', () => {
      const taskWithSigadoc = {
        id: 'task-1',
        publicNumber: 101n,
        teamId: 'team-1',
        createdById: 'user-1',
        sigadocProcessNumber: 'SIGA-2026-001',
        sigadocProcessLink: 'https://sigadoc.mt.gov.br/proc/1',
        createdAt: new Date(),
        updatedAt: new Date(),
        currentCycle: null,
      };

      const presented = presentTask(taskWithSigadoc);
      assert.equal(presented.sigadocProcessNumber, 'SIGA-2026-001');
      assert.equal(presented.sigadocProcessLink, 'https://sigadoc.mt.gov.br/proc/1');

      const taskWithoutSigadoc = {
        id: 'task-2',
        publicNumber: 102n,
        teamId: 'team-1',
        createdById: 'user-1',
        sigadocProcessNumber: null,
        sigadocProcessLink: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        currentCycle: null,
      };

      const presented2 = presentTask(taskWithoutSigadoc);
      assert.equal(presented2.sigadocProcessNumber, null);
      assert.equal(presented2.sigadocProcessLink, null);
    });
  });
});
