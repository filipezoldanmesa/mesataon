import { shortProposalCode } from '@/lib/proposals/proposal-code';
import type { FranquiaSemRoyalty } from '@/lib/opportunities/types';

type Props = {
  franquias: FranquiaSemRoyalty[] | null | undefined;
};

/**
 * Nota discreta: o royalty de uma ou mais franquias ELEITAS não entrou no
 * cálculo consolidado, e por quê (ADO 68009).
 *
 * ## O que ela conserta
 *
 * O negócio elegeu a PCR sozinha, calculou, elegeu BR Mania + Lubrax+ ao lado,
 * calculou de novo — e a TIR e o VPL saíram **idênticos**. Reportou como erro de
 * cálculo. Uma das causas é real e legítima: `ElectedFranquiaRoyaltyService`
 * exclui da soma a franquia que ainda não tem faturamento, formato de loja ou
 * modelo de royalty. O que faltava era **a tela dizer**: a exclusão só existia
 * num `warn` de log, e o card ficava byte a byte igual nos dois cenários.
 *
 * ## Por que discreta, e nunca vermelha
 *
 * Molde do `DevolucaoAoLtNote`: barra fina, texto de legenda, sem fundo, sem
 * ícone, sem pill. **Nada falhou** — franquia meio preenchida é fato de negócio,
 * o cálculo que existe está correto para o que foi informado, e o conserto é do
 * LT. `--color-danger` afirmaria falha de sistema; `CalculationUnavailableNotice`
 * afirmaria indisponibilidade. Nenhuma das duas é verdade aqui.
 *
 * ## Por que ela some sozinha
 *
 * O backend resolve isto na LEITURA (não é snapshot do cálculo), então assim que
 * o LT completa a proposta a franquia sai da lista e a nota desaparece — sem
 * precisar recalcular para a tela parar de avisar.
 *
 * Lista vazia, `null` ou ausente ⇒ não renderiza nada. `null` aqui é "não sei"
 * (backend anterior ao campo, ou leitura que degradou), e um aviso derivado de
 * desconhecimento afirmaria sobre o cálculo o que ninguém apurou.
 */
export function RoyaltyFranquiaNote({ franquias }: Props) {
  if (!franquias || franquias.length === 0) return null;

  return (
    <p
      data-testid="royalty-franquia-fora-note"
      className="mt-2.5 border-l-2 border-(--yellow-700)/60 pl-2.5 text-(length:--t-caption) text-(--color-text-muted)"
    >
      <span className="font-bold">
        {franquias.length === 1
          ? 'O royalty de 1 franquia eleita não entrou neste cálculo.'
          : `O royalty de ${franquias.length} franquias eleitas não entrou neste cálculo.`}
      </span>{' '}
      {franquias.map((f, i) => (
        <span key={f.proposalId}>
          {i > 0 ? '; ' : ''}
          {/*
            O MESMO identificador que a linha da proposta imprime, pelo mesmo
            helper — é por ele que o usuário acha a proposta.

            ⚠️ Não é `f.codigo ?? f.bandeira`: proposta de franquia costuma ter
            `codigo` nulo (as ZBRM/ZLUB anteriores ao sequenciador), e a lista
            acima mostra o encurtamento do id (`P-93B2B7EB`). A nota dizendo
            "ZBRM" mandaria procurar por um rótulo que não está em lugar nenhum
            da tela.
          */}
          <b>{shortProposalCode(f.proposalId, f.codigo)}</b>
          {f.faltando.length > 0 ? `: falta informar ${listar(f.faltando)}` : ''}
        </span>
      ))}
      .
    </p>
  );
}

/** `["a", "b", "c"]` → `"a, b e c"` — enumeração em pt-BR, não `join(', ')`. */
function listar(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}
