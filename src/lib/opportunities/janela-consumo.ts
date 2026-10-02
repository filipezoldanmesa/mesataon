import { formatCalendarDateBR } from '@/lib/date-format';

/**
 * O texto da linha "Datas de início/fim de consumo" do card
 * "Dados da oportunidade" (ADO 68242).
 *
 * ## Por que é função compartilhada, e não JSX repetido
 *
 * QUATRO telas montam esse card, cada uma com o seu próprio átomo de campo
 * (`DataField` × `DItem` × `Field` × `DField`) — a marcação não dá para
 * compartilhar, mas a COMPOSIÇÃO dá. É o mesmo arranjo (e a mesma razão) de
 * `lib/opportunities/nova-imagem-pista.ts`: o compartilhado é a REGRA, não o
 * markup. Quatro cópias divergiriam justamente no detalhe que menos se nota — o
 * formatador —, e é ele que carrega o defeito abaixo.
 *
 * ## ⚠️ `formatCalendarDateBR`, nunca `new Date(...).toLocaleDateString`
 *
 * `janelaConsumo` são datas de CALENDÁRIO (`YYYY-MM-DD`), derivadas de
 * `proposals.data_inicio_analise` / `data_fim_analise`. `new Date('2026-08-01')`
 * parseia como meia-noite **UTC**, e em Brasília (UTC−3)
 * `toLocaleDateString('pt-BR')` rende **31/07/2026** — um dia antes do que o LT
 * informou, na tela e em qualquer print que ele mande ao cliente. É exatamente o
 * defeito que a validade do documento do repositório já custou (ADO 67993).
 *
 * ## As duas datas ou nenhuma
 *
 * Meia janela ("01/08/2026 → —") não é um fato, é um meio-fato que se lê como
 * dado corrompido. O backend já garante o par (as colunas são NOT NULL e
 * `buildJanelaConsumo` recusa meia janela); esta função repete a guarda porque o
 * tipo do front admite os dois campos independentes, herdados de quando eles
 * eram `null` chumbado.
 *
 * `null` — e não `'—'` — quando não há janela: quem decide como renderizar
 * ausência é o call site, que tem o átomo de campo (e três dos quatro já rendem
 * `value ?? '—'` por conta própria).
 */
export function textoJanelaConsumo(
  inicio: string | null | undefined,
  fim: string | null | undefined,
): string | null {
  if (!inicio || !fim) return null;
  return `${formatCalendarDateBR(inicio)} → ${formatCalendarDateBR(fim)}`;
}
