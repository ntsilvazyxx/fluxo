import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ROLE_SEEDS } from '../../prisma/seed-data.js';

describe('seed de perfis', () => {
  it('contém exatamente os quatro perfis documentados', () => {
    assert.deepEqual(
      ROLE_SEEDS.map(({ code }) => code),
      ['ADMIN_MASTER', 'SECRETARY', 'MANAGER', 'TECHNICIAN'],
    );
    assert.equal(new Set(ROLE_SEEDS.map(({ id }) => id)).size, 4);
  });
});
