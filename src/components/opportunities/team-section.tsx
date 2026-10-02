'use client';

import { useCallback, useEffect, useState } from 'react';

import { usePermissions } from '@/hooks/use-permissions';
import { useOpportunityTeam } from '@/hooks/use-opportunity-team';
import {
  addMember as defaultAdd,
  changePrincipal as defaultChangePrincipal,
  getTeam as defaultGetTeam,
  removeMember as defaultRemove,
} from '@/lib/opportunities/team.data';
import type { DirectoryUser } from '@/lib/opportunities/directory.types';
import {
  isTeamScopedRole,
  searchDirectory as defaultSearchDirectory,
  searchLtCandidates as defaultSearchLtCandidates,
  searchTeamCandidates as defaultSearchTeamCandidates,
} from '@/lib/opportunities/directory.data';
import type { AddTeamMemberPayload, OpportunityTeam, TeamMember, TeamMemberRole } from '@/lib/opportunities/team.types';
import { ALL_ROLES, ROLE_LABELS, teamMemberQualifier } from '@/lib/opportunities/team.types';
import { AddMemberModal } from './add-member-modal';
import { useConfirm } from '@/components/confirm-dialog';

/** Derive 2-letter initials from a full name. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type ChipProps = {
  member: TeamMember;
  canManage: boolean;
  onRemove: (memberId: string) => void;
};

function MemberChip({ member, canManage, onRemove }: ChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-(--neutral-60) px-3 py-1 text-(length:--t-small) font-bold">
      {/* Avatar */}
      <span
        aria-hidden="true"
        className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-(--secondary-300) text-[12px] font-bold text-(--secondary-800)"
      >
        {initials(member.name)}
      </span>
      <span>{member.name}</span>
      {member.isPrincipal && (
        <span className="font-normal text-(--color-text-muted)">· principal</span>
      )}
      {canManage && (
        <button
          type="button"
          aria-label={`Remover ${member.name}`}
          onClick={() => onRemove(member.id)}
          className="ml-0.5 cursor-pointer font-bold leading-none text-(--color-text-muted) opacity-45 hover:text-(--color-danger) hover:opacity-100"
        >
          &times;
        </button>
      )}
    </span>
  );
}

/** Read-only chip for the detail view (01b). */
function DetailChip({ member }: { member: TeamMember }) {
  // Mesma precedência do card do principal e dos chips do detalhe (Bug 67589):
  // perfil → cargo → balde, e o trecho ausente é omitido.
  const parts = [
    teamMemberQualifier(member),
    member.zone ?? member.area,
    member.isPrincipal ? 'principal' : null,
  ].filter(Boolean);
  return (
    <span className="inline-flex items-center rounded-full bg-(--neutral-60) px-3 py-1 text-(length:--t-small) font-bold">
      {member.name}
      {parts.length > 0 && (
        <small className="ml-1 font-normal text-(--color-text-muted)">
          · {parts.join(' · ')}
        </small>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// LT principal card
// ---------------------------------------------------------------------------

type LtCardProps = {
  principal: TeamMember | undefined;
  canManage: boolean;
  /** Recebe o id do usuário no DIRETÓRIO, não o id da linha de equipe. */
  onChangePrincipal: (userId: string) => void;
  /** Busca de candidatos a LT — injetável nos testes. */
  searchLtCandidates: (query: string) => Promise<DirectoryUser[]>;
};

/*
 * ADO 67910 — "Perfil SNEG não altera o LT".
 *
 * O seletor listava apenas os OUTROS membros já na equipe. Numa oportunidade
 * recém-criada o único membro é o próprio LT, então ele abria com nada além de
 * "Selecionar…" — um controle que nunca poderia ser usado. Reproduzido
 * localmente em 26/08/2026: o `<select>` tinha uma única `<option>`.
 *
 * O recorte era só da tela: `OpportunityTeamService.changePrincipal` resolve um
 * id que ainda não é membro no diretório e cria a linha (e promove em lugar
 * quem já é membro, então este caminho continua servindo os dois casos).
 *
 * Passa a ser o MESMO modal de busca da equipe, recortado a `Role.LT` — quem
 * assume o posto é um Líder de Território, e oferecer a população inteira
 * convidaria a escolher alguém que o campo não descreve.
 */
function LtPrincipalCard({
  principal,
  canManage,
  onChangePrincipal,
  searchLtCandidates,
}: LtCardProps) {
  const [picking, setPicking] = useState(false);

  if (!principal) {
    return (
      <div className="mt-3 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-25) px-3.5 py-3 text-(length:--t-small) text-(--color-text-muted)">
        Nenhum LT principal definido.
      </div>
    );
  }

  return (
    <div
      data-testid="lt-principal-card"
      className="mt-3 flex items-center gap-3 rounded-[var(--radius-xs)] border border-(--secondary-200) bg-(--secondary-100) px-3.5 py-3"
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--secondary-300) text-[12px] font-bold text-(--secondary-800)"
      >
        {initials(principal.name)}
      </span>
      <div className="flex-1">
        <div className="font-bold">{principal.name}</div>
        {/*
          Perfil → cargo, NUNCA o balde (Bug 67589).

          `ROLE_LABELS[principal.role]` fazia este card dizer "Demais membros"
          para o LT. O balde do principal é `outros` porque a BFF coage
          `funcao ?? 'outros'` — e `funcao` é nula para ele: o valor é default
          fabricado para o AGRUPAMENTO, não resposta de ninguém. Sob o título
          "LT principal", o balde também não é a informação que o card quer (ele
          já está dito pelos baldes abaixo).

          Por isso o `role` NÃO é passado ao qualificador: o 3º nível dele é o
          balde, e aqui ele só poderia mentir. Sem perfil nem cargo — linha
          anterior à captura do snapshot do diretório — o trecho é OMITIDO, que
          é o contrato do próprio `teamMemberQualifier`.
        */}
        <div className="text-(length:--t-small) text-(--color-text-muted)">
          {[
            teamMemberQualifier({
              roles: principal.roles,
              jobTitle: principal.jobTitle,
            }),
            principal.zone ?? principal.area,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      {canManage && (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="shrink-0 cursor-pointer text-(length:--t-small) font-bold text-(--secondary-600) hover:underline"
        >
          Trocar
        </button>
      )}
      {picking && (
        <AddMemberModal
          // O balde não descreve esta ação; ele só alimenta o default dos
          // rótulos, que aqui são todos sobrescritos.
          role="outros"
          title="Trocar LT principal"
          subtitle="Líder de Território"
          ctaLabel="Definir como LT"
          autoLoad
          excludedUserIds={[principal.userId]}
          search={searchLtCandidates}
          onAdd={(user) => {
            onChangePrincipal(user.id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export type TeamSectionMode = 'edit' | 'view';

type DataFns = {
  getTeam: (opportunityId: string) => Promise<OpportunityTeam>;
  addMember: (opportunityId: string, payload: AddTeamMemberPayload) => Promise<TeamMember>;
  removeMember: (opportunityId: string, memberId: string) => Promise<void>;
  changePrincipal: (opportunityId: string, memberId: string) => Promise<TeamMember>;
};

type Props = {
  opportunityId: string;
  /**
   * `edit` — bucket layout with add/remove actions (used in creation / 01a).
   * `view` — flat chip list with role labels (used in detail / 01b).
   */
  mode?: TeamSectionMode;
  /** Injectable for tests. */
  dataFns?: DataFns;
  /**
   * Busca no grupo do Entra de um balde de executivo (ADR-0043). Injetável para
   * testes.
   */
  searchTeamCandidates?: (
    funcao: TeamMemberRole,
    q: string,
  ) => Promise<DirectoryUser[]>;
  /**
   * Busca na população geral (os 12 grupos de perfil) — atende só o balde
   * "Demais membros". Injetável para testes.
   */
  searchDirectory?: (q: string) => Promise<DirectoryUser[]>;
  /** Candidatos a LT principal (ADO 67910) — injetável nos testes. */
  searchLtCandidates?: (q: string) => Promise<DirectoryUser[]>;
};

const DEFAULT_FNS: DataFns = {
  getTeam: defaultGetTeam,
  addMember: defaultAdd,
  removeMember: defaultRemove,
  changePrincipal: defaultChangePrincipal,
};

/**
 * Reusable Team section for the opportunity screens.
 *
 * - `mode="edit"` (default): bucket view by role with "+ Adicionar" / × remove
 *   and principal LT card. Used in the creation step (01a).
 * - `mode="view"`: flat chip list matching the detail screen (01b).
 *
 * Covers 4 UI states: idle (auto-loads), loading, loaded (empty / filled),
 * and error.
 */
export function TeamSection({
  opportunityId,
  mode = 'edit',
  dataFns = DEFAULT_FNS,
  searchTeamCandidates = defaultSearchTeamCandidates,
  searchDirectory = defaultSearchDirectory,
  searchLtCandidates = defaultSearchLtCandidates,
}: Props) {
  /** Read-only profiles get no write controls (mirrors ReadOnlyProfileGuard). */
  const { canWrite } = usePermissions();
  /** Confirmação das ações destrutivas desta tela. */
  const confirm = useConfirm();
  const [addingRole, setAddingRole] = useState<TeamMemberRole | null>(null);
  const [actionError, setActionError] = useState('');

  const { status, team, error, loadTeam, addMember, removeMember, changePrincipal } =
    useOpportunityTeam(opportunityId, dataFns);

  /*
   * Which population the modal searches is decided by the bucket being filled:
   * every bucket reads the Entra groups that back it — including "Demais
   * membros", the Visualizador + Gerente Varejo slice since 2026-08-21
   * (ADR-0043).
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

  // Load team on mount.
  useEffect(() => {
    void loadTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId]);

  async function handleAdd(role: TeamMemberRole, user: DirectoryUser) {
    /*
     * Read-only profile: the API answers 403, and a form still submits on Enter
     * even with the button hidden — so the guard lives in the handler too.
     */
    if (!canWrite) return;
    setActionError('');
    const err = await addMember({ userId: user.id, role });
    if (err) setActionError(err);
    setAddingRole(null);
  }

  async function handleRemove(memberId: string) {
    /*
     * Read-only profile: the API answers 403, and a form still submits on Enter
     * even with the button hidden — so the guard lives in the handler too.
     */
    if (!canWrite) return;
    setActionError('');
    const err = await removeMember(memberId);
    if (err) setActionError(err);
  }

  async function handleChangePrincipal(userId: string) {
    /*
     * Read-only profile: the API answers 403, and a form still submits on Enter
     * even with the button hidden — so the guard lives in the handler too.
     */
    if (!canWrite) return;
    setActionError('');
    const err = await changePrincipal(userId);
    if (err) setActionError(err);
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (status === 'idle' || status === 'loading') {
    return (
      <div
        role="status"
        aria-label="Carregando equipe"
        className="flex items-center gap-2 py-4 text-(length:--t-caption) text-(--color-text-muted)"
      >
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--secondary-400) border-t-transparent" />
        Carregando equipe…
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div
        role="alert"
        className="rounded-[var(--radius-xs)] border border-(--color-danger-bg) bg-(--color-danger-bg) px-4 py-3 text-(length:--t-caption)"
      >
        <span className="text-(--color-danger)">{error}</span>{' '}
        <button
          type="button"
          onClick={() => void loadTeam()}
          className="cursor-pointer font-bold text-(--secondary-600) hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const members = team?.members ?? [];
  /*
   * `canWrite` entra no MESMO predicado que renderiza os controles, não só nos
   * handlers. `canManage` vem da BFF, que hoje o fixa em `true` ("no backend
   * field yet — the RolesGuard still enforces mutations server-side"), então um
   * perfil somente-leitura recebia "+ Adicionar" e o × de remover, e o clique
   * caía no `if (!canWrite) return` dos handlers: controle morto, o anti-padrão
   * que este repo recusa. Latente enquanto este componente não era montado em
   * tela nenhuma; passou a ser alcançável ao montá-lo na oportunidade salva.
   */
  const canManage = (team?.canManage ?? false) && canWrite;
  const principal = members.find((m) => m.isPrincipal);

  // ── View mode (01b detail — flat chips) ──────────────────────────────────
  if (mode === 'view') {
    return (
      <div>
        {members.length === 0 ? (
          <p className="text-(length:--t-small) text-(--color-text-muted)">
            Nenhum membro na equipe.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <DetailChip key={m.id} member={m} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Edit mode (01a creation — buckets by role) ────────────────────────────
  return (
    <div>
      {confirm.dialog}
      {/* Action error banner */}
      {actionError && (
        <div
          role="alert"
          className="mb-3 rounded-[var(--radius-xs)] border border-(--color-danger-bg) bg-(--color-danger-bg) px-3 py-2 text-(length:--t-small) text-(--color-danger)"
        >
          {actionError}
        </div>
      )}

      {/* Principal LT */}
      {(principal || canManage) && (
        <div className="mb-4">
          <span className="block text-[12px] font-bold uppercase tracking-[.3px] text-(--color-text-muted)">
            LT principal
          </span>
          <LtPrincipalCard
            principal={principal}
            canManage={canManage}
            onChangePrincipal={handleChangePrincipal}
            searchLtCandidates={searchLtCandidates}
          />
        </div>
      )}

      {/* Role buckets */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 max-[600px]:grid-cols-1">
        {ALL_ROLES.map((role) => {
          const roleMembers = members.filter((m) => m.role === role);
          return (
            <div key={role}>
              <span className="block text-[12px] font-bold uppercase tracking-[.3px] text-(--color-text-muted)">
                {ROLE_LABELS[role]}
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {roleMembers.length === 0 ? (
                  <span className="text-(length:--t-small) text-(--color-text-muted)">
                    Ninguém adicionado
                  </span>
                ) : (
                  roleMembers.map((m) => (
                    <MemberChip
                      key={m.id}
                      member={m}
                      canManage={canManage}
                      onRemove={(memberId) =>
                        confirm.ask({
                          title: `Remover ${m.name} da equipe?`,
                          // VBR-546: sair da equipe passou a REVOGAR o acesso —
                          // antes era só sumir deste card. A confirmação tem de
                          // dizer a consequência, senão o botão promete menos do
                          // que faz.
                          description: `${m.name} perde o acesso a esta oportunidade e ela deixa de aparecer na lista dele.`,
                          confirmLabel: 'Remover',
                          tone: 'danger',
                          onConfirm: () => handleRemove(memberId),
                        })
                      }
                    />
                  ))
                )}
              </div>
              {canManage && (
                <button
                  type="button"
                  // Four identical "+ Adicionar" buttons are ambiguous to a
                  // screen reader; the bucket is what distinguishes them.
                  aria-label={`Adicionar · ${ROLE_LABELS[role]}`}
                  onClick={() => setAddingRole(role)}
                  className="mt-2 cursor-pointer rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-white px-3 py-1.5 text-(length:--t-small) font-bold text-(--secondary-600) hover:bg-(--secondary-100)"
                >
                  + Adicionar
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add member modal */}
      {addingRole && (
        <AddMemberModal
          role={addingRole}
          excludedUserIds={members
            .filter((m) => m.role === addingRole)
            .map((m) => m.userId)}
          search={searchForBucket}
          onAdd={(user) => void handleAdd(addingRole, user)}
          onClose={() => setAddingRole(null)}
        />
      )}
    </div>
  );
}
