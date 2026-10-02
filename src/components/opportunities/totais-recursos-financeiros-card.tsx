'use client';

import {
  CardCollapseToggle,
  useCardCollapse,
} from '@/components/proposals/card-collapse';
import { formatCurrencyBRL } from '@/lib/clients/format';
import type { TotaisRecursosFinanceiros } from '@/lib/opportunities/types';

/**
 * Os seis campos, na ORDEM da tela do Salesforce que o negócio mandou.
 *
 * A grade é de duas colunas e preenche por LINHA, então a ordem aqui alterna
 * entre as duas colunas do print — coluna esquerda "Bonificação Antecipada +
 * Novo Mútuo / Total Bonificação Desempenho / Valor Total Bonific. + Novo
 * Mútuo", coluna direita "Total Recurso Financeiro Mútuo / Mútuo + Antecipação
 * + Novo Mútuo / Valor Total dos Recursos Financeiros". Reordenar esta lista
 * muda o card.
 *
 * **Os rótulos são o `label` do campo no org, verbatim** (medidos por describe
 * em 28/08/2026, ver `domain/totais-recursos-financeiros.ts` no backend).
 * Reescrevê-los para "ficar mais claro" faria a tela e o CRM chamarem o mesmo
 * número por nomes diferentes — e é o nome do CRM que o usuário repete ao
 * suporte.
 */
const TOTAIS_RECURSOS_FINANCEIROS_CAMPOS: ReadonlyArray<{
  readonly key: keyof TotaisRecursosFinanceiros;
  readonly label: string;
}> = [
  {
    key: 'bonificacaoAntecipadaComNovoMutuoBRL',
    label: 'Bonificação Antecipada + Novo Mútuo',
  },
  { key: 'totalRecursoFinanceiroMutuoBRL', label: 'Total Recurso Financeiro Mútuo' },
  { key: 'totalBonificacaoDesempenhoBRL', label: 'Total Bonificação Desempenho' },
  { key: 'mutuoComAntecipacaoENovoMutuoBRL', label: 'Mútuo + Antecipação + Novo Mútuo' },
  {
    key: 'valorTotalBonificacaoComNovoMutuoBRL',
    label: 'Valor Total Bonific. + Novo Mútuo',
  },
  {
    key: 'valorTotalRecursosFinanceirosBRL',
    label: 'Valor Total dos Recursos Financeiros',
  },
];

/**
 * Card "Totais - Recursos Financeiros" — os seis totais que o Salesforce exibe
 * na `Opportunity`, somados sobre os recursos financeiros das propostas eleitas.
 *
 * ## `null` esconde o card, e é o backend que decide
 *
 * O pedido do negócio é *"quando uma oportunidade passar da fase de
 * preenchimento, exibir um card…"*, e essa fase é renderizada por QUATRO
 * superfícies (workspace da análise, aprovação, contrato e a visão de leitura de
 * quem não tem a permissão de troca de view). Por isso o predicado de fase vive
 * no backend (`TotaisRecursosFinanceirosService`) e chega aqui como presença do
 * slot: cada superfície monta o card sem condição nenhuma e ele simplesmente
 * não aparece antes da análise. Quatro cópias de "já passou do preenchimento?"
 * divergiriam.
 *
 * ## Número × ausência
 *
 * `0` é soma de verdade e renderiza `R$ 0,00` — é o que o roll-up de moeda do
 * org exibe, e é o que a própria captura de tela do pedido mostra em "Total
 * Recurso Financeiro Mútuo". `null` (campo que o backend não mandou) renderiza
 * `—`; fabricar `R$ 0,00` ali afirmaria uma soma que ninguém fez.
 *
 * Colapsável pelo próprio cabeçalho, como o card no Salesforce (e como os
 * demais cards desta tela). O chevron fica no FIM do título — convenção do
 * protótipo desta plataforma —, não no começo como no Lightning.
 */
export function TotaisRecursosFinanceirosCard({
  totais,
  className = '',
}: {
  /** `null`/ausente ⇒ o card não renderiza (a fase não o comporta). */
  totais: TotaisRecursosFinanceiros | null | undefined;
  /**
   * Ritmo vertical do call site — **o card não traz margem própria**, mesma
   * razão do `AlcadaSagaPanel`: as superfícies que o montam usam ritmos
   * diferentes (`mt-4` na tela de preenchimento, `mb-4` no workspace da
   * análise, `gap` da coluna na aprovação e no contrato). Uma margem fixa aqui
   * colaria o card no vizinho em três das quatro.
   */
  className?: string;
}) {
  const collapse = useCardCollapse();

  if (!totais) return null;

  return (
    <div
      data-testid="totais-recursos-financeiros"
      {...collapse.sectionProps}
      className={`rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5 ${className}`}
    >
      <div
        {...collapse.headProps}
        className="mb-3.5 flex items-baseline justify-between gap-2.5"
      >
        <h2 className="text-(length:--t-h4) font-bold">Totais - Recursos Financeiros</h2>
        <CardCollapseToggle {...collapse.toggleProps} />
      </div>

      <div className="grid grid-cols-2 gap-x-7 gap-y-3 max-sm:grid-cols-1">
        {TOTAIS_RECURSOS_FINANCEIROS_CAMPOS.map(({ key, label }) => {
          const value = totais[key];
          return (
            <div key={key}>
              <div className="text-[12px] font-normal uppercase tracking-[0.3px] text-(--color-text-muted)">
                {label}
              </div>
              <div className="mt-0.5 text-(length:--t-caption) font-bold">
                {value === null || value === undefined ? '—' : formatCurrencyBRL(value)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
