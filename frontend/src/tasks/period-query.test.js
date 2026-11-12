import { describe, expect, it } from 'vitest';
import { periodQuery } from './period-query.js';
describe('filtro de período do formulário', () => {
  it('inclui o fim do dia local selecionado e mantém instantes explícitos da API', () => {
    const query = periodQuery({ periodStart: '2026-11-12', periodEnd: '2026-11-12', priority: 'HIGH', search: '' });
    expect(query.get('periodStart')).toBe(new Date(2026, 10, 12, 0, 0, 0, 0).toISOString());
    expect(query.get('periodEnd')).toBe(new Date(2026, 10, 12, 23, 59, 59, 999).toISOString());
    expect(query.get('priority')).toBe('HIGH'); expect(query.has('search')).toBe(false);
    expect(periodQuery({ periodEnd: '2026-11-12T14:00:00Z' }).get('periodEnd')).toBe('2026-11-12T14:00:00Z');
  });
});
