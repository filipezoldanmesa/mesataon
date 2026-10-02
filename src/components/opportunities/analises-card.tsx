'use client';

import Link from 'next/link';
import { StatusPill, type PillVariant } from '@/components/status-pill';
import { DdiDetalhesTrigger } from '@/components/opportunities/ddi-detalhes-trigger';
import { PerfilCreditoDetalhesTrigger } from '@/components/perfil-credito/perfil-credito-detalhes-trigger';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  getAlcadaPreview as defaultGetAlcadaPreview,
  getSnegViability as defaultGetViability,
} from '@/lib/analise/analise.data';
import type {
  AlcadaPreview,
  SnegViability,
  ViabilidadeResultado,
} from '@/lib/analise/analise.types';
import { getChecklist as defaultGetChecklist } from '@/lib/documents/documents.data';
import type { ChecklistResult } from '@/lib/documents/types';
import { getDdiResult as defaultGetDdi } from '@/lib/opportunities/ddi.data';
import type { DdiResult } from '@/lib/opportunities/ddi.types';
import {
  DDI_SITUACAO_PILL,
  situacaoTemVeredito,
} from '@/lib/opportunities/ddi-situacao-pill';
import { getGarantiaTrack as defaultGetGarantiaTrack } from '@/lib/garantia/garantia.data';
import type { GarantiaTrackResult } from '@/lib/garantia/garantia-track.types';
import { getParecer as defaultGetParecer } from '@/lib/opportunities/parecer.data';
import type { Parecer } from '@/lib/opportunities/parecer.types';
import { andamentoDoParecer } from '@/lib/opportunities/parecer-andamento';
import { getPerfilCredito } from '@/lib/perfil-credito/perfil-credito.data';
import {
  resumoPerfilRisco,
  type PerfilRiscoResumo,
} from '@/lib/perfil-credito/perfil-risco-resumo';
import { getOpportunityIndicators as defaultGetIndicators } from '@/lib/opportunities-indicators/opportunity-indicators.data';
import type { OpportunityIndicatorsSnapshot } from '@/lib/opportunities-indicators/types';
import { formatPercentFromDecimal } from '@/lib/opportunities-indicators/format';
import { useAsideLoad, type AsideSlice } from '@/components/opportunities/use-aside-load';

/**
 * O card "Análises" da coluna lateral — UM componente para TODAS as fases a
 * partir da análise (análise, aprovação, minuta, contrato, assinatura).
 *
 * Até 10/09/2026 existiam TRÊS implementações independentes da mesma pergunta,
 * e elas tinham divergido exatamente onde mais custa:
 *
 *  - o workspace da SNEG (`sneg-analise-shell`) tinha 9 linhas, as pills de DDI
 *    e Perfil como GATILHO do detalhamento (ADO 67882/67948), o recorte por
 *    permissão e a faixa de avisos de política (CA-F2-02);
 *  - a tela de aprovação (`aprovacao/analises-card`) tinha 8 — sem a linha
 *    "Parecer SNEG" (ADO 67996) —, pills MORTAS, cópias locais do rótulo e da
 *    pill da DDI que ignoravam a RECLASSIFICAÇÃO (a mesma DDI lia "Alto" numa
 *    tela e "Médio" na outra), e nenhum recorte de permissão: o 403 de quem não
 *    pode ler Perfil/Garantia era renderizado como "Não foi possível ler", que
 *    diz ao usuário que o sistema quebrou;
 *  - a fase de contrato (`contrato-view`) tinha **uma** linha, montada no
 *    backend, com as outras marcadas `deferred` no código desde a entrega.
 *
 * A oportunidade não perde análise ao mudar de fase: o veredito que sustentou a
 * decisão é o mesmo documento na minuta e no contrato. Uma segunda composição
 * para a mesma pergunta volta a divergir — é a mesma razão pela qual
 * `AnaliseView` deixou de escolher entre duas telas por perfil.
 *
 * ⚠️ O que varia por fase NÃO é o conteúdo, é de onde vêm três das leituras:
 * `checklist`, `indicadores` e `parecer` já são carregados pela tela que monta
 * o card (a grade "Análise financeira", o card de documentos, o painel do
 * parecer). Passá-los prontos evita a segunda leitura dos MESMOS números na
 * mesma tela — o defeito do sub-quadro "Resultado Financeiro", em que dois
 * blocos mostravam valores diferentes enquanto um não recarregava. Quem não os
 * tem simplesmente omite a prop e o card os lê.
 */
export type AnalisesCardProps = {
  opportunityId: string;
  /** Código da oportunidade — subtítulo do modal de detalhamento da DDI. */
  codigo?: string;
  /**
   * Contador de re-leitura das fontes que o card carrega sozinho.
   *
   * Contador, não booleano: dois saves são dois eventos e uma flag os
   * coalesceria. A re-leitura é QUIETA (não volta para "loading"), senão a
   * linha some justamente enquanto o usuário observa o valor mudar.
   */
  refreshSignal?: number;
  /** Slices já carregadas pela tela — ver o ⚠️ acima. */
  checklist?: AsideSlice<ChecklistResult>;
  indicadores?: AsideSlice<OpportunityIndicatorsSnapshot | null>;
  parecer?: AsideSlice<Parecer | null>;
  /** Injetáveis nos testes. */
  loadViability?: (id: string) => Promise<SnegViability>;
  loadDdi?: (id: string) => Promise<DdiResult | null>;
  loadCreditRisk?: (id: string) => Promise<PerfilRiscoResumo | null>;
  loadGarantiaTrack?: (id: string) => Promise<GarantiaTrackResult>;
  loadAlcadaPreview?: (id: string) => Promise<AlcadaPreview>;
  loadChecklist?: (id: string) => Promise<ChecklistResult>;
  loadIndicators?: (id: string) => Promise<OpportunityIndicatorsSnapshot | null>;
  loadParecer?: (id: string) => Promise<Parecer | null>;
};

export function AnalisesCard({
  opportunityId,
  codigo,
  refreshSignal = 0,
  checklist: checklistProp,
  indicadores: indicadoresProp,
  parecer: parecerProp,
  loadViability = defaultGetViability,
  loadDdi = defaultGetDdi,
  loadCreditRisk = defaultLoadCreditRisk,
  loadGarantiaTrack = defaultGetGarantiaTrack,
  loadAlcadaPreview = defaultGetAlcadaPreview,
  loadChecklist = defaultGetChecklist,
  loadIndicators = defaultGetIndicators,
  loadParecer = defaultGetParecer,
}: AnalisesCardProps) {
  const { can } = usePermissions();
  /*
   * ⚠️ A Viabilidade NÃO é gated, e a cópia da tela de aprovação estava errada
   * ao gateá-la por `Permission.SnegAnalysis`: `GET .../analise/viabilidade`
   * deixou de ser `@Roles(SNEG, ADMIN)` na emenda de 25/08/2026 à ADR-0012 —
   * o LT lê a viabilidade da PRÓPRIA oportunidade, e ela é a primeira linha do
   * painel no protótipo dele. O gate no front absorvia um 403 que não existe
   * mais e escondia a linha que o desenho pede.
   *
   * As duas permissões abaixo são declaradas SEPARADAS embora hoje coincidam
   * nos papéis: são rotas distintas, e amarrar uma à outra faria o card seguir
   * a permissão errada no dia em que um dos `@Roles` mudar. Elas existem
   * porque o 403 delas NÃO é leitura falhada: renderizá-lo como
   * "Indisponível" diz ao usuário que o sistema quebrou e o manda ao suporte.
   */
  const canSeeGarantia = can(Permission.GarantiaView);
  const canSeePerfilCredito = can(Permission.PerfilCreditoView);
  /*
   * Matriz RBAC v2.1 (28/09/2026): `GET .../ddi` é da linha "Análise DDI ·
   * Visualizar" — fora dela o backend responde 403. A linha nem busca nem
   * renderiza: "Não foi possível ler" diria ao usuário que o sistema quebrou.
   */
  const canSeeDdi = can(Permission.DdiView);

  const viability = useAsideLoad(loadViability, opportunityId, refreshSignal);
  const ddi = useAsideLoad(loadDdi, opportunityId, refreshSignal, canSeeDdi);
  const creditRisk = useAsideLoad(
    loadCreditRisk,
    opportunityId,
    refreshSignal,
    canSeePerfilCredito,
  );
  const garantiaTrack = useAsideLoad(
    loadGarantiaTrack,
    opportunityId,
    refreshSignal,
    canSeeGarantia,
  );
  const alcadaPreview = useAsideLoad(loadAlcadaPreview, opportunityId, refreshSignal);

  /*
   * As três que a tela pode já ter: o hook roda sempre (regra dos hooks) mas
   * fica DESLIGADO quando a prop veio — sem segunda requisição para o mesmo
   * dado na mesma tela.
   */
  const checklistOwn = useAsideLoad(
    loadChecklist,
    opportunityId,
    refreshSignal,
    checklistProp === undefined,
  );
  const indicadoresOwn = useAsideLoad(
    loadIndicators,
    opportunityId,
    refreshSignal,
    indicadoresProp === undefined,
  );
  const parecerOwn = useAsideLoad(
    loadParecer,
    opportunityId,
    refreshSignal,
    parecerProp === undefined,
  );

  const checklist = checklistProp ?? checklistOwn;
  const indicadores = indicadoresProp ?? indicadoresOwn;
  const parecerSlice = parecerProp ?? parecerOwn;

  /*
   * O denominador de "Documentação validada (Hub)".
   *
   * ⚠️ `satisfiedExternally` fica FORA: aquele item não está no Hub (foi
   * atendido pelas fotos do bloco da proposta — VBR-642), não tem
   * `repositoryDocumentId` e portanto NUNCA pode ser validado ali. Contá-lo
   * tornava o contador inalcançável — "1/4" com o quarto impossível —, e um
   * número que não fecha faz procurar trabalho que não existe. É o mesmo
   * recorte que o gate do GATE 2 aplica, então tela e gate contam a mesma
   * população.
   */
  const docs = checklist.status === 'loaded' ? (checklist.value.docs ?? []) : [];
  const requiredDocs = docs.filter((doc) => doc.required && !doc.satisfiedExternally);
  const validatedDocs = requiredDocs.filter((doc) => doc.status === 'validado');

  const parecer = parecerSlice.status === 'loaded' ? parecerSlice.value : null;
  const recomendacao = parecer?.recomendacao?.nota
    ? RECOMENDACAO_LABEL[parecer.recomendacao.nota]
    : null;
  /*
   * ADO 67996 — a linha "Parecer SNEG" (TC 67414). Lê o MESMO `parecer` que
   * "Recomendação" e "Alçada sugerida" logo abaixo, então as três não têm como
   * discordar sobre o estado do documento.
   */
  const andamentoParecer = andamentoDoParecer(parecer);

  return (
    <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-4">
      <h3 className="mb-2.5 text-(length:--t-caption) font-bold">Análises</h3>

      <div data-testid="analises-card">
        <AnRow label="Viabilidade">
          {viability.status === 'loading' && <RowLoading />}
          {viability.status === 'error' && <RowUnavailable />}
          {viability.status === 'loaded' &&
            /*
             * Resultado fora do catálogo cai em "Indisponível", nunca em
             * crash: o valor vem da rede, e um `VIABILIDADE_ROW[x].pill` sobre
             * uma chave desconhecida derrubava a ÁRVORE INTEIRA da tela — o
             * card existe justamente para que uma fonte ruim custe uma linha.
             */
            (VIABILIDADE_ROW[viability.value.resultado] ? (
              <StatusPill variant={VIABILIDADE_ROW[viability.value.resultado].pill}>
                {VIABILIDADE_ROW[viability.value.resultado].label}
              </StatusPill>
            ) : (
              <RowUnavailable />
            ))}
        </AnRow>

        {canSeeDdi && (
          <AnRow label="DDI · Integridade">
            {ddi.status === 'loading' && <RowLoading />}
            {ddi.status === 'error' && <RowUnavailable />}
            {ddi.status === 'loaded' && <DdiValor result={ddi.value} opportunityId={opportunityId} codigo={codigo} />}
          </AnRow>
        )}

        {/* `GET .../perfil-credito` é gated — ver `canSeePerfilCredito`. */}
        {canSeePerfilCredito && (
          <>
            <AnRow label="Perfil / Risco">
              {creditRisk.status === 'loading' && <RowLoading />}
              {creditRisk.status === 'error' && <RowUnavailable />}
              {creditRisk.status === 'loaded' &&
                (creditRisk.value ? (
                  /*
                   * A pill é o GATILHO do detalhamento (ADO 67948). A linha
                   * dizia só o veredito ("Concluído · Risco altíssimo") e não
                   * havia de onde ler POC, restrições e histórico com a Vibra
                   * — exatamente a queixa da reportagem. Mesma superfície em
                   * todas as telas, um componente só.
                   */
                  <PerfilCreditoDetalhesTrigger opportunityId={opportunityId}>
                    <StatusPill variant={creditRisk.value.variant}>
                      {creditRisk.value.label}
                    </StatusPill>
                  </PerfilCreditoDetalhesTrigger>
                ) : (
                  /*
                   * `null` = a concessão nunca exigiu levantamento (204 da
                   * BFF). "Não exigido" é o rótulo honesto; um travessão leria
                   * como dado faltando.
                   */
                  <span className="text-(--color-text-muted)">Não exigido</span>
                ))}
            </AnRow>
            {/*
              * O MOTIVO do encerramento, quando há (ADO 67983).
              *
              * Fora da pill: "Encerrado · CNPJ não encontrado no bureau
              * (SERASA)" não cabe na coluna estreita e alinhada à direita.
              */}
            {creditRisk.status === 'loaded' && creditRisk.value?.detalhe && (
              <p
                data-testid="perfil-risco-motivo"
                className="-mt-1 pb-2.5 text-(length:--t-small) leading-snug text-(--color-text-muted)"
              >
                {creditRisk.value.detalhe}
              </p>
            )}
          </>
        )}

        {/*
          * `GET .../garantia` é gated — ver `canSeeGarantia`. Além do 403, o
          * link levaria a `/garantia`, que responde `NotFoundScreen` para estes
          * perfis: oferecer o atalho seria um beco sem saída.
          */}
        {canSeeGarantia && (
          <AnRow
            label={
              <>
                Garantia{' '}
                <span className="normal-case font-normal">(concessão financeira)</span>
              </>
            }
          >
            {garantiaTrack.status === 'loading' && <RowLoading />}
            {garantiaTrack.status === 'error' && <RowUnavailable />}
            {garantiaTrack.status === 'loaded' &&
              (garantiaTrack.value.naoSeAplica ? (
                <span className="text-(--color-text-muted)">Não se aplica</span>
              ) : (
                /*
                 * O link carrega o VEREDITO como texto: a análise mora na tela
                 * da CCOB e duplicar o veredito aqui criaria um segundo lugar
                 * para discordar. `analiseEstadoLabel` é composto pelo backend
                 * a partir do catálogo único (`ANALISE_ESTADO_LABEL`), então
                 * nenhuma tela nomeia o mesmo estado de outro jeito. Chumbar
                 * "Abrir subprocesso" fazia a linha PERDER, ao entrar em "Em
                 * aprovação", um veredito que existia e não tinha mudado
                 * (VBR-635 §10).
                 */
                <Link
                  href={`/oportunidades/${encodeURIComponent(opportunityId)}/garantia`}
                  className="font-bold text-(--secondary-600) hover:underline"
                >
                  {garantiaTrack.value.analiseEstadoLabel ??
                    `${garantiaTrack.value.subLabel} →`}
                </Link>
              ))}
          </AnRow>
        )}

        {/*
          * "validada": o contador conta `validado`, então `0/12` ao lado de dez
          * linhas "Anexado" lê como "nada foi anexado" (VBR-635 §1).
          */}
        <AnRow label="Documentação validada (Hub)">
          {checklist.status === 'loading' && <RowLoading />}
          {checklist.status === 'error' && <RowUnavailable />}
          {checklist.status === 'loaded' && (
            <StatusPill
              variant={validatedDocs.length >= requiredDocs.length ? 'success' : 'warning'}
            >
              {validatedDocs.length}/{requiredDocs.length}
            </StatusPill>
          )}
        </AnRow>

        <AnRow label="TIR / VPL (oportunidade)">
          {indicadores.status === 'loading' && <RowLoading />}
          {indicadores.status === 'error' && <RowUnavailable />}
          {indicadores.status === 'loaded' &&
            (indicadores.value && indicadores.value.tir !== null ? (
              <span>
                {formatPercentFromDecimal(indicadores.value.tir)} ·{' '}
                {formatCurrency(indicadores.value.vpl)}
              </span>
            ) : (
              <span className="text-(--color-text-muted)">Não calculado</span>
            ))}
        </AnRow>

        {/*
          * ADO 67996 / TC 67414 — "Não iniciado", "Em elaboração", "Emitido".
          *
          * Fica ENTRE "TIR / VPL" e "Alçada sugerida" de propósito: põe o
          * ESTADO do parecer imediatamente acima das duas linhas que saem do
          * CONTEÚDO dele — sem ela, "Alçada sugerida —" e "Recomendação —" não
          * diziam se faltava parecer ou se o analista ainda não tinha
          * respondido.
          */}
        <AnRow label="Parecer SNEG">
          {parecerSlice.status === 'loading' && <RowLoading />}
          {parecerSlice.status === 'error' && <RowUnavailable />}
          {parecerSlice.status === 'loaded' && (
            <StatusPill variant={andamentoParecer.variant}>
              {andamentoParecer.label}
            </StatusPill>
          )}
        </AnRow>

        {/*
          * ADO 68241 — "Alçada Sugerida" dizia "Indisponível"/"—" SEMPRE.
          *
          * O `nivel` vinha de `parecer.alcadaSugerida`, coluna que nunca teve
          * quem escrevesse (medido: 30 pareceres, 0 preenchidos), então a linha
          * era muda em 100% das oportunidades — enquanto a cadeia inteira já
          * estava na MESMA tela, no `AlcadaSagaPanel`. O backend passou a
          * resolver o topo da cadeia simulada pelo Salesforce.
          *
          * Duas linhas, e as duas são veredito do BACKEND: o nome do nível e,
          * abaixo, os MOTIVOS que o elevaram — é o que responde "melhorar a
          * descrição da alçada sugerida para que essa informação seja mais
          * clara". Sem nível, o par vira rótulo curto + a frase que diz o que
          * destrava; nunca um travessão, que não distingue "falta acionar" de
          * "o org não indicou nível".
          */}
        <AnRow label="Alçada sugerida">
          {alcadaPreview.status === 'loading' && <RowLoading />}
          {alcadaPreview.status === 'error' && <RowUnavailable />}
          {alcadaPreview.status === 'loaded' &&
            (alcadaPreview.value.nivel ? (
              <span className="flex flex-col items-end" data-testid="alcada-sugerida">
                <span>{alcadaPreview.value.nivel.nivel}</span>
                {alcadaPreview.value.nivel.descricao && (
                  <span className="text-[11px] font-normal text-(--color-text-muted)">
                    {alcadaPreview.value.nivel.descricao}
                  </span>
                )}
              </span>
            ) : (
              <span className="flex flex-col items-end" data-testid="alcada-sugerida">
                <span className="text-(--color-text-muted)">
                  {alcadaPreview.value.nivelIndisponivelRotulo ?? '—'}
                </span>
                {alcadaPreview.value.nivelIndisponivelMotivo && (
                  <span className="text-[11px] font-normal text-(--color-text-muted)">
                    {alcadaPreview.value.nivelIndisponivelMotivo}
                  </span>
                )}
              </span>
            ))}
        </AnRow>

        <AnRow label="Recomendação">
          {parecerSlice.status === 'loading' && <RowLoading />}
          {parecerSlice.status === 'error' && <RowUnavailable />}
          {parecerSlice.status === 'loaded' &&
            (recomendacao ? (
              <StatusPill variant={recomendacao.pill}>{recomendacao.label}</StatusPill>
            ) : (
              <span className="text-(--color-text-muted)">—</span>
            ))}
        </AnRow>
      </div>

      {/*
       * CA-F2-02 — os avisos de política aparecem sozinhos ao abrir. O card do
       * protótipo carrega só a pill do veredito; a faixa abaixo mantém o
       * critério de aceite (o vocabulário amarelo de "atenção" do `.ad-hint`).
       */}
      {viability.status === 'loaded' &&
        (viability.value.avisos ?? []).map((aviso) => (
          <div
            key={aviso.codigo}
            data-testid="policy-warning"
            className="mt-2.5 rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2 text-(length:--t-small) font-bold text-(--yellow-700)"
          >
            {aviso.mensagem}
          </div>
        ))}

      {/*
       * Âncora de fragmento — a seção do parecer é montada em TODAS as fases a
       * partir da análise (`ParecerPanel` no workspace, `ParecerReadonlySection`
       * daí em diante), justamente para que este botão nunca aponte para o
       * vazio.
       */}
      <a
        href="#parecer"
        className="mt-3 flex w-full items-center justify-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-500) hover:bg-(--neutral-50)"
      >
        Ir para o parecer
      </a>
    </div>
  );
}

/**
 * Valor da linha "DDI · Integridade".
 *
 * ⚠️ O nível exibido é o RECLASSIFICADO quando existe. A cópia que vivia na
 * tela de aprovação lia `riskLevel` cru, então a mesma DDI reclassificada dizia
 * "Alto" numa tela e "Médio" na outra.
 */
function DdiValor({
  result,
  opportunityId,
  codigo,
}: {
  result: DdiResult | null;
  opportunityId: string;
  codigo?: string;
}) {
  /*
   * "Não aplicável" é RESPOSTA, não lacuna (ADO 67943). Com o conjunto eleito
   * só de franquia o backend suprime a solicitação e devolve `not_eligible`;
   * renderizar o mesmo "—" de "ainda não há veredito" faria procurar uma DDI
   * que ninguém vai executar. Pill NEUTRA — nada falhou e nada está pendente.
   */
  if (result?.status === 'not_eligible') {
    return <StatusPill variant="neutral">Não aplicável</StatusPill>;
  }

  const nivel = result ? (result.reclassification?.reclassifiedTo ?? result.riskLevel) : null;
  if (!result || result.status !== 'completed' || !nivel) {
    return <span className="text-(--color-text-muted)">—</span>;
  }

  /*
   * A SITUAÇÃO ao lado do risco (ADO 67882), do mesmo `DDI_SITUACAO_PILL`: uma
   * tela dizendo "Liberada" e a outra só "Médio" é a divergência que a fonte
   * única existe para impedir.
   */
  const situacao = situacaoTemVeredito(result.situacao)
    ? DDI_SITUACAO_PILL[result.situacao]
    : null;

  return (
    /*
     * A pill é o GATILHO do detalhamento (ADO 67882): a linha dizia só o
     * veredito ("Alto · 20") e não havia de onde ler racional, achados e
     * parecer — o `DdiPanel` só é montado dentro de um ticket `ddi:*`.
     */
    <DdiDetalhesTrigger opportunityId={opportunityId} subtitulo={codigo}>
      <span className="flex flex-wrap items-center justify-end gap-1">
        {situacao ? (
          <StatusPill variant={situacao.variant} data-testid="ddi-situacao-pill">
            {situacao.label}
          </StatusPill>
        ) : null}
        <StatusPill variant={DDI_RISK_PILL[nivel]}>
          {DDI_RISK_LABEL[nivel]}
          {result.score !== null ? ` · ${result.score}` : ''}
        </StatusPill>
      </span>
    </DdiDetalhesTrigger>
  );
}

/**
 * Loader padrão de Perfil/Risco — delega ao predicado único (ADO 67983).
 *
 * Era uma das TRÊS cópias da mesma derivação, e todas jogavam fora a pontuação
 * e o motivo do encerramento.
 */
async function defaultLoadCreditRisk(id: string): Promise<PerfilRiscoResumo | null> {
  return resumoPerfilRisco(await getPerfilCredito(id));
}

/** `.an` — uma linha rótulo/valor do card. */
function AnRow({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2.5 border-t border-(--color-border) py-[9px] text-(length:--t-caption) first:border-t-0">
      <span className="text-(--color-text-muted)">{label}</span>
      <span className="text-right font-bold">{children}</span>
    </div>
  );
}

/** Placeholder de carregamento das linhas `.an`. */
function RowLoading() {
  return <span className="inline-block h-4 w-16 animate-pulse rounded bg-(--neutral-100)" />;
}

/**
 * A fonte da linha falhou. O card NUNCA esconde a linha nem escreve um
 * travessão: "—" leria como "esta oportunidade não tem essa análise" (um fato
 * de negócio) em vez de "não conseguimos ler".
 */
function RowUnavailable() {
  return (
    <span
      data-testid="an-unavailable"
      className="inline-flex items-center rounded-full bg-(--neutral-60) px-2 py-0.5 text-[11px] font-bold text-(--neutral-700)"
    >
      Indisponível
    </span>
  );
}

const VIABILIDADE_ROW: Record<ViabilidadeResultado, { label: string; pill: PillVariant }> = {
  OK: { label: 'OK', pill: 'success' },
  ATENCAO: { label: 'Atenção', pill: 'warning' },
  INVIAVEL: { label: 'Inviável', pill: 'danger' },
};

const DDI_RISK_LABEL: Record<NonNullable<DdiResult['riskLevel']>, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
};

const DDI_RISK_PILL: Record<NonNullable<DdiResult['riskLevel']>, PillVariant> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
};

const RECOMENDACAO_LABEL: Record<string, { label: string; pill: PillVariant }> = {
  aprovar: { label: 'Aprovar', pill: 'success' },
  ajustar: { label: 'Ajustar', pill: 'warning' },
  devolver: { label: 'Devolver', pill: 'danger' },
};

function formatCurrency(value: number | null | undefined): string {
  // `== null` cobre `undefined`: o valor vem da rede e um snapshot sem `vpl`
  // derrubava a árvore inteira em vez de custar meia linha.
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
