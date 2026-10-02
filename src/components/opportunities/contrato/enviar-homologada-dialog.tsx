'use client';

import { useEffect, useRef, useState } from 'react';

import type { SignatarioHomologada } from '@/lib/contratos/contrato.api';

/**
 * Diálogo "Enviar para assinatura da homologada" (negócio, 13/09/2026).
 *
 * > *"quando o usuário apertar o botão, abre um dialog para ele digitar o nome
 * > e e-mail da homologada (pode ser mais de um nome/email)."*
 *
 * ## Por que digitado, e não escolhido
 *
 * O e-mail da empresa homologada **não existe em fonte nenhuma hoje**: a v0.2 do
 * envelope do Converge não traz a homologada (dos quatro campos de pessoa, o
 * `TerritoryLeaderEmail` medido vem `nossaobra_executivo_vendas` — um username),
 * e nenhuma outra integração o publica. Enquanto a API do Converge não entregar
 * esse dado, quem envia informa. Um seletor aqui ofereceria uma lista que
 * ninguém alimenta.
 *
 * ## O que este diálogo NÃO decide
 *
 * Se o envio é possível — isso é veredito do backend (`termoCessao.podeEnviar`),
 * e a recusa volta como 409 com a frase que diz o que falta. O diálogo só
 * coleta os signatários e mostra o erro sem fechar, para não perder o que foi
 * digitado.
 */
export function EnviarHomologadaDialog({
  pending,
  erro,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  /** Recusa do último envio, renderizada DENTRO do modal (que segue aberto). */
  erro: string | null;
  onCancel: () => void;
  onConfirm: (signatarios: SignatarioHomologada[]) => void | Promise<void>;
}) {
  const primeiroNomeRef = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<SignatarioHomologada[]>([
    { nome: '', email: '' },
  ]);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  useEffect(() => {
    primeiroNomeRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [pending, onCancel]);

  function atualizar(index: number, campo: keyof SignatarioHomologada, valor: string) {
    setLinhas((atual) =>
      atual.map((linha, i) => (i === index ? { ...linha, [campo]: valor } : linha)),
    );
    setErroLocal(null);
  }

  function submeter() {
    const preenchidas = linhas
      .map((l) => ({ nome: l.nome.trim(), email: l.email.trim() }))
      .filter((l) => l.nome !== '' || l.email !== '');

    if (preenchidas.length === 0) {
      setErroLocal('Informe ao menos um signatário da empresa homologada.');
      return;
    }

    // Linha pela metade é recusada em vez de ignorada: descartá-la em silêncio
    // deixaria de fora um signatário que a pessoa acabou de digitar.
    const incompleta = preenchidas.find((l) => l.nome === '' || l.email === '');
    if (incompleta) {
      setErroLocal('Preencha nome e e-mail de todos os signatários informados.');
      return;
    }

    setErroLocal(null);
    void onConfirm(preenchidas);
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="homologada-title"
        data-testid="enviar-homologada-dialog"
        className="w-full max-w-[520px] rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-6 shadow-[var(--shadow-card)]"
      >
        <h3 id="homologada-title" className="text-(length:--t-h4) font-bold">
          Enviar para assinatura da homologada
        </h3>

        <p className="mt-2 text-(length:--t-caption) text-(--color-text-muted)">
          A empresa homologada recebe <b>apenas o Termo de Cessão</b> já assinado
          pelas demais partes — ela não visualiza as outras minutas do pacote.
          Informe quem assina por ela.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {linhas.map((linha, index) => (
            <div
              key={index}
              data-testid={`homologada-linha-${index}`}
              className="flex flex-col gap-2 rounded-[var(--radius-xxs)] border border-(--color-border) p-3 sm:flex-row"
            >
              <label className="flex-1 text-(length:--t-caption)">
                <span className="block font-bold">
                  Nome <span aria-hidden="true" className="text-(--color-danger)">*</span>
                </span>
                <input
                  ref={index === 0 ? primeiroNomeRef : undefined}
                  type="text"
                  value={linha.nome}
                  disabled={pending}
                  onChange={(e) => atualizar(index, 'nome', e.target.value)}
                  aria-label={`Nome do signatário ${index + 1} da empresa homologada`}
                  className="mt-1.5 w-full rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-(--color-surface) px-3 py-2 disabled:opacity-60"
                />
              </label>
              <label className="flex-1 text-(length:--t-caption)">
                <span className="block font-bold">
                  E-mail <span aria-hidden="true" className="text-(--color-danger)">*</span>
                </span>
                <input
                  type="email"
                  value={linha.email}
                  disabled={pending}
                  onChange={(e) => atualizar(index, 'email', e.target.value)}
                  aria-label={`E-mail do signatário ${index + 1} da empresa homologada`}
                  className="mt-1.5 w-full rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-(--color-surface) px-3 py-2 disabled:opacity-60"
                />
              </label>
              {linhas.length > 1 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setLinhas((atual) => atual.filter((_, i) => i !== index))}
                  aria-label={`Remover signatário ${index + 1}`}
                  className="self-end rounded-[var(--radius-xxs)] px-2 py-2 text-(length:--t-caption) font-bold text-(--color-danger) hover:bg-(--color-danger-bg) disabled:opacity-60"
                >
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={pending}
          data-testid="homologada-adicionar"
          onClick={() => setLinhas((atual) => [...atual, { nome: '', email: '' }])}
          className="mt-3 text-(length:--t-caption) font-bold text-(--secondary-500) hover:underline disabled:opacity-60"
        >
          + Adicionar signatário
        </button>

        {(erroLocal ?? erro) && (
          <p
            role="alert"
            data-testid="homologada-erro"
            className="mt-3 text-(length:--t-caption) text-(--color-danger)"
          >
            {erroLocal ?? erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-500) transition hover:bg-(--neutral-50) disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submeter}
            disabled={pending}
            data-testid="homologada-confirmar"
            className="inline-flex items-center rounded-[var(--radius-xxs)] bg-(--secondary-500) px-4 py-2 text-(length:--t-caption) font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
