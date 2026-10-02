import type { ContratoReadModel } from '@/lib/contratos/contrato-mapping';

type Aviso = ContratoReadModel['alteracaoMinutaPadrao'];

/**
 * Alerta "haverá alteração de minuta padrão", no topo da seção Minuta.
 *
 * O veredito é do BACKEND: `null` significa que a resposta da oportunidade não
 * é "Sim" (cobre igualmente "respondeu Não" e "ninguém respondeu"). A tela só
 * decide como pintar — nunca deriva isso de campo nenhum.
 *
 * ⚠️ **Vive FORA da `MinutaSection`, e isso não é organização de arquivos.** A
 * lista de minutas é uma `SectionResult` que degrada sozinha; se o alerta
 * morasse lá dentro, a falha de leitura DAQUELA lista apagaria também o aviso
 * de que a minuta não segue o padrão — que não depende dela e é justamente o
 * fato que muda a conferência do documento. É a regra "esconder o CTA nunca
 * pode esconder o FATO".
 *
 * Sem `role="alert"`: o texto está presente desde a primeira renderização (não
 * responde a ação nenhuma), e um live region a mais nesta árvore colidiria com
 * os `getByRole('alert')` das suítes vizinhas. O ícone é decorativo — a frase
 * carrega o significado inteiro.
 */
export function AlertaAlteracaoMinutaPadrao({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;

  return (
    <div
      data-testid="alerta-alteracao-minuta-padrao"
      className="mb-3 rounded-[var(--radius-xs)] bg-(--color-danger-bg) px-4 py-3 text-(length:--t-caption) text-(--color-danger)"
    >
      <span aria-hidden="true">⚠ </span>
      Haverá alteração de minuta padrão
      {/*
        `descricao` pode ser `null` nas oportunidades que responderam "Sim"
        antes de ela ser exigida: o alerta aparece sem o complemento, porque o
        FATO continua verdadeiro.
      */}
      {aviso.descricao ? `: ${aviso.descricao}` : '.'}
    </div>
  );
}
