/**
 * Navigable placeholder for menu routes whose screens are not built yet.
 * Keeps the whole nav clickable without shipping half-done journeys.
 */
export function PlaceholderScreen({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-8 py-16 text-center">
      <h1 className="text-(length:--t-h2) font-bold text-(--neutral-900)">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-(length:--t-caption) text-(--color-text-muted)">
        {description ?? 'Tela em construção — disponível em uma próxima entrega.'}
      </p>
      <span className="mt-5 inline-block rounded-full bg-(--neutral-40) px-3 py-1 text-[11px] font-bold text-(--neutral-600)">
        Em construção
      </span>
    </section>
  );
}
