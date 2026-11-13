import { test, expect, request as playwrightRequest } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { testDatabase } from '../test-database.js';
import { fixtures } from '../fixtures.js';
import { createOutboxService } from '../../backend/src/modules/outbox/outbox.service.js';
const API = 'http://127.0.0.1:3109/api/v1';
let prisma; let data; let foreign; let client; let ownManager; let ownSecretary; let waiting; let outside; let done;
async function api(role, path, body, method = 'POST') {
  const auth = await client.post(`${API}/auth/login`, { data: { email: data.users[role].emailNormalized, password: data.password } });
  expect(auth.status()).toBe(200); const token = (await auth.json()).data.accessToken;
  const response = await client.fetch(`${API}${path}`, { method, data: body, headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() } });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.status() === 204 ? null : (await response.json()).data;
}
async function create(role, title, user, teamId = data.team.id) {
  let { task } = await api(role, '/tasks', { title: `${title} ${data.run}`, description: 'Homologação real do Kanban unificado', teamId, priority: 'HIGH' });
  if (user) ({ task } = await api(role, `/tasks/${task.id}/assignments`, { userId: user.id, expectedVersion: task.cycle.version, deadlineAt: '2027-01-05T12:00:00Z' }));
  return task;
}
async function login(page, role) {
  await page.goto('/login'); await page.getByLabel('E-mail').fill(data.users[role].emailNormalized); await page.getByLabel('Senha', { exact: true }).fill(data.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeVisible();
  await page.goto(`/kanban?search=${data.run}`); await expect(page.getByRole('region', { name: 'Colunas do Kanban' })).toBeVisible();
  await expect(page.locator('main').getByRole('status')).toHaveCount(0);
}
const column = (page, name) => page.getByRole('region', { name, exact: true });
test.beforeAll(async () => {
  ({ prisma } = testDatabase()); data = await fixtures(prisma); foreign = await fixtures(prisma); client = await playwrightRequest.newContext();
  ownManager = await create('manager', 'Atribuição do gestor', data.users.manager);
  ownSecretary = await create('secretary', 'Atribuição do secretário', data.users.secretary);
  waiting = await create('manager', 'Atribuição técnica', data.users.technician);
  await create('manager', 'Sem responsável');
  outside = await create('secretary', 'Outra equipe', null, foreign.team.id);
  done = await create('manager', 'Entrega técnica', data.users.technician);
  let result = await api('technician', `/assignments/${done.cycle.assignment.id}/accept`, { expectedVersion: done.cycle.version });
  result = await api('technician', `/tasks/${done.id}/complete`, { expectedVersion: result.task.cycle.version, completionText: 'Entrega finalizada para homologar a coluna' }); done = result.task;
});
test.afterAll(async () => { await client?.dispose(); await prisma?.$disconnect(); });

for (const role of ['manager', 'secretary']) test(`Kanban ${role}: quatro colunas, escopo e referência pessoal sem duplicação`, async ({ page }) => {
  const own = role === 'manager' ? ownManager : ownSecretary;
  const count = await prisma.task.count({ where: { id: own.id } });
  await login(page, role);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Minhas tarefas', 'Pendente', 'Aguardando aceite', 'Em andamento']);
  await expect(column(page, 'Minhas tarefas').locator(`[data-task-id="${own.id}"]`)).toHaveCount(1);
  await expect(column(page, 'Aguardando aceite').locator(`[data-task-id="${own.id}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-task-id="${outside.id}"]`)).toHaveCount(role === 'secretary' ? 1 : 0);
  await expect(page.getByRole('link', { name: 'Minhas tarefas', exact: true })).toHaveCount(0);
  expect(await prisma.task.count({ where: { id: own.id } })).toBe(count);
});

test('Técnico: três colunas pessoais, detalhes integrados e aceite pelo componente existente', async ({ page }) => {
  await login(page, 'technician');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Aguardando aceite', 'Em andamento', 'Concluídas']);
  await expect(column(page, 'Concluídas').locator(`[data-task-id="${done.id}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-task-id="${ownManager.id}"]`)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Nova tarefa' })).toHaveCount(0);
  const card = column(page, 'Aguardando aceite').locator(`[data-task-id="${waiting.id}"]`);
  await card.getByLabel(`Ações da tarefa #${waiting.publicNumber}`).click();
  await card.getByRole('link', { name: 'Responder atribuição' }).click();
  await expect(page).toHaveURL(new RegExp(`/kanban/tarefas/${waiting.id}`));
  await expect(page.getByRole('heading', { name: 'Histórico de alterações' })).toBeVisible();
  await page.getByRole('button', { name: 'Aceitar tarefa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Concluir tarefa', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar ao Kanban' }).click();
  await expect(column(page, 'Em andamento').locator(`[data-task-id="${waiting.id}"]`)).toHaveCount(1);
});

test('ADMIN MASTER usa quadro pessoal sem consultas ou controles gerenciais', async ({ page }) => {
  const calls = []; page.on('request', (r) => { if (r.url().includes('/api/v1/kanban')) calls.push(r.url()); });
  await login(page, 'admin');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Aguardando aceite', 'Em andamento', 'Concluídas']);
  await expect(page.locator('[data-task-id]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Nova tarefa' })).toHaveCount(0);
  await page.getByRole('button', { name: /Filtros/ }).click();
  await expect(page.getByRole('combobox', { name: 'Equipe', exact: true })).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('filtros combinados, limpar e retorno dos detalhes preservam a consulta', async ({ page }) => {
  await login(page, 'manager');
  await expect(page.getByRole('combobox', { name: 'Prioridade' })).toHaveCount(0);
  await page.getByRole('button', { name: /Filtros/ }).click();
  await page.getByRole('combobox', { name: 'Equipe', exact: true }).selectOption(data.team.id);
  await page.getByRole('combobox', { name: 'Responsável', exact: true }).selectOption(data.users.manager.id);
  await page.getByRole('combobox', { name: 'Prioridade', exact: true }).selectOption('HIGH');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('AWAITING_ACCEPTANCE');
  await expect(page.locator('[data-task-id]')).toHaveCount(2);
  await column(page, 'Minhas tarefas').getByRole('link', { name: `Abrir tarefa #${ownManager.publicNumber}: ${ownManager.cycle.title}` }).click();
  await page.getByRole('link', { name: 'Voltar ao Kanban' }).click();
  await expect(page.getByRole('textbox', { name: 'Buscar tarefas' })).toHaveValue(data.run);
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.getByRole('textbox', { name: 'Buscar tarefas' })).toHaveValue('');
  await page.getByRole('button', { name: /Filtros/ }).click();
  await expect(page.getByRole('combobox', { name: 'Equipe', exact: true })).toHaveValue('');
});

test('rota antiga redireciona, notificação abre tarefa no Kanban e IDOR permanece negado', async ({ page }) => {
  const event = await prisma.outboxEvent.findFirstOrThrow({ where: { eventType: 'TASK_ASSIGNED', payloadJson: { path: '$.taskId', equals: waiting.id } } });
  const outbox = createOutboxService({ emailSender: { testMode: true, send: async () => ({ status: 'SENT', sentAt: null }) } });
  await outbox.processEvent(prisma, event);
  await login(page, 'technician');
  await page.goto(`/minhas-tarefas?search=${data.run}`); await expect(page).toHaveURL(new RegExp(`/kanban\\?search=${data.run}`));
  await page.goto('/notificacoes');
  await page.getByRole('button', { name: 'Abrir tarefa' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/kanban/tarefas/${waiting.id}`));
  await page.goto(`/tarefas/${ownManager.id}`); await expect(page.getByText(/não encontrad/i)).toBeVisible();
});

for (const width of [320, 768, 1440]) test(`Kanban compacto ${width}px: rolagem interna, foco, menu e acessibilidade`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await login(page, 'manager');
  const board = page.getByRole('region', { name: 'Colunas do Kanban' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const boxes = await page.getByRole('heading', { level: 2 }).evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
  expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThan(2);
  await board.focus(); if (width < 1440) { await page.keyboard.press('ArrowRight'); await expect.poll(() => board.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0); }
  await board.evaluate((node) => { node.scrollLeft = 0; });
  const menu = column(page, 'Minhas tarefas').getByLabel(`Ações da tarefa #${ownManager.publicNumber}`);
  await menu.focus(); await page.keyboard.press('Enter');
  await expect(column(page, 'Minhas tarefas').getByRole('link', { name: 'Detalhes e histórico' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(menu).toBeFocused();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
  await page.screenshot({ path: `.artifacts/screenshots/kanban-unified-${width}.png`, fullPage: true });
});
