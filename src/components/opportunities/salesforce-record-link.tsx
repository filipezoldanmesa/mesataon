/**
 * O número da oportunidade no Salesforce, como LINK para o registro no org.
 *
 * ADO 68142 (reabertura de 03/09/2026). O primeiro passe deste ticket trouxe o
 * sequencial do org (`4567384`) para a nossa tela — o que fechou metade do
 * cruzamento. O pedido que reabriu é o outro lado: *"a Michelle solicitou um
 * link para abrir uma aba direto no Salesforce com a Oportunidade"*. Ter o
 * número e ter de procurá-lo à mão no CRM é o mesmo trabalho que o ticket veio
 * eliminar.
 *
 * ## Componente único, montado em quatro telas
 *
 * Preenchimento (`opportunity-detail`, cabeçalho + card), workspace SNEG
 * (`sneg-analise-shell`), contrato (`contrato-view`) e aprovação
 * (`aprovacao-view`, que já tinha um CTA próprio). Quatro cópias do mesmo
 * `<a target="_blank">` divergiriam no atributo que menos se nota — e o que
 * menos se nota aqui é o `rel`, cuja ausência entrega `window.opener` à aba
 * aberta.
 *
 * ## O `href` vem MONTADO do backend
 *
 * `salesforceUrl` é resolvido pelo `OpportunityDto` a partir de
 * `SALESFORCE_INSTANCE_URL`, que é variável de RUNTIME do backend. Montá-lo
 * aqui exigiria uma `NEXT_PUBLIC_*`, ou seja **build-time** — cujo modo de
 * falha é silencioso: o bundle sai sem o valor, o link aponta para lugar
 * nenhum, e nada acusa (o aviso do `CLAUDE.md` sobre `NEXT_PUBLIC_*` nasceu
 * exatamente de um caso desses).
 *
 * ## Sem URL ⇒ texto, nunca link morto
 *
 * `href` ausente renderiza o código como texto simples. Um link que não abre
 * ensina o usuário que o controle não funciona — a mesma razão pela qual o CTA
 * da tela de aprovação só existe quando há registro a abrir.
 */

/**
 * Sublinhado SEMPRE, não só no hover.
 *
 * `whitespace-nowrap` porque o código e a seta são dois nós irmãos (ver o
 * comentário no JSX), e a linha quebrava ENTRE eles: medido em staging em
 * 08/09/2026 no card "Aprovação no Salesforce", onde a coluna do valor é
 * estreita — `4567416` ficava numa linha e o `↗` sozinho na de baixo, lido como
 * glifo perdido. O par é curto (7 dígitos + a seta), então prendê-lo não
 * transborda.
 */
const LINK_CLASS =
  'whitespace-nowrap text-(--secondary-600) underline hover:no-underline ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-(--secondary-600)';

export function SalesforceRecordLink({
  code,
  url,
  prefix,
  testId,
}: {
  /** Sequencial do org (`Opportunity.Name` lido de volta). */
  code: string | null | undefined;
  /** Deep link montado pelo backend; `null` ⇒ renderiza só o texto. */
  url?: string | null;
  /**
   * Texto antes do código (`'SF '` no cabeçalho). Fica FORA do link: o
   * cabeçalho o usa para dizer que o número é de outro sistema, e sublinhar o
   * prefixo faria "SF" parecer parte do identificador.
   */
  prefix?: string;
  testId?: string;
}) {
  if (!code) return null;

  const conteudo = url ? (
    <a
      className={LINK_CLASS}
      href={url}
      target="_blank"
      /*
       * `noopener` é o que importa (a aba aberta não recebe `window.opener`);
       * `noreferrer` acompanha porque o destino é outro domínio.
       */
      rel="noopener noreferrer"
      /*
       * O nome acessível diz o que o clique faz E que abre em nova aba — o
       * número sozinho não é uma ação para quem usa leitor de tela.
       */
      aria-label={`Abrir a oportunidade ${code} no Salesforce (nova aba)`}
      title="Abrir no Salesforce (nova aba)"
      data-testid={testId ? `${testId}-link` : undefined}
    >
      {/*
       * O CÓDIGO fica no próprio elemento, e a seta fora dele.
       *
       * Duas razões, e a primeira é de acessibilidade: `↗` é decoração — quem
       * usa leitor de tela recebe "abrir em nova aba" pelo `aria-label`, e a
       * seta lida em voz alta seria ruído. A segunda é de teste: `getByText`
       * casa o texto NORMALIZADO do elemento, então com a seta dentro do mesmo
       * nó todo `getByText('4557970')` já existente no repo passaria a falhar —
       * e o conserto seria editar as asserções, não o componente.
       */}
      <span>{code}</span>
      <span aria-hidden="true"> ↗</span>
    </a>
  ) : (
    code
  );

  return (
    <span data-testid={testId}>
      {prefix}
      {conteudo}
    </span>
  );
}
