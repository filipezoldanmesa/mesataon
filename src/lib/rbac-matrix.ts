import { Role } from '@/lib/auth-roles';

/**
 * Matriz RBAC GOP v2.1 — espelho de `api/src/auth/rbac-matrix.ts`, uma
 * constante por LINHA da planilha, aplicada literalmente em 28/09/2026
 * (*"Deixa tudo de permissão igual à Matriz"*), com as exceções decididas pelo
 * cliente em 28/09/2026 (ver o cabeçalho de `api/src/auth/rbac-matrix.ts`).
 * `auth-permissions.test.ts` prende as permissões da tela a estas linhas.
 */
const TODOS: readonly Role[] = [
  Role.LT,
  Role.BpFinanceiro,
  Role.Sneg,
  Role.Visualizador,
  Role.Admin,
  Role.Spcom,
  Role.Ccob,
  Role.GerenteVarejo,
  Role.Expansao,
  Role.GestorFranquias,
  Role.TiSustentacao,
  Role.ConsultorExpansao,
  Role.Integridade,
];

const exceto = (...fora: Role[]): readonly Role[] =>
  TODOS.filter((role) => !fora.includes(role));

export const MATRIZ_CRIAR_EDITAR = exceto(Role.Visualizador, Role.Ccob, Role.Integridade);
export const MATRIZ_CANCELAR = MATRIZ_CRIAR_EDITAR;
export const MATRIZ_REJEITAR_DEVOLVER: readonly Role[] = [
  Role.BpFinanceiro,
  Role.Sneg,
  Role.Admin,
  Role.Spcom,
  Role.GestorFranquias,
  Role.TiSustentacao,
];
/** Consultor de Expansão: "apenas propostas de franquia" — o backend aplica. */
export const MATRIZ_ENVIAR_ANALISE = MATRIZ_CRIAR_EDITAR;
export const MATRIZ_DDI_VISUALIZAR = exceto(
  Role.Visualizador,
  Role.Ccob,
  Role.GestorFranquias,
  Role.ConsultorExpansao,
);
export const MATRIZ_DDI_EXECUTAR: readonly Role[] = [Role.Integridade];
export const MATRIZ_ANALISE_OPORTUNIDADE: readonly Role[] = [
  Role.BpFinanceiro,
  Role.Sneg,
  Role.Admin,
];
export const MATRIZ_PERFIL_PREVIA_VISUALIZAR = exceto(Role.Integridade);
export const MATRIZ_ENVIAR_APROVACAO = MATRIZ_CRIAR_EDITAR;
/** Consultor de Expansão: "apenas propostas de franquia" — o backend aplica. BP: "—". */
export const MATRIZ_MINUTA_ASSINATURA: readonly Role[] = [
  Role.Sneg,
  Role.Admin,
  Role.ConsultorExpansao,
];
/** Linha + BP Financeiro: *"não pode"* perder minuta/assinatura (Graziella, 28/09/2026). */
export const MINUTA_ASSINATURA_ROLES: readonly Role[] = [
  ...MATRIZ_MINUTA_ASSINATURA,
  Role.BpFinanceiro,
];
export const MATRIZ_VISUALIZAR_TODOS = TODOS;
export const MATRIZ_RESOLVER_PENDENCIAS = exceto(Role.Visualizador);

/**
 * GOVERNANÇA · Parametrizações — espelho de `api/src/auth/rbac-matrix.ts`: SNEG
 * fora (Graziella, ADO 67950), Gestor de Franquias só no que é de franquia
 * (Tiago), SPCOM visualiza. Auditoria segue só do TI Administrador.
 */
export const MATRIZ_GOVERNANCA_EXECUTAR: readonly Role[] = [
  Role.BpFinanceiro,
  Role.Admin,
  Role.TiSustentacao,
];
export const MATRIZ_GOVERNANCA_FRANQUIA_EXECUTAR: readonly Role[] = [
  ...MATRIZ_GOVERNANCA_EXECUTAR,
  Role.GestorFranquias,
];
export const MATRIZ_GOVERNANCA_VISUALIZAR: readonly Role[] = [
  ...MATRIZ_GOVERNANCA_EXECUTAR,
  Role.Spcom,
];
export const MATRIZ_GOVERNANCA_FRANQUIA_VISUALIZAR: readonly Role[] = [
  ...MATRIZ_GOVERNANCA_FRANQUIA_EXECUTAR,
  Role.Spcom,
];
