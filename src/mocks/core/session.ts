import { SESSION_COOKIE } from '@/lib/auth-guard';

/**
 * Perfis de acesso do protótipo — espelho de `apps/api/src/auth/access-profiles.ts`
 * (os 13 perfis do IAM da Vibra). O login do protótipo é o picker mockado que já
 * existe no produto: a chave do perfil viaja como `code`, e o cookie de sessão
 * guarda a própria chave (não há token — não há backend).
 *
 * Os nomes de usuário são FICTÍCIOS. Nunca use nome, e-mail ou CPF/CNPJ de
 * pessoa ou empresa real no protótipo.
 */
export interface MockUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  profileKey: string;
}

export interface MockProfile {
  key: string;
  label: string;
  description: string;
  entraGroup: string;
  roles: string[];
  userId: string;
  userName: string;
  email: string;
}

export const PERFIS: MockProfile[] = [
  {
    key: 'LIDER_TERRITORIO',
    label: 'Líder de Território',
    description: 'Responsável pela criação e acompanhamento das oportunidades de contratação do Varejo.',
    entraGroup: 'VBR_GOP_LIDTERR_DEV',
    roles: ['LT'],
    userId: 'usr-lt-ana',
    userName: 'Ana Ribeiro',
    email: 'ana.ribeiro@exemplo.com.br',
  },
  {
    key: 'BP_FINANCEIRO',
    label: 'BP Financeiro',
    description: 'Responsável pelo acompanhamento das oportunidades e parametrizações financeiras do sistema.',
    entraGroup: 'VBR_GOP_BPFIN_DEV',
    roles: ['BP_FINANCEIRO', 'APPROVER'],
    userId: 'usr-bp-bruno',
    userName: 'Bruno Carvalho',
    email: 'bruno.carvalho@exemplo.com.br',
  },
  {
    key: 'SNEG',
    label: 'SNEG',
    description: 'Responsável pela análise, validação e conferência das oportunidades.',
    entraGroup: 'VBR_GOP_SNEG_DEV',
    roles: ['SNEG'],
    userId: 'usr-sneg-carla',
    userName: 'Carla Mendes',
    email: 'carla.mendes@exemplo.com.br',
  },
  {
    key: 'VISUALIZADOR',
    label: 'Visualizador',
    description: 'Visualização das oportunidades e documentos, sem permissão de alteração.',
    entraGroup: 'VBR_GOP_VISUAL_DEV',
    roles: ['VISUALIZADOR'],
    userId: 'usr-vis-diego',
    userName: 'Diego Nunes',
    email: 'diego.nunes@exemplo.com.br',
  },
  {
    key: 'TI_ADMINISTRADOR',
    label: 'TI Administrador',
    description: 'Administração técnica, configurações e gestão de acessos do sistema.',
    entraGroup: 'VBR_GOP_TIADMIN_DEV',
    roles: ['ADMIN'],
    userId: 'usr-adm-elisa',
    userName: 'Elisa Prado',
    email: 'elisa.prado@exemplo.com.br',
  },
  {
    key: 'SPCOM',
    label: 'SPCOM',
    description: 'Responsável pela gestão contratual e acompanhamento do fluxo de contratos.',
    entraGroup: 'VBR_GOP_SPCOM_DEV',
    roles: ['SPCOM'],
    userId: 'usr-spcom-fabio',
    userName: 'Fábio Teixeira',
    email: 'fabio.teixeira@exemplo.com.br',
  },
  {
    key: 'CCOB',
    label: 'CCOB',
    description: 'Responsável pelas análises de crédito e cobrança.',
    entraGroup: 'VBR_GOP_CCOB_DEV',
    roles: ['CCOB'],
    userId: 'usr-ccob-gabriela',
    userName: 'Gabriela Lopes',
    email: 'gabriela.lopes@exemplo.com.br',
  },
  {
    key: 'GERENTE_VAREJO',
    label: 'Gerente Varejo',
    description: 'Responsável pela gestão e acompanhamento das oportunidades de sua regional.',
    entraGroup: 'VBR_GOP_GERVAREJO_DEV',
    roles: ['GERENTE_VAREJO', 'APPROVER'],
    userId: 'usr-gv-henrique',
    userName: 'Henrique Barros',
    email: 'henrique.barros@exemplo.com.br',
  },
  {
    key: 'EXPANSAO',
    label: 'Expansão',
    description: 'Criação e acompanhamento das oportunidades relacionadas à expansão da rede.',
    entraGroup: 'VBR_GOP_EXPANSAO_DEV',
    roles: ['EXPANSAO'],
    userId: 'usr-exp-isabela',
    userName: 'Isabela Rocha',
    email: 'isabela.rocha@exemplo.com.br',
  },
  {
    key: 'GESTOR_FRANQUIAS',
    label: 'Gestor de Franquias',
    description: 'Responsável pela gestão e acompanhamento das oportunidades de franquias.',
    entraGroup: 'VBR_GOP_GESTFRANQ_DEV',
    roles: ['GESTOR_FRANQUIAS'],
    userId: 'usr-gf-joao',
    userName: 'João Vieira',
    email: 'joao.vieira@exemplo.com.br',
  },
  {
    key: 'TI_SUSTENTACAO',
    label: 'TI Sustentação',
    description: 'Responsável pelo suporte técnico e manutenção operacional do sistema.',
    entraGroup: 'VBR_GOP_TISUST_DEV',
    roles: ['TI_SUSTENTACAO'],
    userId: 'usr-tis-karina',
    userName: 'Karina Duarte',
    email: 'karina.duarte@exemplo.com.br',
  },
  {
    key: 'CONSULTOR_EXPANSAO',
    label: 'Consultor de Expansão',
    description: 'Responsável pela criação e acompanhamento das propostas de franquias.',
    entraGroup: 'VBR_GOP_CONSEXP_DEV',
    roles: ['CONSULTOR_EXPANSAO'],
    userId: 'usr-cex-lucas',
    userName: 'Lucas Martins',
    email: 'lucas.martins@exemplo.com.br',
  },
  {
    key: 'INTEGRIDADE',
    label: 'Integridade',
    description:
      'Responsável pela análise de integridade (DDI): emite o parecer, classifica o risco e libera ou reprova a oportunidade.',
    entraGroup: 'VBR_GOP_INTEGRIDADE_DEV',
    roles: ['INTEGRIDADE', 'COMPLIANCE'],
    userId: 'usr-int-marina',
    userName: 'Marina Castro',
    email: 'marina.castro@exemplo.com.br',
  },
];

export function perfilPorChave(key: string | undefined | null): MockProfile | null {
  return PERFIS.find((p) => p.key === key) ?? null;
}

export function usuarioDoPerfil(p: MockProfile): MockUser {
  return { id: p.userId, email: p.email, name: p.userName, roles: p.roles, profileKey: p.key };
}

/** Todos os usuários fictícios (um por perfil) — base do diretório de colaboradores. */
export function todosOsUsuarios(): MockUser[] {
  return PERFIS.map(usuarioDoPerfil);
}

/**
 * Colaboradores ALÉM dos 13 do login — para os seletores (reatribuir analista,
 * montar equipe, diretório) terem escolha real. Não fazem login, mas existem
 * no diretório.
 *
 * ⚠️ Fonte ÚNICA: o diretório (`/api/directory/*`) lista daqui e toda
 * reatribuição valida daqui. Analista inventado num domínio só aparece no
 * seletor e é recusado no outro.
 */
export interface Colaborador extends MockUser {
  /** Cidade de lotação; ausente = a da área do perfil. */
  region?: string;
}

export const COLABORADORES_EXTRAS: Colaborador[] = [
  { id: 'usr-lt-paulo', name: 'Paulo Henrique Saraiva', email: 'paulo.saraiva@exemplo.com.br', profileKey: 'LIDER_TERRITORIO', roles: ['LT'], region: 'Ribeirão Preto, SP' },
  { id: 'usr-lt-tatiane', name: 'Tatiane Albuquerque', email: 'tatiane.albuquerque@exemplo.com.br', profileKey: 'LIDER_TERRITORIO', roles: ['LT'], region: 'Belo Horizonte, MG' },
  { id: 'usr-lt-rafael', name: 'Rafael Gouveia', email: 'rafael.gouveia@exemplo.com.br', profileKey: 'LIDER_TERRITORIO', roles: ['LT'], region: 'Porto Alegre, RS' },
  { id: 'usr-sneg-otavio', name: 'Otávio Brandão', email: 'otavio.brandao@exemplo.com.br', profileKey: 'SNEG', roles: ['SNEG'] },
  { id: 'usr-sneg-priscila', name: 'Priscila Fontes', email: 'priscila.fontes@exemplo.com.br', profileKey: 'SNEG', roles: ['SNEG'] },
  { id: 'usr-sneg-juliana', name: 'Juliana Costa', email: 'juliana.costa@exemplo.com.br', profileKey: 'SNEG', roles: ['SNEG'] },
  { id: 'usr-ccob-rodrigo', name: 'Rodrigo Amaral', email: 'rodrigo.amaral@exemplo.com.br', profileKey: 'CCOB', roles: ['CCOB'] },
  { id: 'usr-ccob-rafael', name: 'Rafael Antunes', email: 'rafael.antunes@exemplo.com.br', profileKey: 'CCOB', roles: ['CCOB'] },
  { id: 'usr-ccob-patricia', name: 'Patrícia Moura', email: 'patricia.moura@exemplo.com.br', profileKey: 'CCOB', roles: ['CCOB'] },
  { id: 'usr-spcom-silvia', name: 'Sílvia Monteiro', email: 'silvia.monteiro@exemplo.com.br', profileKey: 'SPCOM', roles: ['SPCOM'] },
  { id: 'usr-gf-beatriz', name: 'Beatriz Nogueira', email: 'beatriz.nogueira@exemplo.com.br', profileKey: 'GESTOR_FRANQUIAS', roles: ['GESTOR_FRANQUIAS'] },
  { id: 'usr-exp-vinicius', name: 'Vinícius Coelho', email: 'vinicius.coelho@exemplo.com.br', profileKey: 'EXPANSAO', roles: ['EXPANSAO'], region: 'Curitiba, PR' },
  { id: 'usr-cex-amanda', name: 'Amanda Ferraz', email: 'amanda.ferraz@exemplo.com.br', profileKey: 'CONSULTOR_EXPANSAO', roles: ['CONSULTOR_EXPANSAO'], region: 'Salvador, BA' },
  { id: 'usr-gv-claudio', name: 'Cláudio Medeiros', email: 'claudio.medeiros@exemplo.com.br', profileKey: 'GERENTE_VAREJO', roles: ['GERENTE_VAREJO', 'APPROVER'], region: 'Belo Horizonte, MG' },
];

/** Todo o diretório: os 13 do login + os extras. */
export function todosOsColaboradores(): Colaborador[] {
  return [...todosOsUsuarios(), ...COLABORADORES_EXTRAS];
}

/** Colaboradores que têm o papel — base de toda validação de reatribuição. */
export function colaboradoresComPapel(...roles: string[]): Colaborador[] {
  return todosOsColaboradores().filter((c) => c.roles.some((r) => roles.includes(r)));
}

/** Resolve qualquer colaborador do diretório (login ou extra) pelo id. */
export function usuarioPorId(id: string | null | undefined): MockUser | null {
  return todosOsColaboradores().find((c) => c.id === id) ?? null;
}

/** Lê o cookie de sessão (que no protótipo É a chave do perfil). */
export function usuarioDaRequisicao(request: Request): MockUser | null {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  const perfil = perfilPorChave(decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)));
  return perfil ? usuarioDoPerfil(perfil) : null;
}

export function temPapel(user: MockUser | null, ...roles: string[]): boolean {
  return !!user && user.roles.some((r) => roles.includes(r));
}
