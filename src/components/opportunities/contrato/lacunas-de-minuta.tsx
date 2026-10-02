import type { ContratoReadModel } from '@/lib/contratos/contrato-mapping';

type Lacunas = ContratoReadModel['lacunasDeMinuta'];

/**
 * Nomeia os contratos que o **Salesforce** tem e para os quais esta plataforma
 * não sabe qual minuta corresponde.
 *
 * Perguntada em 21/09/2026 o que fazer com o contrato cujo `RecordType.Name`
 * não tem par no de/para, a Vibra respondeu **"gera lacuna"**: o instrumento é
 * NOMEADO, em vez de omitido ou resolvido por semelhança de rótulo. Um par
 * errado poria no pacote a minuta do instrumento errado — e os dois são
 * indistinguíveis na lista do org.
 *
 * ⚠️ **Nomeia, e NÃO bloqueia.** Ninguém dentro do produto consegue resolver um
 * de/para que falta — só a Vibra, respondendo qual é o par. Travar o envelope
 * aqui prenderia a oportunidade numa pendência sem conserto pela tela, que é o
 * beco sem saída que o repositório recusa.
 *
 * ⚠️ **Vive FORA da `MinutaSection`, pelo mesmo motivo do
 * `AlertaAlteracaoMinutaPadrao` ao lado.** A lista de minutas é uma
 * `SectionResult` que degrada sozinha; se a lacuna morasse lá dentro, a falha
 * de leitura DAQUELA lista apagaria também o aviso de que existe um contrato no
 * org sem minuta aqui — fato que não depende dela. É a regra "esconder o CTA
 * nunca pode esconder o FATO".
 *
 * Lista vazia cobre "não há lacuna" e "o org não pôde ser lido": quem informa a
 * segunda é a seção "Contrato", que degrada com texto próprio. Nomear um
 * instrumento a partir de uma leitura que não aconteceu mandaria o usuário
 * procurar um problema inexistente.
 *
 * Sem `role="alert"`: o texto está presente desde a primeira renderização (não
 * responde a ação nenhuma), e um live region a mais nesta árvore colidiria com
 * os `getByRole('alert')` das suítes vizinhas.
 */
export function LacunasDeMinuta({ lacunas }: { lacunas: Lacunas }) {
  if (lacunas.length === 0) return null;

  return (
    <div
      data-testid="lacunas-de-minuta"
      className="mb-3 rounded-[var(--radius-xs)] bg-(--color-warning-bg) px-4 py-3 text-(length:--t-caption) text-(--color-warning)"
    >
      <p>
        <span aria-hidden="true">⚠ </span>
        {lacunas.length === 1
          ? 'O Salesforce criou um contrato sem minuta correspondente nesta plataforma:'
          : `O Salesforce criou ${lacunas.length} contratos sem minuta correspondente nesta plataforma:`}
      </p>
      <ul className="mt-1 list-disc pl-5">
        {lacunas.map((lacuna) => (
          <li key={`${lacuna.tipoNoOrg ?? ''}-${lacuna.numero ?? ''}`}>
            {/*
              O `RecordType.Name` viaja verbatim do org — é assim que o
              instrumento aparece na tela de lá, que é onde a pessoa vai
              conferir. Traduzi-lo faria as duas telas discordarem.
            */}
            {lacuna.tipoNoOrg ?? 'Contrato sem tipo de registro'}
            {lacuna.numero ? ` · nº ${lacuna.numero}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
