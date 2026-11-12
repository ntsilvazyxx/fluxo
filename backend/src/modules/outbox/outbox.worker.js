import { createOutboxService } from './outbox.service.js';
import { createReminderScheduler } from './outbox.scheduler.js';

const wait = (ms) => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  timer.unref();
});

export const createOutboxWorker = ({ prisma, emailSender, reminderScheduler = createReminderScheduler({ prisma }) }) => {
  const service = createOutboxService({ emailSender });
  let running = false;

  const processOne = async () => {
    const event = await service.claimEvent(prisma);
    if (!event) return false;

    try {
      await service.processEvent(prisma, event);
      await service.completeEvent(prisma, event.id, true);
      return true;
    } catch (error) {
      await service.completeEvent(prisma, event.id, false, error.message);
      return true;
    }
  };

  const recover = async () => {
    const result = await service.recoverOrphaned(prisma);
    if (result.count > 0) {
      console.info(`[OUTBOX] ${result.count} eventos órfãos recuperados.`);
    }
  };

  const runOnce = async ({ scheduleReminders = true } = {}) => {
    await recover();
    if (scheduleReminders) await reminderScheduler.scheduleDeadlineReminders();
    let processed = true;
    while (processed) {
      processed = await processOne();
    }
  };

  const start = async (intervalMs = 60_000) => {
    if (running) return;
    running = true;
    console.info('[OUTBOX] Worker iniciado.');
    while (running) {
      try {
        await runOnce();
      } catch (error) {
        console.error('[OUTBOX] Erro no loop do worker:', error.message);
      }
      await wait(intervalMs);
    }
    console.info('[OUTBOX] Worker parado.');
  };

  const stop = () => {
    running = false;
  };

  return { start, stop, runOnce };
};
