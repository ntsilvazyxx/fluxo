import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAttachmentService } from '../../src/modules/attachments/attachment.service.js';

const makeStorage = () => {
  const files = new Map();
  const storage = {
    createKeys: (extension) => {
      const id = '00000000-0000-0000-0000-' + Math.random().toString(16).padStart(12, '0');
      return { stagingKey: `staging/${id}.upload`, storageKey: `objects/${id.slice(0,2)}/${id}${extension}` };
    },
    moveFromTemporary: async (filePath, key) => { files.set(key, { path: filePath, promoted: false }); },
    promote: async (stagingKey, storageKey) => { const f = files.get(stagingKey); if (!f) throw new Error('ENOENT'); f.promoted = true; files.set(storageKey, f); },
    remove: async (key) => { files.delete(key); },
    stream: (key) => { const f = files.get(key); if (!f) throw new Error('ENOENT'); return { on: () => {}, pipe: () => {} }; },
    resolve: (key) => key,
  };
  storage.__files = files;
  return storage;
};

const makePrisma = () => {
  const staged = [];
  const attachments = [];
  return {
    staged,
    attachments,
    stagedUpload: {
      findMany: async (where) => staged.filter((s) => {
        let ok = true;
        if (where.id && where.id.in) ok = ok && where.id.in.includes(s.id);
        if (where.status) ok = ok && s.status === where.status;
        if (where.uploadedById) ok = ok && s.uploadedById === where.uploadedById;
        if (where.expiresAt) {
          if (where.expiresAt.gt) ok = ok && new Date(s.expiresAt) > where.expiresAt.gt;
          if (where.expiresAt.lte) ok = ok && new Date(s.expiresAt) <= where.expiresAt.lte;
        }
        return ok;
      }),
      updateMany: async (arg) => {
        const { where, data } = arg;
        let count = 0;
        for (const s of staged) {
          let match = true;
          if (where.id && where.id.in) match = match && where.id.in.includes(s.id);
          if (where.status) match = match && s.status === where.status;
          if (where.expiresAt && where.expiresAt.lte) match = match && new Date(s.expiresAt) <= where.expiresAt.lte;
          if (match) { Object.assign(s, data); count++; }
        }
        return { count };
      },
      update: async (arg) => {
        const { where, data } = arg;
        const s = staged.find((x) => x.id === where.id);
        if (s) Object.assign(s, data);
        return s;
      },
      create: async (arg) => {
        const { data } = arg;
        const s = { id: data.id, ...data };
        staged.push(s);
        return s;
      },
      findFirst: async (where) => staged.find((s) => {
        if (where.uploadedById && s.uploadedById !== where.uploadedById) return false;
        if (where.checksum && s.checksum !== where.checksum) return false;
        return true;
      }),
    },
    taskAttachment: {
      create: async (arg) => {
        const { data } = arg;
        const a = { id: data.id, ...data };
        attachments.push(a);
        return a;
      },
      findFirst: async (where) => attachments.find((a) => {
        if (where.checksum && a.checksum !== where.checksum) return false;
        if (where.uploadedById && a.uploadedById !== where.uploadedById) return false;
        return true;
      }),
      update: async (arg) => {
        const { where, data } = arg;
        const a = attachments.find((x) => x.id === where.id);
        if (a) Object.assign(a, data);
        return a;
      },
    },
    task: { findFirst: async () => ({ id: 'task-1', teamId: 'team-1', currentCycleId: 'cycle-1' }) },
    taskCycle: { findUnique: async () => ({ id: 'cycle-1', status: 'IN_PROGRESS', version: 0, closedAt: null }) },
    auditEvent: { create: async () => ({}) },
    $transaction: async (fn) => {
      const instance = {
        stagedUpload: {
          findMany: async (where) => staged.filter((s) => {
            let ok = true;
            if (where.id && where.id.in) ok = ok && where.id.in.includes(s.id);
            if (where.status) ok = ok && s.status === where.status;
            if (where.uploadedById) ok = ok && s.uploadedById === where.uploadedById;
            if (where.expiresAt) {
              if (where.expiresAt.gt) ok = ok && new Date(s.expiresAt) > where.expiresAt.gt;
              if (where.expiresAt.lte) ok = ok && new Date(s.expiresAt) <= where.expiresAt.lte;
            }
            return ok;
          }),
          updateMany: async (arg) => {
            const { where, data } = arg;
            let count = 0;
            for (const s of staged) {
              let match = true;
              if (where.id && where.id.in) match = match && where.id.in.includes(s.id);
              if (where.status) match = match && s.status === where.status;
              if (where.expiresAt && where.expiresAt.lte) match = match && new Date(s.expiresAt) <= where.expiresAt.lte;
              if (match) { Object.assign(s, data); count++; }
            }
            return { count };
          },
          update: async (arg) => {
            const { where, data } = arg;
            const s = staged.find((x) => x.id === where.id);
            if (s) Object.assign(s, data);
            return s;
          },
          create: async (arg) => {
            const { data } = arg;
            const s = { id: data.id, ...data };
            staged.push(s);
            return s;
          },
          findFirst: async (where) => staged.find((s) => {
            if (where.uploadedById && s.uploadedById !== where.uploadedById) return false;
            if (where.checksum && s.checksum !== where.checksum) return false;
            return true;
          }),
        },
        taskAttachment: {
          create: async (arg) => {
            const { data } = arg;
            const a = { id: data.id, ...data };
            attachments.push(a);
            return a;
          },
          findFirst: async (where) => attachments.find((a) => {
            if (where.checksum && a.checksum !== where.checksum) return false;
            if (where.uploadedById && a.uploadedById !== where.uploadedById) return false;
            return true;
          }),
        },
      };
      return fn(instance);
    },
  };
};

describe('attachment.service', () => {
  it('claimInitial: associa anexos de staging ao ciclo de forma transacional', async () => {
    const actorId = 'user-1';
    const cycleId = 'cycle-1';
    const future = new Date(Date.now() + 1000 * 60 * 60);
    const prisma = makePrisma();
    await prisma.stagedUpload.create({ data: { id: 's1', uploadedById: actorId, status: 'STAGED', expiresAt: future, originalName: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: BigInt(100), checksum: 'abc', stagingKey: 'staging/s1.upload' } });
    const storage = makeStorage();
    const service = createAttachmentService({ prisma, storage, ttlMinutes: 60 });
    const claims = await service.claimInitial(prisma, actorId, cycleId, ['s1']);
    assert.equal(claims.length, 1);
    assert.equal(claims[0].attachment.cycleId, cycleId);
    assert.equal(claims[0].attachment.origin, 'INITIAL');
    assert.equal(claims[0].attachment.uploadedById, actorId);
    assert.equal(prisma.staged[0].status, 'CLAIMED');
    assert.ok(prisma.staged[0].claimedAt);
  });

  it('claimExecution: associa anexos de staging com origem EXECUTION', async () => {
    const actorId = 'user-1';
    const cycleId = 'cycle-1';
    const future = new Date(Date.now() + 1000 * 60 * 60);
    const prisma = makePrisma();
    await prisma.stagedUpload.create({ data: { id: 's1', uploadedById: actorId, status: 'STAGED', expiresAt: future, originalName: 'exec.pdf', mimeType: 'application/pdf', sizeBytes: BigInt(200), checksum: 'def', stagingKey: 'staging/s2.upload' } });
    const storage = makeStorage();
    const service = createAttachmentService({ prisma, storage, ttlMinutes: 60 });
    const claims = await service.claimExecution(prisma, actorId, cycleId, ['s1']);
    assert.equal(claims.length, 1);
    assert.equal(claims[0].attachment.origin, 'EXECUTION');
    assert.equal(claims[0].attachment.cycleId, cycleId);
  });

  it('cleanup: remove staging expirado e não remove reivindicados', async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 1000);
    const future = new Date(now.getTime() + 3600000);
    const prisma = makePrisma();
    await prisma.stagedUpload.create({ data: { id: 's1', uploadedById: 'u1', status: 'STAGED', expiresAt: past, originalName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: BigInt(100), checksum: 'a', stagingKey: 'staging/s1.upload' } });
    await prisma.stagedUpload.create({ data: { id: 's2', uploadedById: 'u1', status: 'CLAIMED', expiresAt: past, originalName: 'b.pdf', mimeType: 'application/pdf', sizeBytes: BigInt(100), checksum: 'b', stagingKey: 'staging/s2.upload' } });
    await prisma.stagedUpload.create({ data: { id: 's3', uploadedById: 'u1', status: 'STAGED', expiresAt: future, originalName: 'c.pdf', mimeType: 'application/pdf', sizeBytes: BigInt(100), checksum: 'c', stagingKey: 'staging/s3.upload' } });
    const storage = { ...makeStorage(), remove: async () => {} };
    const service = createAttachmentService({ prisma, storage, ttlMinutes: 60 });
    await service.cleanup();
    assert.equal(prisma.staged.find((s) => s.id === 's1').status, 'EXPIRED');
    assert.equal(prisma.staged.find((s) => s.id === 's2').status, 'CLAIMED');
    assert.equal(prisma.staged.find((s) => s.id === 's3').status, 'STAGED');
  });

  it('reconcilePromotions: marca CLAIMED como EXPIRED quando staging sumiu', async () => {
    const prisma = makePrisma();
    await prisma.stagedUpload.create({ data: { id: 's1', uploadedById: 'u1', status: 'CLAIMED', expiresAt: new Date(Date.now() + 3600000), originalName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: BigInt(100), checksum: 'missing', stagingKey: 'staging/s1.upload' } });
    const storage = { ...makeStorage(), resolve: () => '/nonexistent/path', remove: async () => {} };
    const service = createAttachmentService({ prisma, storage, ttlMinutes: 60 });
    const reconciled = await service.reconcilePromotions();
    assert.equal(reconciled.length, 1);
    assert.equal(reconciled[0].promoted, false);
    assert.equal(prisma.staged[0].status, 'EXPIRED');
  });

  it('promoteClaimed: promove arquivos de staging para storage definitivo', async () => {
    const prisma = makePrisma();
    const storage = makeStorage();
    const service = createAttachmentService({ prisma, storage, ttlMinutes: 60 });
    await storage.moveFromTemporary('/tmp/file', 'staging/s1.upload');
    const claims = [{ attachment: { id: 'a1', storageKey: 'objects/ab/a1.pdf', cycleId: 'c1', uploadedById: 'u1' }, staged: { stagingKey: 'staging/s1.upload' } }];
    await service.promoteClaimed(claims);
    const f = storage.__files.get('objects/ab/a1.pdf');
    assert.ok(f);
    assert.ok(f.promoted);
  });
});

describe('attachment.validation', () => {
  it('PDF: rejeita cabeçalho inválido', async () => {
    const { inspectAttachment } = await import('../../src/modules/attachments/attachment.validation.js');
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'seaf-validate-'));
    try {
      const filePath = path.join(dir, 'bad.pdf');
      await fs.writeFile(filePath, 'not a pdf content');
      await assert.rejects(inspectAttachment({ path: filePath, originalname: 'bad.pdf', size: 23 }), (e) => e.code === 'ATTACHMENT_CONTENT_MISMATCH' || e.code === 'ATTACHMENT_PDF_INVALID_HEADER');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('PDF: rejeita documento sem startxref', async () => {
    const { inspectAttachment } = await import('../../src/modules/attachments/attachment.validation.js');
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'seaf-validate-'));
    try {
      const filePath = path.join(dir, 'bad2.pdf');
      await fs.writeFile(filePath, '%PDF-1.4\ncontent without xref');
      await assert.rejects(inspectAttachment({ path: filePath, originalname: 'bad2.pdf', size: 45 }), (e) => e.code === 'ATTACHMENT_PDF_MALFORMED');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
