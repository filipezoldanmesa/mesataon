"use client";

import { formatCurrencyBRL } from "@/lib/clients/format";
import { formatDateBR } from "@/lib/franquia/format";
import { cronogramaDaObra } from "@/lib/obras/obra-cronograma";
import type { ObraParcela } from "@/lib/obras/obra-mapping";

/*
 * Mesmas classes de tabela do `TabelaAnexoA` — as duas tabelas convivem na
 * mesma tela de proposta, e estilos próprios aqui as fariam divergir no detalhe
 * que menos se nota (o peso da borda, o `uppercase` do cabeçalho).
 */
const TH =
  "border-b border-(--color-border) px-2 py-[7px] text-left align-bottom text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)";
const TD =
  "border-b border-(--color-border) px-2 py-[7px] align-top whitespace-nowrap";

/**
 * As parcelas da obra, como o Converge as publica — ADO 67924.
 *
 * ## O que ela responde
 *
 * O pedido do negócio (26/08/2026) é *"trazer do CONVERGE e **apresentar** 3
 * parcelas referente a nova imagem"*, com data de lançamento por parcela; e o
 * anexo do bug pergunta, sobre a data de liberação do cartão, *"que data é
 * esta?"*. Esta tabela é a resposta das duas coisas: os valores são os que a
 * fonte publica (nada é calculado aqui) e as datas são as da regra do negócio,
 * ancoradas na data de liberação que o LT escolheu.
 *
 * ## Por que a parcela de impostos aparece aqui e não no recurso
 *
 * Ela vence junto da ÚLTIMA parcela da obra, não um período depois dela, e nem o
 * `FinancialResource` desta plataforma nem o `Recurso_Financeiro_Da_Cotacao__c`
 * do org têm cronograma por parcela — os dois guardam um valor e uma
 * periodicidade. Então ela é **exibida** (com o total ao lado, para os números
 * fecharem com a tela do Converge) e fica fora do que o recurso lança. A nota
 * abaixo da tabela diz isso: sem ela, a diferença entre o total da tabela e o
 * "Valor total" do recurso leria como erro de cálculo.
 *
 * Renderiza `null` quando a obra não publica parcela nenhuma — tabela vazia
 * leria como dado que o sistema falhou em carregar.
 */
export function ObraParcelasCronograma({
  parcelas,
  dataLiberacao,
  periodicidade,
  etapas,
  variante = "recurso-legado",
  testId = "obra-parcelas-cronograma",
}: {
  parcelas: readonly ObraParcela[];
  /** ISO `YYYY-MM-DD`. Vazio/ausente ⇒ as datas ficam em travessão. */
  dataLiberacao?: string | null;
  periodicidade?: string | null;
  /**
   * Onde esta tabela está sendo exibida — e, por consequência, **o que ela
   * pode afirmar**.
   *
   * - `'recurso-legado'` (default): o cartão de um recurso gravado quando UMA
   *   linha guardava as N parcelas da obra e a de impostos ficava de fora
   *   (limitação de modelo do ADR-0048). Ali a nota de impostos é verdadeira,
   *   e a data de lançamento também: aquele recurso tem quantidade e
   *   periodicidade, então há um cronograma a projetar.
   * - `'dialogo-de-obra'`: o diálogo "Adicionar obra" (ADR-0051). Ali as duas
   *   coisas deixaram de valer — a parcela de impostos **gera o próprio item**
   *   (RF-04), e cada item nasce com UMA parcela datada de `liberação inicial
   *   + Term`, não da cadência mensal que este componente projeta. A tabela
   *   fica sendo o que ela de fato é ali: o que o Converge publica, valor a
   *   valor.
   *
   * ⚠️ **Uma prop para as duas decisões, de propósito.** Como booleanos
   * separados, um chamador podia desligar a nota e esquecer a coluna — e a
   * tabela afirmaria meia verdade. O default é o comportamento ANTIGO: quem
   * precisa recortar é o caminho novo, não o contrário.
   */
  variante?: "recurso-legado" | "dialogo-de-obra";
  /**
   * As etapas da LINHA da obra (10/09/2026). Só o diálogo as informa: é ele
   * que grava os itens, e exibi-las é o que impede a tela de mostrar uma etapa
   * diferente da que a API vai salvar.
   */
  etapas?: { etapaContratacao: string; etapaImplantacao: string } | null;
  testId?: string;
}) {
  const dialogo = variante === "dialogo-de-obra";
  const cronograma = cronogramaDaObra(parcelas, {
    dataLiberacao,
    periodicidade,
    regra: dialogo ? "obra-um-mes" : "periodicidade",
    etapas: dialogo ? etapas : null,
  });
  if (cronograma === null) return null;

  const legado = variante === "recurso-legado";
  /*
   * ⚠️ A coluna de data VOLTOU ao diálogo em 10/09/2026. Ela tinha sido
   * retirada porque a data de cada item era `liberação inicial + Term`, um
   * cronograma que este componente não sabia projetar. Com a regra nova (1ª na
   * data inicial, demais um mês depois) a tela sabe o que o backend
   * vai gravar — e escondê-la deixaria o LT sem conferir a data antes de
   * salvar, que é a pergunta do anexo do bug original.
   */
  const mostrarData = legado || dialogo;

  return (
    <div className="mt-3" data-testid={testId}>
      <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-(--color-text-muted)">
        Parcelas da obra (Converge)
      </div>
      {/* Tabela larga rola no PRÓPRIO container — o body da página nunca rola
          na horizontal (CLAUDE.md · responsivo). */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr>
              <th className={TH}>Parcela</th>
              <th className={TH}>Valor</th>
              {mostrarData && <th className={TH}>Data de lançamento</th>}
              {dialogo && etapas && (
                <th className={TH}>Etapa da liberação</th>
              )}
            </tr>
          </thead>
          <tbody>
            {cronograma.parcelas.map((parcela, i) => (
              <tr
                key={`${parcela.rotulo}-${i}`}
                data-testid={`${testId}-linha`}
              >
                <td className={`${TD} whitespace-normal`}>{parcela.rotulo}</td>
                <td className={TD}>{formatCurrencyBRL(parcela.valor)}</td>
                {/*
                  Travessão, nunca uma data derivada de nada: sem a data de
                  liberação (ou sem periodicidade escolhida) o cronograma é
                  desconhecido, e uma data plausível ali é indistinguível de uma
                  real.
                */}
                {mostrarData && (
                  <td className={TD}>{formatDateBR(parcela.data) ?? "—"}</td>
                )}
                {dialogo && etapas && (
                  <td className={`${TD} whitespace-normal`}>
                    {parcela.etapa ?? "—"}
                  </td>
                )}
              </tr>
            ))}
            <tr>
              <td className={`${TD} font-bold`}>Total</td>
              <td className={`${TD} font-bold`} data-testid={`${testId}-total`}>
                {formatCurrencyBRL(cronograma.totalGeral)}
              </td>
              {mostrarData && <td className={TD} />}
              {dialogo && etapas && <td className={TD} />}
            </tr>
          </tbody>
        </table>
      </div>
      {legado && cronograma.totalImposto !== null && (
        <p className="mt-1.5 text-[12px] text-(--color-text-muted)">
          A parcela de impostos ({formatCurrencyBRL(cronograma.totalImposto)})
          vence junto da última parcela da obra e <strong>não</strong> integra
          as parcelas deste recurso financeiro, cujo total é o valor da obra sem
          impostos ({formatCurrencyBRL(cronograma.totalObra)}).
        </p>
      )}
    </div>
  );
}
