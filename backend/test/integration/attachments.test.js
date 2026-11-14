import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, describe, it } from 'node:test';
import request from 'supertest';
import { createIntegrationApp, testDatabase } from '../../testing/integration/context.js';
import { fixtures, runningTaskInput } from '../../testing/integration/fixtures.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
describe('anexos e staging isolados com arquivos sintéticos', { skip: process.env.RUN_DATABASE_INTEGRATION !== '1' }, () => {
  let prisma; let app; let data; const tokens = {};
  const call = (role, method, path, body, key = randomUUID()) => request(app)[method](`/api/v1${path}`).set('authorization', `Bearer ${tokens[role]}`).set('idempotency-key', key).send(body);
  const stage = async (role = 'manager') => {
    const r = await request(app).post('/api/v1/attachments/staged').set('authorization', `Bearer ${tokens[role]}`).attach('attachment', png, { filename: 'sintetico.png', contentType: 'image/png' });
    assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.data;
  };
  const create = async (initialAttachmentIds = [], key = randomUUID(), body = {}) => call('manager', 'post', '/tasks', runningTaskInput(data.team.id, data.users.technician.id, { initialAttachmentIds, ...body }), key);
  const list = async (taskId) => {
    const r = await call('manager', 'get', `/attachments/tasks/${taskId}`); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.data.attachments;
  };
  before(async () => {
    ({ prisma } = await testDatabase()); data = await fixtures(prisma); app = createIntegrationApp({ prisma });
    for (const role of ['manager', 'technician', 'outsider']) {
      const r = await request(app).post('/api/v1/auth/login').send({ email: data.users[role].emailNormalized, password: data.password }); assert.equal(r.status, 200); tokens[role] = r.body.data.accessToken;
    }
  });
  after(async () => prisma?.$disconnect());
  it('promove staging inicial, persiste checksum e entrega conteúdo protegido', async () => {
    const staged = await stage(); const result = await create([staged.id]); assert.equal(result.status, 201, JSON.stringify(result.body));
    const attachments = await list(result.body.data.task.id); assert.equal(attachments.length, 1); assert.equal(attachments[0].origin, 'INITIAL'); assert.match(attachments[0].checksum, /^[a-f0-9]{64}$/);
    assert.equal((await prisma.stagedUpload.findUniqueOrThrow({ where: { id: staged.id } })).status, 'CLAIMED');
    const download = await call('technician', 'get', `/attachments/${attachments[0].id}/content`); assert.equal(download.status, 200); assert.deepEqual(download.body, png);
  });
  it('nega acesso anônimo e IDOR de anexos e listagem fora da equipe', async () => {
    const staged = await stage(); const result = await create([staged.id]); assert.equal(result.status, 201);
    const [attachment] = await list(result.body.data.task.id);
    assert.equal((await request(app).get(`/api/v1/attachments/${attachment.id}/content`)).status, 401);
    assert.equal((await call('outsider', 'get', `/attachments/${attachment.id}/content`)).status, 404);
    assert.equal((await call('outsider', 'get', `/attachments/tasks/${result.body.data.task.id}`)).status, 404);
  });
  it('staging de outro usuário não pode ser reivindicado', async () => {
    const staged = await stage('technician'); const result = await create([staged.id]); assert.equal(result.status, 409);
    assert.equal((await prisma.stagedUpload.findUniqueOrThrow({ where: { id: staged.id } })).status, 'STAGED');
  });
  it('staging expirado não pode ser reivindicado', async () => {
    const staged = await stage(); await prisma.stagedUpload.update({ where: { id: staged.id }, data: { expiresAt: new Date(0) } });
    const r = await create([staged.id]); assert.equal(r.status, 409); assert.equal(r.body.error.code, 'STAGED_UPLOAD_UNAVAILABLE');
  });
  it('replay não duplica anexos e staging utilizado não pode ser reutilizado', async () => {
    const staged = await stage(); const key = randomUUID(); const input = { title: `Replay ${randomUUID()}` };
    const first = await create([staged.id], key, input); assert.equal(first.status, 201);
    const replay = await create([staged.id], key, input); assert.equal(replay.status, 201); assert.equal(replay.headers['idempotency-replayed'], 'true');
    assert.equal((await list(first.body.data.task.id)).length, 1); assert.equal((await create([staged.id])).status, 409);
  });
  it('recusa conteúdo incompatível com extensão sem registrar staging', async () => {
    const before = await prisma.stagedUpload.count({ where: { uploadedById: data.users.manager.id } });
    const r = await request(app).post('/api/v1/attachments/staged').set('authorization', `Bearer ${tokens.manager}`).attach('attachment', Buffer.from('arquivo sem assinatura de imagem'), { filename: 'falso.png', contentType: 'image/png' });
    assert.equal(r.status, 422); assert.equal(await prisma.stagedUpload.count({ where: { uploadedById: data.users.manager.id } }), before);
  });
  it('anexo de execução exige aceite e versão atual, depois fica disponível', async () => {
    const created = await create(); assert.equal(created.status, 201); let task = created.body.data.task; const staged = await stage('technician');
    const upload = (version) => call('technician', 'post', `/attachments/tasks/${task.id}/attachments`, { stagedIds: [staged.id], expectedVersion: version });
    assert.equal((await upload(task.cycle.version)).status, 422);
    const accepted = await call('technician', 'post', `/assignments/${task.cycle.assignment.id}/accept`, { expectedVersion: task.cycle.version }); assert.equal(accepted.status, 200); task = accepted.body.data.task;
    assert.equal((await upload(task.cycle.version - 1)).status, 409);
    const attached = await upload(task.cycle.version); assert.equal(attached.status, 201, JSON.stringify(attached.body));
    assert.equal((await list(task.id))[0].origin, 'EXECUTION');
  });
});
