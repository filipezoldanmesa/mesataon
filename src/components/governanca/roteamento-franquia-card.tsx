'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AnalistaPickerModal } from '@/components/governanca/analista-picker-modal';
import {
  BotaoPrimario,
  BotaoSecundario,
} from '@/components/governanca/modal-buttons';
import { Select } from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  listRoteamentoFranquia as defaultList,
  upsertRoteamentoFranquia as defaultUpsert,
} from '@/lib/governanca/roteamento-franquia.data';
import type {
  BandeiraFranquia,
  RoteamentoFranquiaGerencia,
} from '@/lib/governanca/roteamento-franquia.types';
import { searchTeamCandidates } from '@/lib/opportunities/directory.data';
import type { DirectoryUser } from '@/lib/opportunities/directory.types';

type Props = {
  listRoteamento?: () => Promise<{
    items: RoteamentoFranquiaGerencia[];
    total: number;
  }>;
  editarExecutivo?: (
    bandeira: BandeiraFranquia,
    gerencia: string,
    executivoId: string,
  ) => Promise<unknown>;
  searchExecutivos?: (
    bandeira: BandeiraFranquia,
    query: string,
  ) => Promise<DirectoryUser[]>;
};

type Feedback = { tom: 'ok' | 'erro'; texto: string } | null;

/**
 * O balde do diretório de cada bandeira.
 *
 * ⚠️ É o MESMO recorte que o backend usa para validar a escrita
 * (`BANDEIRA_FUNCAO_MEMBRO`): lista e gate saem da mesma fonte, senão a tela
 * oferece quem a API recusa — o defeito que custou dois rounds no analista SNEG
 * (ADO 67877) e no LT principal (ADO 67910).
 */
const BALDE_POR_BANDEIRA: Record<BandeiraFranquia, 'exec_br_mania' | 'exec_lubrax'> = {
  ZBRM: 'exec_br_mania',
  ZLUB: 'exec_lubrax',
};

/**
 * Governança → Distribuição Franquias (pedido do negócio, 19/09/2026;
 * renomeada em 20/09/2026).
 *
 * > *"Devemos criar em governança a mesma tabela de roteamento para BR Mania e
 * > para Lubrax+. Caso esteja atribuído um analista BR Mania ou um analista
 * > Lubrax para aquela gerência, ao criar a proposta devemos automaticamente
 * > adicionar o executivo de franquia lubrax+ ou o executivo de franquia br
 * > mania na equipe da oportunidade."*
 *
 * ## Uma linha por PAR, não por gerência
 *
 * A mesma gerência pode ter um executivo BR Mania e outro Lubrax+, então a
 * chave da linha é `(bandeira, gerência)` — colapsar as duas numa linha com duas
 * colunas de pessoa esconderia qual delas está vazia quando a tabela crescer.
 *
 * ## Um verbo: Editar
 *
 * **Não há remoção**, e é decisão: remover devolve o par ao estado que esta
 * tabela existe para consertar, e não há rota no backend — logo não há controle
 * morto na tela. E não há "Reatribuir": ao contrário da fila da CCOB, aqui não
 * existe nada em curso para mover — o roteamento é lido no instante em que a
 * proposta nasce, e proposta já criada tem a equipe dela pela inclusão manual.
 *
 * ## O nome (20/09/2026)
 *
 * > *"Renomear Roteamento Franquias para Distribuição Franquias e adicionar um
 * > filtro por bandeira."*
 *
 * A aba e o card deixaram de dizer "roteamento" — as três tabelas de "quem
 * responde por esta gerência" passam a se chamar Distribuição, como as irmãs
 * SNEG e CCOB. ⚠️ **Só o vocabulário de tela mudou**: rota
 * (`/v1/roteamento-franquia/...`), permissão (`RoteamentoFranquiaGovernanca`),
 * `id` da aba, `data-testid` e os códigos da trilha SOX
 * (`franquia.roteamento.*`) continuam iguais — trilha é história e rota é
 * contrato, e renomeá-los para acompanhar um rótulo quebraria o de/para de quem
 * audita. ⚠️ E o **"Tabela de Roteamento J10"** (Parametrização de Franquia,
 * chave `tipo de posto × região × UF`) é OUTRA tabela e **não** foi renomeada:
 * o pedido nomeia a aba de Governança, e as duas conviverem com o mesmo nome é
 * o que o negócio está desfazendo.
 *
 * ## O filtro por bandeira
 *
 * ⚠️ As opções são **derivadas do payload** (`bandeira` + `bandeiraLabel`), não
 * de uma lista local: a tela já não mantém uma segunda fonte de rótulo (é o
 * backend que compõe "BR Mania"/"Lubrax+"), e um `['ZBRM','ZLUB']` escrito aqui
 * divergiria na primeira bandeira nova — oferecendo filtro para o que a tabela
 * não tem, ou escondendo o que ela passou a ter.
 *
 * O filtro é de EXIBIÇÃO, não de leitura: a lista inteira já veio numa
 * requisição (gerências × 2 bandeiras), então recarregar por bandeira trocaria
 * um `filter` por um round-trip e um piscar de "Carregando…". E ele **não muda
 * a coluna "Propostas"**, que continua sendo o volume daquele par.
 *
 * ## O que o protótipo NÃO tem
 *
 * `15-governanca.html` desenha uma aba só, "Distribuição SNEG". Esta é
 * divergência deliberada, mesmo precedente da aba da CCOB (04/09/2026) e do
 * ADO 67909. O badge `Vigente … · v.N` e o "Publicar nova versão" continuam
 * fora: a tabela é viva, sem versão nem vigência, e um "v.3" na tela seria
 * número fabricado.
 */
export function RoteamentoFranquiaCard({
  listRoteamento = defaultList,
  editarExecutivo = defaultUpsert,
  searchExecutivos = (bandeira, query) =>
    searchTeamCandidates(BALDE_POR_BANDEIRA[bandeira], query),
}: Props) {
  const { can } = usePermissions();
  const podeEscrever = can(Permission.RoteamentoFranquiaGovernanca);

  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [items, setItems] = useState<RoteamentoFranquiaGerencia[]>([]);
  const [emEdicao, setEmEdicao] = useState<RoteamentoFranquiaGerencia | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  /** `''` = todas as bandeiras. */
  const [bandeiraFiltro, setBandeiraFiltro] = useState<BandeiraFranquia | ''>('');

  const reload = useCallback(() => {
    setStatus('loading');
    listRoteamento()
      .then((data) => {
        setItems(data.items);
        setStatus('loaded');
        /*
         * ⚠️ Filtro que sobrevive a um recarregamento sem ter mais linha
         * nenhuma esconderia a tabela inteira sem dizer por quê — o gatilho
         * seria a bandeira sair do payload (ou a lista vir vazia), e o usuário
         * veria "nada aqui" com o seletor mostrando um valor que não existe
         * mais. Some a bandeira, some o filtro.
         */
        setBandeiraFiltro((atual) =>
          atual && data.items.some((linha) => linha.bandeira === atual)
            ? atual
            : '',
        );
      })
      .catch(() => setStatus('error'));
  }, [listRoteamento]);

  useEffect(() => {
    reload();
  }, [reload]);

  /*
   * As bandeiras que a tabela de fato tem, com o rótulo que o BACKEND mandou.
   * Derivar preserva a ordem do payload e mantém uma fonte só de vocabulário.
   */
  const bandeiras = useMemo(() => {
    const vistas = new Map<BandeiraFranquia, string>();
    for (const linha of items) {
      if (!vistas.has(linha.bandeira)) vistas.set(linha.bandeira, linha.bandeiraLabel);
    }
    return [...vistas].map(([value, label]) => ({ value, label }));
  }, [items]);

  const visiveis = useMemo(
    () =>
      bandeiraFiltro
        ? items.filter((linha) => linha.bandeira === bandeiraFiltro)
        : items,
    [items, bandeiraFiltro],
  );

  const bandeiraFiltradaLabel =
    bandeiras.find((b) => b.value === bandeiraFiltro)?.label ?? '';

  async function handleEditar(
    linha: RoteamentoFranquiaGerencia,
    executivo: DirectoryUser,
  ) {
    setBusy(true);
    try {
      await editarExecutivo(linha.bandeira, linha.gerencia, executivo.id);
      setEmEdicao(null);
      setFeedback({
        tom: 'ok',
        texto:
          `Gerência "${linha.gerencia}" · ${linha.bandeiraLabel}: ${executivo.name} ` +
          `passa a entrar na equipe das oportunidades quando uma proposta desta ` +
          `bandeira for criada. Vale para as propostas criadas a partir de agora; ` +
          `as oportunidades que já existem continuam com a equipe atual.`,
      });
      reload();
    } catch (cause) {
      setFeedback({ tom: 'erro', texto: mensagemDe(cause) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Distribuição de executivo de franquia por bandeira e gerência"
      data-testid="governanca-roteamento-franquia"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px] shadow-[var(--shadow-card)]"
    >
      <header className="mb-3.5 flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-(--color-border) bg-(--neutral-40) px-[9px] py-[3px] text-(length:--t-small) font-bold text-(--color-text-muted)">
            Dono: Gestão de Franquias
          </span>
        </div>
        <h2 className="text-(length:--t-h4) font-bold">
          Distribuição de executivo de franquia
        </h2>
        <p className="text-(length:--t-caption) text-(--color-text-muted)">
          Quando uma proposta BR Mania ou Lubrax+ é criada, o executivo desta
          tabela entra automaticamente na equipe da oportunidade. Par sem
          executivo não inclui ninguém — e nada é bloqueado por isso.
        </p>

        {/*
          O filtro só existe quando há tabela: com a lista vazia ele seria
          controle morto sobre nada, e a frase do estado vazio é o que responde
          ali. Quem NÃO pode editar continua vendo o filtro — ler quem responde
          por cada gerência é justamente o que o gate não tira.
        */}
        {status === 'loaded' && bandeiras.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="filtro-bandeira-franquia">
              Filtrar por bandeira
            </label>
            <Select
              id="filtro-bandeira-franquia"
              data-testid="roteamento-franquia-filtro-bandeira"
              value={bandeiraFiltro}
              onChange={(valor) => setBandeiraFiltro(valor as BandeiraFranquia | '')}
              options={bandeiras}
              placeholder="Todas as bandeiras"
              clearable
              variant="boxed"
              className="w-auto min-w-[190px]"
            />
            {bandeiraFiltro && (
              /*
               * A contagem existe porque a tabela ENCOLHE: sem ela, filtrar
               * parece perda de dado. Diz o recorte e o universo, na mesma
               * frase.
               */
              <span
                data-testid="roteamento-franquia-contagem"
                className="text-(length:--t-caption) text-(--color-text-muted)"
              >
                {/* O substantivo concorda com o UNIVERSO, que é o total. */}
                {`${visiveis.length} de ${items.length} ` +
                  `${items.length === 1 ? 'par' : 'pares'} · ${bandeiraFiltradaLabel}`}
              </span>
            )}
          </div>
        )}
      </header>

      {feedback && (
        <p
          role="status"
          data-testid="roteamento-franquia-feedback"
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
          Carregando a distribuição…
        </p>
      )}

      {status === 'error' && (
        <div className="py-4">
          <p className="text-(length:--t-caption) text-(--color-danger)">
            Não foi possível carregar a distribuição de franquias.
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
          data-testid="roteamento-franquia-vazio"
          className="py-4 text-(length:--t-caption) text-(--color-text-muted)"
        >
          Nenhuma gerência conhecida ainda — as propostas de franquia continuarão
          sendo criadas sem executivo na equipe até esta tabela ser preenchida.
        </p>
      )}

      {/*
        ⚠️ NÃO existe estado de "filtro sem resultado", e é consequência de as
        opções serem derivadas do payload: toda bandeira oferecida tem pelo
        menos uma linha, e a que deixar de ter some do seletor junto com o
        filtro (ver `reload`). Renderizar aquela frase seria controle morto —
        texto que nenhum caminho da tela alcança.
      */}
      {status === 'loaded' && visiveis.length > 0 && (
        <div className="overflow-x-auto">
          <table
            data-testid="roteamento-franquia-tabela"
            className="w-full border-collapse text-(length:--t-caption)"
          >
            <thead>
              <tr>
                {['Gerência', 'Bandeira', 'Executivo de franquia', 'Propostas'].map(
                  (titulo) => (
                    <th
                      key={titulo}
                      className="whitespace-nowrap border-b border-(--color-border) px-2.5 py-2 text-left text-(length:--t-small) font-bold tracking-[.3px] text-(--color-text-muted) uppercase"
                    >
                      {titulo}
                    </th>
                  ),
                )}
                <th className="border-b border-(--color-border) px-2.5 py-2">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((linha, i) => {
                const ultima = i === visiveis.length - 1;
                const cell = `px-2.5 py-[9px] align-top ${
                  ultima ? '' : 'border-b border-(--color-border)'
                }`;
                const chave = `${linha.bandeira}-${linha.gerencia}`;
                return (
                  <tr key={chave}>
                    <td className={cell}>{linha.gerencia}</td>
                    {/* Rótulo do backend — a tela não mantém uma segunda lista. */}
                    <td className={cell}>{linha.bandeiraLabel}</td>
                    <td className={cell}>
                      {linha.executivoNome ?? linha.executivoId ?? (
                        /*
                         * Par sem executivo é resposta de negócio, não campo
                         * vazio: é o que explica por que as propostas daquela
                         * bandeira nascem sem ele na equipe.
                         */
                        <span className="text-(--color-text-muted)">
                          Sem executivo definido
                        </span>
                      )}
                    </td>
                    <td className={cell}>
                      {linha.propostasDaBandeira > 0 ? (
                        linha.propostasDaBandeira
                      ) : (
                        <span className="text-(--color-text-muted)">—</span>
                      )}
                    </td>
                    <td className={`${cell} text-right whitespace-nowrap`}>
                      {podeEscrever && (
                        <button
                          type="button"
                          data-testid={`editar-roteamento-${chave}`}
                          onClick={() => {
                            setFeedback(null);
                            setEmEdicao(linha);
                          }}
                          className="font-bold text-(--secondary-600) hover:underline"
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {emEdicao && (
        <AnalistaPickerModal
          title="Editar executivo de franquia"
          subtitle={`${emEdicao.gerencia} · ${emEdicao.bandeiraLabel}`}
          // A caixa escolhe EXECUTIVO, não analista — o rótulo do campo tem de
          // dizer o mesmo que o título, senão os dois se contradizem na mesma tela.
          pessoa={{ singular: 'executivo', plural: 'executivos' }}
          initialSelectedId={emEdicao.executivoId}
          // O seletor lê o balde da BANDEIRA — o mesmo que o backend valida.
          search={(query) => searchExecutivos(emEdicao.bandeira, query)}
          onClose={() => setEmEdicao(null)}
          footer={(selected) => (
            <>
              <p className="mb-3 text-(length:--t-caption) text-(--color-text-muted)">
                Vale <strong>a partir de agora</strong>: as propostas desta
                bandeira criadas nesta gerência passam a incluir o executivo
                escolhido na equipe da oportunidade. As oportunidades que já
                existem continuam com a equipe atual.
              </p>
              <div className="flex justify-end gap-2">
                <BotaoSecundario onClick={() => setEmEdicao(null)} disabled={busy}>
                  Cancelar
                </BotaoSecundario>
                <BotaoPrimario
                  testId="confirmar-editar-roteamento"
                  disabled={busy || !selected}
                  onClick={() => {
                    if (selected) void handleEditar(emEdicao, selected);
                  }}
                >
                  {busy ? 'Salvando…' : 'Salvar'}
                </BotaoPrimario>
              </div>
            </>
          )}
        />
      )}
    </section>
  );
}

/**
 * A frase do backend, verbatim — é ela que nomeia o motivo (o 400 "esse id não é
 * executivo desta bandeira" é o texto que o usuário precisa ler).
 */
function mensagemDe(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : 'Falha ao salvar a distribuição de franquias.';
}
