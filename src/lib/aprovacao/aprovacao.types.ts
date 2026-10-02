/**
 * Types of the "Em aprovação" phase (protótipo `01d-oportunidade-aprovacao.html`).
 *
 * Mirrors `AprovacaoDto` from the backend (ADR-0044). Labels and pill codes are
 * produced by the backend — the screen renders them, never derives them
 * (ADR-0018: veredito e texto nascem no backend).
 */

/**
 * O estado da oportunidade enquanto ela pertence a ESTA tela.
 *
 * Membro nomeado e não string solta nos call sites: a releitura sob demanda
 * pode avançar a fase no backend, e é a comparação com este valor que decide se
 * a tela ainda é a correta.
 */
export const ESTADO_EM_APROVACAO = 'EM_APROVACAO';

/** Prototype pill codes (`vibra-ui.css`). `.d` is DANGER, `.n` is NEUTRAL. */
export type AprovacaoPill = 's' | 'w' | 'd' | 'i' | 'n';

export type AprovacaoPasso = {
  status: string;
  statusLabel: string;
  ator: string | null;
  comentario: string | null;
  data: string;
};

export type AprovacaoNivel = {
  processInstanceId: string;
  definicao: string | null;
  status: string;
  statusLabel: string;
  pill: AprovacaoPill;
  /** Who decided this level — or who owes the decision, when still pending. */
  ator: string | null;
  comentario: string | null;
  concluidaEm: string | null;
  criadaEm: string;
  passos: AprovacaoPasso[];
  pendentes: string[];
};

export type IniciarMinutaGate = {
  liberado: boolean;
  /** What is missing, one sentence per blocker. Empty when `liberado`. */
  motivos: string[];
};

/**
 * O que aconteceu na última tentativa de AVANÇO automático para a minuta.
 *
 * ⚠️ Não confundir com `erroLeitura`, que é falha ao LER o Salesforce. Aqui a
 * leitura funcionou, o veredito foi `APROVADA`, e a **transição** foi recusada
 * — o conserto é outro (aprovar a análise no org, concluir o perfil de crédito,
 * liberar a garantia), e colapsar os dois mandaria o leitor procurar problema de
 * rede numa recusa de negócio.
 */
export type AvancoAutomatico = {
  /** `null` quando nunca foi tentado. */
  tentadoEm: string | null;
  /** Frase pt-BR do backend. `null` quando a última tentativa não foi recusada. */
  motivo: string | null;
};

export type Aprovacao = {
  salesforceId: string | null;
  salesforceCode: string | null;
  /** `null` ⇒ the screen renders NO "Abrir no Salesforce" CTA (never a dead link). */
  salesforceUrl: string | null;
  stageName: string | null;
  outcome: string;
  outcomeLabel: string;
  outcomePill: AprovacaoPill;
  cadeiaAprovacao: AprovacaoNivel[];
  lidoEm: string | null;
  erroLeitura: string | null;
  iniciarMinuta: IniciarMinutaGate;
  avancoAutomatico: AvancoAutomatico;
  /**
   * Estado da oportunidade AGORA.
   *
   * A releitura sob demanda pode avançar a oportunidade para `EM_MINUTA` na
   * mesma requisição; sem este campo a tela continuaria mostrando a aprovação
   * de uma oportunidade que já saiu dela, e o usuário teria de recarregar.
   */
  estadoAtual: string;
  /**
   * Orientação ao LT quando a alçada foi REPROVADA no Salesforce (ADO 68194):
   * o ajuste é feito NESTA plataforma, e a aprovação não deve ser reenviada
   * pelo Salesforce.
   *
   * `null` em qualquer outro desfecho. Composta pelo backend e renderizada
   * verbatim — é a MESMA frase da pendência aberta ao LT, e uma segunda
   * redação aqui divergiria no detalhe que importa.
   */
  orientacaoReprovacao: string | null;
};
