/**
 * "Cliente / OPP" — o par cliente + código da oportunidade, do jeito que o
 * protótipo o escreve (`12a-pendencia-ticket.html:70`):
 *
 *     Posto Vibra Centro-SP · OPP-0428
 *
 * Existe como função própria porque as DUAS superfícies de pendência mostram o
 * mesmo par e precisam concordar: o cabeçalho do ticket (`Cliente / OPP`) e a
 * linha de meta do painel (`cliente · OPP · fase · resp. X`). Enquanto cada
 * uma compunha a sua, o ticket rotulava "Cliente / OPP" e renderizava só o
 * cliente — o número da oportunidade nunca aparecia (ADO 67964), embora o
 * backend já o sirva em `opportunityCode` e o mapper já o carregue em
 * `oportunidadeCodigo`.
 *
 * Valor ausente é DESCARTADO, nunca preenchido com um traço no meio da linha:
 * pendência órfã (sem oportunidade) ou oportunidade sem código ainda atribuído
 * são estados legítimos, e `Posto Vibra Centro-SP · —` leria como se o código
 * fosse um dado que o sistema falhou em carregar.
 *
 * @returns a linha composta, ou `null` quando nada há para exibir — `null` (e
 *   não `''`) porque é o que o `DataField` do ticket converte no traço `—`.
 */
export function clienteOppLine(
  clienteNome: string | null | undefined,
  oportunidadeCodigo: string | null | undefined,
): string | null {
  const partes = [clienteNome, oportunidadeCodigo]
    .map((parte) => parte?.trim())
    .filter((parte): parte is string => Boolean(parte));

  return partes.length > 0 ? partes.join(' · ') : null;
}
