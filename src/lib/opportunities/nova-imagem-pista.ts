/**
 * "Possui nova imagem de pista" / "Será colocada nova imagem de pista" — o
 * TERCEIRO gate silencioso do `/simulate` da alçada, como linhas de um card de
 * dados.
 *
 * ## Por que a regra virou módulo
 *
 * O campo foi acrescentado ao card de dados em 01/09/2026 (ADO 67941) — e só
 * em `opportunity-detail.tsx`, a tela de PREENCHIMENTO. As outras três telas
 * que renderizam "Dados da oportunidade" têm card próprio
 * (`sneg-analise-shell`, `aprovacao-view`, `contrato-view`) e ficaram sem ele.
 *
 * Medido no stage em 02/09/2026 nas oportunidades `OPP-2026-000051` e
 * `OPP-2026-000046`, ambas em `EM_ANALISE`: `GET .../alcada` recusava com
 * `IMAGEM_PISTA_NAO_RESPONDIDA` e a frase mandava *"informe nos dados da
 * oportunidade"* — enquanto a tela daquele usuário (o workspace SNEG) não tinha
 * o campo nem em leitura. Alçada travada e **nenhuma ação de interface capaz de
 * destravá-la**, que é a classe de defeito que o painel de alçada existe para
 * eliminar. O backend aceitava o valor o tempo todo
 * (`PATCH /v1/opportunities/:id` responde 200).
 *
 * Cada tela tem o próprio átomo de campo (`DataField` no detalhe, `DItem` no
 * shell), então o compartilhado aqui é a **regra**, não a marcação: quais linhas
 * existem, com que rótulo e com que valor. Um componente de renderização
 * obrigaria as quatro a adotar um átomo estranho ao card delas.
 */

/**
 * Booleano tri-estado do cadastro como texto de tela.
 *
 * `null` vira travessão, e nunca "Não": "ninguém respondeu" e "respondeu que
 * não" são fatos diferentes — o primeiro trava a alçada e o segundo não.
 */
export function simNaoLabel(valor: boolean | null | undefined): string {
  if (valor == null) return '—';
  return valor ? 'Sim' : 'Não';
}

export interface CampoNovaImagemPista {
  label: string;
  value: string;
}

/**
 * As linhas de nova imagem de pista para um card de dados.
 *
 * ⚠️ A primeira é **sempre** devolvida, inclusive com valor `null`: é justamente
 * o estado "não respondido" que trava a alçada, e escondê-la faria o card não
 * dizer nada sobre a pendência — que é como o defeito começou.
 *
 * A segunda só aparece com `possui === false`: é a única combinação que o
 * picklist dependente do Salesforce habilita.
 */
export function camposNovaImagemPista(o: {
  possuiNovaImagemPista?: boolean | null;
  seraColocadaNovaImagemPista?: boolean | null;
}): CampoNovaImagemPista[] {
  const campos: CampoNovaImagemPista[] = [
    {
      label: 'Possui nova imagem de pista',
      value: simNaoLabel(o.possuiNovaImagemPista),
    },
  ];

  if (o.possuiNovaImagemPista === false) {
    campos.push({
      label: 'Será colocada nova imagem de pista',
      value: simNaoLabel(o.seraColocadaNovaImagemPista),
    });
  }

  return campos;
}
