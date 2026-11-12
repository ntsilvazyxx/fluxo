import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('email sender em modo teste', () => {
  it('não envia e-mail real e registra no console', async () => {
    const config = { mailEnabled: false, mailHost: 'localhost', mailPort: 25, mailFrom: 'seaf@test.local', mailFromName: 'SEAF' };
    const { createEmailSender } = await import('../../src/modules/outbox/outbox.sender.js');
    const sender = createEmailSender({ config });
    assert.equal(sender.testMode, true);

    const result = await sender.send({ to: 'usuario@test.local', subject: 'Assunto', body: 'Corpo da mensagem' });
    assert.equal(result.status, 'SENT');
    assert.equal(result.recipient, 'usuario@test.local');
    assert.ok(result.lastError);
  });
});
