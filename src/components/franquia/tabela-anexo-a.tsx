'use client';

/**
 * A tabela do Anexo A de uma chave `política × formato de loja` (ADO 67572).
 *
 * ## Por que a tabela inteira, e não a faixa aplicada
 *
 * O negócio publicou uma tarifa de QUATRO faixas e dez colunas e pediu, em
 * 26/08/2026, que ela constasse em tela — "Não consta em tela" foi a reabertura
 * do bug. Até aqui as duas telas mostravam menos que isso, cada uma de um jeito:
 *
 *  - a tela da proposta pintava só a faixa APLICADA, como pares
 *    Componente/Valor, e ainda escondia componente nulo (`.filter`), então numa
 *    linha de catálogo sem tabaco a tabela tinha duas linhas em vez de seis;
 *  - a tela de criação trocava a tabela por uma FRASE quando havia mais de uma
 *    faixa — que é exatamente o caso do escalonado — e nem chegava lá, porque
 *    `exibeTabelaDeRoyalties` escondia o bloco inteiro para essa política.
 *
 * ## Um componente, duas telas
 *
 * As duas pintam a mesma tabela. Duas cópias divergiriam — é o modo de falha
 * recorrente deste repositório, e aqui ele seria invisível: as duas telas
 * renderizam percentual e ninguém compara.
 *
 * ## Qual linha está aplicada NÃO é decidido aqui
 *
 * `seqAplicada` vem do backend (`royaltiesCalculados.faixa.registroSequencial`),
 * que resolve a faixa a partir do faturamento uma única vez. Reimplementar a
 * seleção aqui poria uma segunda cópia de um limite de faixa no código — e o
 * limite é o que o módulo de domínio existe para guardar. `null` = nenhuma linha
 * marcada, que é o estado legítimo da tela de criação (a proposta ainda não
 * existe) e da proposta sem faturamento.
 */

import { StatusPill } from '@/components/status-pill';
import { formatBrlString, formatRatioPercent } from '@/lib/franquia/format';
import type { RoyaltyFaixa } from '@/lib/franquia/proposta-franquia-mapping';
import {
  algumaFaixaHerdaTabaco,
  taxaTabacoDaFaixa,
} from '@/lib/franquia/royalty-band-view';

/*
 * O cabeçalho QUEBRA linha e as células de valor não (ADO · 26/08/2026).
 *
 * São sete colunas com rótulo longo ("Valor fixo de fundo de mkt"); com
 * `whitespace-nowrap` no `th` a largura mínima da tabela passava da coluna de
 * `1fr` da tela e — sem `min-w-0` no item de grid — empurrava o painel lateral
 * para fora do enquadramento. Quebrar só o cabeçalho encolhe a tabela sem
 * partir número nenhum: `R$ 361.800,00` e `2,01%` continuam em uma linha, que
 * é o que torna a coluna legível de relance.
 */
const TH =
  'border-b border-(--color-border) px-2 py-[7px] text-left align-bottom text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)';
const TD =
  'border-b border-(--color-border) px-2 py-[7px] align-top whitespace-nowrap';

/**
 * O intervalo da faixa, ou `Única` quando a política não tem faixa de
 * faturamento.
 *
 * ⚠️ Nunca `— – —` (CA-4): dois travessões leriam como dado faltando, e
 * `PERCENTUAL_UNICO`/`POR_CATEGORIA` legitimamente não têm faixa.
 */
function rotuloDaFaixa(faixa: RoyaltyFaixa): string {
  const inicio = formatBrlString(faixa.inicioFaixaBrl);
  const fim = formatBrlString(faixa.fimFaixaBrl);
  if (inicio === null && fim === null) return 'Única';
  return `${inicio ?? '—'} – ${fim ?? '—'}`;
}

export function TabelaAnexoA({
  faixas,
  seqAplicada,
  testId = 'tabela-anexo-a',
}: {
  faixas: RoyaltyFaixa[];
  seqAplicada: number | null;
  testId?: string;
}) {
  const herdaTabaco = algumaFaixaHerdaTabaco(faixas);

  return (
    /* Tabela larga rola no PRÓPRIO container — o body da página nunca rola na
       horizontal (CLAUDE.md · responsivo). */
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[14px]" data-testid={testId}>
        <thead>
          <tr>
            <th className={TH}>Faixa de faturamento (R$)</th>
            <th className={TH}>Royalty</th>
            <th className={TH}>Royalty · tabaco</th>
            <th className={TH}>Fundo de mkt</th>
            <th className={TH}>Fundo de mkt · tabaco</th>
            <th className={TH}>Valor fixo de royalty</th>
            <th className={TH}>Valor fixo de fundo de mkt</th>
          </tr>
        </thead>
        <tbody>
          {faixas.map((faixa) => {
            const aplicada =
              seqAplicada !== null && faixa.registroSequencial === seqAplicada;
            const royTabaco = taxaTabacoDaFaixa(
              faixa.percRoyaltyTabaco,
              faixa.percRoyalty,
            );
            const fmkTabaco = taxaTabacoDaFaixa(
              faixa.percFundoDeMktTabaco,
              faixa.percFundoDeMkt,
            );

            return (
              <tr
                key={faixa.registroSequencial}
                data-testid={`faixa-${faixa.registroSequencial}`}
                data-aplicada={aplicada ? 'true' : undefined}
                aria-current={aplicada ? 'true' : undefined}
                className={aplicada ? 'bg-(--secondary-100)' : undefined}
              >
                <td className={`${TD} whitespace-normal`}>
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {rotuloDaFaixa(faixa)}
                    {/* Único veredito da tabela — o resto é medida, texto
                        neutro, nunca pill (ADR-0018). */}
                    {aplicada && (
                      <StatusPill variant="success" data-testid="faixa-aplicada">
                        Faixa aplicada
                      </StatusPill>
                    )}
                  </span>
                </td>
                {/* Zero é medida: `0,00%` e `R$ 0,00` são renderizados, nunca
                    escondidos — foi o `.filter(l => l.valor !== null)` que
                    sumiu com metade da tabela. */}
                <td className={TD}>
                  <b>{formatRatioPercent(faixa.percRoyalty) ?? '—'}</b>
                </td>
                <td className={TD}>
                  <b>{royTabaco.valor ?? '—'}</b>
                  {royTabaco.herdado && <MarcaHerdado />}
                </td>
                <td className={TD}>
                  <b>{formatRatioPercent(faixa.percFundoDeMkt) ?? '—'}</b>
                </td>
                <td className={TD}>
                  <b>{fmkTabaco.valor ?? '—'}</b>
                  {fmkTabaco.herdado && <MarcaHerdado />}
                </td>
                {/* Valor fixo ausente numa política percentual é `—` de fato:
                    ali não há herança, o cálculo não usa o campo. */}
                <td className={TD}>
                  <b>{formatBrlString(faixa.valorFixoRoyaltyBrl) ?? '—'}</b>
                </td>
                <td className={TD}>
                  <b>{formatBrlString(faixa.valorFixoFundoMktBrl) ?? '—'}</b>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {herdaTabaco && (
        <p
          className="mt-2 text-[12px] text-(--color-text-muted)"
          data-testid="tabela-anexo-a-nota-tabaco"
        >
          * O catálogo não distingue tabaco nesta faixa — aplica-se a mesma taxa
          das demais categorias.
        </p>
      )}
    </div>
  );
}

/** Marca do valor herdado da taxa geral — explicada na nota sob a tabela. */
function MarcaHerdado() {
  return (
    <sup
      className="ml-0.5 text-(--color-text-muted)"
      title="O catálogo não distingue tabaco nesta faixa — aplica-se a taxa das demais categorias."
    >
      *
    </sup>
  );
}
