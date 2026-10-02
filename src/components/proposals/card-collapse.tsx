"use client";

import { useId, useState } from "react";

/**
 * Collapsible card, as the prototypes do it.
 *
 * `03-proposta-nova.html` / `03-proposta-analise.html` / `03-proposta-ciclo1.html`
 * inject a chevron into every `.block > h3` (`initCollapse()` in `ciclo1.js`) and
 * collapse by hiding the header's siblings — cards start EXPANDED, and the title
 * stays visible so the page keeps its outline while a card is closed.
 *
 * Two pieces, no wrapper component: `useCardCollapse` returns the props the card
 * already has places for (a `data-*` on the `<section>`, another on the header
 * row) and `CardCollapseToggle` is the button that goes at the end of the header.
 * A wrapper would mean restructuring the body of six 1000-line blocks; the CSS
 * rule in `globals.css` does the hiding exactly as the prototype's does.
 */
export interface CardCollapse {
  collapsed: boolean;
  /** Spread on the card's `<section>`. */
  sectionProps: { "data-card-collapsed": "true" | "false" };
  /** Spread on the header row that holds the title (`<div>` with the `h3`). */
  headProps: { "data-card-head": "" };
  /** Spread on {@link CardCollapseToggle}. */
  toggleProps: {
    collapsed: boolean;
    onToggle: () => void;
    controlsId: string;
  };
}

export function useCardCollapse(defaultCollapsed = false): CardCollapse {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const controlsId = useId();

  return {
    collapsed,
    sectionProps: { "data-card-collapsed": collapsed ? "true" : "false" },
    headProps: { "data-card-head": "" },
    toggleProps: {
      collapsed,
      onToggle: () => setCollapsed((c) => !c),
      controlsId,
    },
  };
}

/**
 * The prototype's `.card-tog`: pushed to the right of the header row
 * (`margin-left:auto`), no border, no background, muted chevron that turns green
 * on hover (`#418020` IS `--secondary-500`) and rotates −90° when collapsed.
 *
 * The label flips with the state — a static "Recolher card" lies once the card
 * is closed, and it is the only text a screen reader gets for this control.
 */
export function CardCollapseToggle({
  collapsed,
  onToggle,
  controlsId,
}: CardCollapse["toggleProps"]) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls={controlsId}
      aria-label={collapsed ? "Expandir card" : "Recolher card"}
      data-testid="card-collapse-toggle"
      className="ml-auto flex shrink-0 items-center border-0 bg-transparent p-0.5 text-(--color-text-muted) transition-transform duration-200 hover:text-(--secondary-500)"
      style={{ transform: collapsed ? "rotate(-90deg)" : undefined }}
    >
      {/* Same 16×16 chevron the prototype injects (ciclo1.js:441). */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 6L8 10L12 6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
