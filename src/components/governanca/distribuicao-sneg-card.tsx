'use client';

import { useCallback, useEffect, useState } from 'react';

import { AnalistaPickerModal } from '@/components/governanca/analista-picker-modal';
import {
  BotaoPrimario,
  BotaoSecundario,
} from '@/components/governanca/modal-buttons';
import { useConfirm } from '@/components/confirm-dialog';
import { IN_FIELD, IN_LABEL } from '@/components/ui/field-classes';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  listGerenciasDistribuicao as defaultList,
  reatribuirGerencia as defaultReatribuir,
} from '@/lib/governanca/distribuicao.data';
import type {
  BlocoDistribuicao,
  GerenciaDistribuicao,
  GerenciaDistribuicaoList,
  ReatribuicaoGerenciaResult,
} from '@/lib/governanca/distribuicao.types';
import { searchSnegAnalysts as defaultSearchAnalistas } from '@/lib/opportunities/directory.data';
import type { DirectoryUser } from '@/lib/opportunities/directory.types';
import { upsertDistribuicao as defaultUpsert } from '@/lib/sneg-admin/sneg-admin.data';

type Props = {
  listGerencias?: () => Promise<GerenciaDistribuicaoList>;
  /** "Editar" — troca a parametrização (`PUT /v1/sneg/distribuicao/:gerencia`). */
  editarAnalista?: (
    gerencia: string,
    analistaId: string,
    etapa: BlocoDistribuicao['etapa'],
  ) => Promise<unknown>;
  /** "Reatribuir" — troca o dono das oportunidades em curso. */
  reatribuirGerencia?: (payload: {
    gerencia: string;
    analistaId: string;
    motivo?: string;
  }) => Promise<ReatribuicaoGerenciaResult>;
  searchAnalistas?: (query: string) => Promise<DirectoryUser[]>;
};

type Acao =
  | { tipo: 'editar'; bloco: BlocoDistribuicao; linha: GerenciaDistribuicao }
  | { tipo: 'reatribuir'; bloco: BlocoDistribuicao; linha: GerenciaDistribuicao }
  | null;

type Feedback = { tom: 'ok' | 'erro'; texto: string } | null;

/**
 * Governança → SNEG: "Distribuição e roteamento da análise SNEG"
 * (`15-governanca.html`, aba "Distribuição SNEG").
 *
 * ## Quatro blocos, não uma tabela (ADO 67909)
 *
 * O protótipo (`15-governanca.html:125`) desenha UMA tabela
 * `Gerência | Analista responsável`. O negócio recusou em 31/08/2026:
 *
 * > *"A Distribuição tem que ficar em blocos diferentes por gerências. Análise,
 * > Minutas, Cadastro, Hipoteca porque são analistas diferentes. O mesmo
 * > analista não fica do início ao fim do processo."*
 *
 * A divergência com o protótipo é deliberada — mesmo precedente do ADO 67974 e
 * do ADO 68000. **Etapa, rótulo e ordem vêm do backend**; a tela não mantém a
 * lista.
 *
 * ⚠️ **Em 20/09/2026 o `Cadastro` saiu e a `Hipoteca` virou `Garantia`** (*"ele
 * não existe mais"*). Esta tela não precisou de mudança nenhuma para isso —
 * exatamente porque os rótulos vêm no payload. O que mudou aqui foi o TEXTO do
 * diálogo de confirmação, que nomeava as etapas à mão.
 *
 * ## Dois verbos, dois efeitos — e a tela precisa dizer qual é qual
 *
 * - **Editar** troca só a parametrização. Vale **daí em diante**: a distribuição
 *   automática lê a tabela no GATE 1 (e, desde 20/09/2026, na aprovação da
 *   análise prévia para a etapa Garantia), então quem já está em curso não se
 *   move. Existe em todos os blocos.
 * - **Reatribuir** troca o analista das análises **abertas** da gerência **e**
 *   grava a parametrização — é o superconjunto, e existe **só onde
 *   `executaDistribuicao`** (hoje, a Análise). Nas outras não há FILA para mover
 *   em lote, e um botão ali seria controle morto. ⚠️ A etapa **Garantia** passou
 *   a distribuir automaticamente (20/09/2026), mas a correção dela é UMA A UMA,
 *   na tela da garantia — é lá que se vê de qual processo se trata.
 *
 * ⚠️ `executaDistribuicao` é **veredito do backend**, lido do payload e nunca
 * recalculado aqui: uma segunda cópia da regra ofereceria um CTA que a API
 * recusa.
 *
 * ## O que o protótipo tem e esta tela NÃO reproduz
 *
 * O badge `Vigente … · v.N` e o botão **"Publicar nova versão"** pressupõem um
 * versionamento de parametrização que este domínio não tem: `sneg_assignments`
 * é uma tabela viva, sem versão nem data de vigência. Um "v.3" na tela seria
 * número fabricado (a classe de defeito do CPV fictício) e o botão seria
 * controle morto — o que a escrita faz já vale na hora. No lugar do badge vai
 * a data REAL da última alteração da tabela.
 */
export function DistribuicaoSnegCard({
  listGerencias = defaultList,
  editarAnalista = defaultUpsert,
  reatribuirGerencia = defaultReatribuir,
  searchAnalistas = defaultSearchAnalistas,
}: Props) {
  const { can } = usePermissions();
  const podeEscrever = can(Permission.SnegDistribuicaoGovernanca);
  const confirm = useConfirm();

  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [blocos, setBlocos] = useState<BlocoDistribuicao[]>([]);
  const [acao, setAcao] = useState<Acao>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const reload = useCallback(() => {
    setStatus('loading');
    listGerencias()
      .then((data) => {
        setBlocos(data.blocos);
        setStatus('loaded');
      })
      .catch(() => setStatus('error'));
  }, [listGerencias]);

  useEffect(() => {
    reload();
  }, [reload]);

  const atualizadaEm = ultimaAtualizacao(blocos);
  const vazio = blocos.every((b) => b.items.length === 0);

  async function handleEditar(
    bloco: BlocoDistribuicao,
    linha: GerenciaDistribuicao,
    analista: DirectoryUser,
  ) {
    setBusy(true);
    try {
      await editarAnalista(linha.gerencia, analista.id, bloco.etapa);
      setAcao(null);
      setFeedback({
        tom: 'ok',
        texto:
          `${bloco.etapaLabel} · gerência "${linha.gerencia}": responsável ` +
          `alterado para ${analista.name}.` +
          (bloco.executaDistribuicao
            ? ' Vale para as análises que entrarem a partir de agora; as que já' +
              ' estão em curso continuam com o responsável atual.'
            : ''),
      });
      reload();
    } catch (cause) {
      setFeedback({ tom: 'erro', texto: mensagemDe(cause) });
    } finally {
      setBusy(false);
    }
  }

  async function handleReatribuir(
    linha: GerenciaDistribuicao,
    analista: DirectoryUser,
    motivo: string,
  ) {
    setBusy(true);
    try {
      const resultado = await reatribuirGerencia({
        gerencia: linha.gerencia,
        analistaId: analista.id,
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      });
      setAcao(null);
      /*
       * ADO 67909 — a frase começa pelo efeito que SEMPRE existe.
       *
       * Antes ela abria por `reatribuidas`, e o caso real reportado produzia
       * "0 oportunidade(s) … passaram" logo depois de um modal prometendo 1 —
       * uma resposta que lê como "nada aconteceu" enquanto a parametrização
       * mudava. Agora o primeiro fato é o que a coluna passa a mostrar.
       */
      setFeedback({
        tom: 'ok',
        texto:
          `A gerência "${linha.gerencia}" agora está com ${analista.name} na ` +
          `análise. ` +
          (resultado.reatribuidas > 0
            ? `${contarAnalises(resultado.reatribuidas)} ${
                resultado.reatribuidas === 1 ? 'passou' : 'passaram'
              } para o novo responsável`
            : 'Nenhuma análise aberta precisou mudar') +
          (resultado.inalteradas > 0
            ? `; ${contarAnalises(resultado.inalteradas)} já ${
                resultado.inalteradas === 1 ? 'estava' : 'estavam'
              } com o analista`
            : '') +
          '. A troca foi registrada no log de cada oportunidade.',
      });
      reload();
    } catch (cause) {
      setFeedback({ tom: 'erro', texto: mensagemDe(cause) });
      // Relança para o diálogo de confirmação manter-se aberto com a frase.
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Distribuição e roteamento da análise SNEG"
      data-testid="governanca-distribuicao-sneg"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px] shadow-[var(--shadow-card)]"
    >
      {confirm.dialog}

      {/* .acard-h — badges e título, como no protótipo */}
      <header className="mb-3.5 flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-(--color-border) bg-(--neutral-40) px-[9px] py-[3px] text-(length:--t-small) font-bold text-(--color-text-muted)">
            Dono: SNEG
          </span>
          {atualizadaEm && (
            <span className="inline-flex items-center rounded-full border border-(--secondary-200) bg-(--secondary-100) px-[9px] py-[3px] text-(length:--t-small) font-bold text-(--secondary-700)">
              Atualizada em {atualizadaEm}
            </span>
          )}
        </div>
        <h2 className="text-(length:--t-h4) font-bold">
          Distribuição e roteamento da análise SNEG
        </h2>
      </header>

      {feedback && (
        <p
          role="status"
          data-testid="distribuicao-feedback"
          className={`mb-3 rounded-[var(--radius-xs)] px-3 py-2 text-(length:--t-caption) ${
            feedback.tom === 'ok'
              ? 'bg-(--secondary-100) text-(--secondary-700)'
              : 'bg-(--red-100) text-(--color-danger)'
          }`}
        >
          {feedback.texto}
        </p>
      )}

      {status === 'loading' && (
        <p className="py-4 text-(length:--t-caption) text-(--color-text-muted)">
          Carregando as gerências…
        </p>
      )}

      {status === 'error' && (
        <div className="py-4">
          <p className="text-(length:--t-caption) text-(--color-danger)">
            Não foi possível carregar a distribuição SNEG.
          </p>
          <button
            type="button"
            onClick={reload}
            className="mt-2 text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {status === 'loaded' && vazio && (
        <p
          data-testid="distribuicao-sneg-vazio"
          className="py-4 text-(length:--t-caption) text-(--color-text-muted)"
        >
          Nenhuma gerência configurada — as próximas análises ficarão com
          atribuição pendente.
        </p>
      )}

      {status === 'loaded' && !vazio && (
        <div className="flex flex-col gap-5">
          {blocos.map((bloco) => (
            <BlocoEtapa
              key={bloco.etapa}
              bloco={bloco}
              podeEscrever={podeEscrever}
              onEditar={(linha) => {
                setFeedback(null);
                setAcao({ tipo: 'editar', bloco, linha });
              }}
              onReatribuir={(linha) => {
                setFeedback(null);
                setAcao({ tipo: 'reatribuir', bloco, linha });
              }}
            />
          ))}
        </div>
      )}

      {acao?.tipo === 'editar' && (
        <EditarModal
          bloco={acao.bloco}
          linha={acao.linha}
          busy={busy}
          searchAnalistas={searchAnalistas}
          onClose={() => setAcao(null)}
          onConfirm={(analista) =>
            void handleEditar(acao.bloco, acao.linha, analista)
          }
        />
      )}

      {acao?.tipo === 'reatribuir' && (
        <ReatribuirModal
          linha={acao.linha}
          busy={busy}
          searchAnalistas={searchAnalistas}
          onClose={() => setAcao(null)}
          onConfirm={(analista, motivo) => {
            /*
             * O seletor FECHA antes da confirmação, em vez de empilhar. Os dois
             * usam `z-[200]`, e o seletor é montado depois no DOM — empilhado,
             * ele pintaria POR CIMA do diálogo e o Escape fecharia os dois. A
             * confirmação nomeia gerência, analista e total, então nada do
             * contexto se perde.
             */
            setAcao(null);
            /*
             * ADO 67909 — o texto anterior afirmava duas coisas que deixaram de
             * ser verdade, e o negócio circulou as duas:
             *
             *  1. "inclusive as que já estão em aprovação, minuta ou
             *     assinatura" — a reatribuição agora só alcança análise ABERTA;
             *     as etapas seguintes têm analista próprio.
             *  2. "A distribuição automática NÃO muda" — ela muda: é o que faz
             *     o nome aparecer na coluna.
             */
            confirm.ask({
              title: 'Reatribuir a análise desta gerência?',
              description:
                `${contarEmCurso(acao.linha)} da gerência "${acao.linha.gerencia}" ` +
                `${
                  concordaSingular(acao.linha.oportunidadesEmCurso)
                    ? 'passará'
                    : 'passarão'
                } a ter ${analista.name} como analista responsável, e ` +
                `${analista.name} passa a ser o analista desta gerência na ` +
                'distribuição automática das próximas análises. Oportunidades ' +
                'cuja análise já foi concluída não são alteradas — as etapas ' +
                'seguintes (Minutas, Garantia) têm analista próprio. ' +
                'A troca é registrada no log de cada oportunidade.',
              confirmLabel: 'Reatribuir',
              onConfirm: () => handleReatribuir(acao.linha, analista, motivo),
            });
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bloco de uma etapa
// ---------------------------------------------------------------------------

/**
 * Um bloco da tela: o nome da etapa e a tabela de gerências dela (ADO 67909).
 *
 * O título e a ordem vêm do payload — a tela não conhece a lista de etapas.
 */
function BlocoEtapa({
  bloco,
  podeEscrever,
  onEditar,
  onReatribuir,
}: {
  bloco: BlocoDistribuicao;
  podeEscrever: boolean;
  onEditar: (linha: GerenciaDistribuicao) => void;
  onReatribuir: (linha: GerenciaDistribuicao) => void;
}) {
  return (
    <section data-testid={`distribuicao-bloco-${bloco.etapa}`}>
      <h3 className="mb-1 text-(length:--t-caption) font-bold">
        {bloco.etapaLabel}
      </h3>

      {/*
       * A legenda existe para o bloco não prometer o que não faz. Sem ela, uma
       * tabela sem "Reatribuir" leria como recurso faltando, e não como "aqui
       * não há fila para mover".
       *
       * ⚠️ **Ela vem do PAYLOAD desde 20/09/2026.** Era um ternário sobre
       * `executaDistribuicao`, e por isso escrevia "a distribuição automática
       * vale para a Análise" em toda etapa que respondesse `false` — afirmação
       * que virou FALSA no bloco Garantia, que passou a distribuir na aprovação
       * da análise prévia. Um booleano não tem como carregar três respostas.
       */}
      <p className="mb-2 text-(length:--t-small) text-(--color-text-muted)">
        {bloco.legenda}
      </p>

      {bloco.items.length === 0 ? (
        <p
          data-testid={`distribuicao-bloco-vazio-${bloco.etapa}`}
          className="py-2 text-(length:--t-caption) text-(--color-text-muted)"
        >
          Nenhuma gerência para configurar nesta etapa.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table
            data-testid={`distribuicao-sneg-tabela-${bloco.etapa}`}
            className="w-full border-collapse text-(length:--t-caption)"
          >
            <thead>
              <tr>
                <th className="whitespace-nowrap border-b border-(--color-border) px-2.5 py-2 text-left text-(length:--t-small) font-bold uppercase tracking-[.3px] text-(--color-text-muted)">
                  Gerência
                </th>
                <th className="whitespace-nowrap border-b border-(--color-border) px-2.5 py-2 text-left text-(length:--t-small) font-bold uppercase tracking-[.3px] text-(--color-text-muted)">
                  Analista responsável
                </th>
                <th className="border-b border-(--color-border) px-2.5 py-2">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {bloco.items.map((linha, i) => {
                const ultima = i === bloco.items.length - 1;
                const cell = `px-2.5 py-[9px] align-top ${
                  ultima ? '' : 'border-b border-(--color-border)'
                }`;
                return (
                  <tr key={linha.gerencia}>
                    <td className={cell}>{linha.gerencia}</td>
                    <td className={cell}>
                      {linha.analistaNome ?? linha.analistaId ?? (
                        /*
                         * Gerência sem analista é resposta de negócio (RN-F1-01),
                         * não um campo vazio: dizê-lo é o que explica por que as
                         * análises dela nascem pendentes.
                         */
                        <span className="text-(--color-text-muted)">
                          {bloco.executaDistribuicao
                            ? 'Aguardando distribuição'
                            : 'Sem responsável definido'}
                        </span>
                      )}
                    </td>
                    <td className={`${cell} whitespace-nowrap text-right`}>
                      {podeEscrever ? (
                        <>
                          <button
                            type="button"
                            data-testid={`editar-${bloco.etapa}-${linha.gerencia}`}
                            onClick={() => onEditar(linha)}
                            className="font-bold text-(--secondary-600) hover:underline"
                          >
                            Editar
                          </button>
                          {/*
                           * "Reatribuir" só onde o backend diz que há fila.
                           * Veredito lido, nunca recalculado — e nas outras
                           * etapas o botão seria controle morto.
                           */}
                          {bloco.executaDistribuicao && (
                            <>
                              <span className="px-1.5 text-(--color-text-muted)">·</span>
                              <button
                                type="button"
                                data-testid={`reatribuir-${bloco.etapa}-${linha.gerencia}`}
                                onClick={() => onReatribuir(linha)}
                                className="font-bold text-(--secondary-600) hover:underline"
                              >
                                Reatribuir
                              </button>
                            </>
                          )}
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Modais
// ---------------------------------------------------------------------------

function EditarModal({
  bloco,
  linha,
  busy,
  searchAnalistas,
  onClose,
  onConfirm,
}: {
  bloco: BlocoDistribuicao;
  linha: GerenciaDistribuicao;
  busy: boolean;
  searchAnalistas: (q: string) => Promise<DirectoryUser[]>;
  onClose: () => void;
  onConfirm: (analista: DirectoryUser) => void;
}) {
  return (
    <AnalistaPickerModal
      title={`Editar responsável · ${bloco.etapaLabel}`}
      subtitle={`${linha.gerencia} · ${bloco.etapaLabel}`}
      initialSelectedId={linha.analistaId}
      search={searchAnalistas}
      onClose={onClose}
      footer={(selected) => (
        <>
          <p className="mb-3 text-(length:--t-caption) text-(--color-text-muted)">
            {bloco.executaDistribuicao ? (
              <>
                Vale <strong>a partir de agora</strong>: as oportunidades que
                entrarem em análise nesta gerência passam a ser distribuídas
                para o analista escolhido. As que já estão em curso continuam
                com o responsável atual — para movê-las, use{' '}
                <strong>Reatribuir</strong>.
              </>
            ) : (
              /*
               * ⚠️ A frase é a do PAYLOAD, e não uma escrita aqui. A versão
               * anterior afirmava "a distribuição automática vale para a
               * Análise" em toda etapa sem lote — falso na Garantia desde
               * 20/09/2026, e falso DENTRO do modal daquela etapa, que é onde
               * alguém acabou de clicar para parametrizá-la.
               */
              <>
                Registra quem responde por <strong>{bloco.etapaLabel}</strong>{' '}
                nesta gerência. {bloco.legenda}
              </>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <BotaoSecundario onClick={onClose} disabled={busy}>
              Cancelar
            </BotaoSecundario>
            <BotaoPrimario
              testId="confirmar-editar"
              disabled={busy || !selected}
              onClick={() => selected && onConfirm(selected)}
            >
              {busy ? 'Salvando…' : 'Salvar'}
            </BotaoPrimario>
          </div>
        </>
      )}
    />
  );
}

function ReatribuirModal({
  linha,
  busy,
  searchAnalistas,
  onClose,
  onConfirm,
}: {
  linha: GerenciaDistribuicao;
  busy: boolean;
  searchAnalistas: (q: string) => Promise<DirectoryUser[]>;
  onClose: () => void;
  onConfirm: (analista: DirectoryUser, motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');

  return (
    <AnalistaPickerModal
      title="Reatribuir a análise da gerência"
      subtitle={`${linha.gerencia} · Análise`}
      search={searchAnalistas}
      onClose={onClose}
      footer={(selected) => (
        <>
          {/*
           * O aviso vem ANTES da confirmação, e não no lugar dela: quem escolhe
           * o analista precisa saber o alcance enquanto escolhe, e o diálogo de
           * confirmação repete o número no momento de executar.
           */}
          <p
            data-testid="reatribuir-aviso"
            className="mb-3 rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2 text-(length:--t-caption) text-(--yellow-700)"
          >
            {contarEmCurso(linha)} desta gerência{' '}
            {concordaSingular(linha.oportunidadesEmCurso)
              ? 'será alterada'
              : 'serão alteradas'}
            , e
            a distribuição automática das próximas passa a apontar para o
            analista escolhido.
          </p>

          <label htmlFor="reatribuir-gerencia-motivo" className={IN_LABEL}>
            Motivo (opcional)
          </label>
          <input
            id="reatribuir-gerencia-motivo"
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={busy}
            placeholder="Registrado na trilha de auditoria"
            className={IN_FIELD}
          />

          <div className="mt-4 flex justify-end gap-2">
            <BotaoSecundario onClick={onClose} disabled={busy}>
              Cancelar
            </BotaoSecundario>
            <BotaoPrimario
              testId="confirmar-reatribuir"
              disabled={busy || !selected}
              onClick={() => selected && onConfirm(selected, motivo)}
            >
              {busy ? 'Reatribuindo…' : 'Reatribuir'}
            </BotaoPrimario>
          </div>
        </>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

/**
 * O verbo concorda no SINGULAR também com ZERO.
 *
 * ⚠️ O sujeito de {@link contarEmCurso} é singular quando não há fila
 * ("Nenhuma oportunidade com análise aberta"), então zero e um pedem a mesma
 * conjugação — com `=== 1` a frase saía *"Nenhuma oportunidade … **serão
 * alteradas**"*. Pego no card da CCOB, no browser, em 08/09/2026.
 */
function concordaSingular(n: number | null): boolean {
  return (n ?? 0) <= 1;
}

/**
 * "N oportunidades com análise aberta" em pt-BR, com o singular certo.
 *
 * O número vem do backend, na mesma leitura que monta a lista — derivá-lo de
 * outra chamada faria a confirmação prometer um total diferente do que a
 * escrita altera.
 *
 * ⚠️ Diz **análise aberta**, não "em curso": a reatribuição deixou de alcançar
 * oportunidade cuja análise já foi concluída (ADO 67909), e o texto tem de
 * descrever o que a escrita faz.
 *
 * `null` (fora do bloco Análise) não deveria chegar aqui — só o bloco que
 * executa oferece "Reatribuir" —, e degrada para a frase de zero em vez de
 * imprimir "null".
 */
function contarEmCurso(linha: GerenciaDistribuicao): string {
  const n = linha.oportunidadesEmCurso;
  if (n === null || n === 0) return 'Nenhuma oportunidade com análise aberta';
  return `${n} oportunidade${n === 1 ? '' : 's'} com análise aberta`;
}

/**
 * "N análise aberta / N análises abertas" — o plural certo.
 *
 * O texto da tela fala de ANÁLISES, não de um pronome do analista: o gênero de
 * quem assume não é conhecido pela tela (nem deveria decidir a frase), e
 * "passaram para ele" era o que a UAT via ao reatribuir para uma analista.
 */
function contarAnalises(n: number): string {
  return n === 1 ? '1 análise aberta' : `${n} análises abertas`;
}

/** A data mais recente de alteração da tabela inteira, em `DD/MM/AAAA`. */
function ultimaAtualizacao(blocos: readonly BlocoDistribuicao[]): string | null {
  const datas = blocos
    .flatMap((bloco) => bloco.items)
    .map((linha) => linha.atualizadaEm)
    .filter((v): v is string => typeof v === 'string' && v !== '')
    .map((v) => new Date(v))
    .filter((d) => !Number.isNaN(d.getTime()));

  if (datas.length === 0) return null;

  const maisRecente = datas.reduce((a, b) => (a > b ? a : b));
  return maisRecente.toLocaleDateString('pt-BR');
}

/** Frase exibível de um motivo de rejeição — nunca `String(cause)`. */
function mensagemDe(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim() !== '') return cause.message;
  return 'Não foi possível concluir a ação. Tente novamente.';
}
