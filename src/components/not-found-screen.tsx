import { ButtonLink } from '@/components/button-link';

/**
 * "Página não encontrada" — the SINGLE screen shown both for a route that does
 * not exist (`app/not-found.tsx`) and for a route the signed-in profile may not
 * open ({@link RequirePermission}).
 *
 * Why the two are indistinguishable: answering "você não tem permissão" confirms
 * that the route (and the resource behind it) exists, which lets anyone with a
 * session enumerate the app's restricted surface — the analyst workspace, the
 * parametrization screens, tomorrow's admin area. The caller who is authorized
 * sees the screen; everyone else cannot tell a gated route from a typo.
 *
 * Keep the copy free of any hint of authorization ("restrito", "permissão",
 * "perfil"). The API mirrors the same posture with its own status codes.
 */
export function NotFoundScreen() {
  return (
    <section
      data-testid="not-found"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-8 py-16 text-center"
    >
      <h1 className="text-(length:--t-h2) font-bold text-(--neutral-900)">
        Página não encontrada
      </h1>
      <p className="mx-auto mt-2 max-w-md text-(length:--t-caption) text-(--color-text-muted)">
        O endereço acessado não existe ou não está mais disponível.
      </p>
      <div className="mt-5 flex justify-center">
        <ButtonLink href="/" variant="ghost">
          Voltar para a visão geral
        </ButtonLink>
      </div>
    </section>
  );
}
