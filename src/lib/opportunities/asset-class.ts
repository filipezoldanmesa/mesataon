import {
  TIPO_PROPOSTA_LABEL,
  TipoProposta,
  isTipoProposta,
} from '@/lib/proposals/franquia-proposal.types';
import type { OpportunityProposal } from '@/lib/opportunities/types';

/**
 * Short pt-BR label per proposal tipo, for the header pills.
 *
 * Deliberately shorter than {@link TIPO_PROPOSTA_LABEL}, which is the sentence
 * form used inside the proposal row ("Franquia BR Mania"). A pill sits beside
 * the phase pill and the code, so it carries the bandeira alone — the word
 * "Franquia" is what the pill's position already says.
 */
const ASSET_CLASS_PILL: Record<TipoProposta, string> = {
  PCR: 'POSTO',
  ZBRM: 'BR MANIA',
  ZLUB: 'LUBRAX+',
};

/** Stable render order, so two opportunities never list the same set differently. */
const ORDER: readonly TipoProposta[] = [
  TipoProposta.PCR,
  TipoProposta.ZBRM,
  TipoProposta.ZLUB,
];

/**
 * Asset classes actually present in the opportunity, derived from its proposals.
 *
 * ## Why this exists
 *
 * The header pill was the literal string `POSTO`, hardcoded in
 * `opportunity-detail.tsx`, and the "Tipo" field of "Dados da oportunidade" was
 * the literal `—`. Two defects of the same class, and the first is the worse
 * one: a freshly created opportunity with **zero proposals** already asserted
 * `POSTO` (measured on OPP-2026-000057, 20/08/2026), and a franchise-only
 * opportunity asserted it too — the home screen counts 3 BR Mania and 2 Lubrax+,
 * so that is not a hypothetical. An invented value is indistinguishable from a
 * real one on screen, which is exactly what the repo's "mock no front nunca"
 * rule exists to prevent.
 *
 * ## What it answers, and what it refuses to answer
 *
 * Returns one entry per DISTINCT tipo among the proposals, in catalog order.
 * Returns `[]` when there is no proposal yet, or when no proposal carries a
 * recognizable `tipoProposta` — and `[]` means "nothing to assert", so the
 * caller renders no pill at all rather than a guess.
 *
 * An opportunity legitimately holds more than one class (a posto plus its BR
 * Mania franchise), so this is a list, never a single value: collapsing it would
 * force a choice between two true answers.
 */
export function opportunityAssetClasses(
  proposals: readonly OpportunityProposal[],
): TipoProposta[] {
  const present = new Set<TipoProposta>();

  for (const p of proposals) {
    // `isTipoProposta` is the same narrowing the rest of the app uses — an
    // unknown backend value is dropped, never mapped to the first enum member.
    if (isTipoProposta(p.tipoProposta)) present.add(p.tipoProposta);
  }

  return ORDER.filter((t) => present.has(t));
}

/** Pill labels for {@link opportunityAssetClasses}. Empty when nothing is assertable. */
export function opportunityAssetClassPills(
  proposals: readonly OpportunityProposal[],
): string[] {
  return opportunityAssetClasses(proposals).map((t) => ASSET_CLASS_PILL[t]);
}

/**
 * Value for the "Tipo" field of "Dados da oportunidade".
 *
 * `null` — not `'—'` — when nothing is assertable, so the caller decides how to
 * render absence. The full label is used here (not the pill form) because the
 * field is read as a sentence, next to "Tipo de negociação".
 */
export function opportunityAssetClassText(
  proposals: readonly OpportunityProposal[],
): string | null {
  const classes = opportunityAssetClasses(proposals);
  if (classes.length === 0) return null;
  return classes.map((t) => TIPO_PROPOSTA_LABEL[t]).join(' · ');
}
