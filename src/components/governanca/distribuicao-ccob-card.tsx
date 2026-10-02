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
  listGerenciasCcob as defaultList,
  reatribuirGerenciaCcob as defaultReatribuir,
  upsertDistribuicaoCcob as defaultUpsert,
} from '@/lib/governanca/distribuicao-ccob.data';
import type {
  GerenciaCcob,
  ReatribuicaoGerenciaCcobResult,
} from '@/lib/governanca/distribuicao-ccob.types';
import { searchCcobAnalysts as defaultSearchAnalistas } from '@/lib/opportunities/directory.data';
import type { DirectoryUser } from '@/lib/opportunities/directory.types';

type Props = {
  listGerencias?: () => Promise<{ items: GerenciaCcob[]; total: number }>;
  /** "Editar" — só a parametrização (`PUT /v1/ccob/distribuicao/:gerencia`). */
  editarAnalista?: (gerencia: string, analistaId: string) => Promise<unknown>;
  /** "Reatribuir" — troca também o dono das garantias em análise prévia. */
  reatribuirGerencia?: (payload: {
    gerencia: string;
    analistaId: string;
    motivo?: string;
  }) => Promise<ReatribuicaoGerenciaCcobResult>;
  searchAnalistas?: (query: string) => Promise<DirectoryUser[]>;
};

type Acao =
  | { tipo: 'editar'; linha: GerenciaCcob }
  | { tipo: 'reatribuir'; linha: GerenciaCcob }
  | null;

type Feedback = { tom: 'ok' | 'erro'; texto: string } | null;

/**
 * Governança → CCOB: "Distribuição e roteamento da análise prévia da garantia"
 * (04/09/2026).
 *
 * ## O que esta tela destrava
 *
 * Antes dela a análise prévia era pedida à ÁREA e a nenhuma pessoa: o
 * subprocesso entrava em `EM_ANALISE_PREVIA`, a prévia era aberta e **ninguém
 * era acionado** — nenhuma regra do Anexo B roteava para a caixa `CCOB` (medido
 * em 02/09/2026: LT/EV 12, SNEG 4, COMPLIANCE 1, CCOB **zero**), e a tela da
 * garantia mostrava o literal `"CCOB"` como responsável. O pedido do negócio é a
 * réplica do modelo da SNEG: *"ao entrar em análise prévia, cada oportunidade
 * deve receber automaticamente um analista da CCOB, e abrir uma pendência para
 * esse analista executar a análise"*.
 *
 * ## UMA tabela, não quatro blocos
 *
 * A Distribuição SNEG tem os blocos Análise · Minutas · Cadastro · Hipoteca
 * porque o negócio nomeou aqueles quatro para a SNEG (ADO 67909). **Ninguém
 * nomeou etapas para a CCOB**, e o pedido recorta o escopo: *"pode ignorar a
 * análise de perfil, porque ela é automatizada; foca só na análise prévia"*.
 * Inventar etapas aqui criaria vocabulário de negócio que nenhuma fonte
 * declara — o defeito das gerências semeadas à mão que a migration `…136`
 * removeu.
 *
 * ## Dois verbos — e a tela precisa dizer qual é qual
 *
 * - **Editar** troca só a parametrização. Vale **daí em diante**: quem
 *   distribui lê a tabela no instante em que a garantia é promovida à prévia,
 *   então o que já está em curso não se move.
 * - **Reatribuir** troca o analista das garantias **em análise prévia** da
 *   gerência **e** grava a parametrização — é o superconjunto.
 *
 * ⚠️ **O "Reatribuir" é novo (08/09/2026) e o docblock anterior afirmava o
 * contrário** ("Um verbo: Editar… um lote aqui prometeria mover uma fila que
 * este módulo não possui"). A premissa estava errada: a fila EXISTE e a tela já
 * a contava na coluna "Em análise prévia". Sem o lote, corrigir uma gerência
 * inteira exigia abrir garantia por garantia na tela de cada oportunidade — a
 * reatribuição individual (`POST .../garantia:reatribuir`) **permanece**, para o
 * caso de UMA garantia.
 *
 * Ela é oferecida em **toda** linha, inclusive com a fila vazia: é o
 * superconjunto do Editar, e o backend responde sucesso com zero gravando a
 * parametrização do mesmo jeito. Um botão escondido conforme a contagem faria a
 * afordância piscar entre renders.
 *
 * ⚠️ **Não há remoção**, e é decisão: remover a linha deixa a gerência sem
 * analista — o estado que esta tabela existe para consertar. Não há rota no
 * backend, então não há controle morto na tela.
 *
 * ## O que o protótipo NÃO tem
 *
 * `15-governanca.html` desenha uma aba só, "Distribuição SNEG". A aba da CCOB é
 * divergência deliberada — mesmo precedente do ADO 67909 (que substituiu a
 * tabela única por blocos), do ADO 67974 e do ADO 68000, todos com a decisão de
 * negócio sobrepondo o protótipo. O badge `Vigente … · v.N` e o "Publicar nova
 * versão" continuam fora, pela razão registrada no card da SNEG: a tabela é viva,
 * sem versão nem vigência, e um "v.3" na tela seria número fabricado.
 */
export function DistribuicaoCcobCard({
  listGerencias = defaultList,
  editarAnalista = defaultUpsert,
  reatribuirGerencia = defaultReatribuir,
  searchAnalistas = defaultSearchAnalistas,
}: Props) {
  const { can } = usePermissions();
  const podeEscrever = can(Permission.CcobDistribuicaoGovernanca);
  const confirm = useConfirm();

  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [items, setItems] = useState<GerenciaCcob[]>([]);
  const [acao, setAcao] = useState<Acao>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const reload = useCallback(() => {
    setStatus('loading');
    listGerencias()
      .then((data) => {
        setItems(data.items);
        setStatus('loaded');
      })
      .catch(() => setStatus('error'));
  }, [listGerencias]);

  useEffect(() => {
    reload();
  }, [reload]);

  const atualizadaEm = ultimaAtualizacao(items);

  async function handleEditar(linha: GerenciaCcob, analista: DirectoryUser) {
    setBusy(true);
    try {
      await editarAnalista(linha.gerencia, analista.id);
      setAcao(null);
      setFeedback({
        tom: 'ok',
        texto:
          `Gerência "${linha.gerencia}": a análise prévia passa a ser de ` +
          `${analista.name}. Vale para as garantias que entrarem em análise ` +
          `prévia a partir de agora; as que já estão em curso continuam com o ` +
          `responsável atual — para movê-las, use a reatribuição na tela da ` +
          `garantia.`,
      });
      reload();
    } catch (cause) {
      setFeedback({ tom: 'erro', texto: mensagemDe(cause) });
    } finally {
      setBusy(false);
    }
  }

  async function handleReatribuir(
    linha: GerenciaCcob,
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
       * ⚠️ A frase começa pelo efeito que SEMPRE existe — a parametrização.
       *
       * Lição do ADO 67909 na SNEG: abrindo por `reatribuidas`, uma gerência com
       * fila vazia produzia "0 garantia(s) … passaram", que lê como "nada
       * aconteceu" enquanto a parametrização de fato mudou.
       */
      setFeedback({
        tom: 'ok',
        texto:
          `A gerência "${linha.gerencia}" agora está com ${analista.name} na ` +
          `análise prévia. ` +
          (resultado.reatribuidas > 0
            ? `${contarGarantias(resultado.reatribuidas)} ${
                resultado.reatribuidas === 1 ? 'passou' : 'passaram'
              } para o novo responsável`
            : 'Nenhuma garantia em análise prévia precisou mudar') +
          (resultado.inalteradas > 0
            ? `; ${contarGarantias(resultado.inalteradas)} já ${
                resultado.inalteradas === 1 ? 'estava' : 'estavam'
              } com o analista`
            : '') +
          '.' +
          /*
           * ⚠️ Só com garantia de fato reatribuída. Com zero, nenhuma linha por
           * oportunidade é escrita (a trilha do ato de governança é a do LOTE),
           * e afirmar "registrada no log de cada oportunidade" mandaria o
           * suporte procurar uma entrada que não existe.
           */
          (resultado.reatribuidas > 0
            ? ' A troca foi registrada no log de cada oportunidade.'
            : ''),
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
      aria-label="Distribuição e roteamento da análise prévia da garantia (CCOB)"
      data-testid="governanca-distribuicao-ccob"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px] shadow-[var(--shadow-card)]"
    >
      {confirm.dialog}

      <header className="mb-3.5 flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-(--color-border) bg-(--neutral-40) px-[9px] py-[3px] text-(length:--t-small) font-bold text-(--color-text-muted)">
            Dono: CCOB
          </span>
          {atualizadaEm && (
            <span className="inline-flex items-center rounded-full border border-(--secondary-200) bg-(--secondary-100) px-[9px] py-[3px] text-(length:--t-small) font-bold text-(--secondary-700)">
              Atualizada em {atualizadaEm}
            </span>
          )}
        </div>
        <h2 className="text-(length:--t-h4) font-bold">
          Distribuição e roteamento da análise prévia da garantia
        </h2>
        <p className="text-(length:--t-caption) text-(--color-text-muted)">
          Quando a garantia de uma oportunidade fica completa e entra em análise
          prévia, ela é atribuída automaticamente ao analista da CCOB desta
          tabela, que recebe a pendência para executar a análise.
        </p>
      </header>

      {feedback && (
        <p
          role="status"
          data-testid="distribuicao-ccob-feedback"
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
            Não foi possível carregar a distribuição CCOB.
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

      {status === 'loaded' && items.length === 0 && (
        <p
          data-testid="distribuicao-ccob-vazio"
          className="py-4 text-(length:--t-caption) text-(--color-text-muted)"
        >
          Nenhuma gerência conhecida ainda — as garantias que entrarem em análise
          prévia ficarão com atribuição pendente até esta tabela ser preenchida.
        </p>
      )}

      {status === 'loaded' && items.length > 0 && (
        <div className="overflow-x-auto">
          <table
            data-testid="distribuicao-ccob-tabela"
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
                <th className="whitespace-nowrap border-b border-(--color-border) px-2.5 py-2 text-left text-(length:--t-small) font-bold uppercase tracking-[.3px] text-(--color-text-muted)">
                  Em análise prévia
                </th>
                <th className="border-b border-(--color-border) px-2.5 py-2">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((linha, i) => {
                const ultima = i === items.length - 1;
                const cell = `px-2.5 py-[9px] align-top ${
                  ultima ? '' : 'border-b border-(--color-border)'
                }`;
                return (
                  <tr key={linha.gerencia}>
                    <td className={cell}>{linha.gerencia}</td>
                    <td className={cell}>
                      {linha.analistaNome ?? linha.analistaId ?? (
                        /*
                         * Gerência sem analista é resposta de negócio, não campo
                         * vazio: dizê-lo é o que explica por que as garantias
                         * dela nascem com atribuição pendente.
                         */
                        <span className="text-(--color-text-muted)">
                          Aguardando distribuição
                        </span>
                      )}
                    </td>
                    <td className={cell}>
                      {linha.garantiasEmAnalisePrevia > 0 ? (
                        linha.garantiasEmAnalisePrevia
                      ) : (
                        <span className="text-(--color-text-muted)">—</span>
                      )}
                    </td>
                    <td className={`${cell} whitespace-nowrap text-right`}>
                      {podeEscrever && (
                        <>
                          <button
                            type="button"
                            data-testid={`editar-ccob-${linha.gerencia}`}
                            onClick={() => {
                              setFeedback(null);
                              setAcao({ tipo: 'editar', linha });
                            }}
                            className="font-bold text-(--secondary-600) hover:underline"
                          >
                            Editar
                          </button>
                          <span className="px-1.5 text-(--color-text-muted)">·</span>
                          {/*
                           * Oferecido em TODA linha, inclusive com fila vazia: é
                           * o superconjunto do Editar, e o backend grava a
                           * parametrização do mesmo jeito. Esconder conforme a
                           * contagem faria a afordância piscar entre renders.
                           */}
                          <button
                            type="button"
                            data-testid={`reatribuir-ccob-${linha.gerencia}`}
                            onClick={() => {
                              setFeedback(null);
                              setAcao({ tipo: 'reatribuir', linha });
                            }}
                            className="font-bold text-(--secondary-600) hover:underline"
                          >
                            Reatribuir
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {acao?.tipo === 'editar' && (
        <AnalistaPickerModal
          title="Editar responsável · Análise prévia da garantia"
          subtitle={`${acao.linha.gerencia} · perfil CCOB`}
          initialSelectedId={acao.linha.analistaId}
          search={searchAnalistas}
          onClose={() => setAcao(null)}
          footer={(selected) => (
            <>
              <p className="mb-3 text-(length:--t-caption) text-(--color-text-muted)">
                Vale <strong>a partir de agora</strong>: as garantias que
                entrarem em análise prévia nesta gerência passam a ser
                atribuídas ao analista escolhido, que recebe a pendência. As que
                já estão em curso continuam com o responsável atual — para
                movê-las, use <strong>Reatribuir</strong>.
              </p>
              <div className="flex justify-end gap-2">
                <BotaoSecundario onClick={() => setAcao(null)} disabled={busy}>
                  Cancelar
                </BotaoSecundario>
                <BotaoPrimario
                  testId="confirmar-editar-ccob"
                  disabled={busy || !selected}
                  onClick={() => {
                    if (selected) void handleEditar(acao.linha, selected);
                  }}
                >
                  {busy ? 'Salvando…' : 'Salvar'}
                </BotaoPrimario>
              </div>
            </>
          )}
        />
      )}

      {acao?.tipo === 'reatribuir' && (
        <ReatribuirCcobModal
          linha={acao.linha}
          busy={busy}
          searchAnalistas={searchAnalistas}
          onClose={() => setAcao(null)}
          onConfirm={(analista, motivo) => {
            const linha = acao.linha;
            /*
             * O seletor FECHA antes da confirmação, em vez de empilhar. Os dois
             * usam `z-[200]`, e o seletor é montado depois no DOM — empilhado,
             * ele pintaria POR CIMA do diálogo e o Escape fecharia os dois. A
             * confirmação nomeia gerência, analista e total, então nada do
             * contexto se perde. (Precedente documentado no card da SNEG.)
             */
            setAcao(null);
            confirm.ask({
              title: 'Reatribuir a análise prévia desta gerência?',
              description:
                `${contarEmPrevia(linha)} da gerência "${linha.gerencia}" ` +
                `${
                  concordaSingular(linha.garantiasEmAnalisePrevia)
                    ? 'passará'
                    : 'passarão'
                } a ter ${analista.name} como analista responsável, e ` +
                `${analista.name} passa a ser o analista desta gerência na ` +
                'atribuição automática das próximas análises prévias. ' +
                'Garantias cuja análise prévia já foi concluída não são ' +
                'alteradas. A troca é registrada no log de cada oportunidade.',
              confirmLabel: 'Reatribuir',
              onConfirm: () => handleReatribuir(linha, analista, motivo),
            });
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Modal de reatribuição
// ---------------------------------------------------------------------------

function ReatribuirCcobModal({
  linha,
  busy,
  searchAnalistas,
  onClose,
  onConfirm,
}: {
  linha: GerenciaCcob;
  busy: boolean;
  searchAnalistas: (q: string) => Promise<DirectoryUser[]>;
  onClose: () => void;
  onConfirm: (analista: DirectoryUser, motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');

  return (
    <AnalistaPickerModal
      title="Reatribuir a análise prévia da gerência"
      subtitle={`${linha.gerencia} · perfil CCOB`}
      search={searchAnalistas}
      onClose={onClose}
      footer={(selected) => (
        <>
          {/*
           * O aviso vem ANTES da confirmação, e não no lugar dela: quem escolhe
           * o analista precisa saber o alcance enquanto escolhe, e o diálogo
           * repete o número no momento de executar. A contagem sai do MESMO
           * payload que a escrita lê, então texto e efeito não divergem.
           */}
          <p
            data-testid="reatribuir-ccob-aviso"
            className="mb-3 rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2 text-(length:--t-caption) text-(--yellow-700)"
          >
            {contarEmPrevia(linha)} desta gerência{' '}
            {concordaSingular(linha.garantiasEmAnalisePrevia)
              ? 'será alterada'
              : 'serão alteradas'}
            , e a atribuição automática das próximas passa a apontar para o
            analista escolhido.
          </p>

          <label htmlFor="reatribuir-ccob-motivo" className={IN_LABEL}>
            Motivo (opcional)
          </label>
          <input
            id="reatribuir-ccob-motivo"
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
              testId="confirmar-reatribuir-ccob"
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
 * "N garantias em análise prévia" em pt-BR, com o singular certo.
 *
 * O número vem do backend, na mesma leitura que monta a lista — derivá-lo de
 * outra chamada faria a confirmação prometer um total diferente do que a escrita
 * altera.
 */
function contarEmPrevia(linha: GerenciaCcob): string {
  const n = linha.garantiasEmAnalisePrevia;
  if (!n) return 'Nenhuma garantia em análise prévia';
  return `${n} garantia${n === 1 ? '' : 's'} em análise prévia`;
}

/**
 * O verbo concorda no SINGULAR também com ZERO.
 *
 * ⚠️ Medido no browser em 08/09/2026: com a fila vazia, `=== 1` produzia
 * *"**Nenhuma garantia** em análise prévia desta gerência **serão
 * alteradas**"* — o sujeito de {@link contarEmPrevia} é singular ("Nenhuma
 * garantia"), então zero e um pedem a mesma conjugação. O card da SNEG tinha o
 * mesmo defeito latente, pela mesma razão.
 */
function concordaSingular(n: number | null): boolean {
  return (n ?? 0) <= 1;
}

/**
 * "N garantia / N garantias" — o plural certo.
 *
 * A frase fala de GARANTIAS, não de um pronome do analista: o gênero de quem
 * assume não é conhecido pela tela (nem deveria decidir a frase) — foi o defeito
 * que a UAT viu na SNEG ao reatribuir para uma analista.
 */
function contarGarantias(n: number): string {
  return n === 1 ? '1 garantia' : `${n} garantias`;
}

/** A data mais recente da tabela — o badge do cabeçalho. */
function ultimaAtualizacao(items: readonly GerenciaCcob[]): string | null {
  const datas = items
    .map((linha) => linha.atualizadaEm)
    .filter((v): v is string => v !== null)
    .sort();
  const ultima = datas[datas.length - 1];
  if (!ultima) return null;
  const d = new Date(ultima);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/**
 * A frase do backend, quando houver — é ela que nomeia o conserto (o 400
 * "analista fora do grupo do Entra do perfil CCOB"). Só o erro sem mensagem cai
 * no genérico.
 */
function mensagemDe(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : 'Falha ao salvar a distribuição CCOB.';
}
