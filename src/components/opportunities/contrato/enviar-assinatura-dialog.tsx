'use client';

import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignatarioInput {
  nome: string;
  email: string;
}

export interface EnviarAssinaturaPayload {
  /**
   * Correção do e-mail do signatário #1 (o LT). Presente só quando o backend
   * marcou o endereço como editável — ver `signatarioLt` em Props.
   */
  ltEmail?: string;
  clientesSignatarios: SignatarioInput[];
  /**
   * Representantes da Vibra / BR Mania / Lubrax — **um ou mais** (11/09/2026).
   * Assinam em sequência depois dos sócios, cada um com a sua própria ordem no
   * DocuSign. Espelha `EnviarAssinaturaDto.representantesVibra`.
   */
  representantesVibra: SignatarioInput[];
  testemunhas: SignatarioInput[];
}

type Props = {
  open: boolean;
  /**
   * Signatário #1 já resolvido pelo backend (`readiness.assinatura.signatarioLt`).
   *
   * Renderizado como DADO quando `editavel` é falso — o endereço vem do
   * diretório corporativo, é governado por IAM e a rota de envio recusa a
   * sobrescrita —, e como campo quando é verdadeiro: aí ele veio do snapshot da
   * criação e pode simplesmente não entregar (medido em 20/08/2026: o DocuSign
   * devolveu bounce e o envelope morreu na ordem 1). `null` não deveria chegar
   * aqui, porque o CTA fica bloqueado com `lt_nao_resolvido`.
   */
  signatarioLt?: { nome: string; email: string; editavel: boolean } | null;
  /**
   * Gerente/líder do LT resolvido pelo backend
   * (`readiness.assinatura.representanteSugerido`), usado para PRÉ-PREENCHER a
   * primeira linha de "Representantes da Vibra".
   *
   * ⚠️ `null` = **sem fonte**, e o formulário então deixa a linha em branco e
   * NOMEIA a lacuna. Nunca um substituto plausível: num envelope de assinatura,
   * um signatário verossímil e errado é pior do que um campo vazio.
   */
  representanteSugerido?: { nome: string; email: string } | null;
  /** Disables every control while the request is in flight. */
  pending?: boolean;
  /**
   * Recusa do servidor ao último envio, em pt-BR.
   *
   * Fica AQUI, e não num toast, porque o modal continua aberto depois da falha
   * (para não perder o que foi digitado) e o toast nasce atrás dele. Medido no
   * stage em 11/09/2026: a recusa do DocuSign — minuta sem o marcador de
   * assinatura — apareceu como `Erro: Unprocessable Entity` numa faixa preta
   * encoberta pelo modal, e quem estava enviando não tinha como ler nem o
   * motivo nem, depois, o conserto.
   */
  error?: string | null;
  onCancel: () => void;
  onSubmit: (payload: EnviarAssinaturaPayload) => void;
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Mirrors the backend DTO (`EnviarAssinaturaDto`): at least one client signer, a
 * Vibra representative, optional witnesses, and a valid e-mail everywhere.
 *
 * Validating here is UX only — `class-validator` on the API is the enforcement
 * point. What it buys is that the user sees "e-mail inválido" next to the field
 * instead of a generic `400 VALIDATION_ERROR` toast.
 */
export function validateEnviarAssinatura(
  payload: EnviarAssinaturaPayload,
): string | null {
  const emailOk = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  // A correção do LT é opcional; quando vem, tem de ser um endereço válido —
  // um e-mail torto aqui derruba a ordem 1 e o envelope inteiro para com ela.
  if (payload.ltEmail !== undefined && !emailOk(payload.ltEmail)) {
    return 'E-mail inválido para o signatário 1 (LT).';
  }

  const clientes = payload.clientesSignatarios.filter(
    (s) => s.nome.trim() || s.email.trim(),
  );
  if (clientes.length === 0) {
    return 'Informe ao menos um signatário do cliente (sócio conforme contrato social).';
  }
  for (const c of clientes) {
    if (!c.nome.trim()) return 'Todo signatário do cliente precisa de nome.';
    if (!emailOk(c.email)) return `E-mail inválido para o signatário "${c.nome.trim()}".`;
  }

  const representantes = payload.representantesVibra.filter(
    (s) => s.nome.trim() || s.email.trim(),
  );
  if (representantes.length === 0) {
    return 'Informe ao menos um representante da Vibra / BR Mania / Lubrax.';
  }
  for (const r of representantes) {
    if (!r.nome.trim()) return 'Todo representante Vibra precisa de nome.';
    if (!emailOk(r.email)) {
      return `E-mail inválido para o representante "${r.nome.trim()}".`;
    }
  }

  // Witnesses are NOT part of the default chain — they are an exception per
  // minuta type (design briefing 2026-07-27, item 14), which is why the API has
  // no `@ArrayMinSize` on `testemunhas`. An empty list is valid; a filled row
  // still has to be complete.
  const testemunhas = payload.testemunhas.filter(
    (s) => s.nome.trim() || s.email.trim(),
  );
  for (const t of testemunhas) {
    if (!t.nome.trim()) return 'Toda testemunha precisa de nome.';
    if (!emailOk(t.email)) return `E-mail inválido para a testemunha "${t.nome.trim()}".`;
  }

  return null;
}

/** Trims every field and drops the rows the user left completely blank. */
function normalize(payload: EnviarAssinaturaPayload): EnviarAssinaturaPayload {
  const clean = (list: SignatarioInput[]): SignatarioInput[] =>
    list
      .filter((s) => s.nome.trim() || s.email.trim())
      .map((s) => ({ nome: s.nome.trim(), email: s.email.trim() }));

  return {
    // Campo em branco não é correção: some do payload para o backend usar o
    // e-mail que ele mesmo resolveu.
    ...(payload.ltEmail?.trim() ? { ltEmail: payload.ltEmail.trim() } : {}),
    clientesSignatarios: clean(payload.clientesSignatarios),
    representantesVibra: clean(payload.representantesVibra),
    testemunhas: clean(payload.testemunhas),
  };
}

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

function TextField({
  id,
  label,
  value,
  placeholder,
  type = 'text',
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  type?: 'text' | 'email';
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      <label
        htmlFor={id}
        className="block text-(length:--t-caption) text-(--color-text-muted)"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-[var(--radius-xxs)] border border-(--color-border) px-3 py-2 text-(length:--t-caption) focus:border-(--secondary-500) focus:outline-none disabled:opacity-60"
      />
    </div>
  );
}

/** Editable list of name/e-mail pairs (client signers, witnesses). */
function SignatarioList({
  idPrefix,
  legend,
  hint,
  rows,
  minRows = 1,
  disabled,
  onChange,
}: {
  idPrefix: string;
  legend: string;
  hint: string;
  rows: SignatarioInput[];
  /**
   * Rows that cannot be removed. 1 for client signatories (the API requires at
   * least one); 0 for witnesses, which are an exception rather than part of the
   * default chain.
   */
  minRows?: number;
  disabled?: boolean;
  onChange: (rows: SignatarioInput[]) => void;
}) {
  function patch(index: number, field: keyof SignatarioInput, v: string): void {
    onChange(rows.map((r, i) => (i === index ? { ...r, [field]: v } : r)));
  }

  return (
    <fieldset className="mt-4">
      <legend className="text-(length:--t-caption) font-bold">{legend}</legend>
      <p className="mt-0.5 text-(length:--t-caption) text-(--color-text-muted)">
        {hint}
      </p>

      <div className="mt-2 flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <TextField
              id={`${idPrefix}-nome-${i}`}
              label="Nome"
              value={row.nome}
              disabled={disabled}
              onChange={(v) => patch(i, 'nome', v)}
            />
            <TextField
              id={`${idPrefix}-email-${i}`}
              label="E-mail"
              type="email"
              value={row.email}
              disabled={disabled}
              onChange={(v) => patch(i, 'email', v)}
            />
            {rows.length > minRows && (
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remover ${legend} ${i + 1}`}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="shrink-0 rounded-[var(--radius-xxs)] border border-(--color-border) px-2.5 py-2 text-(length:--t-caption) font-bold text-(--color-text-muted) hover:bg-(--neutral-40) disabled:opacity-60"
              >
                Remover
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...rows, { nome: '', email: '' }])}
        className="mt-2 text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline disabled:opacity-60"
      >
        + Adicionar
      </button>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

/**
 * Collects the signatories for `POST .../contrato/assinatura:enviar`.
 *
 * The backend requires them (`EnviarAssinaturaDto`) and derives the signing
 * order LT → CLIENTE → REPRESENTANTE_VIBRA → TESTEMUNHA from the roles (PRD
 * §7.2, decision validated 08/07). A IDENTIDADE do LT continua vindo do
 * agregado, nunca do corpo — tirá-la da requisição quebraria o ator
 * não-repudiável da auditoria. O que este formulário pode tocar é o ENDEREÇO,
 * e só quando o backend disser que ele é editável (`signatarioLt.editavel`):
 * e-mail do diretório corporativo é governado por IAM, e-mail do snapshot da
 * criação pode não entregar.
 *
 * Witnesses start empty: they are an exception per minuta type, not part of the
 * default chain (design briefing 2026-07-27, item 14).
 */
export function EnviarAssinaturaDialog({
  open,
  pending = false,
  signatarioLt = null,
  representanteSugerido = null,
  error = null,
  onCancel,
  onSubmit,
}: Props) {
  const [clientes, setClientes] = useState<SignatarioInput[]>([
    { nome: '', email: '' },
  ]);
  // Pré-preenchido com o endereço que o backend resolveu: o campo é para
  // CORRIGIR um e-mail que não entrega, não para descobrir qual é.
  const [ltEmail, setLtEmail] = useState(signatarioLt?.email ?? '');
  // Pré-preenchido com o gerente do LT quando o backend o resolveu; em branco
  // quando não há fonte (a lacuna é nomeada abaixo da legenda).
  const [representantes, setRepresentantes] = useState<SignatarioInput[]>([
    representanteSugerido
      ? { nome: representanteSugerido.nome, email: representanteSugerido.email }
      : { nome: '', email: '' },
  ]);
  // Starts empty: the default chain is LT → cliente → representante Vibra.
  // A witness is added only for the minuta types that require one.
  const [testemunhas, setTestemunhas] = useState<SignatarioInput[]>([]);
  // Problema do formulário, detectado aqui. Distinto de `error` (a recusa do
  // servidor), e com precedência sobre ele: descreve o que está na tela agora.
  const [localError, setLocalError] = useState<string | null>(null);

  // O read model é relido a cada abertura da tela; sem isto o campo ficaria com
  // o endereço da primeira renderização depois de uma correção de cadastro.
  useEffect(() => {
    setLtEmail(signatarioLt?.email ?? '');
  }, [signatarioLt?.email]);

  /*
   * Mesma razão do efeito acima: o read model é relido a cada abertura da tela,
   * e sem isto a sugestão ficaria presa na primeira renderização — que, num
   * primeiro carregamento ainda sem `contrato`, é `null`.
   *
   * Só semeia enquanto a primeira linha está INTACTA: sobrescrever o que a
   * pessoa digitou seria um formulário que apaga o trabalho dela ao revalidar.
   */
  useEffect(() => {
    if (!representanteSugerido) return;
    setRepresentantes((atual) => {
      const [primeira, ...resto] = atual;
      if (primeira && (primeira.nome.trim() || primeira.email.trim())) return atual;
      return [
        { nome: representanteSugerido.nome, email: representanteSugerido.email },
        ...resto,
      ];
    });
  }, [representanteSugerido?.nome, representanteSugerido?.email]);

  // Esc closes, but never mid-request: the envelope call is already in flight
  // and closing would hide the pending state from the user.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !pending) onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, pending, onCancel]);

  if (!open) return null;

  function handleSubmit(): void {
    const payload = normalize({
      // Só viaja quando o backend permite corrigir — mandar sempre faria a rota
      // recusar (400) todo envio cujo LT veio do diretório.
      ...(signatarioLt?.editavel ? { ltEmail } : {}),
      clientesSignatarios: clientes,
      representantesVibra: representantes,
      testemunhas,
    });

    const problem = validateEnviarAssinatura(payload);
    if (problem) {
      setLocalError(problem);
      return;
    }

    setLocalError(null);
    onSubmit(payload);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!pending) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="enviar-assinatura-title"
        className="max-h-[85vh] w-full max-w-[560px] overflow-y-auto rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-6 py-5 shadow-[0_24px_60px_rgba(0,0,0,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="enviar-assinatura-title"
          className="text-(length:--t-h4) font-bold text-(--neutral-900)"
        >
          Enviar para assinatura
        </h2>
        {/*
         * NOT "você (LT)": this dialog is gated to SNEG/TI Admin, so the person
         * reading it is never the LT. Signatory #1 is the LT **of the
         * opportunity**, resolved by the backend from its creator — saying
         * "você" told the analyst they were about to sign the contract.
         */}
        <p className="mt-2 text-(length:--t-caption) text-(--color-text-muted)">
          Um envelope único é criado no DocuSign com todas as minutas. A ordem de
          assinatura é definida pelo sistema: o LT da oportunidade assina primeiro,
          depois os sócios do cliente, o representante Vibra e, por fim, as
          testemunhas.
        </p>

        {/*
          * Ordem 1 explícita. Antes o LT era invisível no formulário, então o
          * analista não tinha como notar que o envelope ia para um endereço
          * errado — e quando o e-mail não entrega, o envelope morre na ordem 1
          * sem chegar a ninguém (medido em 20/08/2026).
          */}
        {signatarioLt ? (
          <fieldset className="mt-4">
            <legend className="text-(length:--t-caption) font-bold">
              1 · LT da oportunidade
            </legend>
            <p className="mt-1 text-(length:--t-caption) text-(--color-text-muted)">
              {signatarioLt.editavel
                ? 'Assina primeiro. Corrija o e-mail se este endereço não recebe.'
                : 'Assina primeiro. E-mail do diretório corporativo — alterações são feitas no cadastro do colaborador.'}
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <span className="block text-(length:--t-caption) text-(--color-text-muted)">
                  Nome
                </span>
                <p className="mt-1 text-(length:--t-caption) font-bold text-(--neutral-900)">
                  {signatarioLt.nome}
                </p>
              </div>
              {signatarioLt.editavel ? (
                <TextField
                  id="lt-email"
                  label="E-mail"
                  type="email"
                  value={ltEmail}
                  disabled={pending}
                  onChange={setLtEmail}
                />
              ) : (
                <div className="min-w-0 flex-1">
                  <span className="block text-(length:--t-caption) text-(--color-text-muted)">
                    E-mail
                  </span>
                  <p className="mt-1 text-(length:--t-caption) text-(--neutral-900)">
                    {signatarioLt.email}
                  </p>
                </div>
              )}
            </div>
          </fieldset>
        ) : null}

        <SignatarioList
          idPrefix="cliente"
          legend="Signatários do cliente"
          hint="Sócios conforme o contrato social, com os e-mails informados pelo LT."
          rows={clientes}
          disabled={pending}
          onChange={setClientes}
        />

        {/*
          * Lista, não par de campos: um mesmo pacote pode exigir mais de um
          * representante (ex.: o gerente do LT e o responsável pela franquia), e
          * com um só campo o segundo simplesmente não entrava no envelope.
          *
          * A dica MUDA com a origem da primeira linha: dizer "preenchido com o
          * gerente do LT" quando não houve fonte alguma faria o campo vazio
          * parecer defeito da tela. A lacuna é nomeada, nunca preenchida.
          */}
        <SignatarioList
          idPrefix="vibra"
          legend="Representantes da Vibra / BR Mania / Lubrax"
          hint={
            representanteSugerido
              ? 'Primeira linha preenchida com o gerente do LT, conforme o diretório — ajuste se não for quem assina. Assinam depois dos sócios.'
              : 'Não foi possível resolver o gerente do LT no diretório: informe quem assina pela Vibra. Assinam depois dos sócios.'
          }
          rows={representantes}
          disabled={pending}
          onChange={setRepresentantes}
        />

        <SignatarioList
          idPrefix="testemunha"
          legend="Testemunhas (opcional)"
          hint="Testemunha não faz parte da cadeia padrão — adicione apenas para os tipos de minuta que exigem. Assinam depois do representante Vibra."
          rows={testemunhas}
          minRows={0}
          disabled={pending}
          onChange={setTestemunhas}
        />

        {/*
          * UM só `role="alert"`: dois quebram todo `getByRole('alert')` da
          * suíte (`Found multiple elements`) e empilham duas razões
          * contraditórias na frente do usuário.
          */}
        {(localError ?? error) && (
          <p
            role="alert"
            className="mt-4 text-(length:--t-caption) text-(--color-danger)"
          >
            {localError ?? error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2.25 text-(length:--t-caption) font-bold text-(--secondary-500) hover:bg-(--neutral-50) disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="inline-flex items-center rounded-[var(--radius-xxs)] border border-transparent bg-(--secondary-500) px-4 py-2.25 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Enviando…' : 'Enviar para assinatura'}
          </button>
        </div>
      </div>
    </div>
  );
}
