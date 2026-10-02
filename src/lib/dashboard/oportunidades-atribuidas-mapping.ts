/**
 * Mapeamento do payload de `GET /v1/dashboard/oportunidades-atribuidas` para o
 * tipo que o quadro "Oportunidades atribuídas" consome (ADO 68531).
 *
 * ⚠️ **A BFF nunca faz passthrough cru** (CLAUDE.md §Frontend): o corpo é
 * serializado como `unknown`, então uma divergência de nome ou de forma compila
 * e só aparece em runtime, como campo vazio na tela.
 */

// ── Forma do backend ─────────────────────────────────────────────────────────

export interface BackendOportunidadeAtribuidaItem {
  oportunidadeId: string;
  codigo: string | null;
  clienteNome: string | null;
  atribuicao: string;
  atribuicaoLabel: string;
  /** `null` quando a gerência não tem analista na etapa de `sneg_assignments`. */
  analistaId: string | null;
  analistaNome: string | null;
  dataCadastro: string;
  href: string;
}

export interface BackendOportunidadesAtribuidasAnalista {
  id: string;
  nome: string;
  total: number;
}

export interface BackendDashboardOportunidadesAtribuidas {
  itens: BackendOportunidadeAtribuidaItem[];
  total: number | null;
  contagem?: string;
  analistas: BackendOportunidadesAtribuidasAnalista[];
  page: number | null;
  limit: number | null;
  hasMore: boolean;
  gaps: { secao: string; fonte: string; motivo: string }[];
}

// ── Forma da tela ────────────────────────────────────────────────────────────

export interface OportunidadeAtribuidaItem {
  oportunidadeId: string;
  /** Código de negócio; `null` cai no rótulo de lacuna, nunca no UUID. */
  codigo: string | null;
  clienteNome: string | null;
  /**
   * Rótulo pt-BR da atribuição — é o que a coluna exibe.
   *
   * ⚠️ O valor de máquina (`ANALISE`/`GARANTIA`/`MINUTA`) **não** atravessa: a
   * tela não ramifica sobre ele (o `href` já vem pronto do backend), e um enum
   * cru aqui convidaria a montar rota ou cor a partir dele.
   */
  atribuicaoLabel: string;
  analistaNome: string | null;
  /**
   * `true` quando a atribuição **não tem analista** — a gerência não está
   * parametrizada na etapa correspondente de `sneg_assignments`.
   *
   * ⚠️ É um fato diferente de `analistaNome === null`, e a tela escreve frases
   * diferentes para os dois: *"Sem analista"* (ninguém é responsável — pede
   * parametrização na Governança) × *"Sem nome"* (há responsável, o snapshot do
   * nome é que falta). Colapsá-los faria o quadro afirmar que uma oportunidade
   * está órfã só porque o nome não foi gravado.
   */
  semAnalista: boolean;
  /** ISO-8601 do backend; a formatação pt-BR é da tela. */
  dataCadastro: string;
  href: string;
}

export interface OportunidadesAtribuidasAnalista {
  id: string;
  nome: string;
  total: number;
}

/**
 * O que `total` conta — espelho de `ContagemAtribuidas` do backend. A SNEG vê
 * uma linha por atribuição; o BP Financeiro, uma por oportunidade (Evolução do
 * Dashboard SNEG). A tela escolhe o substantivo por aqui, nunca pela persona.
 */
export const ContagemAtribuidas = {
  Atribuicoes: 'ATRIBUICOES',
  Oportunidades: 'OPORTUNIDADES',
} as const;

export type ContagemAtribuidas = (typeof ContagemAtribuidas)[keyof typeof ContagemAtribuidas];

export interface OportunidadesAtribuidasData {
  itens: OportunidadeAtribuidaItem[];
  /** Conjunto filtrado INTEIRO — não o da página. `null` = fonte degradada. */
  total: number | null;
  contagem: ContagemAtribuidas;
  /** Vazio para quem vê só as próprias atribuições: aí não há seletor. */
  analistas: OportunidadesAtribuidasAnalista[];
  page: number | null;
  limit: number | null;
  hasMore: boolean;
  gaps: { secao: string; fonte: string; motivo: string }[];
}

// ── Mapper ───────────────────────────────────────────────────────────────────

/**
 * Converte o payload do backend.
 *
 * ⚠️ **`analistaId` da LINHA não atravessa** — só o booleano derivado dele
 * ({@link OportunidadeAtribuidaItem.semAnalista}). A coluna exibe
 * `analistaNome`, e o filtro trabalha com os ids do vocabulário `analistas[]`;
 * carregar o id na linha convidaria a derivar dela as opções do seletor, que é
 * exatamente o colapso que o backend existe para evitar (ADO 67912).
 */
export function mapDashboardOportunidadesAtribuidas(
  raw: BackendDashboardOportunidadesAtribuidas,
): OportunidadesAtribuidasData {
  return {
    itens: (raw.itens ?? []).map((i) => ({
      oportunidadeId: i.oportunidadeId,
      codigo: i.codigo ?? null,
      clienteNome: i.clienteNome ?? null,
      // Rótulo composto pelo backend; valor cru só se ele faltar — e aí o valor
      // de máquina é melhor que uma célula vazia, porque expõe a lacuna.
      atribuicaoLabel: i.atribuicaoLabel || i.atribuicao,
      analistaNome: i.analistaNome ?? null,
      /*
       * ⚠️ `== null` (frouxo) e sobre o ID, nunca sobre o nome: `undefined`
       * chega de um payload mais velho que o campo, e um `=== null` o leria
       * como "tem analista" — a linha órfã voltaria a se passar por atribuída,
       * que é o defeito que esta entrega corrige.
       */
      semAnalista: i.analistaId == null || i.analistaId === '',
      dataCadastro: i.dataCadastro,
      href: i.href,
    })),
    total: typeof raw.total === 'number' ? raw.total : null,
    /*
     * Valor ausente/desconhecido (backend mais velho que o campo) cai em
     * "atribuições", que é o que aquele backend de fato contava.
     */
    contagem:
      raw.contagem === ContagemAtribuidas.Oportunidades
        ? ContagemAtribuidas.Oportunidades
        : ContagemAtribuidas.Atribuicoes,
    analistas: (raw.analistas ?? []).map((a) => ({
      id: a.id,
      nome: a.nome || a.id,
      total: a.total,
    })),
    page: typeof raw.page === 'number' ? raw.page : null,
    limit: typeof raw.limit === 'number' ? raw.limit : null,
    hasMore: raw.hasMore === true,
    gaps: raw.gaps ?? [],
  };
}
