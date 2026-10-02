'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { GearIcon, InboxIcon } from '@/components/icons';
import { Select } from '@/components/ui/select';
import { SELO_LABEL, Selo, isSelo } from '@/lib/dashboard/requer-acao-mapping';
import { usePermissions } from '@/hooks/use-permissions';
import { clienteOppLine } from '@/lib/pendencias/cliente-opp';
import { listPendenciaAreas, listPendencias } from '@/lib/pendencias/pendencias.data';
import {
  podeResolverPendencia,
  rotuloCtaPendencia,
} from '@/lib/pendencias/resolve-cta';
import {
  SLA_LABEL,
  SlaFaixa,
  isSlaFaixa,
  type ListPendenciasParams,
  type ListPendenciasResult,
  type PendenciaAreaOption,
  type PendenciaPrioridade,
  type PendenciaSummary,
  type PendenciasKpis,
  type PendenciaStatus,
} from '@/lib/pendencias/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CHIPS: Array<{ key: 'todas' | PendenciaStatus; label: string }> = [
  { key: 'todas', label: 'Todas' },
  { key: 'Aberta', label: 'Abertas' },
  { key: 'Em tratativa', label: 'Em tratativa' },
  { key: 'Resolvida', label: 'Resolvidas' },
];

const PRIORIDADE_OPTIONS: PendenciaPrioridade[] = ['Urgente', 'Alta', 'Média', 'Baixa'];

/**
 * Status em que a pendência ACABOU — e por isso não carrega selo nenhum.
 *
 * ⚠️ **Selo e status terminal são mutuamente exclusivos por construção, e
 * combiná-los devolve conjunto VAZIO sempre** (ADO 68191). `seloSqlCondition`
 * embute a cláusula de "só ativa" desde o ADO 67960 — *"pendência resolvida não
 * casa mais nenhuma faixa"*, que é a leitura correta (ela acabou, não está
 * atrasada). A consequência na tela é que `?status=Resolvida&selo=CRITICA` NÃO
 * é um filtro estreito: é um filtro impossível.
 *
 * Foi o que o anexo do ADO 68191 registrou em staging (09/09/2026, 16:48): o
 * chip **Críticas** aceso — o anel `ring-2 ring-inset` está no print — ao lado
 * de **Resolvidas**, os três contadores de selo em `0`, e *"Nenhuma pendência
 * neste filtro"* sobre cards que diziam **187 abertas / 85 concluídas**. A
 * queixa literal do ticket é *"Ao clicar em abertas ou resolvidas não aparece
 * nenhuma informação"* — e nada na tela explicava o que havia sumido, que é a
 * mesma classe de defeito do ADO 67960/67965.
 *
 * A regra é **a última escolha do usuário vence** ({@link handleStatusChange} e
 * {@link handleSeloChange} zeram o eixo oposto), em vez de esconder ou desligar
 * os chips: chip escondido deixa o recorte aplicado sem controle que o desfaça —
 * o beco sem saída que o ADO 67965 já fechou uma vez.
 */
const STATUS_TERMINAIS: readonly PendenciaStatus[] = ['Resolvida', 'Cancelada'];

/** `true` quando o filtro de status escolhido exclui, por definição, todo selo. */
function isStatusTerminal(status: 'todas' | PendenciaStatus): boolean {
  return STATUS_TERMINAIS.includes(status as PendenciaStatus);
}

/** Stable rendering order for selo chips — critical first. */
const SELO_ORDER: Selo[] = [Selo.Critica, Selo.Atencao, Selo.Andamento];

/** SLA select options in a logical order (most urgent first). */
const SLA_ORDER: SlaFaixa[] = [
  SlaFaixa.Atrasada,
  SlaFaixa.VenceHoje,
  SlaFaixa.NoPrazo,
  SlaFaixa.SemPrazo,
];

const EMPTY_KPIS: PendenciasKpis = {
  atrasadas: 0,
  vencemHoje: 0,
  abertas: 0,
  concluidasSemana: 0,
};

const SELO_CLASSES: Record<Selo, { bg: string; text: string }> = {
  [Selo.Critica]: { bg: 'bg-(--red-100)', text: 'text-(--red-700)' },
  [Selo.Atencao]: { bg: 'bg-(--yellow-100)', text: 'text-(--yellow-700)' },
  [Selo.Andamento]: { bg: 'bg-(--blue-100)', text: 'text-(--blue-700)' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the SLA badge data for a pendency item.
 *
 * ## O rótulo vem da FAIXA, nunca do sinal de `slaDias` (ADO 67960)
 *
 * `slaFaixa` é o veredito do backend — o MESMO predicado que o filtro `?sla=` e
 * os cards do topo aplicam. Enquanto a pill era derivada do número, ela
 * discordava dos dois nas bordas que mais aparecem:
 *
 * - prazo às 22:00 de hoje ⇒ `slaDias = 1` ⇒ pill **"Em 1d · no prazo"**, e
 *   filtrar "Vence hoje" trazia a linha que a pill dizia estar no prazo;
 * - prazo às 08:00 de hoje (já vencido) ⇒ `ceil` de diferença negativa em horas
 *   dá `-0` ⇒ pill **"Vence hoje"** para algo atrasado, contado no card
 *   "Atrasadas".
 *
 * `slaDias` continua compondo só o texto auxiliar.
 *
 * Resolved tasks always show a "Resolvida" badge regardless of the faixa —
 * pendência resolvida não está atrasada, ela acabou.
 *
 * ⚠️ Faixa ausente (`null`/`undefined` — backend anterior a esta entrega)
 * degrada para a derivação antiga por `slaDias`: é o comportamento anterior,
 * não um rótulo inventado.
 */
function slaBadge(item: PendenciaSummary): {
  label: string;
  sub: string;
  variant: 'overdue' | 'today' | 'ok' | 'resolved' | 'none';
} {
  if (item.status === 'Resolvida') {
    return { label: 'Resolvida', sub: '', variant: 'resolved' };
  }

  const dias = item.slaDias;
  /** "há N dias" — só faz sentido com o prazo em outro dia de calendário. */
  const atraso =
    dias != null && dias < 0
      ? `há ${Math.abs(dias)} dia${Math.abs(dias) !== 1 ? 's' : ''}`
      : '';

  switch (item.slaFaixa) {
    case SlaFaixa.SemPrazo:
      // Sem prazo (ex.: pendência do parecer da DDI) — nunca "Em nulld".
      return { label: 'Sem prazo', sub: '', variant: 'none' };
    case SlaFaixa.Atrasada:
      return { label: 'Atrasada', sub: atraso, variant: 'overdue' };
    case SlaFaixa.VenceHoje:
      return { label: 'Vence hoje', sub: '', variant: 'today' };
    case SlaFaixa.NoPrazo:
      return {
        label: dias != null ? `Em ${dias}d` : 'No prazo',
        sub: 'no prazo',
        variant: 'ok',
      };
  }

  // Backend sem `slaFaixa` — comportamento anterior, derivado do número.
  if (dias == null) return { label: 'Sem prazo', sub: '', variant: 'none' };
  if (dias < 0) return { label: 'Atrasada', sub: atraso, variant: 'overdue' };
  if (dias === 0) return { label: 'Vence hoje', sub: '', variant: 'today' };
  return { label: `Em ${dias}d`, sub: 'no prazo', variant: 'ok' };
}

/**
 * Builds the muted meta line (cliente · OPP · fase · resp. X) from only the
 * fields that are present, so an unenriched or area-routed pendência never
 * renders orphan separators like "· · · resp.".
 */
function metaLine(item: PendenciaSummary): string {
  return [
    // O par cliente · OPP sai do MESMO predicado que o cabeçalho do ticket
    // (ADO 67964): lá ele estava faltando, e duas composições paralelas
    // divergiriam de novo na próxima vez que uma das duas ganhasse um campo.
    clienteOppLine(item.clientName, item.opportunityCode),
    item.fase,
    item.responsavel ? `resp. ${item.responsavel}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const SLA_BADGE_STYLES: Record<
  'overdue' | 'today' | 'ok' | 'resolved' | 'none',
  { badge: string; leftBorder: string }
> = {
  overdue: {
    badge: 'bg-(--red-100) text-(--red-700)',
    leftBorder: 'border-l-[3px] border-l-(--red-500)',
  },
  today: {
    badge: 'bg-(--yellow-100) text-(--yellow-700)',
    leftBorder: 'border-l-[3px] border-l-(--yellow-500)',
  },
  ok: {
    badge: 'bg-(--blue-100) text-(--blue-800)',
    leftBorder: '',
  },
  resolved: {
    badge: 'bg-(--secondary-100) text-(--secondary-700)',
    leftBorder: '',
  },
  none: {
    badge: 'bg-(--neutral-60) text-(--neutral-700)',
    leftBorder: '',
  },
};

const PRIORIDADE_STYLES: Record<PendenciaPrioridade, string> = {
  Urgente: 'bg-(--red-100) text-(--red-700)',
  Alta: 'bg-(--red-100) text-(--red-700)',
  Média: 'bg-(--yellow-100) text-(--yellow-700)',
  Baixa: 'bg-(--neutral-60) text-(--neutral-700)',
};

// ---------------------------------------------------------------------------
// URL state helpers
// ---------------------------------------------------------------------------

/** Builds a new URLSearchParams merging the current params with patch object. */
function patchParams(
  current: URLSearchParams,
  patch: Record<string, string | undefined>,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '') {
      next.delete(k);
    } else {
      next.set(k, v);
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  value,
  label,
  valueClass,
  critical,
}: {
  value: number;
  label: string;
  valueClass?: string;
  critical?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-4 py-3.5${
        critical ? ' border-l-[3px] border-l-(--red-500)' : ''
      }`}
    >
      <div
        className={`text-(length:--t-h1) font-bold tracking-[-0.5px]${
          valueClass ? ` ${valueClass}` : ''
        }`}
      >
        {value}
      </div>
      <div className="text-(length:--t-caption) text-(--color-text-muted)">{label}</div>
    </div>
  );
}

function Tag({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block rounded-[var(--radius-xxs)] px-1.5 py-0.5 text-(length:--t-small) font-bold${
        className ? ` ${className}` : ' bg-(--neutral-60) text-(--neutral-700)'
      }`}
    >
      {children}
    </span>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-6 py-10 text-center text-(length:--t-caption) text-(--color-text-muted)">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PendencyItem
// ---------------------------------------------------------------------------

function PendencyItem({ item }: { item: PendenciaSummary }) {
  const sla = slaBadge(item);
  const styles = SLA_BADGE_STYLES[sla.variant];
  const isResolved = item.status === 'Resolvida';
  /*
   * O CTA da linha não promete um ato que este perfil não pode praticar: a SNEG
   * via "Resolver" na pendência do parecer da DDI, que só a Integridade emite
   * (ADO 67911). Continua sendo um link — a pendência é legitimamente visível
   * para ela —, só deixa de se chamar "Resolver".
   */
  const { can } = usePermissions();
  const podeResolver = podeResolverPendencia(
    item.acaoResolucao,
    can,
    // POSSE — veredito do backend (ADO 68190). Era aqui que o LT via "Resolver"
    // em `DDI: emitir parecer` da Integridade.
    item.resolucaoPermitida,
  );

  return (
    <div
      className={`flex items-center gap-3.5 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-3.5${
        styles.leftBorder ? ` ${styles.leftBorder}` : ''
      }${isResolved ? ' opacity-60' : ''}`}
    >
      {/* SLA badge column — 120px per spec */}
      <div className="w-[120px] shrink-0 text-center">
        <div className="mb-1.5 text-(length:--t-body) font-bold text-(--color-text)">
          {item.code}
        </div>
        <span
          className={`inline-block rounded-full px-2 py-1 text-(length:--t-small) font-bold ${styles.badge}`}
        >
          {sla.label}
        </span>
        {sla.sub && (
          <div className="mt-0.5 text-(length:--t-small) text-(--color-text-muted)">{sla.sub}</div>
        )}
      </div>

      {/* Content column */}
      <div className="min-w-0 flex-1">
        <div className="text-(length:--t-caption) font-bold">{item.title}</div>
        {metaLine(item) && (
          <div className="mt-0.5 text-(length:--t-small) text-(--color-text-muted)">
            {metaLine(item)}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {item.automatica && (
            <Tag>
              <GearIcon className="mr-1 inline-block align-[-0.1em]" /> automática
            </Tag>
          )}
          <Tag>{item.tipo}</Tag>
          <Tag className={PRIORIDADE_STYLES[item.prioridade]}>
            Prioridade {item.prioridade}
          </Tag>
          <Tag>{item.status}</Tag>
          {item.area && <Tag>{item.area}</Tag>}
          {item.canal && <Tag>{item.canal}</Tag>}
        </div>
      </div>

      {/* Action column */}
      <div className="shrink-0">
        {isResolved ? (
          <span className="rounded-[var(--radius-xs)] border border-(--color-border-strong) bg-white px-2.5 py-1.5 text-(length:--t-small) font-bold text-(--color-text-muted)">
            ✓ resolvida
          </span>
        ) : (
          <Link
            href={`/pendencias/${item.id}`}
            className="inline-block rounded-[var(--radius-xs)] bg-(--secondary-500) px-3 py-1.5 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600)"
          >
            {rotuloCtaPendencia(podeResolver)}
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type LoadFn = (params: ListPendenciasParams) => Promise<ListPendenciasResult>;

type LoadAreasFn = () => Promise<PendenciaAreaOption[]>;

type Props = {
  /**
   * Loads the pendency list (items + KPIs); injectable for tests. Defaults to
   * `listPendencias` from `pendencias.data.ts`, which calls the real BFF
   * (`/api/pendencias`). Tests inject their own stub via this prop.
   */
  load?: LoadFn;
  /**
   * Carrega o vocabulário do filtro de área (ADO 67912). O painel NÃO tem uma
   * lista própria: `?area=` é comparado com o token cru no backend, então
   * rótulo escrito aqui filtra zero linhas.
   */
  loadAreas?: LoadAreasFn;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Pendency panel (journey F3 — `/pendencias`). Loads pendency data from the
 * backend, shows KPI cards, status chips, SLA/selo/responsável/minhas filters
 * and free-text search with debounce.
 *
 * ## TODO filtro ativo vive na URL, e volta dela no reload (ADO 67961)
 *
 * Este docblock já afirmava isso, e era falso para TRÊS dos filtros:
 * `prioridade`, `área` e a BUSCA livre nunca eram empurrados para a
 * query-string nem lidos de volta. Medido em 04/09/2026 abrindo
 * `?status=Aberta&prioridade=Alta&area=SNEG&q=posto&sla=SEM_PRAZO&minhas=true`:
 * status, SLA e "Minhas" voltavam; os outros três eram ignorados, com os
 * controles em "Todas as prioridades" / "Todas as áreas" / busca vazia e a lista
 * SEM aquele recorte. É a queixa literal do ticket — *"apenas o filtro de SLA é
 * mantido quando a página é recarregada"* — e ela também quebrava o link
 * compartilhado: colar a URL de um filtro entregava outra lista.
 *
 * Params reconhecidos:
 *   ?status=Aberta|Em tratativa|Resolvida|Cancelada
 *   ?sla=ATRASADA|VENCE_HOJE|NO_PRAZO|SEM_PRAZO
 *   ?selo=CRITICA|ATENCAO|ANDAMENTO
 *   ?prioridade=Urgente|Alta|Média|Baixa
 *   ?area=<token do backend>
 *   ?q=<busca livre>
 *   ?minhas=true
 *   ?responsavelId=<id>   (aceito, sem controle na tela — ver abaixo)
 *   ?opp=<ref>            (escopo de uma oportunidade, com faixa própria)
 *
 * ⚠️ **`?responsavelId=` não tem mais campo na tela.** Ele era um `input` de
 * texto livre rotulado "ID do responsável…", e o valor que ele espera é um
 * identificador OPACO do diretório (o `oid` do Entra, ou `seed-2` no fake) —
 * ninguém sabe o próprio, muito menos o de um colega, então o campo só podia
 * produzir lista vazia. Era o candidato óbvio do pedido do ticket ("verificar
 * quais campos devem ser exibidos, quais devem ser removidos"). O caso ÚTIL —
 * "as minhas" — já tem o chip `Minhas` ao lado, que resolve o id pelo token da
 * sessão. O parâmetro continua aceito (deep link e API), só deixou de ter
 * controle: campo que não consegue filtrar é controle morto.
 *
 * Valor de enum vindo da URL é sempre NARROWED (`isSlaFaixa`/`isSelo`/lista de
 * prioridades): `?prioridade=Altíssima` volta a "todas" em vez de mandar lixo ao
 * backend. `?area=` é token do backend e não tem vocabulário local — ele é
 * preservado e ACRESCENTADO às opções quando o catálogo lido não o contém, para
 * o controle sempre refletir o filtro que está de fato aplicado (`isKnown` ×
 * `isSelectable`).
 *
 * Covers all four UI states: carregando, preenchido, vazio and erro.
 * Supports the `?opp=<opportunityId>` query param to scope the panel to a
 * single opportunity with a dismissable banner.
 *
 * Enum options for sla/selo are derived from `SlaFaixa`/`Selo` (not hardcoded).
 */
export function PendenciasPanel({
  load = listPendencias,
  loadAreas = listPendenciaAreas,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // -- Read initial state from URL (CA-5: reload restores controls) --
  const oppFilter = searchParams.get('opp') ?? '';
  const initialStatus = (): 'todas' | PendenciaStatus => {
    const v = searchParams.get('status');
    if (!v) return 'todas';
    const known: PendenciaStatus[] = ['Aberta', 'Em tratativa', 'Resolvida', 'Cancelada'];
    return known.includes(v as PendenciaStatus) ? (v as PendenciaStatus) : 'todas';
  };
  const initialSla = (): SlaFaixa | '' => {
    const v = searchParams.get('sla');
    return v && isSlaFaixa(v) ? v : '';
  };
  /**
   * ⚠️ Um `?selo=` que chega junto de um status TERMINAL é descartado — ver
   * {@link STATUS_TERMINAIS}. É o mesmo deep link que a própria tela produz ao
   * empilhar os dois filtros, e sem a normalização a página abriria já no
   * conjunto impossível, com o chip aceso sobre uma lista vazia.
   */
  const initialSelo = (): Selo | '' => {
    const v = searchParams.get('selo');
    if (!v || !isSelo(v)) return '';
    return isStatusTerminal(initialStatus()) ? '' : v;
  };
  const initialMinhas = (): boolean => searchParams.get('minhas') === 'true';
  const initialResponsavelId = (): string => searchParams.get('responsavelId') ?? '';
  const initialPrioridade = (): PendenciaPrioridade | '' => {
    const v = searchParams.get('prioridade');
    return v && (PRIORIDADE_OPTIONS as string[]).includes(v)
      ? (v as PendenciaPrioridade)
      : '';
  };
  /**
   * `?area=` é token de máquina do backend (`COMPLIANCE`, `LT_EV`) e a tela não
   * tem vocabulário próprio — o catálogo chega por leitura à parte (ADO 67912).
   * Então o valor é aceito CRU: validá-lo contra `areaOptions` aqui recusaria
   * todo deep link, porque no primeiro render a lista ainda está vazia.
   */
  const initialArea = (): string => searchParams.get('area') ?? '';
  const initialQuery = (): string => searchParams.get('q') ?? '';

  const [loadStatus, setLoadStatus] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  );
  const [items, setItems] = useState<PendenciaSummary[]>([]);
  const [kpis, setKpis] = useState<PendenciasKpis>(EMPTY_KPIS);
  const [porSelo, setPorSelo] = useState<ListPendenciasResult['porSelo']>(undefined);
  const [error, setError] = useState('');

  const [statusChip, setStatusChip] = useState<'todas' | PendenciaStatus>(initialStatus);
  const [prioridade, setPrioridade] = useState<PendenciaPrioridade | ''>(
    initialPrioridade,
  );
  const [area, setArea] = useState(initialArea);
  /**
   * Vocabulário do filtro de área, publicado pelo backend (ADO 67912).
   *
   * Começa VAZIO e permanece vazio se a leitura falhar — não há lista de
   * reserva. Uma lista fixa aqui é exatamente o defeito corrigido: ela
   * concordava com o backend em três dos sete valores e omitia a área da
   * Integridade. Sem vocabulário, o seletor não é renderizado: filtro que
   * não consegue filtrar é controle morto.
   */
  const [areaOptions, setAreaOptions] = useState<PendenciaAreaOption[]>([]);
  const [sla, setSla] = useState<SlaFaixa | ''>(initialSla);
  const [seloFilter, setSeloFilter] = useState<Selo | ''>(initialSelo);
  const [minhas, setMinhas] = useState<boolean>(initialMinhas);
  /*
   * Sem `useState`: `?responsavelId=` é deep-link/API e não tem controle na tela
   * (ADO 67961) — nada aqui o muta, então um estado seria sempre igual à URL, e
   * o setter ficaria órfão.
   */
  const responsavelId = initialResponsavelId();
  /*
   * A busca nasce do `?q=` E JÁ nasce "debounced": sem semear as duas, o
   * primeiro fetch sairia sem o termo e a lista piscaria completa antes de
   * recortar — e com o debounce só disparando no `onChange`, ela nunca
   * recortaria.
   */
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  // Debounce search input by 300 ms.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value);
      /*
       * A URL é atualizada no MESMO debounce do fetch, e não a cada tecla: um
       * `router.push` por caractere enche o histórico do navegador, e aí o
       * botão voltar percorre a busca letra por letra.
       */
      pushUrl({ q: value || undefined });
    }, 300);
  };

  // ---------------------------------------------------------------------------
  // URL sync helpers — each filter setter also pushes to the URL.
  // ---------------------------------------------------------------------------

  function pushUrl(patch: Record<string, string | undefined>) {
    const next = patchParams(searchParams, patch);
    const qs = next.toString();
    router.push(qs ? `?${qs}` : '?', { scroll: false });
  }

  function handleStatusChange(value: 'todas' | PendenciaStatus) {
    setStatusChip(value);
    /*
     * Status terminal apaga o selo — ver {@link STATUS_TERMINAIS}. Os dois vão
     * no MESMO `pushUrl`: dois pushes seguidos deixariam um passo intermediário
     * no histórico do navegador em que o par impossível está de pé, e o botão
     * voltar cairia justamente nele.
     */
    const limpaSelo = isStatusTerminal(value) && seloFilter !== '';
    if (limpaSelo) setSeloFilter('');
    pushUrl({
      status: value === 'todas' ? undefined : value,
      ...(limpaSelo ? { selo: undefined } : {}),
    });
  }

  function handleSlaChange(value: SlaFaixa | '') {
    setSla(value);
    pushUrl({ sla: value || undefined });
  }

  function handleSeloChange(value: Selo | '') {
    setSeloFilter(value);
    /*
     * A recíproca: acender um selo com "Resolvidas" ativo devolve a aba a
     * "Todas", senão o clique entrega o mesmo vazio — e aí o usuário conclui que
     * a categoria não tem nada, quando o que não existe é a combinação.
     */
    const soltaStatus = value !== '' && isStatusTerminal(statusChip);
    if (soltaStatus) setStatusChip('todas');
    pushUrl({
      selo: value || undefined,
      ...(soltaStatus ? { status: undefined } : {}),
    });
  }

  function handleMinhasToggle() {
    const next = !minhas;
    setMinhas(next);
    pushUrl({ minhas: next ? 'true' : undefined });
  }

  function handlePrioridadeChange(value: PendenciaPrioridade | '') {
    setPrioridade(value);
    pushUrl({ prioridade: value || undefined });
  }

  function handleAreaChange(value: string) {
    setArea(value);
    pushUrl({ area: value || undefined });
  }

  // ---------------------------------------------------------------------------
  // Data fetch
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoadStatus('loading');
    setError('');
    try {
      const params: ListPendenciasParams = {
        status: statusChip === 'todas' ? undefined : (statusChip as PendenciaStatus),
        prioridade: prioridade || undefined,
        area: area || undefined,
        opportunityRef: oppFilter || undefined,
        q: debouncedQuery || undefined,
        sla: sla || undefined,
        selo: seloFilter || undefined,
        responsavelId: responsavelId || undefined,
        minhas: minhas || undefined,
      };
      const result = await load(params);
      // Client-side sort: resolved items at the end, then SLA ascending
      // (null SLA = "Sem prazo" → sorted after positive values).
      const sorted = [...result.items].sort((a, b) => {
        const aResolved = a.status === 'Resolvida' ? 1 : 0;
        const bResolved = b.status === 'Resolvida' ? 1 : 0;
        if (aResolved !== bResolved) return aResolved - bResolved;
        const aSla = a.slaDias ?? Infinity;
        const bSla = b.slaDias ?? Infinity;
        return aSla - bSla;
      });
      setItems(sorted);
      setKpis(result.kpis);
      setPorSelo(result.porSelo);
      setLoadStatus('loaded');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar pendências.',
      );
      setLoadStatus('error');
    }
  }, [load, statusChip, prioridade, area, oppFilter, debouncedQuery, sla, seloFilter, responsavelId, minhas]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /*
   * ⚠️ A URL também perde o `?selo=` descartado por {@link initialSelo}, e isso
   * NÃO é cosmético: `pushUrl` parte sempre dos `searchParams` atuais, então o
   * parâmetro órfão seria carregado adiante por todo filtro seguinte. Trocar
   * depois para uma aba ativa faria o recorte VOLTAR no próximo recarregamento,
   * com o chip apagado — estado e URL discordando sobre o mesmo filtro.
   *
   * `replace`, nunca `push`: normalizar o endereço não é navegação, e um passo
   * no histórico devolveria o usuário ao par impossível pelo botão voltar —
   * mesma razão pela qual os dois eixos vão num `pushUrl` só.
   */
  const urlSemSeloOrfao = ((): string | null => {
    const bruto = searchParams.get('selo');
    const orfao =
      Boolean(bruto && isSelo(bruto)) && isStatusTerminal(initialStatus());
    if (!orfao) return null;
    const qs = patchParams(searchParams, { selo: undefined }).toString();
    return qs ? `?${qs}` : '?';
  })();

  /*
   * ⚠️ A dependência é a URL de destino (uma STRING), não `searchParams`: o
   * objeto do hook é recriado a cada render, então dependê-lo faria a
   * normalização disparar em TODO render em vez de uma vez.
   */
  useEffect(() => {
    if (!urlSemSeloOrfao) return;
    router.replace(urlSemSeloOrfao, { scroll: false });
  }, [urlSemSeloOrfao, router]);

  // Vocabulário do filtro de área — leitura única, independente da listagem.
  // Falha não vira erro de tela: a lista de pendências continua utilizável, só
  // o seletor de área deixa de ser oferecido.
  useEffect(() => {
    let active = true;
    void loadAreas()
      .then((options) => {
        if (active) setAreaOptions(options);
      })
      .catch(() => {
        if (active) setAreaOptions([]);
      });
    return () => {
      active = false;
    };
  }, [loadAreas]);

  // Clear any pending debounce timers on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Selo chip helpers
  // ---------------------------------------------------------------------------

  function seloCount(s: Selo): number {
    return porSelo?.find((e) => e.selo === s)?.total ?? 0;
  }

  /*
   * O valor ATIVO de `?area=` entra nas opções quando o catálogo lido não o
   * contém (`isKnown` × `isSelectable`, a mesma disciplina do catálogo de
   * picklists). Sem isso um deep link com área fora do vocabulário atual
   * recortaria a lista com o seletor exibindo "Todas as áreas" — filtro
   * invisível, que é o mesmo tipo de contradição que este ticket corrige. O
   * rótulo é o token cru: melhor uma lacuna visível que um nome inventado.
   */
  const areaOptionsComFiltroAtivo: PendenciaAreaOption[] =
    area && !areaOptions.some((o) => o.value === area)
      ? [...areaOptions, { value: area, label: area }]
      : areaOptions;

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h1 className="my-1 text-(length:--t-h2) font-bold tracking-[-0.6px]">
          Pendências
        </h1>
        <p className="text-(length:--t-caption) text-(--color-text-muted)">
          Painel único da carteira, priorizado por SLA. Geradas e roteadas
          automaticamente — sem tarefa manual.
        </p>
      </div>

      {/* KPI cards — always visible; values update after first successful load */}
      <div className="my-[18px] grid grid-cols-2 gap-4 min-[761px]:grid-cols-4">
        <KpiCard
          value={kpis.atrasadas}
          label="Atrasadas"
          valueClass="text-(--red-700)"
          critical
        />
        <KpiCard
          value={kpis.vencemHoje}
          label="Vencem hoje"
          valueClass="text-(--yellow-700)"
        />
        <KpiCard value={kpis.abertas} label="Abertas" />
        <KpiCard
          value={kpis.concluidasSemana}
          label="Concluídas (semana)"
          valueClass="text-(--secondary-600)"
        />
      </div>

      {/* Opportunity filter banner — shown when ?opp= is present */}
      {oppFilter && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--secondary-200) bg-(--secondary-100) px-3.5 py-2.5 text-(length:--t-caption)">
          <span>
            Filtrando pendências da oportunidade{' '}
            <b>{oppFilter}</b>
          </span>
          <Link
            href="/pendencias"
            className="font-bold text-(--secondary-600) no-underline hover:underline"
          >
            Ver todas →
          </Link>
        </div>
      )}

      {/* Toolbar: status chips + minhas + SLA/prioridade/área + busca (ADO 67961) */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">

        {/* Status chips */}
        <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-1.5">
          {STATUS_CHIPS.map(({ key, label }) => {
            const active = statusChip === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => handleStatusChange(key)}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-(length:--t-small) font-bold ${
                  active
                    ? 'border-(--neutral-900) bg-(--neutral-900) text-white'
                    : 'border-(--color-border) bg-white text-(--color-text-muted) hover:bg-(--neutral-40)'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* "Minhas" shortcut — sets ?minhas=true (CA-3) */}
        <button
          type="button"
          aria-pressed={minhas}
          onClick={handleMinhasToggle}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-(length:--t-small) font-bold ${
            minhas
              ? 'border-(--secondary-600) bg-(--secondary-600) text-white'
              : 'border-(--color-border) bg-white text-(--color-text-muted) hover:bg-(--neutral-40)'
          }`}
        >
          Minhas
        </button>

        {/*
          Os três filtros são `clearable`: o próprio rótulo ("Todos os SLAs",
          "Todas as prioridades", "Todas as áreas") entra como primeira opção do
          menu, valor `''`, e volta a filtragem para o segmento inteiro.

          Sem isso a escolha era de mão única: o `<select>` nativo oculto sempre
          teve a opção vazia — então leitor de tela e teste conseguiam limpar —,
          mas o menu que o usuário vê listava só os valores. Escolhido um SLA,
          não havia como voltar a "todos" sem recarregar a tela.

          "Todos" é resposta legítima num FILTRO, e é por isso que o flag é
          opt-in: nos campos obrigatórios de formulário oferecer vazio daria como
          desfazer uma resposta que o DTO exige.
        */}
        {/* SLA select — options from SlaFaixa enum (no hardcoded strings) */}
        <label className="sr-only" htmlFor="filtro-sla">Filtrar por SLA</label>
        <Select
          id="filtro-sla"
          value={sla}
          onChange={(v) => handleSlaChange(v as SlaFaixa | '')}
          options={[
            ...SLA_ORDER.map((s) => ({ value: s, label: SLA_LABEL[s] })),
          ]}
          placeholder="Todos os SLAs"
          clearable
          variant="boxed"
          className="w-auto min-w-[140px]"
        />

        {/* Priority select */}
        <label className="sr-only" htmlFor="filtro-prioridade">Filtrar por prioridade</label>
        <Select
          id="filtro-prioridade"
          value={prioridade}
          onChange={(v) => handlePrioridadeChange(v as PendenciaPrioridade | '')}
          options={PRIORIDADE_OPTIONS.map((p) => ({ value: p, label: p }))}
          placeholder="Todas as prioridades"
          clearable
          variant="boxed"
          className="w-auto min-w-[160px]"
        />

        {/*
          Area select — options come from the backend (ADO 67912).

          ⚠️ `w-auto` nos TRÊS selects: o wrapper do `Select` chumba `w-full`, e
          num contêiner `flex flex-wrap` isso os empilhava full-width — o
          protótipo (`.toolbar` de `12-pendencias.html`) desenha chips, selects e
          busca em UMA linha. `min-w-` sozinho não vence `w-full` (mesmo grupo de
          utility; a ordem no atributo não desempata).
        */}
        {/*
          ⚠️ O gate é `areaOptionsComFiltroAtivo`, não `areaOptions`: com um
          `?area=` ativo e o catálogo indisponível, esconder o seletor deixaria
          a lista recortada sem nenhum controle que mostre — ou desfaça — o
          recorte (ADO 67961).
        */}
        {areaOptionsComFiltroAtivo.length > 0 && (
          <>
            <label className="sr-only" htmlFor="filtro-area">Filtrar por área</label>
            <Select
              id="filtro-area"
              value={area}
              onChange={(v) => handleAreaChange(v)}
              options={areaOptionsComFiltroAtivo}
              placeholder="Todas as áreas"
              clearable
              variant="boxed"
              className="w-auto min-w-[130px]"
            />
          </>
        )}

        {/* Free-text search */}
        <input
          type="search"
          aria-label="Buscar pendência"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Buscar por pendência, cliente ou OPP..."
          className="min-w-[200px] flex-1 rounded-[var(--radius-xs)] border border-(--color-border-strong) bg-white px-3 py-2 text-(length:--t-caption)"
        />
      </div>

      {/*
        Selo filter chips — counts from porSelo (VBR-431).
        Options derived from Selo enum (no hardcoded strings).
        Shown even when porSelo is absent (counts default to 0).
      */}
      <div
        role="group"
        aria-label="Filtrar por categoria (selo)"
        className="mb-3.5 flex flex-wrap gap-2"
      >
        {SELO_ORDER.map((s) => {
          const count = seloCount(s);
          const { bg, text } = SELO_CLASSES[s];
          const isActive = seloFilter === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={isActive}
              onClick={() => handleSeloChange(isActive ? '' : s)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-(length:--t-small) font-bold transition ${
                isActive
                  ? `${bg} ${text} ring-2 ring-inset ring-current`
                  : `${bg} ${text} opacity-75 hover:opacity-100`
              }`}
            >
              {SELO_LABEL[s]}
              {/* count = measure → neutral font-weight (ADR-0018) */}
              <span className="font-normal">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Loading skeleton */}
      {loadStatus === 'loading' && (
        <div role="status" aria-live="polite" aria-busy="true" className="space-y-2.5">
          <span className="sr-only">Carregando pendências…</span>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {loadStatus === 'error' && (
        <Message>
          <p className="text-(--color-danger)">{error}</p>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="mt-3 cursor-pointer font-bold text-(--secondary-600) hover:underline"
          >
            Tentar novamente
          </button>
        </Message>
      )}

      {/* Loaded state */}
      {loadStatus === 'loaded' && (
        <>
          {items.length === 0 ? (
            <Message>
              <InboxIcon className="mb-1 block text-(length:--t-h2) text-(--neutral-400)" />
              Nenhuma pendência neste filtro.
            </Message>
          ) : (
            <div className="flex flex-col gap-2.5">
              {items.map((item) => (
                <PendencyItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
