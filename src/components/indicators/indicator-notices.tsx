/**
 * Avisos do ciclo assíncrono de cálculo dos indicadores econômicos
 * (OPP-F7 / VBR-403 — HU-13.2).
 *
 * Compartilhados pelos painéis que recalculam pelo ARP ("Painel ao vivo" da
 * proposta e a grade "Análise financeira" da oportunidade) para que o mesmo
 * estado nunca seja descrito com palavras diferentes em duas telas.
 *
 * Nenhum deles é `--color-danger`: enquanto o ARP processa **nada falhou**, e
 * mesmo quando o cálculo não conclui a ação seguinte existe (recalcular) —
 * vermelho leria como falha do sistema (ADR-0018).
 */

type NoticeProps = {
  /** Test id do painel chamador (os três renderizam textos iguais em telas diferentes). */
  testId: string;
};

/** Faixa de atenção (amarelo do DS) — "falta o próximo passo". */
function AttentionNotice({
  testId,
  children,
}: NoticeProps & { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      data-testid={testId}
      /*
       * `break-words`: o conteúdo destas faixas é TEXTO DE TERCEIRO — a
       * mensagem que o ARP devolveu —, e ele não tem largura previsível. Sem
       * isto, uma palavra sem espaço estoura a caixa: reportado em 03/09/2026
       * com `java.sql.SQLException cannot be cast to
       * java.sql.SQLIntegrityConstraintViolationException`, cujo último token
       * saiu para fora do card.
       */
      className="mb-3 rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2.5 text-(length:--t-caption) break-words text-(--yellow-700)"
    >
      {children}
    </div>
  );
}

/**
 * `status = em_calculo` — o ARP aceitou o pedido (202 "Processando") e o
 * resultado chega por callback.
 *
 * `role="status"` + `aria-live="polite"`, não `alert`: é progresso, não erro.
 * Quando o orçamento de revalidação se esgota (`exhausted`), o spinner sai de
 * cena e entra uma ação explícita — spinner infinito é o anti-padrão que este
 * estado existe para evitar.
 */
export function CalculatingNotice({
  testId,
  exhausted,
  onRefresh,
  refreshDisabled = false,
}: NoticeProps & {
  exhausted: boolean;
  onRefresh: () => void;
  refreshDisabled?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId}
      className="mb-3 flex items-start gap-2 rounded-[var(--radius-xs)] border border-(--blue-200) bg-(--color-info-bg) px-3 py-2.5 text-(length:--t-caption) text-(--color-info)"
    >
      {!exhausted && (
        <span
          aria-hidden="true"
          className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-(--color-info) border-t-transparent"
        />
      )}
      <span>
        {exhausted ? (
          <>
            O resultado do cálculo ainda não chegou do ARP. Ele pode ter demorado mais que o
            previsto — atualize para ver o estado atual.
          </>
        ) : (
          <>
            Cálculo em andamento no ARP. O resultado chega em instantes e esta seção se atualiza
            sozinha.
          </>
        )}
        {exhausted && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshDisabled}
            className="ml-2 font-bold underline disabled:cursor-not-allowed disabled:opacity-50"
            data-testid={`${testId}-refresh`}
          >
            Atualizar
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * `status = indisponivel` — o ARP respondeu com erro no callback, ou a
 * requisição expirou sem callback nenhum (worker de reconciliação, VBR-401).
 *
 * Nomeia o que aconteceu em vez de dizer "indisponível": o usuário precisa
 * saber que o pedido dele terminou, não ficar esperando um resultado que não vem.
 *
 * ⚠️ **A ação seguinte depende de onde o aviso está** — e é por isso que
 * `retry` existe: instrução para um controle que não está na tela é pior que
 * nenhuma instrução. O default `manual` serve as duas telas que hoje têm CTA
 * (a proposta, e a "Análise financeira" da oportunidade desde 04/09/2026);
 * `automatic` fica para a superfície que não tiver um.
 */
export function CalculationUnavailableNotice({
  testId,
  retry = "manual",
  reason = null,
}: NoticeProps & { retry?: "manual" | "automatic"; reason?: string | null }) {
  return (
    <AttentionNotice testId={testId}>
      Não foi possível concluir o cálculo — o ARP não devolveu um resultado utilizável. Os valores
      abaixo são do último cálculo bem-sucedido.{" "}
      {retry === "manual"
        ? "Recalcule para tentar novamente."
        : "O cálculo é refeito automaticamente quando a composição de propostas muda ou a proposta eleita é recalculada."}
      {/*
       * O motivo vem do ARP e é o que nomeia o conserto ("Diretoria não
       * encontrada para o centro de lucro DAC0TTE008"). Renderizado só quando
       * existe: na expiração por timeout, e em linhas anteriores à coluna, não
       * há motivo nenhum — e um rótulo "Motivo:" vazio leria como dado que a
       * tela falhou em carregar.
       */}
      {reason && (
        <span className="mt-1.5 block" data-testid={testId ? `${testId}-reason` : undefined}>
          Motivo informado pelo ARP:{' '}
          {/*
            `overflow-wrap:anywhere` e não só `break-words`: o motivo é string de
            MÁQUINA (nome de classe Java, id de centro de lucro), onde a quebra
            "só entre palavras" não tem oportunidade nenhuma para agir — foi
            assim que `java.sql.SQLIntegrityConstraintViolationException` saiu
            para fora do card. Fica no `<strong>`, e não na faixa inteira, para
            o texto humano continuar quebrando por palavra.
          */}
          <strong className="[overflow-wrap:anywhere]">{reason}</strong>
        </span>
      )}
    </AttentionNotice>
  );
}

/**
 * HTTP 409 — a guarda de disparo concorrente do backend recusou um segundo
 * pedido porque um cálculo já está em andamento. Não é falha: é o mesmo
 * resultado que o usuário quer, já a caminho.
 */
export function CalculationInProgressNotice({ testId }: NoticeProps) {
  return (
    <AttentionNotice testId={testId}>
      Já existe um cálculo em andamento para este alvo. Aguarde o resultado — não é necessário
      pedir de novo.
    </AttentionNotice>
  );
}

/**
 * O backend mandou um `status` que este frontend não conhece.
 *
 * Estado mais seguro: os valores deixam de ser apresentados como definitivos e
 * o recálculo fica desabilitado (um `status` que ninguém entende pode ser um
 * cálculo em andamento, e um segundo pedido duplicaria trabalho no ARP).
 */
export function UnknownStatusNotice({ testId }: NoticeProps) {
  return (
    <AttentionNotice testId={testId}>
      Não foi possível interpretar o estado do cálculo. Atualize a página; se persistir, acione o
      suporte.
    </AttentionNotice>
  );
}

/**
 * Legenda que subordina os números do snapshot anterior (HU-13.2).
 *
 * Enquanto o cálculo corre — ou quando ele não concluiu — os valores exibidos
 * são do cálculo anterior e **não podem parecer atuais**. Vem junto de
 * {@link STALE_VALUES_CLASS} no contêiner dos números.
 */
export function StaleValuesCaption({ testId }: NoticeProps) {
  return (
    <p
      data-testid={testId}
      className="mb-2 text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
    >
      Valores do cálculo anterior — não são o resultado atual
    </p>
  );
}

/**
 * Subordina visualmente os números anteriores. Aplicada no contêiner das
 * medidas, junto com {@link StaleValuesCaption}.
 */
export const STALE_VALUES_CLASS = 'opacity-60';
