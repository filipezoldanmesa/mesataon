'use client';

import { Fragment, useState } from 'react';

import { FieldHint } from '@/components/field-hint';
import type {
  ClientSection,
  DetailField,
  ExpandableTable,
  TableColumn,
  TableSection,
} from '@/lib/clients/types';

/**
 * Class applied to a value that is a gap sentence rather than data (VBR-493).
 *
 * The same treatment the pending section uses, so "awaiting integration" looks
 * the same everywhere on the 360º — a second visual vocabulary for the same
 * fact is what CA-5 forbids.
 */
const PENDING_VALUE_CLASS = 'font-normal opacity-40';

/**
 * Restores full opacity for a value inside a section that is itself muted.
 *
 * A card can mix the two kinds of answer: "Grupo empresa" carries one fact the
 * CRM does know (the group's name, or "Não vinculado a grupo empresa") next to
 * six measures the Tableau and the ARP owe. Muting the whole card would
 * subordinate the fact to the gaps — the exact regression VBR-493 fixed — so
 * the resolved value opts back out of the section's dimming.
 */
const RESOLVED_VALUE_CLASS = 'opacity-100';

function FieldValue({ field }: { field: DetailField }) {
  return (
    <span
      className={field.pending ? PENDING_VALUE_CLASS : RESOLVED_VALUE_CLASS}
      data-pending={field.pending ? 'true' : undefined}
    >
      {field.value}
    </span>
  );
}

/**
 * Shared "mini" table — matches the prototype's `table.mini` (12px bold `th`).
 *
 * `detailKey`, quando presente numa linha, vira uma **sub-linha de largura
 * inteira** logo abaixo dela: é assim que o dossiê do representante aparece sob
 * o sócio a que pertence (09/09/2026). Ela é `colSpan` das colunas todas, muted
 * e sem a borda inferior da linha de cima — para ler como continuação daquela
 * linha, não como um sócio a mais.
 */
function MiniTable({
  columns,
  rows,
  detailKey,
}: {
  columns: TableColumn[];
  rows: Array<Record<string, string>>;
  detailKey?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border-collapse text-(length:--t-caption)">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="border-b border-(--color-border) px-2 py-1.5 text-left text-(length:--t-small) font-bold uppercase tracking-wide text-(--color-text-muted)"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            // Rows carry no id; derive a key from content + index (content
            // alone can collide — e.g. two contacts sharing name/phone/email).
            const rowKey = `${columns.map((col) => row[col.key]).join('|')}#${rowIndex}`;
            const detalhe = detailKey ? row[detailKey] : undefined;
            return (
              <Fragment key={rowKey}>
                <tr>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-2 py-2 text-(--neutral-900) ${
                        // Sem borda quando o dossiê vem logo abaixo: as duas
                        // linhas são o MESMO sócio, e a régua entre elas o
                        // partiria em dois.
                        detalhe ? '' : 'border-b border-(--color-border)'
                      }`}
                    >
                      {row[col.key] ?? ''}
                    </td>
                  ))}
                </tr>
                {detalhe ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="border-b border-(--color-border) px-2 pb-2 text-(length:--t-small) text-(--color-text-muted)"
                      data-testid="linha-detalhe"
                    >
                      {detalhe}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Table section: just the mini table — the footnote is rendered by the card.
 *
 * ⚠️ Tabela SEM linha nenhuma renderiza uma frase, não o cabeçalho sozinho.
 * Medido em staging em 07/09/2026 na conta `1173269`: "Contatos" e "Sócios e
 * representantes" apareciam como uma fileira de rótulos e mais nada — que se lê
 * como "os dados sumiram", e não como "esta conta não tem sócio cadastrado".
 *
 * ⚠️ Seção que JÁ TRAZ `note` não recebe a frase — a nota dela É o estado
 * vazio, e é mais específica. "Garantias vigentes" é o caso: com zero linhas o
 * card já diz "Cliente sem conta de crédito no SAP." ou "Fonte de garantias
 * indisponível", e o rótulo genérico ao lado seria redundante na primeira e
 * FALSO na segunda (afirmaria cadastro vazio sobre uma fonte que caiu — o
 * colapso de significados que a VBR-539 corrigiu na ANP).
 *
 * O texto padrão nomeia o SALESFORCE porque é dele que vêm as duas seções sem
 * nota (contatos e sócios); qualquer outra fonte passa `emptyLabel`.
 */
function TableSectionView({ section }: { section: TableSection }) {
  if (section.rows.length === 0) {
    const frase =
      section.emptyLabel ??
      (section.note
        ? null
        : 'Nada cadastrado no Salesforce para este cliente.');
    if (frase === null) return null;
    return (
      <p
        className="text-(length:--t-caption) text-(--color-text-muted)"
        data-testid={`tabela-vazia-${section.key}`}
      >
        {frase}
      </p>
    );
  }
  return (
    <MiniTable
      columns={section.columns}
      rows={section.rows}
      detailKey={section.detailKey}
    />
  );
}

/** Toggle button + collapsible table nested inside a fields section. */
function ExpandableTableView({ table }: { table: ExpandableTable }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
      >
        {open ? (table.closeLabel ?? '− Ocultar integrantes') : table.toggleLabel}
      </button>
      {open ? (
        <div className="mt-3">
          <MiniTable columns={table.columns} rows={table.rows} />
          {/*
            * ADO 68082 — a tabela pode ser PARCIAL (grupo grande), e a nota é o
            * que impede o leitor de concluir que o conjunto acabou na última
            * linha. Mesmo tratamento visual da nota do card.
            */}
          {table.note ? (
            <p className="mt-2 text-(length:--t-small) text-(--color-text-muted)">
              {table.note}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ClientSectionView({ section }: { section: ClientSection }) {
  return (
    <section className="mb-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-4">
      <h3
        className={`mb-3 text-(length:--t-h4) font-bold text-(--neutral-900) ${
          section.pending ? 'opacity-40' : ''
        }`}
      >
        {section.title}
      </h3>

      {/*
       * When the section is pending (source integration not yet contracted) the
       * whole card — title included — renders at reduced opacity so it reads as
       * "awaiting integration" rather than real data. Any field that DID
       * resolve opts back to full opacity via `RESOLVED_VALUE_CLASS`.
       */}
      <div
        data-pending={section.pending ? 'true' : undefined}
        className={section.pending ? 'opacity-40' : undefined}
      >
        {section.kind === 'fields' ? (
          <>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {section.fields.map((field) => (
                <div key={field.label}>
                  <dt className="text-(length:--t-small) uppercase tracking-wide text-(--color-text-muted)">
                    {field.label}
                    {/* ⓘ do campo — o mesmo affordance do layout do org. */}
                    {field.hint ? (
                      <FieldHint text={field.hint} label={field.label} />
                    ) : null}
                  </dt>
                  <dd className="text-(length:--t-caption) font-bold text-(--neutral-900)">
                    <FieldValue field={field} />
                  </dd>
                </div>
              ))}
            </dl>
            {section.expandable ? <ExpandableTableView table={section.expandable} /> : null}
          </>
        ) : (
          <TableSectionView section={section} />
        )}

        {/*
         * The footnote lives on the CARD, not inside one of the two bodies, so
         * both kinds get it from the same element. It used to sit inside
         * `TableSectionView`, which left a fields card with no way to explain an
         * empty body — and "Dados bancários" is exactly that card: when the
         * client is not a supplier there is no field to hang a gap off, so the
         * sentence is all there is.
         */}
        {section.note ? (
          <p className="mt-2 text-(length:--t-small) text-(--color-text-muted)">{section.note}</p>
        ) : null}
      </div>
    </section>
  );
}
