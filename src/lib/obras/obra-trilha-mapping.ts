/**
 * Fronteira BFF → front da trilha da obra (ADO 67921).
 *
 * ⚠️ Mapeamento **explícito**, nunca `NextResponse.json(await res.json())`: o
 * passthrough compila (a expressão não tem tipo) e falha só em runtime,
 * renderizando campo vazio. Mesma doutrina que o `obra-mapping.ts` ao lado
 * documenta no topo.
 *
 * Este payload **não tem PII** — é o que permite a rota do backend ficar sem
 * `@Roles`, ao contrário do `GET .../obra`, que carrega CNPJ da empreiteira e
 * e-mail do engenheiro.
 */

/** Estado de um degrau — o mesmo vocabulário da trilha de garantia. */
export type ObraPassoEstado = 'done' | 'active' | 'pending';

export interface ObraPasso {
  /** Posição 1-based — o número do círculo. */
  ordem: number;
  /** Nome do degrau em pt-BR, composto pelo backend (ADR-0018). */
  label: string;
  /**
   * Área responsável pelo degrau — a pill sob o círculo, como na trilha do
   * fluxo principal. Composta pelo backend, nunca derivada aqui.
   */
  gresp: string;
  estado: ObraPassoEstado;
  /**
   * Linha pt-BR sob o degrau, renderizada verbatim. Nenhum degrau a emite hoje —
   * o slot fica porque a razão de um degrau parado pertence ao degrau.
   */
  detalhe?: string;
}

export interface ObraTrilha {
  /** `false` é fato de negócio ("não tem obra"), não erro. */
  temObra: boolean;
  /**
   * Sub-rótulo da aba Obra. Com obra, o status do §6; sem obra, "Aguardando
   * ativação" — o literal do protótipo. **Nunca derivado aqui.**
   */
  subLabel: string;
  /** Código da pill do design system (`s`/`w`/`i`/`d`/`n`). */
  pill: string;
  /**
   * Os degraus da escada, na ordem. São sete desde 18/09/2026 — a escada deixou
   * de bifurcar por modelo de contratação —, e ainda assim a tela nunca assume
   * um número fixo: quem manda a lista é o backend.
   */
  passos: ObraPasso[];
  /** Legenda sob a trilha, composta pelo backend. `null` quando não há o que dizer. */
  nota: string | null;
}

export interface BackendObraPasso {
  ordem: number;
  label: string;
  gresp?: string;
  estado: string;
  detalhe?: string;
}

export interface BackendObraTrilha {
  temObra: boolean;
  subLabel: string;
  pill: string;
  passos: BackendObraPasso[];
  nota: string | null;
}

const ESTADOS: readonly ObraPassoEstado[] = ['done', 'active', 'pending'];

/**
 * Estado desconhecido degrada para `pending`.
 *
 * A coluna do backend é `string` (não enum TS), e um valor que este build não
 * conhece não pode virar `done` — pintar de verde um degrau cujo estado ninguém
 * leu é a mesma classe de erro que a lista fechada de status do Converge existe
 * para impedir.
 */
function mapEstado(raw: string): ObraPassoEstado {
  return (ESTADOS as readonly string[]).includes(raw)
    ? (raw as ObraPassoEstado)
    : 'pending';
}

export function mapObraPasso(raw: BackendObraPasso): ObraPasso {
  return {
    ordem: raw.ordem,
    label: raw.label,
    /*
     * `?? ''` só impede `undefined` chegar à tela numa resposta malformada — o
     * backend sempre manda a área. A pill some quando a string é vazia, que é
     * melhor que renderizar "undefined" sob a bolinha.
     */
    gresp: raw.gresp ?? '',
    estado: mapEstado(raw.estado),
    ...(raw.detalhe !== undefined ? { detalhe: raw.detalhe } : {}),
  };
}

export function mapObraTrilha(raw: BackendObraTrilha): ObraTrilha {
  return {
    temObra: raw.temObra === true,
    subLabel: raw.subLabel,
    pill: raw.pill,
    /*
     * `?? []` não é "erro virando lista vazia": o backend sempre manda os
     * degraus, e o fallback só impede `undefined` quebrar um `.map()` na tela.
     * O mapper é a fronteira e não pode confiar na forma do JSON.
     */
    passos: (raw.passos ?? []).map(mapObraPasso),
    nota: raw.nota ?? null,
  };
}
