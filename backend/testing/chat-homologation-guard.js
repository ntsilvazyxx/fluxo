export const CHAT_HOMOLOGATION_DATABASE = 'seaf_chat_homologation';
export const CHAT_HOMOLOGATION_OPT_IN = 'RUN_CHAT_REAL_HOMOLOGATION';
export const CHAT_HOMOLOGATION_URL = 'CHAT_HOMOLOGATION_DATABASE_URL';

const operationalDatabase = 'seaf_gestao_functional';

const databaseNameFromUrl = (url) => decodeURIComponent(url.pathname.replace(/^\//, ''));

export function getChatHomologationDatabaseUrl(environment = process.env) {
  if (environment[CHAT_HOMOLOGATION_OPT_IN] !== '1') {
    throw new Error(`${CHAT_HOMOLOGATION_OPT_IN}=1 é obrigatório para a homologação real do Chat.`);
  }

  const value = environment[CHAT_HOMOLOGATION_URL];
  if (!value) {
    throw new Error(`${CHAT_HOMOLOGATION_URL} deve ser informada somente no processo de homologação.`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${CHAT_HOMOLOGATION_URL} não é uma URL válida.`);
  }

  if (parsed.protocol !== 'mysql:') {
    throw new Error(`${CHAT_HOMOLOGATION_URL} deve usar o protocolo mysql://.`);
  }

  const database = databaseNameFromUrl(parsed);
  if (database === operationalDatabase) {
    throw new Error('Execução recusada: o banco operacional seaf_gestao_functional é protegido.');
  }
  if (database !== CHAT_HOMOLOGATION_DATABASE) {
    throw new Error(`Execução recusada: o destino deve ser exatamente ${CHAT_HOMOLOGATION_DATABASE}.`);
  }
  if (decodeURIComponent(parsed.username).toLowerCase() === 'root') {
    throw new Error('Execução recusada: a homologação real não pode utilizar a conta root.');
  }
  if (!parsed.username || !parsed.password) {
    throw new Error('Execução recusada: a homologação exige conta dedicada com senha não vazia.');
  }

  return value;
}

const databaseAccessDenied = (error) => {
  const values = [
    error?.code,
    error?.errno,
    error?.meta?.code,
    error?.meta?.driverAdapterError?.cause?.originalCode,
    error?.meta?.driverAdapterError?.cause?.code,
  ].map(String);
  return values.includes('1044') || values.includes('1142');
};

export async function assertChatHomologationDatabase(client) {
  const [identity] = await client.$queryRawUnsafe(
    'SELECT DATABASE() AS db, VERSION() AS version, CURRENT_USER() AS currentUser',
  );

  if (identity?.db !== CHAT_HOMOLOGATION_DATABASE) {
    throw new Error(`Destino efetivo inválido: esperado ${CHAT_HOMOLOGATION_DATABASE}.`);
  }
  if (!String(identity?.version ?? '').startsWith('10.11.')) {
    throw new Error('A homologação do Chat exige MariaDB 10.11.x.');
  }
  if (String(identity?.currentUser ?? '').toLowerCase().startsWith('root@')) {
    throw new Error('Execução recusada: a conexão efetiva utiliza root.');
  }

  try {
    await client.$queryRawUnsafe('SELECT 1 FROM seaf_gestao_functional.roles LIMIT 1');
    throw new Error('Execução recusada: a conta de homologação possui acesso ao banco operacional.');
  } catch (error) {
    if (error?.message?.startsWith('Execução recusada:')) throw error;
    if (!databaseAccessDenied(error)) {
      throw new Error('Não foi possível comprovar o isolamento da conta de homologação.', { cause: error });
    }
  }

  return {
    database: identity.db,
    version: identity.version,
    currentUser: identity.currentUser,
    operationalAccessDenied: true,
  };
}
