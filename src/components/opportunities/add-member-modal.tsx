'use client';

import { DirectoryPickerModal } from '@/components/directory/directory-picker-modal';
import { DirectoryUserList } from '@/components/directory/directory-user-list';
import { isTeamScopedRole } from '@/lib/opportunities/directory.data';
import { searchDirectory as defaultSearch } from '@/lib/opportunities/directory.data';
import type { DirectoryUser } from '@/lib/opportunities/directory.types';
import type { TeamMemberRole } from '@/lib/opportunities/team.types';
import { ROLE_LABELS } from '@/lib/opportunities/team.types';

type Props = {
  /** Target role bucket being filled. */
  role: TeamMemberRole;
  /** User ids already in this role bucket (excluded from results). */
  excludedUserIds?: string[];
  /** Called when user picks a collaborator to add. */
  onAdd: (user: DirectoryUser) => void;
  /** Called to close the modal (X or backdrop click). */
  onClose: () => void;
  /** Injectable for tests. */
  search?: (query: string) => Promise<DirectoryUser[]>;
  /**
   * Título e subtítulo do cabeçalho, e o rótulo da ação em cada linha.
   *
   * Existem porque o MESMO seletor passou a servir a troca do LT principal
   * (ADO 67910), onde "Adicionar à equipe · Demais membros" descreveria o
   * lugar errado. Ausentes, valem os do balde — que é o caso original e
   * continua o padrão.
   */
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  /**
   * Lista já ao abrir, sem exigir termo.
   *
   * Ausente, herda {@link isTeamScopedRole}: um balde É um recorte de grupos do
   * Entra, então listá-lo inteiro é a resposta útil. A troca de LT recorta por
   * PAPEL, que é a mesma natureza — população pequena e governada por IAM.
   */
  autoLoad?: boolean;
};

/**
 * Modal for adding a team member to a role bucket.
 * Matches the prototype `.modal` / "Adicionar à equipe" pattern
 * (`01a-nova-oportunidade.html:219-227`).
 *
 * Casca e lista vivem em `components/directory/` desde o ADO 67877, quando a
 * reatribuição do analista SNEG adotou o mesmo seletor — duas cópias do mesmo
 * modal já haviam divergido (a de lá não tinha debounce, estado de carga nem a
 * distinção entre "grupo vazio" e "fonte caiu").
 */
export function AddMemberModal({
  role,
  excludedUserIds = [],
  onAdd,
  onClose,
  search = defaultSearch,
  title = 'Adicionar à equipe',
  subtitle,
  ctaLabel = '+ Adicionar',
  autoLoad,
}: Props) {
  /*
   * Um balde É um recorte de grupos do Entra: abrir o modal já deve listá-lo,
   * sem exigir que o usuário digite para descobrir quem está lá. Desde
   * 21/08/2026 isso vale para os quatro, "Demais membros" incluído — antes ele
   * era a população geral dos grupos de perfil e a BFF exigia 2 caracteres.
   */
  const autoLoads = autoLoad ?? isTeamScopedRole(role);
  const headerSubtitle = subtitle ?? ROLE_LABELS[role];

  return (
    <DirectoryPickerModal
      title={title}
      subtitle={headerSubtitle}
      onClose={onClose}
    >
      <DirectoryUserList
        search={search}
        onPick={onAdd}
        excludedUserIds={excludedUserIds}
        autoLoad={autoLoads}
        ctaLabel={ctaLabel}
      />
    </DirectoryPickerModal>
  );
}
