'use client';

import { useRouter } from 'next/navigation';
import { PicklistSelect } from '@/components/picklists/picklist-select';
import { RecebedorClientCombobox } from '@/components/opportunities/recebedor-client-combobox';
import { PicklistField } from '@/lib/picklists/picklists.types';
import {
  Finalidade,
  TIPO_NEGOCIACAO_LABEL,
  TipoNegociacao,
  TipoProposta,
} from '@/lib/picklists/salesforce-values';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FieldLabel } from '@/components/ui/field-label';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/spinner';
import { useAuth } from '@/hooks/use-auth';
import { useClientSearch } from '@/hooks/use-client-search';
import { getClient as defaultGetClient, searchClients as defaultSearch } from '@/lib/clients/clients.data';
import { maskClientQuery } from '@/lib/clients/format';
import type { ClientDetail, ClientSummary } from '@/lib/clients/types';
import {
  isTeamScopedRole,
  searchDirectory as defaultSearchDirectory,
  searchLtCandidates as defaultSearchLtCandidates,
  searchTeamCandidates as defaultSearchTeamCandidates,
} from '@/lib/opportunities/directory.data';
import type { DirectoryUser } from '@/lib/opportunities/directory.types';
import {
  createOpportunity as defaultCreate,
  getOpportunityPrefill as defaultPrefill,
} from '@/lib/opportunities/opportunity-creation.data';
import {
  addMember as defaultAddMember,
  changePrincipal as defaultChangePrincipal,
} from '@/lib/opportunities/team.data';
import type {
  AddTeamMemberPayload,
  TeamMember,
  TeamMemberRole,
} from '@/lib/opportunities/team.types';
import { ALL_ROLES, ROLE_LABELS } from '@/lib/opportunities/team.types';
import type {
  CreateOpportunityPayload,
  CreateOpportunityResult,
  OpportunityPrefill,
} from '@/lib/opportunities/types';
import {
  OpportunityForbiddenError,
  PrefillUnavailableError,
} from '@/lib/opportunities/types';

import { ENABLE_CREATE_PROSPECT } from '@/lib/feature-flags';

import { AddMemberModal } from './add-member-modal';
import {
  customerReference,
  customerReferenceLabel,
  sapOrProspect,
} from '@/lib/clients/customer-reference';
import { rotaDoApp } from '@/lib/navegacao-segura';
import {
  allowedSalesAreas,
  defaultSalesAreaCode,
  describeAreaVendaAllow,
  salesAreaOptionLabel,
} from '@/lib/opportunities/sales-area-scope';
import {
  ALTERACAO_MINUTA_PADRAO_FIELD_LABEL,
  DESCRICAO_ALTERACAO_MINUTA_PADRAO_FIELD_LABEL,
} from '@/lib/opportunities/alteracao-minuta-padrao';
import {
  FINALIDADE_FIELD_LABEL,
  textoFinalidade,
} from '@/lib/opportunities/finalidade-oportunidade';
import { PARECER_LT_FIELD_LABEL } from '@/lib/opportunities/textos-do-lt';

/**
 * The negotiation type a new opportunity is created with — read-only on this
 * form and fixed server-side by `OpportunitiesService.create`.
 *
 * Read from the same constant the backend writes, rather than a hardcoded
 * string, so the screen cannot claim one value while the API persists another.
 * `CONTRATACAO` is not a Salesforce picklist member; it is kept because DDI
 * eligibility depends on it (see the service).
 */
const CREATED_TIPO_NEGOCIACAO = TipoNegociacao.Contratacao;

/**
 * Recorte de tela: só estas finalidades são oferecidas no formulário de
 * criação (decisão de produto, 11/08/2026). A API continua aceitando o value
 * set inteiro. Espelha o mesmo recorte em `nova-proposta-block.tsx`.
 *
 * ⚠️ **Deixou de ser "temporário" em 09/09/2026.** O negócio pediu que, com a
 * conta `Fora da rede` ou `Em processo de entrada`, a tela exibisse
 * **apenas Implantação e Vinculação** — que é exatamente esta lista. As outras
 * duas situações (`Na rede`, `Em processo de saída`) não chegam a escolher
 * finalidade: o backend recusa a criação (`avaliarMapaDaRedeGate`), e o card
 * "Dados da oportunidade" exibe o Mapa da Rede da conta.
 *
 * Ou seja, levantar o recorte agora é decisão de PRODUTO com uma condição
 * junto: se um dia outras finalidades voltarem a ser oferecidas, elas têm de
 * ficar fora quando a conta está fora do mapa. Não basta apagar a constante.
 */
const FINALIDADE_ALLOW = [Finalidade.Implantacao, Finalidade.Vinculacao] as const;

/**
 * Default de "Haverá alteração de minuta padrão?" na CRIAÇÃO (ADO 68438).
 *
 * Pedido do negócio em 16/09/2026. É deliberadamente uma constante nomeada, e
 * não um `'nao'` solto espalhado pelos três resets: o dia em que o negócio
 * mudar de ideia, muda aqui.
 */
const ALTERACAO_MINUTA_PADRAO_DEFAULT: RespostaSimNao = 'nao';

/**
 * Resposta tri-estado dos selects Sim/Não desta tela (nova imagem de pista —
 * ADO 68001 — e alteração de minuta padrão — ADO 68438). `''` é "não
 * respondido" — distinto de `'nao'`, porque os campos correspondentes do
 * Salesforce são picklists RESTRITAS e `nillable`: em branco o campo é
 * OMITIDO do payload, nunca enviado como `false`.
 */
type RespostaSimNao = '' | 'sim' | 'nao';

/** Converte a sugestão do prefill (tri-state booleano) para o valor do select. */
function imagemPistaDoPrefill(valor: boolean | null | undefined): RespostaSimNao {
  if (valor === null || valor === undefined) return '';
  return valor ? 'sim' : 'nao';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The four UI states of the creation form (RN-F2 — 4 estados):
 * empty / loading-prefill / filled / error.
 */
type FormState = 'empty' | 'loading-prefill' | 'filled' | 'error';
type SubmitState = 'idle' | 'submitting' | 'error';

const DEBOUNCE_MS = 300;

/**
 * Shared field style — the Vibra DS form control (`.in` in the prototype):
 * neutral-40 background, bottom border only, square corners, green focus.
 * Used across every input/select/textarea so the screen matches 01a exactly.
 */
/**
 * Bottom-border input style — prototype `.in` (01a-nova-oportunidade.html).
 * Disabled tokens use --disabled-bg (#f4f5f5) and --disabled-text (#767676)
 * from globals.css — no raw hexes in executable code (ADR-0018).
 */
const FIELD =
  'w-full rounded-none border-0 border-b-2 border-(--neutral-600) bg-(--neutral-40) px-3 py-[11px] text-(length:--t-caption) text-(--neutral-800) outline-none transition-colors placeholder:text-(--neutral-500) focus:border-(--secondary-500) disabled:cursor-not-allowed disabled:border-(--neutral-200) disabled:bg-(--disabled-bg) disabled:text-(--disabled-text)';

const LABEL =
  'mb-1 block text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)';


type Props = {
  /**
   * SAP code of a client to pre-select on mount (e.g. arriving from a client's
   * 360º "+ Nova oportunidade"). Resolves the client and fires prefill exactly
   * as picking it from the search box would.
   */
  initialClientId?: string;
  /** Injectable for tests; defaults to the configured data sources. */
  search?: (query: string) => Promise<ClientSummary[]>;
  /** 360º lookup — enriches the client card with bandeira + localização. */
  getClient?: (id: string) => Promise<ClientDetail>;
  prefill?: (customerId: string) => Promise<OpportunityPrefill>;
  create?: (payload: CreateOpportunityPayload) => Promise<CreateOpportunityResult>;
  /**
   * Busca na população geral (os 13 grupos de perfil).
   *
   * ⚠️ Não atende mais o card do LT — ver {@link Props.searchLtCandidates}. Fica
   * como reserva do `searchForBucket` para um balde que venha a NÃO ser escopado
   * por grupo; hoje todos são (ADR-0043, emenda de 21/08/2026).
   */
  searchDirectory?: (query: string) => Promise<DirectoryUser[]>;
  /**
   * Busca no grupo do Entra do perfil "Líder de Território" — a mesma que a tela
   * de detalhe usa para trocar o LT principal. Injetável para testes.
   */
  searchLtCandidates?: (query: string) => Promise<DirectoryUser[]>;
  /**
   * Busca no grupo do Entra de um balde de executivo (ADR-0043). Injetável
   * para testes.
   */
  searchTeamCandidates?: (
    funcao: TeamMemberRole,
    query: string,
  ) => Promise<DirectoryUser[]>;
  addMember?: (
    opportunityId: string,
    payload: AddTeamMemberPayload,
  ) => Promise<TeamMember>;
  changePrincipal?: (opportunityId: string, memberId: string) => Promise<TeamMember>;
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Two-letter initials from a full name (avatar fallback). */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size >= 32 ? 12 : 11 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-(--secondary-300) font-bold text-(--secondary-800)"
    >
      {initials(name)}
    </span>
  );
}

/** Section card (prototype `.block`). */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]">
      <h3 className="mb-3.5 flex items-center gap-2.5 text-(length:--t-h4) font-bold">
        {title}
      </h3>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Person card (prototype `.lt-card`) — "Criado por" and the LT proprietário.
// ---------------------------------------------------------------------------

function PersonCard({
  name,
  detail,
  badge,
  action,
}: {
  name: string;
  detail: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-xs)] border border-(--secondary-200) bg-(--secondary-100) px-3.5 py-3">
      <Avatar name={name} size={36} />
      <div className="min-w-0 flex-1">
        <div className="font-bold">{name}</div>
        <div className="text-[12px] text-(--color-text-muted)">{detail}</div>
      </div>
      {badge}
      {action}
    </div>
  );
}

/**
 * LT do cliente (proprietário). O prefill do CRM não expõe o líder de
 * território, então nasce com o criador logado e é trocável.
 *
 * ## O seletor é o MESMO modal da equipe, recortado ao grupo do perfil de LT
 *
 * Era um combobox inline que buscava a população geral
 * (`GET /v1/directory/users`), enquanto o card da tela de detalhe já usava o
 * `AddMemberModal` sobre o grupo do Entra. Duas superfícies para a mesma
 * escolha, com populações diferentes — e a divergência não era só visual:
 *
 * `persistStagedTeam` grava a escolha com `PUT /:id/team/principal`, e desde
 * 27/08/2026 aquele endpoint **recusa com 422 quem não está no grupo**
 * `VBR_GOP_LIDTERR_DEV`. Como a chamada é best-effort (`.catch(() => {})`, para
 * um time parcial nunca bloquear a navegação), escolher alguém da população
 * geral deixaria o LT **silenciosamente não definido**: a tela mostrou o nome,
 * navegou, e a oportunidade ficou com o criador como principal sem uma palavra.
 *
 * Com o mesmo recorte nas duas telas, lista e gate voltam ao mesmo predicado.
 *
 * Seleção local: o endpoint de criação não tem campo de equipe, então a posse é
 * persistida depois (ver `persistStagedTeam`).
 */
function LtCard({
  value,
  onChange,
  search,
}: {
  value: DirectoryUser | null;
  onChange: (user: DirectoryUser) => void;
  search: (query: string) => Promise<DirectoryUser[]>;
}) {
  const [picking, setPicking] = useState(false);

  /*
   * Os rótulos do modal são todos sobrescritos: o default fala de balde
   * ("Adicionar à equipe · Demais membros"), que descreveria o lugar errado.
   * `role="outros"` só alimenta esse default e não recorta nada — quem recorta é
   * o `search`. E `autoLoad` lista o grupo ao abrir: é população pequena e
   * governada por IAM, então listá-la inteira é a resposta útil.
   */
  const modal = picking ? (
    <AddMemberModal
      role="outros"
      title="Trocar LT do cliente"
      subtitle="Líder de Território"
      ctaLabel="Definir como LT"
      autoLoad
      excludedUserIds={value ? [value.id] : []}
      search={search}
      onAdd={(user) => {
        onChange(user);
        setPicking(false);
      }}
      onClose={() => setPicking(false)}
    />
  ) : null;

  if (!value) {
    return (
      <>
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-25) px-3.5 py-3 text-(length:--t-small) text-(--color-text-muted)">
          <span>Nenhum LT definido.</span>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="shrink-0 cursor-pointer font-bold text-(--secondary-600) hover:underline"
          >
            Definir
          </button>
        </div>
        {modal}
      </>
    );
  }

  return (
    <>
      <PersonCard
        name={value.name}
        detail={value.detail || 'LT do cliente'}
        action={
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="shrink-0 cursor-pointer whitespace-nowrap text-[12px] font-bold text-(--secondary-600) hover:underline"
          >
            Trocar
          </button>
        }
      />
      {modal}
    </>
  );
}

/**
 * Centro de lucro combobox — CA-2 (VBR-463).
 *
 * Replaces the old read-only text input. Options are derived from the account
 * prefill (Salesforce `Zona_de_vendas_da_conta__c`). The backend re-derives the
 * profit center on create, so the selection is informational; the backend does
 * NOT accept a user-overridden value. No free typing: on blur without a
 * selection, the input reverts to the last valid value.
 *
 * "Verificação" result (issue VBR-463): the data already comes from the
 * account's prefill as a single string — no separate search endpoint is needed.
 * Should multiple profit centers be introduced in the future, `options` can be
 * expanded without touching this component's contract.
 */
function ProfitCenterCombobox({
  options,
  value,
  onChange,
  disabled,
}: {
  /** Available options derived from the account prefill (usually 0–1 items). */
  options: string[];
  /** The currently selected profit center code, e.g. "SP108". */
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  // Sync the display whenever the value changes externally (e.g. prefill load
  // or client reset).
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(query.toLowerCase()),
  );

  function pick(opt: string) {
    onChange(opt);
    setQuery(opt);
    setOpen(false);
  }

  function handleBlur() {
    // Revert to the last valid selection after the click target has had time
    // to fire its mousedown handler (160 ms — same window as LtCard).
    setTimeout(() => {
      setQuery(value);
      setOpen(false);
    }, 160);
  }

  return (
    <div className="relative">
      <input
        id="nova-opp-centro"
        type="text"
        role="combobox"
        aria-expanded={open && filtered.length > 0}
        aria-controls="profit-center-results"
        aria-label="Zona de vendas (centro de lucro)"
        autoComplete="off"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onBlur={handleBlur}
        placeholder="Grupo de contas + setor + canal"
        className={FIELD}
      />
      {open && filtered.length > 0 && (
        <div
          id="profit-center-results"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 overflow-hidden rounded-[var(--radius-xs)] border border-(--color-border-strong) bg-white shadow-[var(--shadow-card)]"
        >
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={opt === value}
              onMouseDown={() => pick(opt)}
              className="block w-full cursor-pointer border-b border-(--color-border) px-3 py-2.5 text-left last:border-b-0 hover:bg-(--secondary-100)"
            >
              <span className="text-(length:--t-caption) font-bold">{opt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Opportunity creation screen (F2 — 01a-nova-oportunidade.html).
 *
 * Two-column layout matching the prototype: form blocks on the left
 * (Cliente / Dados / Finalidade / Responsáveis / Equipe) and a
 * sticky "Resumo da oportunidade" panel with the submit action on the right.
 *
 * Real integration:
 *  - client search + prefill + create hit the backend via the BFF (no mocks);
 *  - "Criado por" is the signed-in user (`GET /v1/auth/me`);
 *  - a busca da Equipe lê o grupo do Entra de cada balde
 *    (`GET /v1/directory/team-candidates`) e a do LT o grupo do perfil de LT
 *    (`GET /v1/directory/profile-candidates?perfil=LIDER_TERRITORIO`) — as duas
 *    pelo mesmo driver, `ENTRA_TEAM_DIRECTORY_DRIVER`.
 *
 * Equipe and LT selections are local staging (the create endpoint has no team
 * field and the opportunity id does not exist yet) — team ownership is managed
 * on the detail screen (01b) after creation.
 *
 * Covers the four UI states: empty / loading-prefill / filled / error.
 */
export function NovaOportunidade({
  initialClientId,
  search = defaultSearch,
  getClient = defaultGetClient,
  prefill = defaultPrefill,
  create = defaultCreate,
  searchDirectory = defaultSearchDirectory,
  searchLtCandidates = defaultSearchLtCandidates,
  searchTeamCandidates = defaultSearchTeamCandidates,
  addMember = defaultAddMember,
  changePrincipal = defaultChangePrincipal,
}: Props) {
  const router = useRouter();
  const { user } = useAuth();

  // ── Client search (autocomplete) ──────────────────────────────────────────
  const [clientQuery, setClientQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(null);
  /** True when the user picked "Criar prospect (sem CNPJ)" from the dropdown. */
  const [isProspect, setIsProspect] = useState(false);
  // Bandeira/localização come from the 360º view, not the autocomplete
  // projection (which omits them) — fetched on selection to enrich the card.
  const [clientExtra, setClientExtra] = useState<{
    flag: string;
    location: string;
    document: string;
  } | null>(null);

  const { status: searchStatus, results, error: searchError, runSearch, reset } =
    useClientSearch(search);

  // Set when a client is picked: writing the name back into the input would
  // otherwise re-trigger the search effect and re-open the dropdown.
  const suppressSearchRef = useRef(false);

  useEffect(() => {
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }
    const term = clientQuery.trim();
    if (term === '') {
      reset();
      setDropdownOpen(false);
      return;
    }
    setDropdownOpen(true);
    const timer = setTimeout(() => void runSearch(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [clientQuery, runSearch, reset]);

  // ── Prefill + form state ──────────────────────────────────────────────────
  const [formState, setFormState] = useState<FormState>('empty');
  const [prefillData, setPrefillData] = useState<OpportunityPrefill | null>(null);
  const [prefillError, setPrefillError] = useState('');

  // Editable fields
  const [title, setTitle] = useState('');
  const [clientRecebedorId, setClientRecebedorId] = useState('');
  /** What the recebedor combobox shows for the committed value above. */
  const [recebedorDisplay, setRecebedorDisplay] = useState('');
  // Sales-area CHOICE (code) — '' = no choice. Only offered when the account
  // has more than one approved area; the backend validates existence again.
  const [areaVendaCode, setAreaVendaCode] = useState('');
  /**
   * The account's approved areas the MVP serves. Measured in the org on
   * 25/08/2026 over 300 DCVIM accounts: 111 have exactly one Combustíveis
   * Claros area, 189 have none, and NONE has more than one — so the selector
   * branch below is the rare path, not the common one.
   */
  const allowedAreas = useMemo(
    () =>
      allowedSalesAreas(prefillData?.salesAreas),
    [prefillData],
  );
  /**
   * The sales-area code that travels in the create.
   *
   * With exactly one allowed area there is nothing to choose, so the field is
   * read-only text — and until 25/08/2026 the code was displayed and then
   * DISCARDED, leaving `opportunities.sales_area_code` null.
   *
   * That is not cosmetic: `vkorg`/`vtweg`/`spart` are parsed out of this code
   * and ARE the SAP pricing keys, so without it `ProposalPriceSimulationService`
   * refuses to dispatch — silently and by design, since guessing a key makes SAP
   * price a different scenario and still answer 202. Measured in stage on
   * 25/08/2026: 37 opportunities, 0 with a chosen area, and
   * `price_simulation_requests` EMPTY — the integration had never run once.
   *
   * Sending it is not a fabricated choice: with a single option there is nothing
   * to fabricate (the same reason `formatosLojaParaBandeira` lets a single
   * format be born selected).
   *
   * ⚠️ **Desde 16/09/2026 a regra do default mora em `defaultSalesAreaCode`** —
   * pedido do negócio: com MAIS de uma área de Combustíveis Claros (o caso
   * medido em campo é `Vendas Indiretas` + `Vendas Diretas`), a de **Vendas
   * Indiretas** nasce escolhida. A escolha continua saindo da lista de áreas
   * aprovadas da própria conta; sem ela, nada é enviado e a regra do picklist
   * segue de pé.
   */
  const effectiveAreaVendaCode =
    areaVendaCode || defaultSalesAreaCode(prefillData?.salesAreas);
  const [briefing, setBriefing] = useState('');
  const [description, setDescription] = useState('');
  // "Parecer do LT" (ADO 68473) — texto livre do LT sobre a negociação.
  const [parecerLt, setParecerLt] = useState('');
  const [finalidade, setFinalidade] = useState('');
  /*
   * Nova imagem de pista (ADO 68001) — o TERCEIRO gate do `/simulate`
   * (ADR-0037). O Salesforce recusa a simulação da alçada com "Possui" em
   * branco, e recusa de novo com "Possui = Não" e "Será colocada" em branco;
   * até esta entrega os dois campos só existiam no modal de edição, então a
   * oportunidade nascia com o par incompleto e o LT descobria semanas depois.
   *
   * Tri-estado `'' | 'sim' | 'nao'` — o MESMO vocabulário do modal
   * (`opportunity-detail.tsx`), para as duas telas não divergirem na
   * serialização: `''` é "não respondido" e nunca vira `false`.
   */
  const [possuiNovaImagemPista, setPossuiNovaImagemPista] =
    useState<RespostaSimNao>('');
  const [seraColocadaNovaImagemPista, setSeraColocadaNovaImagemPista] =
    useState<RespostaSimNao>('');
  /*
   * "Haverá alteração de minuta padrão?" (ADO 68438) — o destino é
   * `Alteracao_Minuta_Padrao__c`, que o org tem na Cotação E na Oportunidade
   * (e copia de uma para a outra). A plataforma SEMPRE enviou o campo,
   * derivando-o de `proposals.standard_draft` — booleano `NOT NULL DEFAULT
   * true` sem controle de escrita montado em tela nenhuma —, e o resultado
   * medido em 15/09/2026 foram 41 de 41 oportunidades nossas afirmando "Não"
   * no org sem que ninguém tivesse respondido.
   *
   * Até aqui a pergunta só existia no modal de edição: quem nunca o reabria
   * nascia (e sincronizava) sem resposta. Mesmo tri-estado do modal, para as
   * duas telas não divergirem na serialização.
   *
   * ⚠️ Nasce em `'nao'` — o default pedido pelo negócio em 16/09/2026, e a
   * ÚNICA exceção nesta tela à regra "valor de picklist nunca nasce
   * escolhido". A diferença para o defeito que o ADO 68438 conserta é que lá
   * o "Não" era invisível (derivado de uma coluna `NOT NULL DEFAULT true` sem
   * controle em tela nenhuma) e aqui ele está na tela, obrigatório, ao lado do
   * texto que explica o que a resposta faz. O tri-estado é preservado: quem
   * voltar para "Selecione…" trava o submit em vez de enviar `false`.
   */
  const [alteracaoMinutaPadrao, setAlteracaoMinutaPadrao] =
    useState<RespostaSimNao>(ALTERACAO_MINUTA_PADRAO_DEFAULT);
  /**
   * Descrição da alteração da minuta padrão — só existe com a resposta
   * "Sim", e é exigida com ela. O texto NÃO é apagado ao alternar para "Não":
   * quem trocou por engano recupera o que escreveu; quem não trocou de volta
   * tem o campo descartado no envio (e no backend), porque a descrição da alteração só
   * viaja com o "Sim".
   */
  const [descricaoAlteracaoMinutaPadrao, setDescricaoAlteracaoMinutaPadrao] =
    useState('');
  // CA-2 (VBR-463): profit center displayed in the combobox. Initialised from
  // prefill (CRM-derived); the backend re-derives it on create (the BFF drops
  // the value) — this state drives the UI only.
  const [profitCenterValue, setProfitCenterValue] = useState('');

  // ── Team / LT staging (local; real directory search) ──────────────────────
  const [ltUser, setLtUser] = useState<DirectoryUser | null>(null);
  const [team, setTeam] = useState<Record<TeamMemberRole, DirectoryUser[]>>({
    exec_expansao: [],
    exec_br_mania: [],
    exec_lubrax: [],
    outros: [],
  });
  const [addingRole, setAddingRole] = useState<TeamMemberRole | null>(null);

  /*
   * Which population the modal searches is decided by the bucket being filled:
   * every bucket reads the Entra groups that back it (ADR-0043 — since
   * 2026-08-21 that includes "Demais membros", which is now the Visualizador +
   * Gerente Varejo slice instead of the whole population). O card do LT NÃO passa
   * por aqui: ele não é um balde, e tem busca própria
   * ({@link Props.searchLtCandidates}) recortada ao grupo do perfil de LT.
   *
   * MUST be memoized on `addingRole`: `useDirectorySearch` takes `search` as a
   * `useCallback` dependency, so a fresh function on every render would
   * re-create `runSearch` and re-fire the debounced effect on every keystroke.
   */
  const searchForBucket = useCallback(
    (q: string) =>
      addingRole && isTeamScopedRole(addingRole)
        ? searchTeamCandidates(addingRole, q)
        : searchDirectory(q),
    [addingRole, searchTeamCandidates, searchDirectory],
  );

  // ── Submit state ──────────────────────────────────────────────────────────
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState('');
  const [isForbidden, setIsForbidden] = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────────--
  const prefillSeqRef = useRef<number>(0);

  const handleSelectClient = useCallback(
    async (client: ClientSummary) => {
      setSelectedClient(client);
      suppressSearchRef.current = true;
      setClientQuery(client.name);
      setDropdownOpen(false);
      reset();

      // Reset editable fields for the new selection.
      setTitle('');
      setClientRecebedorId('');
      setRecebedorDisplay('');
      setBriefing('');
      setDescription('');
      setParecerLt('');
      setFinalidade('');
      setProfitCenterValue('');
      setSubmitState('idle');
      setSubmitError('');
      setIsForbidden(false);
      setLtUser(null); // useEffect at line 546 will re-default to the signed-in user
      setTeam({ exec_expansao: [], exec_br_mania: [], exec_lubrax: [], outros: [] });

      const mySeq = (prefillSeqRef.current += 1);
      setFormState('loading-prefill');
      setPrefillError('');
      setClientExtra(null);

      // Enrich the client card with bandeira + localização from the 360º view
      // (parallel, best-effort — the autocomplete projection lacks them and a
      // prospect 360º may 404; the card falls back to the autocomplete fields).
      void getClient(client.id)
        .then((detail) => {
          if (mySeq !== prefillSeqRef.current) return;
          setClientExtra({
            flag: detail.flag,
            location: detail.location,
            document: detail.document,
          });
        })
        .catch(() => {
          /* keep autocomplete values */
        });

      try {
        const data = await prefill(client.id);
        if (mySeq !== prefillSeqRef.current) return;

        setPrefillData(data);
        setTitle(data.suggestedTitle);
        setClientRecebedorId(data.clientRecebedorId ?? '');
        // Default receiver is the client itself — show its NAME (a raw SAP
        // code on screen is a machine value), same format as a manual pick.
        // A prospect's default receiver reference is its CRM id (ADR-0055) —
        // never labelled "SAP": the label comes from the picked client.
        setRecebedorDisplay(
          data.clientRecebedorId
            ? customerReferenceLabel({ name: data.clientName, sapCode: client.sapCode })
            : '',
        );
        // Sales-area choice: never born selected (picklist rule) — the LT
        // decides. With a single approved area there is nothing to choose and
        // the backend already sends it, so the field stays read-only.
        setAreaVendaCode('');
        // CA-2 (VBR-463 / VBR-497): pre-select the CRM-derived profit center in
        // the combobox. The backend re-derives this on create; the value here
        // only drives the display. When the CRM returns no profit center for
        // this account, show a named sentinel so the blank is never
        // indistinguishable from "field not yet loaded" (CA-2 fixo).
        setProfitCenterValue(data.profitCenter ?? 'Não informado no CRM');
        /*
         * "Possui nova imagem de pista" nasce com a SUGESTÃO do cadastro do
         * cliente — a mesma derivação que o backend aplicaria em silêncio se o
         * campo ficasse em branco, e o que o texto de ajuda promete. Não é um
         * default fabricado: conta que não informa (84% delas) devolve `null` e
         * o campo fica em "Selecione…".
         *
         * "Será colocada" NÃO tem sugestão nenhuma — é decisão do negócio, sem
         * campo de onde derivar (a hipótese do recurso de Imagem Pista foi
         * medida contra o org e falhou). Sempre em branco.
         */
        setPossuiNovaImagemPista(imagemPistaDoPrefill(data.possuiNovaImagemPista));
        setSeraColocadaNovaImagemPista('');
        setFormState('filled');
      } catch (err) {
        if (mySeq !== prefillSeqRef.current) return;

        setPrefillError(
          err instanceof PrefillUnavailableError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Erro ao carregar dados do cliente.',
        );
        setFormState('error');
      }
    },
    [prefill, getClient, reset],
  );

  // Pre-select the client when arriving from a 360º "+ Nova oportunidade"
  // (?clientId=<sap>). Runs once: resolve the client via the 360º lookup, then
  // drive the same selection path as the search box. Best-effort — a failed
  // lookup silently leaves the form empty so the user can search manually.
  const preselectDoneRef = useRef(false);
  useEffect(() => {
    if (!initialClientId || preselectDoneRef.current) return;
    preselectDoneRef.current = true;
    void getClient(initialClientId)
      .then((detail) => handleSelectClient(detail))
      .catch(() => {
        /* no preselect on lookup failure — manual search still works */
      });
  }, [initialClientId, getClient, handleSelectClient]);

  function clearSelection() {
    setSelectedClient(null);
    setClientExtra(null);
    setIsProspect(false);
    setPrefillData(null);
    setAreaVendaCode('');
    // A sugestão é do cliente que saiu — mantê-la afirmaria sobre a pista de
    // um posto que não é mais o selecionado.
    setPossuiNovaImagemPista('');
    setSeraColocadaNovaImagemPista('');
    setAlteracaoMinutaPadrao(ALTERACAO_MINUTA_PADRAO_DEFAULT);
    setFormState('empty');
    setPrefillError('');
    setLtUser(null); // useEffect will re-default to the signed-in user
    setTeam({ exec_expansao: [], exec_br_mania: [], exec_lubrax: [], outros: [] });
  }

  /**
   * Handles selection of the "Criar prospect (sem CNPJ)" option from the
   * client dropdown. Only reachable when ENABLE_CREATE_PROSPECT is true.
   * Does NOT trigger a prefill fetch — the prospect has no CNPJ/SAP code yet.
   */
  function handleSelectProspect() {
    clearSelection();
    // Prospect-specific overrides on top of the shared reset.
    setIsProspect(true);
    suppressSearchRef.current = true;
    setClientQuery('Prospect (sem CNPJ)');
    setDropdownOpen(false);
    reset();

    // Reset editable fields.
    setTitle('');
    setClientRecebedorId('');
    setRecebedorDisplay('');
    setBriefing('');
    setDescription('');
    setParecerLt('');
    setFinalidade('');
    setPossuiNovaImagemPista('');
    setSeraColocadaNovaImagemPista('');
    setAlteracaoMinutaPadrao(ALTERACAO_MINUTA_PADRAO_DEFAULT);
    setProfitCenterValue('');
    setSubmitState('idle');
    setSubmitError('');
    setIsForbidden(false);
    // Prospect flow does not load prefill — stay in 'empty' form state so
    // the submit button remains disabled until the backend integration lands.
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Also guarded here (not only via the disabled button): the form submits
    // on Enter, which bypasses the button entirely.
    if (
      !selectedClient ||
      formState !== 'filled' ||
      finalidade === '' ||
      // ADO 67913 — guardado aqui também: o form submete no Enter, que passa
      // por cima do botão desabilitado.
      effectiveAreaVendaCode === '' ||
      // ADO 68438 — idem: obrigatória na criação.
      alteracaoMinutaPadrao === '' ||
      // A descrição da alteração é obrigatória junto com o "Sim" — o backend recusa
      // com 400, e o Enter passa por cima do botão desabilitado.
      (alteracaoMinutaPadrao === 'sim' &&
        descricaoAlteracaoMinutaPadrao.trim() === '')
    )
      return;

    setSubmitState('submitting');
    setSubmitError('');
    setIsForbidden(false);

    // Only fields the backend accepts are sent; salesZone/profitCenter are
    // CRM-derived server-side (the BFF drops them) but kept for continuity.
    const payload: CreateOpportunityPayload = {
      customerId: selectedClient.id,
      title: title.trim(),
      finalidade: finalidade || undefined,
      briefing: briefing.trim() || undefined,
      description: description.trim() || undefined,
      parecerLt: parecerLt.trim() || undefined,
      clientRecebedorId: clientRecebedorId.trim() || undefined,
      areaVendaCode: effectiveAreaVendaCode,
      /*
       * `''` ⇒ `undefined` (omitido), nunca `false`: em branco é "não
       * respondido", e o backend então deriva do cadastro da conta. Mandar
       * `false` afirmaria que o posto NÃO tem nova imagem.
       */
      possuiNovaImagemPista:
        possuiNovaImagemPista === '' ? undefined : possuiNovaImagemPista === 'sim',
      /*
       * Só viaja com "Possui = Não" — mesma guarda do modal de edição. É a
       * única combinação que o picklist dependente do Salesforce habilita;
       * enviar fora dela gravaria um valor que a tela do org nem oferece.
       */
      seraColocadaNovaImagemPista:
        possuiNovaImagemPista === 'nao' && seraColocadaNovaImagemPista !== ''
          ? seraColocadaNovaImagemPista === 'sim'
          : undefined,
      /*
       * ADO 68438 — o `''` NÃO chega aqui: o guard no topo deste handler já
       * devolveu, e é ele quem mantém a invariante "branco nunca vira
       * `false`" (mandar `false` afirmaria "Não" no org sobre a minuta do
       * contrato, que é o defeito que este campo corrige). Um ternário para o
       * `''` aqui seria ramo morto — o TypeScript acusa, porque o guard já
       * estreitou o tipo para `'sim' | 'nao'`.
       */
      alteracaoMinutaPadrao: alteracaoMinutaPadrao === 'sim',
      /*
       * Só viaja com o "Sim". Com "Não" o texto é OMITIDO — não porque seja
       * inofensivo mandá-lo (o backend o descartaria), mas porque o payload
       * não deve carregar a descrição da alteração de uma alteração que a própria
       * resposta acabou de negar.
       */
      descricaoAlteracaoMinutaPadrao:
        alteracaoMinutaPadrao === 'sim'
          ? descricaoAlteracaoMinutaPadrao.trim()
          : undefined,
      salesZone: prefillData?.salesZone,
      profitCenter: prefillData?.profitCenter,
    };

    try {
      const result = await create(payload);
      // Persist the staged Equipe/LT now that the opportunity id exists
      // (the create endpoint has no team field). Best-effort — team is also
      // editable on the detail screen, so a failure here must not block.
      await persistStagedTeam(result.id);
      router.push(rotaDoApp('oportunidades', result.id));
    } catch (err) {
      if (err instanceof OpportunityForbiddenError) {
        setIsForbidden(true);
        setSubmitError(err.message);
      } else {
        setSubmitError(
          err instanceof Error ? err.message : 'Erro ao criar a oportunidade.',
        );
      }
      setSubmitState('error');
    }
  }

  function addTeamMember(role: TeamMemberRole, dirUser: DirectoryUser) {
    setTeam((prev) => {
      if (prev[role].some((u) => u.id === dirUser.id)) return prev;
      return { ...prev, [role]: [...prev[role], dirUser] };
    });
    setAddingRole(null);
  }

  function removeTeamMember(role: TeamMemberRole, userId: string) {
    setTeam((prev) => ({
      ...prev,
      [role]: prev[role].filter((u) => u.id !== userId),
    }));
  }

  /**
   * Option A — persist the staged Equipe/LT via the team sub-resource after
   * the opportunity is created (the create endpoint has no team field). Each
   * bucket member is added with its franchise `funcao` preserved
   * (`POST /:id/team`), and the LT is set via `PUT /:id/team/principal` (the
   * backend adds them from the directory as principal). Best-effort:
   * individual failures are swallowed so a partial team never blocks
   * navigation (the detail screen manages the team too).
   */
  async function persistStagedTeam(opportunityId: string): Promise<void> {
    const principalId = ltUser?.id;
    const seen = new Set<string>();

    const bucketWrites: Promise<unknown>[] = [];
    for (const role of ALL_ROLES) {
      for (const member of team[role]) {
        if (member.id === principalId || seen.has(member.id)) continue;
        seen.add(member.id);
        // The BFF persists `role` as the backend member `funcao` (bucket kept).
        bucketWrites.push(addMember(opportunityId, { userId: member.id, role }));
      }
    }
    await Promise.allSettled(bucketWrites);

    if (ltUser) {
      // Promote by directory userId — the backend creates the member as
      // principal when they aren't on the team yet.
      await changePrincipal(opportunityId, ltUser.id).catch(() => {
        // LT can be set on the detail screen — do not block navigation.
      });
    }
  }

  // Default the LT proprietário to the signed-in creator once resolved.
  useEffect(() => {
    if (user && !ltUser) {
      setLtUser({
        id: user.id,
        name: user.name,
        email: user.email,
        detail: user.roles.join(' · ') || 'LT do cliente',
      });
    }
  }, [user, ltUser]);

  // Every field the form marks as required gates the submit — finalidade was
  // visually required but not enforced, so empty submissions went through.
  /*
   * ADO 67913 — a área de venda passou a ser OBRIGATÓRIA: é ela que define o
   * setor dos produtos elegíveis da proposta e carrega as chaves de
   * precificação do SAP. Sem ela a oportunidade nascia sem seletor de produto
   * e sem simulação, as duas falhando em silêncio muito depois desta tela.
   *
   * ⚠️ Conta sem nenhuma área de Combustíveis Claros fica sem criação
   * possível, e isso é a consequência correta: sem a área não há produto de
   * combustível claro para cotar. Medido no org em 28/08/2026 — 40.356 das
   * 55.725 contas DCVIM (72,4%) têm a área, e entre as que já têm cotação PCR
   * de verdade são 96,8%. O campo NOMEIA a ausência (CA-2 / VBR-518) em vez de
   * deixar o botão desabilitado sem explicação.
   */
  const canSubmit =
    formState === 'filled' &&
    title.trim() !== '' &&
    finalidade !== '' &&
    effectiveAreaVendaCode !== '' &&
    // ADO 68438 — OBRIGATÓRIA na criação (decisão do negócio, 16/09/2026).
    // `''` é "não respondido": sem a resposta a oportunidade nasceria (e
    // sincronizaria) com o campo vazio no org, que é o estado que este campo
    // existe para tornar visível.
    alteracaoMinutaPadrao !== '' &&
    // A descrição da alteração nasce junto com a resposta "Sim": sem ela o alerta da
    // fase de minuta diria que algo muda sem dizer o quê.
    (alteracaoMinutaPadrao !== 'sim' ||
      descricaoAlteracaoMinutaPadrao.trim() !== '') &&
    submitState !== 'submitting';

  const clientName = prefillData?.clientName ?? selectedClient?.name ?? '—';
  const creatorName = user?.name ?? '—';

  // ── Render ──────────────────────────────────────────────────────────────--
  return (
    <div>
      {submitState === 'submitting' && (
        <Spinner variant="overlay" backdrop size="lg" label="Criando oportunidade…" />
      )}

      {/* Page heading */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="my-1 text-(length:--t-h2) font-bold tracking-[-0.6px]">
            Nova oportunidade
          </h1>
          <p className="text-(length:--t-caption) text-(--color-text-muted)">
            Cliente, dados e equipe — em uma etapa
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="mt-[18px] grid grid-cols-[1fr_330px] items-start gap-6 max-[920px]:grid-cols-1">
          {/* ============================ LEFT ============================ */}
          <div className="min-w-0">
            {/* 1 · Cliente */}
            <Block title="1 · Cliente">
              <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
                <div className="relative">
                  <FieldLabel htmlFor="nova-opp-cliente">Buscar cliente</FieldLabel>
                  <input
                    id="nova-opp-cliente"
                    type="text"
                    role="combobox"
                    aria-expanded={dropdownOpen}
                    aria-controls="nova-opp-resultados"
                    aria-label="Buscar cliente"
                    autoComplete="off"
                    value={clientQuery}
                    onChange={(e) => {
                      setClientQuery(maskClientQuery(e.target.value));
                      if (selectedClient || isProspect) clearSelection();
                    }}
                    placeholder="Buscar por nome, CNPJ ou Código SAP..."
                    className={FIELD}
                  />

                  {dropdownOpen && (
                    <div
                      id="nova-opp-resultados"
                      role="listbox"
                      className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-[var(--radius-xs)] border border-(--color-border-strong) bg-white shadow-[var(--shadow-card)]"
                    >
                      {searchStatus === 'loading' && (
                        <div
                          role="status"
                          aria-live="polite"
                          className="px-3 py-2.5 text-(length:--t-small) text-(--color-text-muted)"
                        >
                          Buscando…
                        </div>
                      )}

                      {searchStatus === 'error' && (
                        <div className="px-3 py-2.5 text-(length:--t-small)">
                          <span className="text-(--color-danger)">{searchError}</span>
                        </div>
                      )}

                      {searchStatus === 'loaded' && results.length === 0 && (
                        <div className="px-3 py-2.5 text-(length:--t-small) text-(--color-text-muted)">
                          Nenhum cliente cadastrado com esse termo.
                        </div>
                      )}

                      {searchStatus === 'loaded' &&
                        results.map((client) => (
                          <button
                            key={client.id}
                            type="button"
                            role="option"
                            aria-selected={false}
                            onClick={() => void handleSelectClient(client)}
                            className="block w-full cursor-pointer border-b border-(--color-border) px-3 py-2.5 text-left last:border-b-0 hover:bg-(--secondary-100)"
                          >
                            <div className="text-(length:--t-caption) font-bold text-(--neutral-900)">
                              {client.name}
                            </div>
                            <div className="text-[12px] text-(--color-text-muted)">
                              {sapOrProspect(client.sapCode)} · {client.document} · {client.location}
                            </div>
                          </button>
                        ))}

                      {/* "Criar prospect" option — only rendered when the flag is on */}
                      {ENABLE_CREATE_PROSPECT && searchStatus === 'loaded' && (
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={handleSelectProspect}
                          className="block w-full cursor-pointer border-t border-(--color-border) px-3 py-2.5 text-left hover:bg-(--secondary-100)"
                        >
                          <div className="text-(length:--t-caption) font-bold text-(--secondary-700)">
                            + Criar prospect (sem CNPJ)
                          </div>
                          <div className="text-[12px] text-(--color-text-muted)">
                            Inicia pré-cadastro e sinaliza pendências
                          </div>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <FieldLabel htmlFor="nova-opp-tipo">Tipo de negociação</FieldLabel>
                  <input
                    id="nova-opp-tipo"
                    type="text"
                    value={TIPO_NEGOCIACAO_LABEL[CREATED_TIPO_NEGOCIACAO]}
                    disabled
                    aria-disabled="true"
                    className={FIELD}
                  />
                </div>
              </div>

              {/* Selected client card */}
              {selectedClient && (
                <div className="mt-3 flex items-start gap-3 rounded-[var(--radius-xs)] border border-(--secondary-200) bg-(--secondary-100) px-3.5 py-3">
                  <Avatar name={selectedClient.name} size={36} />
                  <div className="min-w-0">
                    <div className="font-bold">{selectedClient.name}</div>
                    <div className="text-(length:--t-small) text-(--secondary-800)">
                      {[
                        `SAP ${selectedClient.sapCode}`,
                        clientExtra?.document || selectedClient.document,
                        clientExtra?.flag || selectedClient.flag,
                        clientExtra?.location || selectedClient.location,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                </div>
              )}

              {/* Prospect warning — only rendered when the flag is on and the
                  user chose "Criar prospect (sem CNPJ)" from the dropdown */}
              {ENABLE_CREATE_PROSPECT && isProspect && (
                <div
                  role="alert"
                  className="mt-3 rounded-[var(--radius-xs)] border border-amber-300 bg-amber-50 px-3.5 py-3 text-(length:--t-caption) text-amber-900"
                >
                  ⚠ Prospect sem CNPJ — será preciso informar o{' '}
                  <strong>CPF dos sócios</strong> adiante.
                </div>
              )}
            </Block>

            {/* 2 · Dados da oportunidade */}
            <Block title="2 · Dados da oportunidade">
              <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
                <div>
                  <FieldLabel htmlFor="nova-opp-titulo" required>
                    Título da oportunidade (auto)
                  </FieldLabel>
                  <input
                    id="nova-opp-titulo"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={formState !== 'filled'}
                    aria-disabled={formState !== 'filled'}
                    placeholder="Sugerido automaticamente — pode editar"
                    required
                    className={FIELD}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="nova-opp-area" required>Área de venda</FieldLabel>
                  {/*
                    More than one approved area is the NORM (97,5% of accounts,
                    measured 07/08/2026) and picking one is a business decision
                    — so the field is a selector. It is BORN SELECTED on the
                    default channel (see effectiveAreaVendaCode), and the code
                    is always SENT: displaying it and dropping it left the SAP
                    price simulation permanently un-dispatched.

                    ⚠️ **Uma área permitida também é SELETOR, não texto travado
                    (16/09/2026).** Até aqui o ramo `length === 1` rendia um
                    `<input disabled>` com o nome da área (CA-1 do VBR-518), e o
                    negócio leu isso como defeito: *"você deixou o campo
                    desabilitado, era pra apenas começar selecionado por padrão,
                    não ficar desabilitado"*. O default resolve o que aquele ramo
                    existia para resolver — o campo já abre preenchido — sem
                    tirar do LT a interação. Com UMA opção o seletor tem uma
                    opção só: não se inventa área que o CRM não aprovou (é a
                    classe do default `CIF`), mas ele abre, mostra o que há e
                    responde ao clique.

                    Zero áreas permitidas continua sendo TEXTO: não há o que
                    escolher, e a frase nomeia a ausência em vez de listar as
                    áreas que o MVP não atende (CA-2 · VBR-518). Um seletor
                    vazio e clicável prometeria uma escolha que não existe.
                  */}
                  {allowedAreas.length > 0 ? (
                    <Select
                      id="nova-opp-area"
                      data-testid="nova-opp-area-select"
                      /*
                       * O VALOR EFETIVO, não o estado cru (16/09/2026): é ele
                       * que carrega o default do canal padrão, e é o mesmo que
                       * viaja no create. Ligado ao estado cru, a tela abriria em
                       * "Selecione…" enquanto o payload já levava a área — o
                       * campo dizendo uma coisa e o envio outra. A escolha do
                       * usuário vence (`areaVendaCode ||`).
                       */
                      value={effectiveAreaVendaCode}
                      onChange={setAreaVendaCode}
                      disabled={formState !== 'filled'}
                      placeholder="Selecione a área desta oportunidade…"
                      options={allowedAreas.map((area) => ({
                        value: area.code,
                        label: salesAreaOptionLabel(area),
                      }))}
                    />
                  ) : (
                    // CA-2 (VBR-518): zero allowed areas — name the absence instead of
                    // listing every area that the MVP does not serve.
                    <input
                      id="nova-opp-area"
                      type="text"
                      value={`Nenhuma área de ${describeAreaVendaAllow()} nesta conta`}
                      disabled
                      aria-disabled="true"
                      placeholder="—"
                      className={FIELD}
                    />
                  )}
                </div>
                <div>
                  <FieldLabel htmlFor="nova-opp-centro">
                    Zona de vendas (centro de lucro)
                  </FieldLabel>
                  {/*
                    CA-2 (VBR-463): combobox backed by the CRM-derived value
                    from the prefill. Options are restricted to what the
                    account's profile provides (single value today); free typing
                    is not allowed — the user must select from the dropdown.
                    The backend re-derives it on create (the BFF drops it), so
                    this is an informational field.

                    ⚠️ The label says "Zona de vendas" because that is what the
                    field holds. Measured in the org on 16/08/2026:
                    `Account.Zona_de_vendas_da_conta__c` is a FORMULA over
                    `Centro_de_Lucro_Principal__r.Vendedor__r.Zona_De_Vendas__c`
                    — the sales zone of the seller (the LT) attached to the
                    account's profit centre, e.g. "RN06". The profit-centre CODE
                    is a different string ("DAC0TNA006") and is resolved only on
                    the ARP path (`profit-center-code.resolver.ts`). Calling
                    this "Centro de lucro" promised the second and delivered the
                    first.

                    It DOES follow the LT — but the Salesforce one. Changing the
                    LT in this screen (which lists Entra directory users) must
                    not touch it: the CRM owns the value, and there is no
                    mapping between a `DirectoryUser` and a Salesforce `User`.
                    See architecture/Salesforce-Evidencias-Centro-De-Lucro-2026-08-16.md.
                  */}
                  <ProfitCenterCombobox
                    options={prefillData?.profitCenter ? [prefillData.profitCenter] : []}
                    value={profitCenterValue}
                    onChange={setProfitCenterValue}
                    disabled={formState !== 'filled'}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="nova-opp-recebedor">Cliente recebedor</FieldLabel>
                  {/*
                    Deviation from the prototype's free-text SAP input (product
                    request, 11/08/2026): the receiver is picked with the same
                    client search as "Buscar cliente" — a typo-able raw SAP code
                    would reach the CRM sync unvalidated.
                  */}
                  <RecebedorClientCombobox
                    display={recebedorDisplay}
                    disabled={formState !== 'filled'}
                    search={search}
                    onSelect={(client) => {
                      // The REFERENCE, never `sapCode` alone: a prospect has
                      // none, and `""` fell back to the customer in silence.
                      setClientRecebedorId(customerReference(client));
                      setRecebedorDisplay(customerReferenceLabel(client));
                    }}
                    onClear={() => {
                      setClientRecebedorId('');
                      setRecebedorDisplay('');
                    }}
                  />
                </div>
              </div>

              <div className="mt-3">
                {/*
                  "(opcional)" deviates from the prototype (which omits it) so
                  the label matches the field's real contract — the DTO is
                  `@IsOptional()`, same as Descrição below.
                */}
                <FieldLabel htmlFor="nova-opp-briefing">
                  Briefing do revendedor (opcional)
                </FieldLabel>
                <textarea
                  id="nova-opp-briefing"
                  rows={2}
                  value={briefing}
                  onChange={(e) => setBriefing(e.target.value)}
                  disabled={formState !== 'filled'}
                  aria-disabled={formState !== 'filled'}
                  placeholder="Contexto do revendedor: histórico, perfil e relacionamento..."
                  className={`${FIELD} resize-y font-[inherit]`}
                />
              </div>

              <div className="mt-3">
                <FieldLabel htmlFor="nova-opp-descricao">Descrição (opcional)</FieldLabel>
                <textarea
                  id="nova-opp-descricao"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={formState !== 'filled'}
                  aria-disabled={formState !== 'filled'}
                  placeholder="Observações da oportunidade..."
                  className={`${FIELD} resize-y font-[inherit]`}
                />
              </div>

              {/*
                * "Parecer do LT" (ADO 68473) — o espaço que o LT pediu para
                * registrar o próprio texto sobre a negociação. Opcional, e com
                * campo PRÓPRIO: `Descrição` são observações da oportunidade e
                * `Briefing` descreve o revendedor, então pendurar a leitura do
                * LT em qualquer um dos dois apagaria a fronteira entre os três
                * no primeiro reload. E não é o parecer TÉCNICO do analista
                * SNEG — ver `lib/opportunities/textos-do-lt.ts`.
                */}
              <div className="mt-3">
                <FieldLabel htmlFor="nova-opp-parecer-lt">
                  {PARECER_LT_FIELD_LABEL} (opcional)
                </FieldLabel>
                <textarea
                  id="nova-opp-parecer-lt"
                  rows={2}
                  value={parecerLt}
                  onChange={(e) => setParecerLt(e.target.value)}
                  disabled={formState !== 'filled'}
                  aria-disabled={formState !== 'filled'}
                  placeholder="Texto livre sobre esta negociação..."
                  className={`${FIELD} resize-y font-[inherit]`}
                />
              </div>

              {/*
                * "Haverá alteração de minuta padrão?" (ADO 68438).
                *
                * O rótulo e a leitura vêm de
                * `lib/opportunities/alteracao-minuta-padrao.ts` — o mesmo ponto
                * único que o modal de edição e o card de dados usam, para as
                * superfícies não divergirem no vocabulário do campo.
                *
                * OBRIGATÓRIO na criação, e nascendo em "Não" (as duas
                * decisões são do negócio, 16/09/2026) —
                * diferente dos campos de imagem de pista, que o gate da alçada
                * cobra depois. Aqui não há gate a jusante: sem a resposta a
                * oportunidade nasce e sincroniza com o campo vazio no org, que
                * é exatamente o estado que o ADO 68438 veio tornar visível.
                *
                * A serialização continua tri-estado (`''` ⇒ OMITIDO, nunca
                * `false`): o guard do submit é quem impede o `''` de chegar ao
                * payload, e a assimetria "Selecione… não é Não" é a invariante
                * do campo — o modal de edição segue aceitando o branco.
                */}
              <div className="mt-3">
                <FieldLabel htmlFor="nova-opp-alteracao-minuta-padrao" required>
                  {ALTERACAO_MINUTA_PADRAO_FIELD_LABEL}
                </FieldLabel>
                <select
                  id="nova-opp-alteracao-minuta-padrao"
                  data-testid="field-alteracao-minuta-padrao"
                  value={alteracaoMinutaPadrao}
                  onChange={(e) =>
                    setAlteracaoMinutaPadrao(e.target.value as RespostaSimNao)
                  }
                  disabled={formState !== 'filled'}
                  aria-disabled={formState !== 'filled'}
                  required
                  className={FIELD}
                >
                  <option value="">Selecione…</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
                <p className="mt-1 text-[12px] text-(--color-text-muted)">
                  Marque &quot;Sim&quot; quando a minuta do contrato não seguirá
                  o padrão. A resposta vai para a Cotação e a Oportunidade no
                  Salesforce.
                </p>
              </div>

              {/*
                * Descrição da alteração — aparece SÓ com "Sim", e aí é obrigatória.
                *
                * Renderização condicional, não um campo desabilitado: com
                * "Não" não há nada a justificar, e um campo cinza permanente
                * seria controle morto. O texto digitado sobrevive à troca de
                * resposta no estado (quem trocou por engano não reescreve),
                * mas só viaja no payload com o "Sim".
                *
                * É este texto que a fase de minuta exibe no alerta vermelho
                * acima da lista de minutas — o analista precisa saber O QUE
                * muda em relação ao padrão antes de conferir o documento.
                */}
              {alteracaoMinutaPadrao === 'sim' && (
                <div className="mt-3">
                  <FieldLabel
                    htmlFor="nova-opp-descricao-alteracao-minuta-padrao"
                    required
                  >
                    {DESCRICAO_ALTERACAO_MINUTA_PADRAO_FIELD_LABEL}
                  </FieldLabel>
                  <textarea
                    id="nova-opp-descricao-alteracao-minuta-padrao"
                    data-testid="field-descricao-alteracao-minuta-padrao"
                    value={descricaoAlteracaoMinutaPadrao}
                    onChange={(e) =>
                      setDescricaoAlteracaoMinutaPadrao(e.target.value)
                    }
                    disabled={formState !== 'filled'}
                    aria-disabled={formState !== 'filled'}
                    required
                    rows={3}
                    maxLength={2000}
                    className={`${FIELD} min-h-[72px] resize-y`}
                  />
                  <p className="mt-1 text-[12px] text-(--color-text-muted)">
                    Descreva o que muda em relação à minuta padrão. O texto
                    aparece como alerta na fase de minuta.
                  </p>
                </div>
              )}

              {/*
                * Nova imagem de pista (ADO 68001) — o TERCEIRO gate do
                * `/simulate` (ADR-0037).
                *
                * O Salesforce tem um trigger que sugere "Possui" a partir do
                * cadastro do cliente (`Account.Nova_Imagem__c`) — e é isso que o
                * prefill semeia aqui —, mas deixa em branco quando a conta não
                * informa, o que são 84% delas. Depois, a alçada recusa enquanto
                * o campo estiver vazio. Por isso a tela pergunta já na criação,
                * e não só no modal de edição.
                *
                * Opcionais de propósito: quem cobra a resposta é o gate da
                * alçada, que já recusa nomeando o campo. Exigir aqui criaria uma
                * trava nova no primeiro passo do fluxo.
                */}
              <div className="mt-3 grid grid-cols-2 items-start gap-3 max-[600px]:grid-cols-1">
                <div>
                  <FieldLabel htmlFor="nova-opp-possui-imagem-pista">
                    Possui nova imagem de pista
                  </FieldLabel>
                  <select
                    id="nova-opp-possui-imagem-pista"
                    data-testid="field-possui-imagem-pista"
                    value={possuiNovaImagemPista}
                    onChange={(e) =>
                      setPossuiNovaImagemPista(e.target.value as RespostaSimNao)
                    }
                    disabled={formState !== 'filled'}
                    aria-disabled={formState !== 'filled'}
                    className={FIELD}
                  >
                    <option value="">Selecione…</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                  <p className="mt-1 text-[12px] text-(--color-text-muted)">
                    O Salesforce exige esta resposta antes de calcular a alçada.
                    Vem preenchida do cadastro do cliente quando ele informa.
                  </p>
                </div>

                {/*
                  * Só aparece com "Possui = Não": é a única combinação que o
                  * picklist dependente do Salesforce habilita. Renderizá-lo
                  * sempre ofereceria uma escolha que o org não aceita.
                  */}
                {possuiNovaImagemPista === 'nao' && (
                  <div>
                    <FieldLabel htmlFor="nova-opp-sera-colocada-imagem-pista">
                      Será colocada nova imagem de pista
                    </FieldLabel>
                    <select
                      id="nova-opp-sera-colocada-imagem-pista"
                      data-testid="field-sera-colocada-imagem-pista"
                      value={seraColocadaNovaImagemPista}
                      onChange={(e) =>
                        setSeraColocadaNovaImagemPista(
                          e.target.value as RespostaSimNao,
                        )
                      }
                      disabled={formState !== 'filled'}
                      aria-disabled={formState !== 'filled'}
                      className={FIELD}
                    >
                      <option value="">Selecione…</option>
                      <option value="sim">Sim</option>
                      <option value="nao">Não</option>
                    </select>
                    <p className="mt-1 text-[12px] text-(--color-text-muted)">
                      Nesta negociação. O Salesforce exige a resposta quando o
                      posto ainda não tem nova imagem.
                    </p>
                  </div>
                )}
              </div>
            </Block>

            {/* 3 · Finalidade */}
            <Block title="3 · Finalidade">
              <div>
                <FieldLabel htmlFor="nova-opp-finalidade" required>
                  Finalidade da oportunidade
                </FieldLabel>
                {/*
                  Options from the picklist catalog, filtered by
                  `Tipo_de_Proposta__c`.
                  CA-1 (VBR-463): only Vinculação and Implantação are offered
                  on this screen — screen-level recorte, not a catalog change.
                  The backend continues to accept the full value set.
                */}
                <PicklistSelect
                  id="nova-opp-finalidade"
                  data-testid="field-finalidade"
                  field={PicklistField.QuoteFinalidade}
                  controllingValue={TipoProposta.Pcr}
                  controllingLabel="Tipo de proposta"
                  value={finalidade}
                  onChange={setFinalidade}
                  disabled={formState !== 'filled'}
                  required
                  allow={FINALIDADE_ALLOW}
                />
              </div>
            </Block>

            {/*
              * A Adesão ao PIM NÃO é perguntada aqui.
              *
              * O PIM é o **Programa Acelera+**, que já é perguntado (e é
              * obrigatório) no bloco "Dados da proposta" — perguntar aqui era
              * a mesma pergunta duas vezes, com dois rótulos, em dois
              * agregados. O valor que vai ao Salesforce é derivado da proposta
              * PCR eleita (`opportunities/domain/pim-adesao.ts`).
              */}
            {/* 4 · Responsáveis */}
            <Block title="4 · Responsáveis">
              <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
                <div>
                  <FieldLabel htmlFor="nova-opp-criado-por">Criado por</FieldLabel>
                  <PersonCard
                    name={creatorName}
                    detail={user?.roles.join(' · ') || '—'}
                    badge={
                      <span className="inline-flex items-center rounded-full bg-(--neutral-60) px-2.5 py-1 text-[11px] font-bold text-(--neutral-700)">
                        Quem está criando
                      </span>
                    }
                  />
                </div>
                <div>
                  <span className={LABEL}>LT do cliente (proprietário)</span>
                  <LtCard value={ltUser} onChange={setLtUser} search={searchLtCandidates} />
                </div>
              </div>
            </Block>

            {/* Equipe */}
            <Block title="Equipe">
              <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
                {ALL_ROLES.map((role) => (
                  <div key={role}>
                    <span className={LABEL}>{ROLE_LABELS[role]}</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {team[role].length === 0 ? (
                        <span className="text-[12px] text-(--color-text-muted)">
                          Ninguém adicionado
                        </span>
                      ) : (
                        team[role].map((member) => (
                          <span
                            key={member.id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-(--neutral-60) px-3 py-1.5 text-(length:--t-small) font-bold"
                          >
                            <Avatar name={member.name} size={22} />
                            {member.name}
                            <button
                              type="button"
                              aria-label={`Remover ${member.name}`}
                              onClick={() => removeTeamMember(role, member.id)}
                              className="ml-0.5 cursor-pointer font-bold leading-none text-(--color-text-muted) opacity-45 hover:text-(--color-danger) hover:opacity-100"
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    <button
                      type="button"
                      // Four identical "+ Adicionar" buttons are ambiguous to a
                      // screen reader; the bucket is what distinguishes them.
                      aria-label={`Adicionar · ${ROLE_LABELS[role]}`}
                      onClick={() => setAddingRole(role)}
                      className="mt-2 cursor-pointer rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-500) hover:bg-(--neutral-50)"
                    >
                      + Adicionar
                    </button>
                  </div>
                ))}
              </div>
            </Block>
          </div>

          {/* ============================ PANEL =========================== */}
          <aside className="sticky top-4 flex flex-col gap-3.5 self-start max-[920px]:static">
            <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-4">
              <div className="mb-2 text-(length:--t-caption) font-bold">
                Resumo da oportunidade
              </div>
              <dl className="text-(length:--t-caption) leading-[1.9]">
                <SummaryRow label="Código:">
                  <span className="font-normal text-(--color-text-muted)">
                    gerado ao criar
                  </span>
                </SummaryRow>
                <SummaryRow label="Cliente:">
                  <b>{clientName}</b>
                </SummaryRow>
                {/*
                  * ADO 68242 — a FINALIDADE, não a negociação.
                  *
                  * `Negociação: Contratação` era constante em toda oportunidade
                  * (ver `CREATED_TIPO_NEGOCIACAO`), então o resumo gastava uma
                  * linha com o único campo que nunca varia. A finalidade é a
                  * resposta que o LT acabou de dar no passo 3 — é ela que o
                  * resumo precisa confirmar antes do "Criar oportunidade".
                  *
                  * Vazia ⇒ travessão: o campo é obrigatório e o gate do submit
                  * já o cobra; o resumo não inventa a resposta que falta.
                  */}
                <SummaryRow label={`${FINALIDADE_FIELD_LABEL}:`}>
                  <b>{textoFinalidade(finalidade) ?? '—'}</b>
                </SummaryRow>
                <SummaryRow label="Fase:">
                  <b>Novos</b>
                </SummaryRow>
                <SummaryRow label="Criado por:">
                  <b>{creatorName}</b>
                </SummaryRow>
                <SummaryRow label="Data de abertura:">
                  <b>gerada ao criar</b>
                </SummaryRow>
                <SummaryRow label="Data de conclusão:">
                  <b>—</b>
                </SummaryRow>
              </dl>
            </div>

            {/* Prefill error */}
            {formState === 'error' && prefillError && (
              <div
                role="alert"
                className="rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2.5 text-(length:--t-small) text-(--yellow-700)"
              >
                {prefillError} Selecione o cliente novamente para tentar recarregar.
              </div>
            )}

            {/* Submit error */}
            {submitState === 'error' && (
              <div
                role="alert"
                className={`rounded-[var(--radius-xs)] border px-3 py-2.5 text-(length:--t-small) ${
                  isForbidden
                    ? 'border-(--yellow-300) bg-(--yellow-100) text-(--yellow-700)'
                    : 'border-(--color-danger) bg-(--color-danger-bg) text-(--color-danger)'
                }`}
              >
                {isForbidden ? (
                  <>
                    <strong>Acesso negado:</strong> {submitError}
                  </>
                ) : (
                  submitError
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
              className="flex w-full cursor-pointer items-center justify-center rounded-[var(--radius-xxs)] bg-(--secondary-500) px-4 py-2.5 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-hover) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitState === 'submitting' ? 'Criando…' : 'Criar oportunidade'}
            </button>
          </aside>
        </div>
      </form>

      {/* Add-to-team modal (real directory search) */}
      {addingRole && (
        <AddMemberModal
          role={addingRole}
          excludedUserIds={team[addingRole].map((u) => u.id)}
          search={searchForBucket}
          onAdd={(dirUser) => addTeamMember(addingRole, dirUser)}
          onClose={() => setAddingRole(null)}
        />
      )}
    </div>
  );
}

/** Prototype `.kv` row — muted label + value. */
function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-(--color-text-muted)">{label}</span> {children}
    </div>
  );
}
