import { describe, expect, it } from 'vitest';
import { getRoleLabel, getSelectableRoles, ORDERED_ROLES, ROLE_LABELS } from './roles.ts';

describe('Padronização dos nomes dos perfis em português (Prompt 54)', () => {
  it('1. Mapeia exatamente os 4 identificadores internos para os nomes oficiais em português', () => {
    expect(ROLE_LABELS.ADMIN_MASTER).toBe('Admin Master');
    expect(ROLE_LABELS.SECRETARY).toBe('Secretário');
    expect(ROLE_LABELS.TECHNICIAN).toBe('Técnico');
    expect(ROLE_LABELS.MANAGER).toBe('Gestor');

    expect(getRoleLabel('ADMIN_MASTER')).toBe('Admin Master');
    expect(getRoleLabel('SECRETARY')).toBe('Secretário');
    expect(getRoleLabel('TECHNICIAN')).toBe('Técnico');
    expect(getRoleLabel('MANAGER')).toBe('Gestor');
  });

  it('2. getRoleLabel aceita objetos { code } ou { code, label } e extrai o nome padronizado', () => {
    expect(getRoleLabel({ code: 'ADMIN_MASTER' })).toBe('Admin Master');
    expect(getRoleLabel({ code: 'SECRETARY', label: 'Outro' })).toBe('Secretário');
    expect(getRoleLabel({ code: 'TECHNICIAN' })).toBe('Técnico');
    expect(getRoleLabel({ code: 'MANAGER' })).toBe('Gestor');
    expect(getRoleLabel(null)).toBe('');
    expect(getRoleLabel(undefined)).toBe('');
  });

  it('3. Respeita a ordem oficial de apresentação nos seletores', () => {
    expect(ORDERED_ROLES).toEqual([
      'ADMIN_MASTER',
      'SECRETARY',
      'TECHNICIAN',
      'MANAGER',
    ]);
  });

  it('4. ADMIN_MASTER pode selecionar todos os 4 perfis na ordem oficial', () => {
    const selectable = getSelectableRoles('ADMIN_MASTER');
    expect(selectable).toEqual([
      { code: 'ADMIN_MASTER', label: 'Admin Master' },
      { code: 'SECRETARY', label: 'Secretário' },
      { code: 'TECHNICIAN', label: 'Técnico' },
      { code: 'MANAGER', label: 'Gestor' },
    ]);
  });

  it('5. SECRETARY pode selecionar somente Técnico e Gestor, respeitando a ordem oficial', () => {
    const selectable = getSelectableRoles('SECRETARY');
    expect(selectable).toEqual([
      { code: 'TECHNICIAN', label: 'Técnico' },
      { code: 'MANAGER', label: 'Gestor' },
    ]);
  });

  it('6. Perfis sem permissão gerencial não possuem perfis selecionáveis', () => {
    expect(getSelectableRoles('TECHNICIAN')).toEqual([]);
    expect(getSelectableRoles('MANAGER')).toEqual([]);
    expect(getSelectableRoles(null)).toEqual([]);
  });
});
