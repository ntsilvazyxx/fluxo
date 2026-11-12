import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { testDatabase } from '../test-database.js';
import { fixtures } from '../fixtures.js';
import { createOutboxService } from '../../backend/src/modules/outbox/outbox.service.js';
import nodemailer from 'nodemailer';
import { hashPassword } from '../../backend/src/shared/security/password.js';
import { createEmailSender } from '../../backend/src/modules/outbox/outbox.sender.js';

const API = 'http://127.0.0.1:3109/api/v1';
let data; let prisma;
test.beforeAll(async () => { ({ prisma } = testDatabase()); data = await fixtures(prisma); });
test.afterAll(async () => { await prisma?.$disconnect(); });
const section = (page, name) => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) }).last();
async function login(page, role) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(data.users[role].emailNormalized);
  await page.getByLabel('Senha', { exact: true }).fill(data.password);
  const loginResponse = page.waitForResponse((r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await loginResponse).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeVisible();
}
async function api(request, role, path, body, method = 'POST') {
  const auth = await request.post(`${API}/auth/login`, { data: { email: data.users[role].emailNormalized, password: data.password } });
  expect(auth.status()).toBe(200);
  const authData = (await auth.json()).data;
  const token = authData.accessToken;
  const result = await request.fetch(`${API}${path}`, { method, data: body, headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() } });
  expect(result.ok(), `${method} ${path}: ${await result.text()}`).toBeTruthy();
  return result.status() === 204 ? null : (await result.json()).data;
}
async function assigned(request, title = 'Execução QA9') {
  const { task } = await api(request, 'manager', '/tasks', { title: `${title} ${randomUUID()}`, description: 'Tarefa exclusiva de homologação', teamId: data.team.id });
  await api(request, 'manager', `/tasks/${task.id}/assignments`, { userId: data.users.technician.id, expectedVersion: task.cycle.version, deadlineAt: '2027-01-05T12:00:00Z' });
  return task.id;
}
async function accept(page, id) {
  await page.goto(`/tarefas/${id}`);
  await page.getByRole('button', { name: 'Aceitar tarefa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Solicitações', exact: true })).toBeVisible();
}

test('sessão: login, cookie protegido, renovação após expiração, reload e logout', async ({ page }) => {
  await login(page, 'technician');
  const cookie = (await page.context().cookies()).find((item) => item.name === 'seaf_refresh');
  expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe('Strict');
  const refresh = page.waitForResponse((r) => r.url().endsWith('/auth/refresh') && r.status() === 200);
  await page.waitForTimeout(4500); // Real access-token expiry; no intercepted responses.
  await page.goto('/equipes');
  await refresh;
  await expect(page.getByRole('heading', { name: 'Equipes', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
});

test('Secretário cria, edita e atribui; Técnico conclui; Gestor reabre preservando histórico', async ({ page, request }) => {
  await login(page, 'secretary'); await page.goto('/tarefas/nova');
  const title = `Entrega E2E ${randomUUID()}`;
  await page.getByLabel('Título', { exact: true }).fill(title);
  await page.getByLabel('Descrição', { exact: true }).fill('Descrição completa da entrega de homologação');
  await page.locator('select[name=teamId]').selectOption(data.team.id);
  await page.getByRole('button', { name: 'Criar tarefa', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const id = page.url().split('/').at(-1);
  const edit = section(page, 'Editar tarefa');
  await edit.locator('[name=title]').fill(`${title} revisada`);
  await edit.locator('[name=reason]').fill('Revisão de título na homologação');
  await edit.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('heading', { name: `${title} revisada`, exact: true })).toBeVisible();
  const assign = section(page, 'Atribuir responsável');
  await assign.locator('[name=userId]').selectOption(data.users.technician.id);
  await assign.locator('[name=deadlineAt]').fill('2027-01-05T08:00');
  await assign.getByRole('button', { name: 'Confirmar atribuição' }).click();
  await expect(section(page, 'Reatribuir responsável')).toBeVisible();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await login(page, 'technician'); await accept(page, id);
  await page.getByLabel('Descrição dos resultados').fill('Entrega concluída e validada pelo teste E2E.');
  await page.getByRole('button', { name: 'Concluir tarefa', exact: true }).click();
  await expect(section(page, 'Concluir tarefa')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await login(page, 'manager'); await page.goto(`/tarefas/${id}`);
  const restart = section(page, 'Novo ciclo de execução');
  await restart.locator('textarea').fill('Novo ciclo solicitado na homologação');
  await restart.getByRole('button', { name: 'Reabrir tarefa' }).click();
  await expect(page.getByText('Ciclo 2', { exact: true })).toBeVisible();
  const stored = await api(request, 'manager', `/tasks/${id}`, undefined, 'GET');
  expect(stored.task.cycles).toHaveLength(2);
  expect(stored.task.cycle.assignment).toBeNull();
});

test('rejeição, cancelamento e restauração pelo navegador', async ({ page, request }) => {
  const id = await assigned(request);
  await login(page, 'technician'); await page.goto(`/tarefas/${id}`);
  await section(page, 'Responder atribuição').getByLabel('Justificativa').fill('Atribuição rejeitada durante homologação');
  await page.getByRole('button', { name: 'Rejeitar atribuição' }).click();
  await expect(page.getByRole('button', { name: 'Aceitar tarefa' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await login(page, 'manager'); await page.goto(`/tarefas/${id}`);
  await section(page, 'Cancelar tarefa').getByLabel('Justificativa').fill('Cancelamento controlado de homologação');
  await page.getByRole('button', { name: 'Cancelar definitivamente' }).click();
  await expect(page.getByRole('button', { name: 'Restaurar tarefa' })).toBeVisible();
  await section(page, 'Novo ciclo de execução').locator('textarea').fill('Restauração controlada de homologação');
  await page.getByRole('button', { name: 'Restaurar tarefa' }).click();
  await expect(page.getByText('Ciclo 2', { exact: true })).toBeVisible();
});

for (const type of ['RETURN', 'EXTENSION']) for (const decision of ['approve', 'deny']) {
  test(`solicitação ${type}: decisão ${decision} no navegador`, async ({ page, request }) => {
    const id = await assigned(request); await login(page, 'technician'); await accept(page, id);
    const form = section(page, 'Solicitações');
    await form.locator('select').selectOption(type);
    if (type === 'EXTENSION') await form.locator('input[type=datetime-local]').fill('2027-02-05T08:00');
    await form.locator('textarea').fill('Justificativa completa do pedido de homologação');
    await form.getByRole('button', { name: 'Enviar solicitação' }).click();
    await expect(page.getByRole('heading', { name: 'Solicitação pendente', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await login(page, 'manager'); await page.goto(`/tarefas/${id}`);
    const pending = section(page, 'Solicitação pendente');
    await pending.locator('textarea').fill('Decisão fundamentada na homologação');
    await pending.getByRole('button', { name: decision === 'approve' ? 'Aprovar' : 'Negar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Solicitação pendente', exact: true })).toHaveCount(0);
    const stored = await api(request, 'manager', `/tasks/${id}`, undefined, 'GET');
    expect(stored.task.cycle.status).toBe(type === 'RETURN' && decision === 'approve' ? 'PENDING' : 'IN_PROGRESS');
  });
}

test('subtarefa bloqueia conclusão e cancelamento da principal encerra ambas', async ({ page, request }) => {
  const id = await assigned(request); await login(page, 'manager'); await page.goto(`/tarefas/${id}`);
  await page.getByRole('button', { name: 'Nova subtarefa' }).click();
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Criar e atribuir subtarefa' }) });
  await form.getByLabel('Título', { exact: true }).fill('Subtarefa E2E');
  await form.getByLabel('Descrição', { exact: true }).fill('Descrição da subtarefa E2E');
  await form.locator('select[name=userId]').selectOption(data.users.technician.id);
  await form.getByLabel('Prazo', { exact: true }).fill('2027-01-04T08:00');
  await form.getByRole('button', { name: 'Criar e atribuir subtarefa' }).click();
  await expect(page.getByText('A conclusão da tarefa principal está bloqueada enquanto houver subtarefas ativas.')).toBeVisible();
  await section(page, 'Cancelar tarefa').getByLabel('Justificativa').fill('Cancelamento atômico na homologação');
  await page.getByRole('button', { name: 'Cancelar definitivamente' }).click();
  await expect(page.getByRole('button', { name: 'Restaurar tarefa' })).toBeVisible();
  const stored = await api(request, 'manager', `/tasks/${id}`, undefined, 'GET');
  expect(stored.task.subtasks[0].cycle.status).toBe('CANCELLED');
});

test('imagem real: upload, conteúdo protegido, modal e exclusão lógica', async ({ page, request }) => {
  const id = await assigned(request); await login(page, 'technician'); await accept(page, id);
  await page.locator('input[type=file]').setInputFiles({ name: 'evidencia.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  await page.getByRole('button', { name: /Enviar 1 imagem/ }).click();
  await expect(page.getByRole('status')).toHaveText('Imagens enviadas com segurança.');
  const image = page.locator('section[aria-labelledby=task-images-title] article img').first();
  await expect(image).toBeVisible();
  const content = await prisma.taskImage.findFirstOrThrow({ where: { cycle: { taskId: id } } });
  expect((await request.get(`${API}/images/${content.id}/content`)).status()).toBe(401);
  await image.click(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await page.getByRole('dialog').locator('textarea').fill('Remoção de evidência de homologação');
  await page.getByRole('button', { name: /Confirmar remo/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('ADMIN MASTER gerencia usuários/equipes via API e consulta telas técnicas', async ({ page, request }) => {
  const user = await api(request, 'admin', '/users', { name: 'Conta QA9', email: `${randomUUID()}@qa9.test`, password: data.password, roleCode: 'TECHNICIAN' });
  const created = await api(request, 'admin', '/teams', { name: `Equipe QA9 ${randomUUID()}` });
  await api(request, 'admin', `/teams/${created.team.id}/members/${user.user.id}`, undefined, 'POST');
  await api(request, 'admin', `/users/${user.user.id}`, { isActive: false, reason: 'Inativação controlada de homologação' }, 'PATCH');
  await login(page, 'admin'); await page.goto('/usuarios'); await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();
  await page.goto('/equipes'); await expect(page.getByRole('heading', { name: 'Equipes' })).toBeVisible();
  await page.goto('/dashboard'); await expect(page).toHaveURL(/minhas-tarefas/);
});

test('notificação produzida pela outbox aparece e pode ser marcada como lida', async ({ page, request }) => {
  const id = await assigned(request, 'Notificação E2E');
  const cycle = await prisma.taskCycle.findFirstOrThrow({ where: { taskId: id } });
  const assignment = await prisma.taskAssignment.findFirstOrThrow({ where: { cycleId: cycle.id } });
  const event = await prisma.outboxEvent.create({ data: { id: randomUUID(), eventType: 'TASK_ASSIGNED', dedupeKey: `qa9-notification:${randomUUID()}`, payloadJson: { taskId: id, cycleId: cycle.id, assignmentId: assignment.id, userId: data.users.technician.id } } });
  await prisma.notificationPreference.upsert({ where: { userId_notificationType: { userId: data.users.technician.id, notificationType: 'TASK_ASSIGNED' } }, update: {}, create: { id: randomUUID(), userId: data.users.technician.id, notificationType: 'TASK_ASSIGNED', emailEnabled: false, internalEnabled: true } });
  await createOutboxService({ emailSender: { send: async () => { throw Error('SMTP proibido no E2E'); } } }).processEvent(prisma, event);
  await login(page, 'technician'); await page.goto('/notificacoes');
  await expect(page.getByText('Nova atribuição', { exact: true }).first()).toBeVisible();
  const mark = page.getByRole('button', { name: /Marcar.*lida/i }).first();
  await mark.click();
  await expect.poll(async () => prisma.notification.count({ where: { userId: data.users.technician.id, readAt: { not: null } } })).toBeGreaterThan(0);
});

for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
  test(`responsividade e navegação real ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 }); await login(page, 'manager');
    for (const route of ['/kanban', '/tarefas/nova', '/calendarios', '/dashboard', '/relatorios', '/notificacoes', '/equipes', '/minhas-tarefas']) {
      await page.goto(route); await expect(page.locator('main h1')).toBeVisible();
      if (route === '/dashboard') {
        await expect(page.getByRole('button', { name: 'Aplicar filtros' })).toBeEnabled();
        await expect(page.locator('.recharts-sector').first()).toBeVisible();
      }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `.artifacts/screenshots/${width}-${route.slice(1).replaceAll('/', '-')}.png`, fullPage: true });
    }
    if (width < 768) { await page.getByRole('button', { name: 'Abrir navegação' }).click(); await page.getByRole('link', { name: 'Kanban', exact: true }).click(); await expect(page).toHaveURL(/kanban/); }
  });
}

test('acessibilidade WCAG A/AA em login e páginas gerenciais', async ({ page }) => {
  await page.goto('/login');
  let result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations).toEqual([]);
  await login(page, 'manager');
  for (const route of ['/dashboard', '/relatorios', '/tarefas/nova', '/kanban']) {
    await page.goto(route); await expect(page.locator('main h1')).toBeVisible();
    result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) }))).toEqual([]);
  }
});

test('XSS é texto, erro e estados vazios são apresentados sem executar HTML', async ({ page, request }) => {
  const title = '<img src=x onerror="window.qaXss=1">';
  const { task } = await api(request, 'manager', '/tasks', { title, description: 'Teste de escape de conteúdo', teamId: data.team.id });
  await login(page, 'manager'); await page.goto(`/tarefas/${task.id}`);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.qaXss)).toBeUndefined();
  await page.goto(`/tarefas/${randomUUID()}`); await expect(page.getByText(/não encontrad/i)).toBeVisible();
});

test('carregamento mantém feedback enquanto a requisição real aguarda a rede', async ({ page }) => {
  await login(page, 'technician');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/v1/my-tasks?*', async (route) => { await gate; await route.continue(); });
  try {
    await page.goto('/minhas-tarefas');
    await expect(page.locator('main').getByText('Carregando…', { exact: true })).toBeVisible();
  } finally { release(); }
  await expect(page.locator('main').getByText('Carregando…', { exact: true })).toHaveCount(0);
});

test('dashboard envia limites inclusivos do dia selecionado e recebe ciclos reais', async ({ page, request }) => {
  await assigned(request, 'Período E2E'); await login(page, 'manager'); await page.goto('/dashboard');
  const now = new Date(); const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  await page.locator('[name=periodStart]').fill(day);
  const response = page.waitForResponse((r) => r.url().includes('/api/v1/dashboard?') && r.url().includes('periodEnd=') && r.status() === 200);
  await page.locator('[name=periodEnd]').fill(day);
  const result = await response; const query = new URL(result.url()).searchParams;
  expect(new Date(query.get('periodEnd')).getHours()).toBe(23);
  expect(new Date(query.get('periodEnd')).getMilliseconds()).toBe(999);
  expect((await result.json()).data.cards.createdCycles).toBeGreaterThan(0);
});

for (const width of [320, 768, 1440]) {
  test(`telas técnicas e execução do Técnico em ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 1000 }); await login(page, 'admin');
    for (const route of ['/usuarios', '/equipes']) {
      await page.goto(route); await expect(page.locator('main h1')).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `.artifacts/screenshots/${width}-admin-${route.slice(1)}.png`, fullPage: true });
    }
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    const id = await assigned(request); await login(page, 'technician'); await accept(page, id);
    await expect(page.getByRole('heading', { name: 'Concluir tarefa', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `.artifacts/screenshots/${width}-technician-detail.png`, fullPage: true });
    await page.goto('/dashboard'); await expect(page).toHaveURL(/minhas-tarefas/);
  });
}

test('conclusão durante prorrogação pendente encerra o pedido conforme o contrato', async ({ page, request }) => {
  const id = await assigned(request); await login(page, 'technician'); await accept(page, id);
  const form = section(page, 'Solicitações');
  await form.locator('select').selectOption('EXTENSION');
  await form.locator('input[type=datetime-local]').fill('2027-02-05T08:00');
  await form.locator('textarea').fill('Pedido que será encerrado pela entrega');
  await form.getByRole('button', { name: 'Enviar solicitação' }).click();
  await expect(page.getByRole('heading', { name: 'Solicitação pendente', exact: true })).toBeVisible();
  await page.getByLabel('Descrição dos resultados').fill('Entrega realizada antes da decisão de prorrogação.');
  await page.getByRole('button', { name: 'Concluir tarefa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Solicitação pendente', exact: true })).toHaveCount(0);
  const result = await api(request, 'manager', `/tasks/${id}`, undefined, 'GET');
  expect(result.task.cycle.status).toBe('COMPLETED');
  expect(result.task.cycles[0].requests[0].status).toBe('CLOSED_BY_COMPLETION');
});

test('ADMIN MASTER entra somente por e-mail e senha, sem telas ou chamadas de segundo fator', async ({ page }) => {
  const calls = []; page.on('request', (r) => { if (r.url().includes('/auth/mfa')) calls.push(r.url()); });
  await login(page, 'admin'); await page.goto('/usuarios');
  await expect(page.getByRole('heading', { name: 'Segundo fator', exact: true })).toHaveCount(0);
  await expect(page.locator('[name=code], [data-testid=mfa-secret]')).toHaveCount(0);
  expect(calls).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.reload(); await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
});

test('recuperação pelo navegador usa e-mail Nodemailer local e revoga o login anterior', async ({ page }) => {
  const account = await prisma.user.create({ data: { id: randomUUID(), name: 'Recovery Browser QA9', emailNormalized: `${randomUUID()}@qa9.test`, passwordHash: await hashPassword(data.password), roleId: data.users.technician.roleId } });
  await page.goto('/recuperar-senha'); await page.getByLabel('E-mail').fill(account.emailNormalized);
  await page.getByRole('button', { name: 'Solicitar recuperação' }).click();
  await expect(page.getByRole('status')).toContainText('Se a conta existir');
  const reset = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: account.id, usedAt: null } });
  const event = await prisma.outboxEvent.findUniqueOrThrow({ where: { dedupeKey: `password-reset:${reset.id}` } });
  let email; const jsonTransport = nodemailer.createTransport({ jsonTransport: true });
  const config = { authDataEncryptionKey: process.env.AUTH_DATA_ENCRYPTION_KEY, appBaseUrl: 'http://127.0.0.1:4179', mailEnabled: true, mailFrom: 'seaf@qa9.test', mailFromName: 'SEAF QA9' };
  const sender = createEmailSender({ config, transport: { async sendMail(options) { const result = await jsonTransport.sendMail(options); email = JSON.parse(result.message); return result; } } });
  await createOutboxService({ emailSender: sender, config }).processEvent(prisma, event);
  const url = email.text.match(/http:\/\/127\.0\.0\.1:4179\/recuperar-senha#token=[A-Za-z0-9_-]+/)[0];
  await page.goto(url); await expect(page.getByRole('heading', { name: 'Redefinir senha' })).toBeVisible();
  await expect.poll(() => page.url().includes('#token=')).toBe(false);
  const password = 'New-Browser-Password-2026'; await page.getByLabel('Nova senha').fill(password);
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByRole('status')).toContainText('Senha redefinida');
  await page.goto('/login'); await page.getByLabel('E-mail').fill(account.emailNormalized); await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.goto(url); await page.getByLabel('Nova senha').fill('Another-Browser-Password-2026');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click(); await expect(page.getByRole('status')).toContainText('Token inválido ou expirado');
});
