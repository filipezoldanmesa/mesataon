/**
 * O analista responsável pela **minuta** de uma oportunidade (18/09/2026).
 *
 * Espelho de `ContractDraftAssignmentDto` do backend. O vocabulário é o mesmo
 * da análise (`AnaliseSneg.analista` / `atribuicaoPendente`) de propósito: é o
 * MESMO fluxo em outra fase, e um segundo vocabulário faria a tela descrever as
 * duas coisas de jeitos diferentes.
 */
export interface AnalistaMinuta {
  /** OID no Entra — é ele que a reatribuição envia, nunca o nome. */
  id: string;
  nome: string;
  email: string | null;
}

export interface MinutaAtribuicao {
  opportunityId: string;
  /** `null` quando ninguém foi atribuído — ver `atribuicaoPendente`. */
  analista: AnalistaMinuta | null;
  gerencia: string | null;
  /**
   * `true` quando a gerência não tem analista parametrizado para a etapa
   * Minutas.
   *
   * ⚠️ **Não é erro e não bloqueia a fase** — é o estado que a tela nomeia como
   * "Aguardando distribuição", e o conserto é a reatribuição. Colapsá-lo num
   * traço mudo esconderia que existe uma ação a tomar.
   */
  atribuicaoPendente: boolean;
  atribuidaEm: string | null;
  atribuidaPorNome: string | null;
  /**
   * A reatribuição ainda está aberta? (21/09/2026)
   *
   * `true` só enquanto o pacote está na etapa MINUTA. ⚠️ **Veredito do
   * BACKEND** — a mesma resposta que a rota de escrita aplica (409 fora da
   * fase). A tela NUNCA deriva isto da etapa que ela já tem em mãos: botão e
   * gate divergiriam exatamente no caso ambíguo (a janela entre o envio do
   * envelope e o GATE 3).
   *
   * ⚠️ **Fechar o CTA não fecha o FATO**: com `false` o nome do responsável —
   * ou o selo "Aguardando distribuição" — continua na tela.
   */
  podeReatribuir: boolean;
}

/** Corpo de `POST /api/opportunities/:id/minuta/atribuicao/reatribuir`. */
export interface ReatribuirAnalistaMinutaPayload {
  analistaId: string;
  motivo?: string;
}

/**
 * A oportunidade ainda não entrou na fase de minuta — 404 do backend.
 *
 * ⚠️ Erro TIPADO, e não uma frase: é ele que faz a tela **não renderizar o
 * card** em vez de pintar uma caixa de erro. Antes da fase existir, não haver
 * atribuição é o estado correto, não uma falha — mesma lição do
 * `AnaliseNaoAbertaError` (ADO 68256), onde um 404 legítimo virava uma caixa
 * vermelha dizendo que o sistema quebrou.
 */
export class MinutaAtribuicaoAusenteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MinutaAtribuicaoAusenteError';
  }
}
