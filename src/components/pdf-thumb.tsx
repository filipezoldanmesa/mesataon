/**
 * Miniatura de um anexo de foto que é um PDF (VBR — pedido de 10/09/2026).
 *
 * As dropzones de "foto" passaram a aceitar `application/pdf`, e um `<img>`
 * sobre um PDF não falha de um jeito útil: ele cai no fallback de erro das duas
 * grades ("Falha ao carregar a foto"), que afirmaria um defeito sobre um
 * arquivo íntegro e mandaria o usuário reenviar o que já está lá.
 *
 * Um componente só, e não duas cópias, porque a grade da proposta de franquia e
 * o card de conferência da SNEG olham para o MESMO anexo: divergir no rótulo
 * faria o analista e o LT descreverem coisas diferentes ao telefone.
 *
 * Preenche a caixa do chamador (`h-full w-full`) — quem posiciona é a grade.
 */
export function PdfThumb({ fileName }: { fileName: string }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1 bg-(--neutral-50) text-(--color-text-muted)"
      data-testid="pdf-thumb"
      title={fileName}
    >
      <span aria-hidden className="text-[18px] font-bold leading-none">
        PDF
      </span>
      <span className="text-[12px] leading-none">documento</span>
    </div>
  );
}
