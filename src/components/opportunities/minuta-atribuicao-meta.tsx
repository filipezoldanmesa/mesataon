'use client';

import { useCallback, useEffect, useState } from 'react';

import { DirectoryPickerModal } from '@/components/directory/directory-picker-modal';
import { DirectoryUserList } from '@/components/directory/directory-user-list';
import { StatusPill } from '@/components/status-pill';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  getMinutaAtribuicao as defaultGet,
  reatribuirAnalistaMinuta as defaultReatribuir,
} from '@/lib/contratos/minuta-atribuicao.data';
import type {
  MinutaAtribuicao,
  ReatribuirAnalistaMinutaPayload,
} from '@/lib/contratos/minuta-atribuicao.types';
import { MinutaAtribuicaoAusenteError } from '@/lib/contratos/minuta-atribuicao.types';
// O recorte é o grupo do Entra do perfil SNEG, pelo eixo
// `ENTRA_TEAM_DIRECTORY_DRIVER` — a MESMA população que a escrita
// (`ContractDraftAssignmentService.reatribuir`) aceita. Ler de outro eixo faria
// o modal listar gente que a API recusa (o defeito do ADO 67877).
import { searchSnegAnalysts as defaultSearchAnalistas } from '@/lib/opportunities/directory.data';
import type { DirectoryUser } from '@/lib/opportunities/directory.types';

type Props = {
  opportunityId: string;
  /** Injetáveis nos testes; o default é a chamada real à BFF. */
  load?: (id: string) => Promise<MinutaAtribuicao>;
  reatribuir?: (
    id: string,
    payload: ReatribuirAnalistaMinutaPayload,
  ) => Promise<MinutaAtribuicao>;
  searchAnalistas?: (q: string) => Promise<DirectoryUser[]>;
};

type Estado =
  | { status: 'loading' }
  /** A oportunidade não entrou na fase — a célula simplesmente não existe. */
  | { status: 'ausente' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: MinutaAtribuicao };

/** Célula da barra de metadados: rótulo em caixa alta sobre o valor em negrito. */
function MetaItem({
  label,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <div className="text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)">
        {label}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-(length:--t-caption) font-bold">
        {children}
      </div>
    </div>
  );
}

/**
 * Quem responde pela **minuta**, e a troca do responsável (18/09/2026).
 *
 * > *"Na fase de análise existe um fluxo para atribuir uma oportunidade para o
 * > analista, e também existe a opção de reatribuição … esse fluxo todo precisa
 * > tbm ser feito na parte de minuta."*
 *
 * ## Por que no CABEÇALHO, e não dentro da seção Minuta (18/09/2026)
 *
 * Nasceu como um card no topo da seção "Minuta" — a 5ª seção colapsável da
 * tela, abaixo de Dados da oportunidade, Análises e o parecer. Quem operava a
 * fase não o encontrava: *"não estou vendo o botão de reatribuir"*, com a tela
 * certa aberta e o card carregado (dois `GET .../minuta/atribuicao 200` no log).
 *
 * Na **análise** o mesmo fato vive na barra de metadados do cabeçalho
 * (`data-testid="sneg-meta"`), ao lado de "Responsável (LT)" e "Região /
 * Gerência" — visível de relance, sem rolar. Este componente é o par daquele na
 * fase de contrato: mesmas duas células, mesma gramática visual, mesmo link
 * `reatribuir` em `--t-body`.
 *
 * ⚠️ **Está no cabeçalho E em lugar nenhum mais.** A mesma resposta em dois
 * pontos da mesma tela é o defeito que o comentário da "Zona de venda" logo
 * acima registra: ela SUBIU do card para o cabeçalho, não foi copiada.
 *
 * ## O que a permissão esconde, e o que ela NÃO esconde
 *
 * ⚠️ **O CTA é gateado; o FATO não.** `ContractDraftManage` (`[SNEG, ADMIN]`) é
 * o espelho do `@Roles` da rota de reatribuição, e sem ele o link some — mas o
 * nome de quem está com a minuta continua na tela para todo perfil que abre a
 * oportunidade. É quase sempre o LT quem cobra o andamento, e esconder o
 * responsável junto com o botão é o defeito que o CLAUDE.md nomeia. No
 * cabeçalho essa propriedade fica mais forte, não mais fraca: o fato passa a
 * ser visível sem rolar a página.
 *
 * ## A FASE também fecha o CTA — e ela é veredito do backend (21/09/2026)
 *
 * > *"Só deve ser possível reatribuir um analista de minutas enquanto a
 * > oportunidade estiver na fase de minutas. Depois dessa fase, o botão não
 * > deve mais existir, mesmo que não haja nenhum analista atribuído."*
 *
 * São DUAS condições independentes, e as duas têm de valer: `podeReatribuir`
 * (a fase, do backend) e a permissão (o papel). ⚠️ **`podeReatribuir` não é
 * derivado aqui** — nem da etapa que a `ContratoView` já tem em mãos, nem de
 * `atribuicaoPendente`. A tela e o gate da rota (409) leem o MESMO predicado,
 * senão divergiriam justamente na janela entre o envio do envelope (que move
 * os contratos para `ASSINATURA` na hora) e o GATE 3.
 *
 * ⚠️ **Fechar o CTA continua não fechando o FATO:** passada a fase, o nome do
 * responsável — ou o selo "Aguardando distribuição" — permanece. É a mesma
 * regra do gate de papel logo acima, e é o que o pedido pede ao dizer que o
 * BOTÃO some, não a informação.
 *
 * ## Ausência ≠ falha
 *
 * Antes de a oportunidade entrar na fase de minuta não existe atribuição, e o
 * backend responde 404. Isso NÃO é erro: a célula não renderiza. Uma caixa
 * vermelha ali mandaria o usuário procurar um defeito inexistente — a lição do
 * ADO 68256, em que um 404 legítimo virava "Falha ao carregar (404)".
 */
export function MinutaAtribuicaoMeta({
  opportunityId,
  load = defaultGet,
  reatribuir = defaultReatribuir,
  searchAnalistas = defaultSearchAnalistas,
}: Props) {
  const { can } = usePermissions();
  // Espelha `@Roles(SNEG, BP_FINANCEIRO, ADMIN)` de `minuta/atribuicao:reatribuir` —
  // NÃO `ContractDraftManage`, que inclui o Consultor de Expansão (403 na API).
  const temPermissao = can(Permission.ContractDraftAssign);

  const [estado, setEstado] = useState<Estado>({ status: 'loading' });
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const data = await load(opportunityId);
      setEstado({ status: 'loaded', data });
    } catch (err) {
      if (err instanceof MinutaAtribuicaoAusenteError) {
        setEstado({ status: 'ausente' });
        return;
      }
      setEstado({
        status: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Falha ao carregar o responsável pela minuta.',
      });
    }
  }, [load, opportunityId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function confirmar(payload: ReatribuirAnalistaMinutaPayload) {
    setSalvando(true);
    setErroAcao(null);
    try {
      const atualizada = await reatribuir(opportunityId, payload);
      setEstado({ status: 'loaded', data: atualizada });
      setModalAberto(false);
    } catch (err) {
      /*
       * ⚠️ O modal FICA ABERTO na falha, com a frase do backend — é ela que
       * nomeia o grupo do Entra quando o id não pertence a ele (422). Fechar
       * descartaria a seleção e a frase de uma vez.
       */
      setErroAcao(
        err instanceof Error
          ? err.message
          : 'Falha ao reatribuir o analista da minuta.',
      );
    } finally {
      setSalvando(false);
    }
  }

  // Antes da fase não há o que dizer — nem célula, nem erro.
  if (estado.status === 'ausente') return null;

  if (estado.status === 'loading') {
    return (
      <div
        data-testid="minuta-atribuicao-loading"
        className="h-9 w-40 animate-pulse rounded-[var(--radius-xs)] bg-(--neutral-100)"
      />
    );
  }

  if (estado.status === 'error') {
    return (
      <MetaItem label="Analista da minuta">
        <span
          data-testid="minuta-atribuicao-erro"
          role="alert"
          className="font-normal text-(--color-danger)"
        >
          {estado.message}
        </span>
      </MetaItem>
    );
  }

  const { data } = estado;

  return (
    <>
      <MetaItem label="Analista da minuta" testId="minuta-atribuicao">
        {data.atribuicaoPendente ? (
          /*
           * Pill NEUTRA, nunca `danger`: a gerência sem analista parametrizado
           * é um estado do processo, não uma falha — e a fase NÃO é bloqueada
           * por ele. Mesmo rótulo da análise, para o mesmo estado não ter dois
           * nomes no produto.
           */
          <StatusPill variant="neutral">Aguardando distribuição</StatusPill>
        ) : (
          <span data-testid="minuta-analista">{data.analista?.nome ?? '—'}</span>
        )}

        {temPermissao && data.podeReatribuir && (
          /*
           * ⚠️ `--t-body` (16px), não `--t-caption` (14px). O link passava
           * despercebido na barra de metadados da análise, e o que lhe dá peso
           * aqui é o TAMANHO, não o `font-weight`: `--font-family` é
           * `Arial, Helvetica, sans-serif`, sem `@font-face`, então só há
           * Regular e Bold — pedir 800 sobre este 700 casaria de volta em 700
           * pelo font matching do CSS, um no-op invisível. Mesma medição, mesma
           * escolha, para os dois links ficarem idênticos.
           */
          <button
            type="button"
            data-testid="minuta-reatribuir"
            onClick={() => {
              setErroAcao(null);
              setModalAberto(true);
            }}
            className="text-(length:--t-body) font-bold text-(--secondary-600) hover:underline"
          >
            reatribuir
          </button>
        )}
      </MetaItem>

      {/*
       * Célula PRÓPRIA, como "Região / Gerência" na análise — e não uma linha
       * solta sob o nome. É ela que explica "Aguardando distribuição": a
       * parametrização é por gerência, e sem o rótulo o usuário não sabe qual
       * linha da Governança preencher.
       */}
      {data.gerencia && (
        <MetaItem label="Região / Gerência" testId="minuta-gerencia">
          {data.gerencia}
        </MetaItem>
      )}

      {modalAberto && (
        <ReatribuirMinutaModal
          loading={salvando}
          erro={erroAcao}
          searchAnalistas={searchAnalistas}
          onConfirm={confirmar}
          onCancel={() => setModalAberto(false)}
        />
      )}
    </>
  );
}

/**
 * Escolhe o novo analista numa LISTA, não numa caixa de busca — e a escrita
 * referencia o **id** do diretório, nunca um nome digitado.
 *
 * Mesma composição do modal da análise (ADO 67877): `autoLoad` porque o grupo
 * de perfil é pequeno e o pedido foi "trazer uma lista das pessoas disponíveis
 * para seleção", e vazio NOMEADO porque um grupo legitimamente vazio renderiza
 * como branco e leria como defeito da tela.
 */
function ReatribuirMinutaModal({
  onConfirm,
  onCancel,
  loading,
  erro,
  searchAnalistas,
}: {
  onConfirm: (payload: ReatribuirAnalistaMinutaPayload) => void;
  onCancel: () => void;
  loading: boolean;
  erro: string | null;
  searchAnalistas: (q: string) => Promise<DirectoryUser[]>;
}) {
  const [selected, setSelected] = useState<DirectoryUser | null>(null);
  const [motivo, setMotivo] = useState('');

  return (
    <DirectoryPickerModal
      title="Reatribuir analista da minuta"
      subtitle="Analista SNEG"
      onClose={onCancel}
      footer={
        <>
          <label
            htmlFor="reatribuir-minuta-motivo"
            className="mb-1 block text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)"
          >
            Motivo (opcional)
          </label>
          <input
            id="reatribuir-minuta-motivo"
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={loading}
            placeholder="Motivo da reatribuição"
            className="w-full rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2 text-(length:--t-caption) font-[inherit] disabled:opacity-60"
            aria-label="Motivo da reatribuição"
          />

          {erro && (
            <p
              data-testid="minuta-reatribuir-erro"
              role="alert"
              className="mt-2 text-(length:--t-caption) text-(--color-danger)"
            >
              {erro}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-(--color-surface) px-3 py-1.5 text-(length:--t-caption) font-bold hover:bg-(--neutral-40) disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() =>
                selected &&
                onConfirm({
                  analistaId: selected.id,
                  ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
                })
              }
              disabled={loading || !selected}
              className="rounded-[var(--radius-xxs)] border border-transparent bg-(--secondary-500) px-3 py-1.5 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        </>
      }
    >
      <DirectoryUserList
        search={searchAnalistas}
        onPick={setSelected}
        selectedId={selected?.id ?? null}
        autoLoad
        ctaLabel="Selecionar"
        placeholder="Nome ou e-mail do analista"
        inputAriaLabel="Buscar analista"
        emptyScopeMessage="Nenhum analista SNEG no grupo de acesso. Verifique com a TI."
        listTestId="reatribuir-minuta-results"
        emptyTestId="reatribuir-minuta-vazio"
      />
    </DirectoryPickerModal>
  );
}
