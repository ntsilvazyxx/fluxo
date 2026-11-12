import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';

export const createEmailSender = ({ config }) => {
  const testMode = !config.mailEnabled;
  const transport = testMode
    ? null
    : nodemailer.createTransport({
      host: config.mailHost,
      port: config.mailPort,
      secure: config.mailPort === 465,
      auth: config.mailUser ? { user: config.mailUser, pass: config.mailPass } : undefined,
    });

  const send = async ({ to, subject, body }) => {
    const deliveryId = randomId();
    const record = {
      id: deliveryId,
      recipient: to,
      status: 'SENT',
      attemptCount: 1,
      sentAt: testMode ? null : new Date(),
      lastError: null,
    };

    if (testMode) {
      console.info(`[EMAIL TEST] para=${to} assunto=${subject} corpo=${body.slice(0, 120)}...`);
      return { ...record, status: 'SENT', sentAt: null, lastError: 'SMTP desativado: adaptador de teste' };
    }

    try {
      await transport.sendMail({
        from: { name: config.mailFromName, address: config.mailFrom },
        to,
        subject,
        text: body,
      });
      return { ...record, status: 'SENT', sentAt: new Date() };
    } catch {
      return {
        ...record,
        status: 'FAILED',
        lastError: 'Falha ao enviar e-mail.',
      };
    }
  };

  return { send, testMode };
};

const randomId = () => randomUUID();
