/**
 * Asterisco de campo obrigatório, para ficar ao fim do texto do rótulo.
 *
 * Componente, e não um `<span>` inline no call site, porque é o PRIMEIRO
 * marcador de obrigatoriedade do app: o próximo campo que precisar de um vai
 * copiar o que existir, e duas cópias divergem em cor, espaçamento e em quem
 * lê o asterisco em voz alta. Mesma razão de `PRIMARY_ACTION_BTN` viver em
 * `components/button.tsx`.
 *
 * ## Vermelho é pedido do produto, não o protótipo
 *
 * O protótipo marca obrigatório com um ` *` cru dentro do próprio texto do
 * rótulo, sem cor e sem classe (`03-proposta-nova.html`: `Tipo *`,
 * `Data do investimento *`). O pedido de 26/08/2026 é explícito — asterisco
 * **vermelho** —, e a palavra do usuário vence a do protótipo. A divergência
 * fica registrada aqui em vez de reconciliada em silêncio.
 *
 * ## Cor não é o único sinal
 *
 * `aria-hidden` no glifo, porque um leitor de tela anunciando "asterisco" no
 * meio do rótulo é ruído; quem carrega a informação para a tecnologia
 * assistiva é o `required` do controle (o `Select` o repassa ao `<select>`
 * nativo). Sinalizar obrigatoriedade **só** por cor deixaria o campo sem aviso
 * nenhum para quem não distingue vermelho — e o `title` cobre o hover.
 */
export function RequiredMark() {
  return (
    <span
      aria-hidden="true"
      title="Campo obrigatório"
      className="ml-0.5 font-bold text-(--color-danger)"
    >
      *
    </span>
  );
}
