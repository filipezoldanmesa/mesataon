import { MENSAGEM_RETORNO_DOCUSIGN } from '@/lib/contratos/retorno-docusign';

/**
 * A janela onde a Embedded Sender View do DocuSign é aberta.
 *
 * ## Por que janela, e não iframe
 *
 * O pedido do negócio (14/09/2026) foi *"abre um popup com iFrame como a gente
 * abre em outros momento"*. **Não é possível**, e a medição é do mesmo dia:
 * os dois hosts da cadeia da Sender View recusam ser embutidos —
 * `account-d.docusign.com/managed_token/v1/redeem` manda
 * `x-frame-options: SAMEORIGIN` **e** CSP `frame-ancestors 'self'`, e
 * `apps-d.docusign.com/send/prepare/…` manda a CSP. No browser: `decodedBodySize: 0`
 * nos dois, com as requisições `client-errors/csp/enforce` e `/csp/report` do
 * próprio DocuSign disparando — é o `report-uri` da CSP deles acusando a
 * violação. Um controle same-origin no mesmo teste carregou.
 *
 * É recusa do navegador sobre um cabeçalho do fornecedor: não há configuração
 * nossa que mude isso. O guia técnico do fornecedor diz o mesmo em §2, e este
 * repositório já pagou a lição — `lib/proposals/tableau-embed-url.ts` registra
 * que `X-Frame-Options` **não dispara `onError`**: o sintoma é um retângulo
 * branco mudo, que é o que o cliente veria.
 *
 * A janela entrega a mesma experiência: a oportunidade continua atrás, o
 * DocuSign abre por cima e a janela se fecha sozinha ao terminar.
 */
export interface JanelaDocusign {
  /**
   * Leva a janela à URL da Sender View.
   *
   * Sem janela (popup bloqueado) navega a **página inteira** — o comportamento
   * anterior a esta mudança. Nunca um beco sem saída.
   */
  apontar(url: string): void;
  /** Fecha a janela, se houver. Idempotente. */
  fechar(): void;
  /** Traz a janela para frente quando ela já existe. */
  focar(): void;
  /** `true` quando o navegador recusou abrir a janela. */
  readonly bloqueada: boolean;
  /** A janela em si — `null` quando bloqueada. Use para casar `event.source`. */
  readonly janela: Window | null;
}

/**
 * Nome fixo da janela.
 *
 * Com nome, um segundo clique **reusa** a mesma janela em vez de abrir outra —
 * e uma segunda janela sobre o mesmo envelope é exatamente o que produz dois
 * Taggers concorrentes sobre um envelope de uso único.
 */
const NOME_JANELA = 'vibra-docusign';

/*
 * O Tagger é denso: paleta à esquerda, documento no meio, miniaturas à direita.
 * Numa janela pequena não dá para arrastar os campos com precisão, e a pessoa
 * teria de redimensionar no meio da marcação.
 */
const LARGURA = 1100;
const ALTURA = 800;

/**
 * Abre a janela **imediatamente**, antes de qualquer `await`.
 *
 * ⚠️ **Esta função tem de ser a PRIMEIRA instrução do handler do clique.** O
 * navegador só permite `window.open` enquanto a ativação do gesto está viva —
 * no Chrome, poucos segundos —, e a URL da Sender View só existe depois de duas
 * ou três chamadas de rede (criar o envelope, reler o pacote, pedir a view).
 * Abrir em branco agora e apontar depois é o que torna o fluxo possível;
 * inverter a ordem funciona no laptop e é bloqueado em produção. Medido:
 * `window.open` fora do gesto **é bloqueado**.
 *
 * ⚠️ **Sem `noopener`, e isso é deliberado.** Todas as outras `window.open`
 * deste repositório usam `noopener` justamente para a janela aberta não receber
 * `window.opener` — aqui o `opener` **é** o mecanismo: sem ele a página de
 * retorno não tem a quem avisar e a janela nunca se fecha sozinha. A troca
 * aceita é o *reverse tabnabbing*: enquanto o DocuSign está carregado ali, ele
 * detém uma referência cross-origin à nossa janela. Aceito porque é o
 * fornecedor de assinatura, numa URL que nós mesmos cunhamos, e porque o único
 * canal de dados aberto é o `postMessage`, com origem, janela e oportunidade
 * validadas. **Não acrescente `noopener` "por segurança"** — isso quebra o
 * fechamento automático sem nada acusar.
 */
export function abrirJanelaDocusign(): JanelaDocusign {
  // Centraliza na tela em que a janela-mãe está, não na primária.
  const esquerda = Math.max(0, window.screenX + (window.outerWidth - LARGURA) / 2);
  const topo = Math.max(0, window.screenY + (window.outerHeight - ALTURA) / 2);
  const features = `popup=yes,width=${LARGURA},height=${ALTURA},left=${Math.round(esquerda)},top=${Math.round(topo)}`;

  let janela: Window | null = null;
  try {
    janela = window.open('', NOME_JANELA, features);
  } catch {
    // Alguns navegadores lançam em vez de devolver `null`. O tratamento é o
    // mesmo: cair para a navegação de página inteira.
    janela = null;
  }

  if (janela) {
    try {
      // A janela em branco fica alguns instantes no ar enquanto o envelope é
      // criado. Sem isto é um retângulo branco sem explicação.
      janela.document.write(
        '<title>Abrindo o DocuSign…</title>' +
          '<p style="font:16px system-ui,sans-serif;color:#5A6660;padding:32px">Abrindo o DocuSign…</p>',
      );
      janela.document.close();
    } catch {
      // Falha de escrita não é motivo para abortar o fluxo — a janela existe.
    }
  }

  return {
    janela,
    bloqueada: janela === null,
    apontar(url: string) {
      if (janela && !janela.closed) {
        // `replace` e não `href`: a tela em branco não precisa virar histórico
        // dentro da janela.
        janela.location.replace(url);
        return;
      }
      // Popup bloqueado (ou fechado antes da URL chegar): navegação de página
      // inteira, que é o comportamento anterior a esta mudança.
      window.location.assign(url);
    },
    fechar() {
      try {
        if (janela && !janela.closed) janela.close();
      } catch {
        // Janela já morta.
      }
    },
    focar() {
      try {
        if (janela && !janela.closed) janela.focus();
      } catch {
        // idem
      }
    },
  };
}

/** A mensagem que a página de retorno manda para a janela-mãe. */
export interface MensagemRetornoDocusign {
  tipo: typeof MENSAGEM_RETORNO_DOCUSIGN;
  oportunidadeId: string;
}

export function montarMensagemRetorno(oportunidadeId: string): MensagemRetornoDocusign {
  return { tipo: MENSAGEM_RETORNO_DOCUSIGN, oportunidadeId };
}

/**
 * `true` quando o evento é o aviso de retorno da NOSSA janela, para ESTA
 * oportunidade.
 *
 * ⚠️ **A mensagem é um GATILHO, não um dado.** Ela autoriza uma única coisa:
 * reler a situação pela nossa própria API (`:sincronizar`, que não recebe id de
 * envelope justamente por isso). Ela não carrega status, não carrega
 * `envelopeId`, e nada nela decide estado — aceitar isso seria deixar o
 * conteúdo de uma janela escolher o que a plataforma acredita, a mesma regra
 * que já proíbe aceitar o `envelopeId` da URL de retorno.
 *
 * As quatro checagens, da mais forte para a mais fraca:
 *
 * 1. `source` — identidade do `WindowProxy` que **nós** recebemos de
 *    `window.open`. Não é forjável por outra aba, frame ou extensão.
 * 2. `origin` — só a nossa origem. O DocuSign nunca manda mensagem; se
 *    mandasse, pararia aqui.
 * 3. `tipo` — a forma.
 * 4. `oportunidadeId` — uma segunda aba da plataforma, aberta em outra
 *    oportunidade, não dispara sincronização na errada.
 */
export function ehMensagemDeRetornoDocusign(
  evento: MessageEvent,
  esperado: { janela: Window | null; origem: string; oportunidadeId: string },
): boolean {
  if (!esperado.janela) return false;
  if (evento.source !== esperado.janela) return false;
  if (evento.origin !== esperado.origem) return false;

  const dados = evento.data as Partial<MensagemRetornoDocusign> | null | undefined;
  if (dados?.tipo !== MENSAGEM_RETORNO_DOCUSIGN) return false;
  return dados.oportunidadeId === esperado.oportunidadeId;
}
