import type { RoleCode } from '../types/domain.ts';

/**
 * Mapeamento oficial dos perfis de usuário do SEAF (Identificador interno -> Nome exibido em português).
 * Respeita estritamente a grafia, capitalização e acentuação exigidas:
 * - ADMIN_MASTER -> Admin Master
 * - SECRETARY    -> Secretário
 * - TECHNICIAN   -> Técnico
 * - MANAGER      -> Gestor
 */
export const ROLE_LABELS: Record<RoleCode, string> = {
  ADMIN_MASTER: 'Admin Master',
  SECRETARY: 'Secretário',
  TECHNICIAN: 'Técnico',
  MANAGER: 'Gestor',
};

/**
 * Ordem canônica oficial de apresentação dos perfis em seletores:
 * 1. Admin Master
 * 2. Secretário
 * 3. Técnico
 * 4. Gestor
 */
export const ORDERED_ROLES: RoleCode[] = [
  'ADMIN_MASTER',
  'SECRETARY',
  'TECHNICIAN',
  'MANAGER',
];

/**
 * Retorna o nome oficial em português para um perfil ou identificador interno.
 * Suporta o código direto ('ADMIN_MASTER') ou objeto de usuário/perfil ({ code: 'ADMIN_MASTER' }).
 */
export function getRoleLabel(
  roleOrCode?: RoleCode | string | { code?: string; label?: string } | null,
): string {
  if (!roleOrCode) return '';
  const code = typeof roleOrCode === 'string' ? roleOrCode : roleOrCode?.code;
  if (!code) return '';
  return ROLE_LABELS[code as RoleCode] ?? code;
}

/**
 * Retorna os perfis que o usuário autenticado possui autorização para selecionar,
 * respeitando a ordem canônica:
 * - ADMIN_MASTER: Admin Master, Secretário, Técnico, Gestor
 * - SECRETARY: Técnico, Gestor
 * - Outros perfis: lista vazia (sem autorização de cadastro/edição)
 */
export function getSelectableRoles(
  actorRoleCode?: string | null,
): Array<{ code: RoleCode; label: string }> {
  if (actorRoleCode === 'ADMIN_MASTER') {
    return ORDERED_ROLES.map((code) => ({ code, label: ROLE_LABELS[code] }));
  }
  if (actorRoleCode === 'SECRETARY') {
    return (['TECHNICIAN', 'MANAGER'] as RoleCode[]).map((code) => ({
      code,
      label: ROLE_LABELS[code],
    }));
  }
  return [];
}
