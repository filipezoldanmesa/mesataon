'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ButtonLink } from '@/components/button-link';
import { ClientSectionView } from '@/components/clients/client-section';
import { NewOpportunityButton } from '@/components/opportunities/new-opportunity-button';
import { StatusPill } from '@/components/status-pill';
import { getClient as defaultLoad } from '@/lib/clients/clients.data';
import { DDI_RISK_PILL } from '@/lib/opportunities/ddi-risk-pill';
import type { ClientDetail } from '@/lib/clients/types';

type Status = 'loading' | 'loaded' | 'error';

type Props = {
  clientId: string;
  /** Injectable for tests; defaults to the BFF-backed API client. */
  load?: (id: string) => Promise<ClientDetail>;
};

export function ClientDetailView({ clientId, load = defaultLoad }: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [client, setClient] = useState<ClientDetail | null>(null);

  useEffect(() => {
    let active = true;
    setStatus('loading');

    load(clientId)
      .then((data) => {
        if (!active) return;
        setClient(data);
        setStatus('loaded');
      })
      .catch(() => {
        if (active) setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [clientId, load]);

  if (status === 'loading') {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="space-y-4">
        <span className="sr-only">Carregando cliente…</span>
        <div className="h-24 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
        <div className="h-64 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
      </div>
    );
  }

  if (status === 'error' || !client) {
    return (
      <section className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-8 py-16 text-center">
        <h1 className="text-(length:--t-h3) font-bold text-(--neutral-900)">
          Cliente não encontrado
        </h1>
        <p className="mx-auto mt-2 max-w-md text-(length:--t-caption) text-(--color-text-muted)">
          Verifique o Código SAP ou consulte o cadastro no Salesforce.
        </p>
        <Link
          href="/clientes"
          className="mt-5 inline-block font-bold text-(--secondary-600) hover:underline"
        >
          ‹ Voltar para Clientes
        </Link>
      </section>
    );
  }

  return (
    <div>
      <header className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-[22px] py-5">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <StatusPill variant={client.kind === 'prospect' ? 'warning' : 'success'}>
            {client.kind === 'prospect' ? 'Prospect' : 'Cadastrado'}
          </StatusPill>
          {/*
            Pílula "Risco DDI Baixo" do protótipo `11-cliente-360.html` (TC 68060).

            Renderiza SOMENTE quando o cliente já tem risco calculado — ou seja,
            já teve oportunidade no VIBRAGO cuja análise de integridade produziu
            classificação. Ausência não é lacuna nomeada: é o estado comum de
            quem nunca teve oportunidade, e uma frase ali ("aguardando análise")
            prometeria um cálculo que a 360º deliberadamente não pede.

            ⚠️ A cor vem do NÍVEL, nunca fixa. O protótipo só desenha o caso
            feliz (`pill s`), e o `variant="success"` copiado dele pintava de
            verde um risco alto — afirmando na tela o contrário do que a análise
            apurou. `DDI_RISK_PILL` é o mesmo mapa do card "Análises" da
            oportunidade, para a mesma análise não ler diferente em duas telas.
          */}
          {client.risk ? (
            <StatusPill
              variant={DDI_RISK_PILL[client.risk].variant}
              data-testid="ddi-risk-pill"
            >
              Risco DDI {DDI_RISK_PILL[client.risk].label}
            </StatusPill>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-(length:--t-h2) font-bold text-(--neutral-900)">
            {/* A prospect has no SAP code (ADR-0055) — no empty "· SAP" suffix. */}
            {client.sapCode ? `${client.name} · SAP ${client.sapCode}` : client.name}
          </h1>
          <NewOpportunityButton clientId={clientId} />
        </div>
        <p className="mt-1 text-(length:--t-caption) text-(--color-text-muted)">
          {[
            client.document,
            client.flag ? `Bandeira ${client.flag}` : null,
            client.location || null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/*
          `min-w-0` é load-bearing: um item de grid tem `min-width: auto`, então
          ele se recusa a encolher abaixo do conteúdo e uma tabela larga estica a
          COLUNA — o `overflow-x-auto` do filho não adianta, porque quem cresceu
          foi o pai. O resultado é a página inteira rolando na horizontal, que o
          CLAUDE.md proíbe. Apareceu quando a tabela de garantias passou de 7
          para 9 colunas (VBR-646).
        */}
        <div className="min-w-0">
          {client.sections.map((section) => (
            <ClientSectionView key={section.key} section={section} />
          ))}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-4">
            <h2 className="mb-2 text-(length:--t-caption) font-bold text-(--neutral-900)">
              Documentos
            </h2>
            {client.documents.length === 0 ? (
              <p className="py-1.5 text-(length:--t-caption) text-(--color-text-muted)">
                Nenhum documento disponível.
              </p>
            ) : (
              <>
                {/*
                  * `doc.name` É a chave porque o card lista TIPOS, e o backend
                  * deduplica por tipo (ADO 67547) — um tipo, uma linha. O
                  * `${name}#${i}` existe só para o skew de deploy (web novo
                  * contra API antiga, que ainda manda um item por arquivo): ali
                  * a chave duplicada é warning de console, e o conserto é do
                  * lado que serve a lista, não deste.
                  */}
                {client.documents.map((doc, i) => (
                  <div
                    key={`${doc.name}#${i}`}
                    className="border-b border-(--color-border) py-1.5 text-(length:--t-caption) last:border-b-0"
                  >
                    <span>{doc.name}</span>
                  </div>
                ))}
              </>
            )}
            <ButtonLink
              href={`/clientes/${clientId}/documentos`}
              className="mt-3 w-full justify-center"
            >
              Gerenciar documentos
            </ButtonLink>
          </div>

          <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-4">
            <h2 className="mb-2 text-(length:--t-caption) font-bold text-(--neutral-900)">
              Oportunidades
            </h2>
            {client.opportunities.length === 0 ? (
              <p className="py-1.5 text-(length:--t-caption) text-(--color-text-muted)">
                Nenhuma oportunidade disponível.
              </p>
            ) : null}
            {client.opportunities.map((opp) => (
              <Link
                key={opp.id}
                href={`/oportunidades/${opp.id}`}
                className="-mx-2 flex items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-(length:--t-caption) transition-colors hover:bg-(--secondary-100)"
              >
                <span className="truncate">
                  <span className="font-medium text-(--neutral-900)">{opp.code}</span>{' '}
                  <span className="text-(--color-text-muted)">· {opp.title}</span>
                </span>
                <StatusPill variant="warning" size="sm">
                  {opp.status}
                </StatusPill>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
