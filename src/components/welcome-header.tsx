'use client';

import { NewOpportunityButton } from '@/components/opportunities/new-opportunity-button';
import { useAuth } from '@/hooks/use-auth';
import { useSaudacao } from '@/hooks/use-saudacao';

function firstName(fullName: string | undefined): string {
  return fullName?.trim().split(/\s+/)[0] ?? '';
}

type Props = {
  /**
   * Critical-item count from `saudacao.itensCriticos` (GET /v1/dashboard/resumo).
   * `null` → the phrase is suppressed entirely (CA-4): not "0 itens críticos",
   * just nothing. `undefined` → not yet fetched; also suppresses the phrase.
   */
  itensCriticos?: number | null;
  /**
   * Open-task count from `saudacao.tarefasAbertas`.
   * Same null/undefined rule as {@link itensCriticos}.
   */
  tarefasAbertas?: number | null;
};

/**
 * Home greeting header (protótipo 01-visao-geral, lines 96–99):
 * "{saudação}, {usuário}" on the left (Bom dia / Boa tarde / Boa noite by the
 * viewer's clock — see `useSaudacao`), the critical-items phrase below, and the
 * "+ Nova oportunidade" CTA on the right.
 *
 * The critical-items phrase ("Você tem N itens críticos e M tarefas em aberto")
 * only renders when `itensCriticos` is a non-null number — not when null (source
 * failed) and not when undefined (not yet fetched). This guards CA-4.
 */
export function WelcomeHeader({ itensCriticos, tarefasAbertas }: Props = {}) {
  const { user } = useAuth();
  const name = firstName(user?.name);
  const saudacao = useSaudacao();

  // CA-4: phrase only when itensCriticos is a real number (not null, not undefined).
  const showCritPhrase = typeof itensCriticos === 'number';

  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        {/* Matches the prototype `.page-title`: t-h1 / 700 / -0.6px tracking,
            color inherited from body (--color-text), not forced darker. */}
        <h1 className="my-1 text-(length:--t-h1) font-bold tracking-[-0.6px]">
          {saudacao}{name ? `, ${name}` : ''}
        </h1>
        {showCritPhrase && (
          /* Prototype line 98: "Você tem N itens críticos e M tarefas em aberto na sua carteira."
             Both counts use --red-700 (#791f1f) as a verdict (urgency signal), not a measure.

             ⚠️ "atribuídas a você", NÃO "na sua carteira" (VBR-645). As duas
             contagens são escopadas por `assignee_id` no backend, enquanto o KPI
             "Pendências abertas" logo abaixo é escopado pela CARTEIRA (as
             pendências das oportunidades em que o usuário é `lt_principal`,
             qualquer que seja o responsável). São perguntas diferentes com
             respostas legitimamente diferentes — observado em dev: KPI 1 e
             saudação 0. O sufixo saiu em vez de virar "atribuídas a você"
             porque "Você tem" já diz de quem são, e repetir soaria redundante;
             o que não podia ficar é a frase reivindicando o escopo do KPI.
             O texto do protótipo é de uma tela estática onde só existia uma. */
          <p className="text-(length:--t-caption) text-(--color-text-muted)">
            Você tem{' '}
            <b className="text-(--red-700)">
              {itensCriticos} {plural(itensCriticos, 'item crítico', 'itens críticos')}
            </b>
            {typeof tarefasAbertas === 'number' && (
              <>
                {' '}e{' '}
                <b className="text-(--red-700)">
                  {tarefasAbertas}{' '}
                  {plural(tarefasAbertas, 'tarefa em aberto', 'tarefas em aberto')}
                </b>
                {/*
                  ⚠️ O QUALIFICADOR É LOAD-BEARING (retest 03/09/2026).

                  Sem ele a frase reivindica o escopo do KPI logo abaixo, e as
                  duas contagens leem como contradição: medido em staging,
                  "0 itens críticos e 4 tarefas em aberto" a ~40px de
                  "10 Pendências abertas · na sua carteira". São perguntas
                  diferentes — aqui é `assignee_id`, lá é a CARTEIRA (as
                  oportunidades em que o usuário é `lt_principal`, qualquer que
                  seja o responsável) — e é exatamente a classe de contradição
                  que o ADO 67965 veio corrigir.

                  A decisão anterior (VBR-645) removeu o sufixo "na sua
                  carteira" por ele reivindicar o escopo errado, e não pôs nada
                  no lugar por soar redundante com "Você tem". A evidência de
                  tela diz o contrário: sem qualificador nenhum, quem lê soma as
                  duas frases.
                */}{' '}
                {plural(tarefasAbertas, 'atribuída a você', 'atribuídas a você')}
              </>
            )}
            .
          </p>
        )}
      </div>

      <NewOpportunityButton />
    </div>
  );
}

/**
 * Agreement for the counts in the greeting.
 *
 * The prototype only ever shows the plural numbers (6 and 14), so the singular
 * was never written — and it reads on the home screen of anyone with exactly
 * one open item ("Você tem 1 itens críticos").
 */
function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}
