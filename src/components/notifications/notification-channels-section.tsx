'use client';

import { NotificationToggle } from '@/components/notifications/notification-toggle';
import {
  NOTIFICATION_CHANNEL_LABEL,
  NOTIFICATION_CHANNEL_ORDER,
} from '@/lib/notifications/notifications.types';
import type {
  NotificationChannel,
  NotificationChannelSetting,
} from '@/lib/notifications/notifications.types';

/**
 * A seção **Canais** — o interruptor geral por meio de entrega (21/09/2026).
 *
 * > *"devemos abrir um dialog com o título de Notificações e com uma seção
 * > chamada Canais, lá ele deve poder habilitar ou desabilitar E-mail e Teams.
 * > Por padrão, todos os usuários serão notificados em todos os canais."*
 *
 * Montado pelo diálogo do sino, que é a única superfície de preferência do
 * produto desde que a tela `/notificacoes/preferencias` saiu (29/09/2026).
 *
 * ⚠️ **A frase sobre os avisos obrigatórios não é decoração.** O interruptor
 * não alcança os eventos `obrigatorio` (prazo vencido, devolução ao LT,
 * aprovação pendente); sem dizê-lo, o usuário desliga o canal, continua
 * recebendo, e nada na tela explica por quê.
 *
 * ⚠️ Renderiza **o que veio do backend**, na ordem de
 * {@link NOTIFICATION_CHANNEL_ORDER} e com os desconhecidos no fim pelo próprio
 * código: um canal novo tem de aparecer como `PUSH` em vez de desaparecer da
 * tela sem ninguém notar.
 */
export function NotificationChannelsSection({
  canais,
  canSave,
  onToggle,
  headingId,
}: {
  canais: NotificationChannelSetting[];
  canSave: boolean;
  onToggle: (canal: NotificationChannel, next: boolean) => void;
  /** Id do `<h*>` para o `aria-labelledby` de quem envolve a seção. */
  headingId?: string;
}) {
  const ordered = [...canais].sort(
    (a, b) => orderIndex(a.canal) - orderIndex(b.canal),
  );

  return (
    <section aria-labelledby={headingId ?? 'canais-heading'}>
      <h3
        id={headingId ?? 'canais-heading'}
        className="text-(length:--t-body) font-semibold text-(--neutral-900)"
      >
        Canais
      </h3>
      <p className="mt-1 text-(length:--t-caption) text-(--neutral-500)">
        Escolha por onde quer ser avisado. O sino do topo da tela continua
        recebendo todas as notificações.
      </p>

      {/*
        Lista vazia é alcançável num deploy em rolagem (web novo, API antiga
        ainda sem `canais`). Um cabeçalho "Canais" sobre um bloco em branco não
        diz nada; a frase nomeia a lacuna em vez de deixá-la muda.
      */}
      {ordered.length === 0 && (
        <p className="mt-3 text-(length:--t-caption) text-(--neutral-500)">
          Nenhum canal disponível para configurar no momento.
        </p>
      )}

      <ul className="mt-3 divide-y divide-(--neutral-100) border-y border-(--neutral-100)">
        {ordered.map((c) => (
          <li
            key={c.canal}
            data-testid={`canal-row-${c.canal}`}
            className="flex items-center justify-between gap-4 py-3"
          >
            <span className="text-(length:--t-body) text-(--neutral-900)">
              {NOTIFICATION_CHANNEL_LABEL[c.canal] ?? c.canal}
            </span>
            <NotificationToggle
              checked={c.habilitado}
              disabled={!canSave}
              disabledReason={
                canSave ? undefined : 'Seu perfil não permite alterar'
              }
              label={NOTIFICATION_CHANNEL_LABEL[c.canal] ?? c.canal}
              onChange={(next) => onToggle(c.canal, next)}
            />
          </li>
        ))}
      </ul>

      <p className="mt-3 text-(length:--t-caption) text-(--neutral-500)">
        Avisos obrigatórios — prazo vencido, devolução ao LT e aprovação
        pendente — continuam sendo enviados mesmo com o canal desligado.
      </p>
    </section>
  );
}

/** Canal fora do catálogo conhecido vai para o fim, nunca some da lista. */
function orderIndex(canal: NotificationChannel): number {
  const i = NOTIFICATION_CHANNEL_ORDER.indexOf(canal);
  return i === -1 ? NOTIFICATION_CHANNEL_ORDER.length : i;
}
