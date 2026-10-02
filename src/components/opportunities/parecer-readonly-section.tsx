'use client';

import { useCallback, useEffect, useState } from 'react';

import { Spinner } from '@/components/spinner';
import { StatusPill, type PillVariant } from '@/components/status-pill';
import { getParecer as defaultGetParecer } from '@/lib/opportunities/parecer.data';
import type { Parecer, ParecerIndicador } from '@/lib/opportunities/parecer.types';

/**
 * "Parecer técnico — SNEG" em LEITURA (protótipo `01d`), fechando com a linha
 * que diz para onde ele foi.
 *
 * Montado em TODAS as fases a partir da aprovação — aprovação, minuta,
 * contrato, assinatura. Na de contrato ele era um stub (título, frase de rodapé
 * e um comentário dizendo que a CTR-14 montaria o painel), e o parecer é o
 * documento que sustenta o contrato que aquela tela está gerando: ele não muda
 * de conteúdo ao mudar de fase.
 *
 * ⚠️ É também o alvo da âncora `#parecer` do card "Análises". Como o card é o
 * mesmo em todas essas fases, o botão "Ir para o parecer" só não aponta para o
 * vazio porque esta seção acompanha.
 *
 * Deliberadamente NÃO é o `ParecerPanel` do workspace da análise: aquele edita,
 * gera e emite. A partir da aprovação o parecer é documento de registro, e
 * montar o painel editável ofereceria controles que mudam um texto já enviado à
 * aprovação no Salesforce.
 */
export function ParecerReadonlySection({
  opportunityId,
  getParecer = defaultGetParecer,
}: {
  opportunityId: string;
  /** Injectable for tests. */
  getParecer?: (id: string) => Promise<Parecer | null>;
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [parecer, setParecer] = useState<Parecer | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setParecer(await getParecer(opportunityId));
      setStatus('loaded');
    } catch {
      setStatus('error');
    }
  }, [getParecer, opportunityId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section id="parecer" className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h2 className="text-(length:--t-h4) font-bold">Parecer técnico — SNEG</h2>
        <span
          aria-hidden="true"
          className={`transition-transform ${open ? '' : '-rotate-90'}`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open && (
        <div className="mt-4">
          {status === 'loading' && <Spinner label="Carregando parecer…" />}

          {status === 'error' && (
            <p className="text-(length:--t-caption) text-(--color-text-muted)">
              Não foi possível carregar o parecer.
            </p>
          )}

          {status === 'loaded' && !parecer && (
            <p className="text-(length:--t-caption) text-(--color-text-muted)">
              Parecer técnico ainda não emitido para esta oportunidade.
            </p>
          )}

          {status === 'loaded' && parecer && <ParecerCorpo parecer={parecer} />}
        </div>
      )}
    </section>
  );
}

function Pcard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-25) p-4 first:mt-1">
      <div className="mb-2.5 text-(length:--t-caption) font-bold">{titulo}</div>
      {children}
    </div>
  );
}

function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-(length:--t-caption) uppercase tracking-[.3px] text-(--color-text-muted)">
        {label}
      </div>
      <div className="mt-0.5 text-(length:--t-caption) font-bold">{value ?? '—'}</div>
    </div>
  );
}

function Texto({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-(length:--t-caption) leading-relaxed whitespace-pre-line">{children}</p>
  );
}

const NOTA: Record<string, { label: string; pill: PillVariant }> = {
  aprovar: { label: 'Aprovar', pill: 'success' },
  ajustar: { label: 'Ajustar', pill: 'warning' },
  devolver: { label: 'Devolver', pill: 'danger' },
};

/**
 * Situação of an indicator row.
 *
 * "Exceção/Atenção" has ONE colour in this product (`--yellow-700`, ADR-0018),
 * and the situação is the only verdict in the table — the negotiated and
 * reference values are measures and stay neutral.
 */
function situacaoClass(situacao: string | null): string {
  if (situacao === 'padrao') return 'text-(--secondary-600) font-bold';
  if (situacao === 'excecao') return 'text-(--yellow-700) font-bold';
  return 'text-(--color-text-muted)';
}

const SITUACAO_LABEL: Record<string, string> = {
  padrao: 'Padrão',
  excecao: 'Exceção',
};

function fmtNum(v: number | null): string {
  return typeof v === 'number' ? v.toLocaleString('pt-BR') : '—';
}

function ParecerCorpo({ parecer }: { parecer: Parecer }) {
  const cab = parecer.cabecalho;
  const resumo = parecer.resumoNegociacao;
  const vol = parecer.volumeEqualizacao;
  const indicadores: ParecerIndicador[] = parecer.indicadores ?? [];
  const fg = parecer.franquiasGarantias;
  const ader = parecer.aderenciaPolitica;
  const nota = parecer.recomendacao ? NOTA[parecer.recomendacao.nota] : null;

  return (
    <>
      <Pcard titulo="Identificação">
        <div className="grid gap-3 sm:grid-cols-2">
          <Kv label="Oportunidade nº" value={cab?.oportunidadeNumero ?? '—'} />
          <Kv label="Tipo de negociação" value={cab?.tipoNegociacao ?? '—'} />
          <Kv label="Posto / Rede" value={cab?.posto ?? '—'} />
          <Kv label="Localização" value={cab?.localizacao ?? '—'} />
          <Kv label="Regional / GV" value={cab?.regional ?? '—'} />
          <Kv label="Data de emissão" value={fmtData(cab?.dataGeracao ?? null)} />
        </div>
      </Pcard>

      <Pcard titulo="Resumo da negociação">
        <Texto>{resumo?.briefing ?? 'Sem resumo registrado.'}</Texto>
      </Pcard>

      <Pcard titulo="Volume e equalização">
        <div className="grid gap-3 sm:grid-cols-2">
          <Kv label="Volume negociado" value={fmtNum(vol?.volumeNegociado ?? null)} />
          <Kv label="Volume de referência" value={fmtNum(vol?.volumeReferencia ?? null)} />
          <Kv label="Equalização" value={fmtNum(vol?.equalizacao ?? null)} />
        </div>
        {vol?.observacoes && (
          <div className="mt-3">
            <Texto>{vol.observacoes}</Texto>
          </div>
        )}
      </Pcard>

      <Pcard titulo="Indicadores · negociado × referência × situação">
        {indicadores.length === 0 ? (
          <p className="text-(length:--t-caption) text-(--color-text-muted)">
            Nenhum indicador registrado no parecer.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-(length:--t-caption)">
              <thead>
                <tr>
                  {['Indicador', 'Negociado', 'Referência', 'Situação'].map((h) => (
                    <th
                      key={h}
                      className="border-b border-(--color-border) px-2 py-1.5 text-left text-(length:--t-caption) uppercase tracking-[.3px] text-(--color-text-muted)"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {indicadores.map((ind) => (
                  <tr key={ind.nome}>
                    <td className="border-b border-(--color-border) px-2 py-1.5">{ind.nome}</td>
                    <td className="border-b border-(--color-border) px-2 py-1.5">
                      {fmtNum(ind.valorNegociado)}
                    </td>
                    <td className="border-b border-(--color-border) px-2 py-1.5">
                      {fmtNum(ind.valorReferencia)}
                    </td>
                    <td
                      className={`border-b border-(--color-border) px-2 py-1.5 ${situacaoClass(ind.situacao)}`}
                    >
                      {ind.situacao ? (SITUACAO_LABEL[ind.situacao] ?? ind.situacao) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Pcard>

      <Pcard titulo="Franquias e garantias">
        <div className="grid gap-3 sm:grid-cols-2">
          <Kv label="Franquias" value={fg?.franquia ?? '—'} />
          <Kv label="Garantias" value={fg?.garantia ?? '—'} />
        </div>
      </Pcard>

      <Pcard titulo="Aderência à política e alçada">
        <div className="grid gap-3 sm:grid-cols-2">
          <Kv
            label="Aderência"
            value={
              ader ? (
                <StatusPill variant={ader.aderente ? 'success' : 'warning'}>
                  {ader.aderente ? 'Aderente' : 'Com exceções'}
                </StatusPill>
              ) : (
                '—'
              )
            }
          />
          <Kv label="Alçada sugerida" value={parecer.alcadaSugerida?.nivel ?? '—'} />
        </div>
        {parecer.analiseAderencia && (
          <div className="mt-3">
            <Texto>{parecer.analiseAderencia}</Texto>
          </div>
        )}
      </Pcard>

      <Pcard titulo="Recomendação">
        <Kv
          label="Nota do analista"
          value={nota ? <StatusPill variant={nota.pill}>{nota.label}</StatusPill> : '—'}
        />
        {parecer.recomendacao?.parecerExecutivo && (
          <div className="mt-3">
            <Texto>{parecer.recomendacao.parecerExecutivo}</Texto>
          </div>
        )}
      </Pcard>

      <p className="mt-4 text-(length:--t-caption) text-(--color-text-muted)">
        Parecer emitido pela SNEG · enviado para aprovação via Salesforce.
      </p>
    </>
  );
}

function fmtData(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : '—';
}
