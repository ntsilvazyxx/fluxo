import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';

export const smtpOptions = (config) => ({
  host: config.mailHost, port: config.mailPort, secure: config.mailPort === 465,
  requireTLS: config.mailPort !== 465,
  tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true, servername: config.mailHost },
  auth: config.mailUser ? { user: config.mailUser, pass: config.mailPass } : undefined,
  connectionTimeout: config.mailConnectionTimeout ?? 10000,
  greetingTimeout: config.mailGreetingTimeout ?? 10000,
  socketTimeout: config.mailSocketTimeout ?? 30000,
  disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
});

export const createEmailSender = ({ config, transport: injectedTransport }) => {
  const testMode = !config.mailEnabled;
  const transport = injectedTransport ?? (testMode
    ? null
    : nodemailer.createTransport(smtpOptions(config)));

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
      console.info('[EMAIL TEST] SMTP desativado; entrega simulada sem registrar destinatário ou conteúdo.');
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
