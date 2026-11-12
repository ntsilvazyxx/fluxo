import assert from 'node:assert/strict';
import { it } from 'node:test';
import { randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { seal, unseal } from '../../src/shared/security/auth-secrets.js';
import { smtpOptions, createEmailSender } from '../../src/modules/outbox/outbox.sender.js';
it('AEAD protege sigilo, integridade, contexto e chave de recuperação de senha', () => {
  const config = { authDataEncryptionKey: randomBytes(32).toString('hex') }; const encrypted = seal('never-log-this', 'id1', config);
  assert.ok(!encrypted.includes('never-log-this')); assert.equal(unseal(encrypted, 'id1', config), 'never-log-this');
  assert.throws(() => unseal(encrypted, 'id2', config)); assert.throws(() => unseal(encrypted, 'id1', { authDataEncryptionKey: randomBytes(32).toString('hex') }));
});
it('SMTP impõe TLS, valida certificado, limita espera e desativa acesso a arquivo/URL', () => {
  const config = { mailHost: 'smtp.example.invalid', mailPort: 587, mailUser: 'test', mailPass: 'not-real' };
  const options = smtpOptions(config); assert.equal(options.requireTLS, true); assert.equal(options.secure, false);
  assert.equal(options.tls.rejectUnauthorized, true); assert.equal(options.tls.minVersion, 'TLSv1.2');
  assert.equal(options.connectionTimeout, 10000); assert.equal(options.greetingTimeout, 10000); assert.equal(options.socketTimeout, 30000);
  assert.equal(options.disableFileAccess, true); assert.equal(options.disableUrlAccess, true);
  assert.equal(smtpOptions({ ...config, mailPort: 465 }).secure, true);
});
it('Nodemailer JSON transport valida montagem sem enviar e-mail externo', async () => {
  let message; const transport = nodemailer.createTransport({ jsonTransport: true });
  const sender = createEmailSender({ config: { mailEnabled: true, mailFrom: 'seaf@test.invalid', mailFromName: 'SEAF' }, transport: { async sendMail(options) { const result = await transport.sendMail(options); message = JSON.parse(result.message); return result; } } });
  assert.equal((await sender.send({ to: 'user@test.invalid', subject: 'Recovery', body: 'Local test' })).status, 'SENT');
  assert.equal(message.text, 'Local test'); assert.equal(message.to[0].address, 'user@test.invalid');
});
it('falha SMTP não expõe credenciais na resposta do adaptador', async () => {
  const sender = createEmailSender({ config: { mailEnabled: true }, transport: { sendMail: async () => { throw Error('secret username/password'); } } });
  const result = await sender.send({ to: 'user@test.invalid', subject: 'Recovery', body: 'Local test' });
  assert.equal(result.status, 'FAILED'); assert.equal(result.lastError, 'Falha ao enviar e-mail.');
});
