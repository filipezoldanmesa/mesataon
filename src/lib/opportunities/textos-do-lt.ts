/**
 * "Briefing do revendedor" e "Parecer do LT" como linhas de um card de dados —
 * os dois textos que o LT escreve sobre a negociação (ADO 68473).
 *
 * ## Por que a regra virou módulo
 *
 * QUATRO telas montam "Dados da oportunidade" (preenchimento, workspace SNEG,
 * aprovação e contrato), cada uma com o seu átomo de campo (`DataField` ×
 * `DItem` × `Field` × `DField`). Até 18/09/2026 o **briefing só existia na
 * primeira** — a tela de quem ESCREVE. Quem lê a oportunidade depois (analista
 * SNEG, aprovador, CCOB) não tinha acesso ao texto em que o LT explica o
 * negócio, justamente nas fases em que ele é decidido.
 *
 * O "Parecer do LT" nasceu no mesmo card e no mesmo dia, e ia repetir a
 * história: acrescentado só ao detalhe, ficaria invisível para exatamente o
 * público que o pedido nomeia. É a mesma divergência entre telas que este
 * repositório já pagou três vezes (`possuiNovaImagemPista`,
 * `textoJanelaConsumo`, `textoFinalidade`) — mesmo arranjo, mesma razão: o
 * compartilhado é a **regra** (quais linhas, com que rótulo, com que valor),
 * nunca a marcação.
 *
 * ## ⚠️ "Parecer do LT" não é o parecer técnico
 *
 * O parecer técnico (F5) é o documento oficial do analista SNEG — emitido,
 * versionado e exportado em PDF (`parecer-panel`, `parecer-readonly-section`),
 * e tem inclusive um bloco próprio chamado "Outras informações". Este campo é
 * texto livre do LT na oportunidade, sem emissão e sem PDF. Foi por causa
 * dessa colisão que o rótulo saiu de "Outras informações" para "Parecer do LT"
 * antes de ir a produção.
 *
 * ## Sempre renderizados, inclusive vazios
 *
 * Diferente do briefing antes desta mudança, que só aparecia preenchido. Quem
 * lê estas telas **não tem o botão "Editar"**: escondendo a linha vazia, "o LT
 * não escreveu nada" fica indistinguível de "esta tela não traz o campo" — e é
 * a segunda leitura que manda o usuário abrir chamado. É o mesmo critério do
 * vizinho "Descrição", que as quatro telas já renderizam com `?? '—'`.
 */

export const BRIEFING_FIELD_LABEL = 'Briefing do revendedor';
export const PARECER_LT_FIELD_LABEL = 'Parecer do LT';

export interface CampoTextoDoLt {
  label: string;
  value: string;
}

/**
 * As linhas dos textos do LT para um card de dados, na ordem do card.
 *
 * ⚠️ Devolve `'—'` para o texto ausente, e não `null`: aqui a ausência É a
 * resposta que interessa ao leitor, então quem chama não decide escondê-la.
 * (O `null` de `textoFinalidade` existe porque lá três das quatro telas já
 * aplicam o próprio `?? '—'`.)
 */
export function camposTextosDoLt(o: {
  briefing?: string | null;
  parecerLt?: string | null;
}): CampoTextoDoLt[] {
  return [
    { label: BRIEFING_FIELD_LABEL, value: o.briefing?.trim() || '—' },
    { label: PARECER_LT_FIELD_LABEL, value: o.parecerLt?.trim() || '—' },
  ];
}
