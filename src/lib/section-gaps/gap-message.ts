/**
 * Frase pt-BR de uma lacuna de fonte (`SectionSourceGap`).
 *
 * Por que existe um módulo só para isto: a frase nasce de `sourceLabel` +
 * `reason` (+ `detail`), e escrevê-la à mão em cada consumidor faz as telas
 * divergirem na única palavra que o usuário repetiria ao suporte — foi o que
 * aconteceu no card de garantias, que dizia "Aguardando integração ERP"
 * enquanto o catálogo do backend diz "SAP". Um lugar compõe; todo mundo
 * renderiza.
 *
 * A lógica veio de `gapResolver` (`lib/clients/customer-360-mapping.ts`), onde
 * era privada do 360º.
 */

/**
 * Forma do gap como o backend o serializa (`SectionSourceGapDto`,
 * `apps/api/src/customers/dto/customer-360.dto.ts`).
 *
 * ⚠️ **Não existe campo `message`.** A frase é composta aqui. Um consumidor que
 * declare `message` recebe `undefined` e renderiza a lacuna sem texto — só a
 * lista de campos entre parênteses, que não diz nada a quem lê.
 */
export type BackendSectionSourceGap = {
  source: string;
  /** Rótulo pt-BR do sistema — renderize ESTE, nunca `source`. */
  sourceLabel: string;
  /** `NAO_CONTRATADA` | `INDISPONIVEL` | `LIMITE_EXCEDIDO` | `SEM_REGISTRO` | `NAO_FORNECIDO`. */
  reason: string;
  /** Campos da seção cobertos por esta lacuna. */
  fields: string[];
  /** Frase composta pelo backend quando o motivo por si não é específico. */
  detail: string | null;
};

/**
 * Compõe a frase que a tela exibe para uma lacuna.
 *
 * Os quatro motivos produzem textos deliberadamente diferentes, porque levam a
 * ações diferentes:
 *
 * - `NAO_CONTRATADA` — o número não existe em lugar nenhum ainda; repetir não
 *   resolve.
 * - `INDISPONIVEL` — existe, mas a fonte não respondeu agora; repetir pode
 *   resolver. É o ÚNICO que convida a nova tentativa.
 * - `LIMITE_EXCEDIDO` — a pergunta é grande demais para a fonte; repetir nunca
 *   resolve, então "indisponível" prometeria um retry impossível.
 * - `SEM_REGISTRO` — a fonte respondeu e não tem registro do assunto; é fato de
 *   negócio, e chamá-lo de indisponibilidade culparia a fonte por uma resposta
 *   correta (VBR-539).
 *
 * `detail` do backend, quando presente, vence a frase genérica nos dois motivos
 * estruturais — ele carrega o número (qual limite, por quanto).
 */
export function sectionGapMessage(gap: BackendSectionSourceGap): string {
  if (gap.reason === 'LIMITE_EXCEDIDO') {
    return gap.detail ?? `Fora do limite de consulta do ${gap.sourceLabel}`;
  }
  if (gap.reason === 'SEM_REGISTRO') {
    return gap.detail ?? `Sem registro no cadastro da ${gap.sourceLabel}`;
  }
  /*
   * A integração respondeu; o contrato dela é que não tem o campo. A frase NÃO
   * pode conter "aguardando" — costuma aparecer ao lado de dado real vindo da
   * mesma fonte, e ali "aguardando integração X" é afirmação falsa.
   */
  if (gap.reason === 'NAO_FORNECIDO') {
    /*
     * O `detail` SUBSTITUI a frase genérica, como em LIMITE_EXCEDIDO e
     * SEM_REGISTRO — não a complementa. Esta lacuna costuma aparecer embaixo de
     * dado real da MESMA fonte, e um prefixo do tipo "SAP não fornece este dado"
     * lê como se a tabela inteira não viesse do SAP. Só o backend sabe QUAL
     * campo falta, então é ele quem escreve a frase inteira, nomeando a coluna.
     */
    return gap.detail ?? `${gap.sourceLabel} não informa este campo`;
  }
  const base =
    gap.reason === 'NAO_CONTRATADA'
      ? `Aguardando integração ${gap.sourceLabel}`
      : `${gap.sourceLabel} indisponível`;
  /*
   * Nestes dois motivos o `detail` COMPLEMENTA a frase; nos dois de cima ele a
   * SUBSTITUI (lá o backend precisa dizer qual limite, ou qual cadastro).
   *
   * Aqui ele é o canal por onde o backend nomeia, em pt-BR, o que a integração
   * deve. Sem isso a única saída era a tela imprimir `gap.fields` cru — nome de
   * propriedade do DTO na cara do usuário.
   *
   * Nenhum gap do backend hoje traz `detail` com estes motivos além do da
   * análise de perfil, então isto não altera texto existente (verificado em
   * `customer-360.service.ts`, `customer-portfolio.service.ts` e
   * `garantia.service.ts`: todos `detail: null` fora de SEM_REGISTRO /
   * LIMITE_EXCEDIDO).
   */
  return gap.detail ? `${base} — ${gap.detail}` : base;
}
