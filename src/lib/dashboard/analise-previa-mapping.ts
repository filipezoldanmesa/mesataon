/**
 * Mapeamento do payload de `GET /v1/dashboard/analise-previa` para o tipo que a
 * tabela "Análise Prévia" da visão geral da CCOB consome.
 *
 * ⚠️ **A BFF nunca faz passthrough cru** (CLAUDE.md §Frontend): o corpo é
 * serializado como `unknown`, então uma divergência de nome ou de forma compila
 * e só aparece em runtime, como campo vazio na tela. Aqui a interface
 * `Backend*` é explícita e o mapper é testado isolado.
 */

/*
 * ⚠️ **Não existe aqui uma constante para o sentinela `SEM_ANALISTA`.** A tela
 * nunca o escreve: o `value` de cada `<option>` vem de `analistas[]`, e o filtro
 * devolve ao backend exatamente o id que ele publicou. Um espelho do valor neste
 * arquivo seria uma segunda fonte para uma resposta que já tem dono — e a
 * primeira coisa que alguém faria com ele é comparar.
 */

// ── Forma do backend ─────────────────────────────────────────────────────────

export interface BackendAnalisePreviaItem {
  oportunidadeId: string;
  codigo: string | null;
  clienteNome: string | null;
  analistaId: string | null;
  analistaNome: string | null;
  bonificacaoAntecipadaBRL: number;
  novoMutuoBRL: number;
  mutuoBRL: number;
  totalBRL: number;
  href: string;
}

export interface BackendAnalisePreviaAnalista {
  id: string;
  nome: string;
  total: number;
}

export interface BackendDashboardAnalisePrevia {
  itens: BackendAnalisePreviaItem[];
  total: number | null;
  analistas: BackendAnalisePreviaAnalista[];
  page: number | null;
  limit: number | null;
  hasMore: boolean;
  gaps: { secao: string; fonte: string; motivo: string }[];
}

// ── Forma da tela ────────────────────────────────────────────────────────────

export interface AnalisePreviaItem {
  oportunidadeId: string;
  /**
   * O que a coluna "Oportunidade" exibe: o código quando existe, o nome do
   * cliente abaixo.
   *
   * ⚠️ Código ausente cai no **rótulo de lacuna**, nunca no UUID: id de máquina
   * não é texto de tela, e ele não ajuda quem lê a fila (o código é o que
   * circula entre as áreas).
   */
  codigo: string | null;
  clienteNome: string | null;
  analistaNome: string | null;
  bonificacaoAntecipadaBRL: number;
  novoMutuoBRL: number;
  mutuoBRL: number;
  totalBRL: number;
  href: string;
}

export interface AnalisePreviaAnalista {
  id: string;
  nome: string;
  total: number;
}

export interface AnalisePreviaData {
  itens: AnalisePreviaItem[];
  /**
   * Tamanho do conjunto FILTRADO INTEIRO — não o da página.
   *
   * `null` = a fonte degradou. **Não** é zero — ver `gaps`.
   */
  total: number | null;
  analistas: AnalisePreviaAnalista[];
  /** Página atual; `null` quando a chamada não pediu paginação. */
  page: number | null;
  /** Tamanho da página; `null` quando a chamada não pediu paginação. */
  limit: number | null;
  /** Veredito do backend sobre haver linha adiante — a tela não o recalcula. */
  hasMore: boolean;
  /** Fontes degradadas; a tela nomeia a primeira quando não há linha nenhuma. */
  gaps: { secao: string; fonte: string; motivo: string }[];
}

// ── Mapper ───────────────────────────────────────────────────────────────────

/**
 * Converte o payload do backend.
 *
 * ⚠️ **`analistaId` não atravessa para a tela.** A coluna exibe `analistaNome`,
 * e o filtro trabalha com os ids do vocabulário `analistas[]` — carregar o id
 * na linha convidaria a derivar dela as opções do seletor, que é exatamente o
 * colapso que o backend existe para evitar.
 *
 * Valor numérico ausente ou não-finito vira `0`, e isso é deliberado: o backend
 * já distingue "não há o que somar" (zeros + `gaps`) de "somou zero", então aqui
 * `null` só apareceria por payload corrompido — e uma coluna de moeda com
 * `NaN` derruba o `Intl.NumberFormat` e a tabela inteira junto.
 */
export function mapDashboardAnalisePrevia(
  raw: BackendDashboardAnalisePrevia,
): AnalisePreviaData {
  return {
    itens: (raw.itens ?? []).map((i) => ({
      oportunidadeId: i.oportunidadeId,
      codigo: i.codigo ?? null,
      clienteNome: i.clienteNome ?? null,
      analistaNome: i.analistaNome ?? null,
      bonificacaoAntecipadaBRL: numero(i.bonificacaoAntecipadaBRL),
      novoMutuoBRL: numero(i.novoMutuoBRL),
      mutuoBRL: numero(i.mutuoBRL),
      totalBRL: numero(i.totalBRL),
      href: i.href,
    })),
    total: typeof raw.total === 'number' ? raw.total : null,
    page: typeof raw.page === 'number' ? raw.page : null,
    limit: typeof raw.limit === 'number' ? raw.limit : null,
    hasMore: raw.hasMore === true,
    analistas: (raw.analistas ?? []).map((a) => ({
      id: a.id,
      // Rótulo vem do backend; id cru só se o snapshot do nome faltar dos dois
      // lados — e aí o id é melhor que uma opção em branco.
      nome: a.nome || a.id,
      total: a.total,
    })),
    gaps: raw.gaps ?? [],
  };
}

function numero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
