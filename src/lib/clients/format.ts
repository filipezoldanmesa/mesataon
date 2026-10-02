function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function applyMask(digits: string, mask: string): string {
  let out = '';
  let i = 0;
  for (const ch of mask) {
    if (i >= digits.length) break;
    if (ch === '#') {
      out += digits[i];
      i += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Máximo de dígitos de um CPF. É o divisor entre as duas máscaras E entre os
 * dois rótulos — {@link formatTaxId} e {@link taxIdLabel} leem daqui de
 * propósito: se cada um tivesse o seu, a tela poderia escrever "CPF" sobre um
 * valor formatado como CNPJ, que é a mesma classe de defeito que o rótulo fixo
 * produzia.
 */
const CPF_MAX_DIGITS = 11;

/**
 * Maior Código SAP possível, em dígitos — o piso a partir do qual um termo
 * numérico só pode ser documento.
 *
 * Medido no org em 26/08/2026, recorte DCVIM (55.725 contas):
 *
 * | Dígitos | Contas |
 * |---|---|
 * | 3 | 293 |
 * | 4 | 4.461 |
 * | 5 | 16.427 |
 * | 6 | 17.069 |
 * | 7 | **17.474** |
 * | 8 | 1 |
 *
 * O piso era **6**, e com ele quem digitava um código de 7 dígitos via
 * `1853611` virar `185.361.1` na tela — a máscara de CPF sobre um Código SAP.
 * Não é caso de borda: 7 dígitos são **31% da base**, a faixa mais numerosa.
 *
 * A busca continuava funcionando (o backend normaliza para dígitos), mas o
 * campo contradizia o que a pessoa acabou de digitar, e o placeholder promete
 * justamente "Código SAP, CNPJ, nome ou cidade".
 */
const MAX_SAP_CODE_DIGITS = 8;

/**
 * Formats a client search term as CPF/CNPJ while it is clearly a document
 * (digits-only and longer than any SAP code). Free text (razão social /
 * cidade) is returned unchanged, since the search box is a single entry that
 * accepts all of them (PRD Cliente §7.1 / HU-01).
 *
 * ⚠️ **Enquanto o termo couber num Código SAP, NADA é mascarado** — as duas
 * famílias se sobrepõem em comprimento e o usuário digitou um número, não
 * declarou um campo (a mesma razão pela qual `classifyTerm`, no backend, tenta
 * as duas). Consequência aceita: quem digita CNPJ vê os 8 primeiros dígitos
 * crus e a máscara aparece a partir do 9º. É o preço de um campo único que
 * aceita os dois — e o inverso (mascarar cedo) escreve na tela um número que
 * ninguém digitou.
 */
export function maskClientQuery(value: string): string {
  if (/[a-zA-Z]/.test(value)) return value; // razão social / cidade
  const digits = onlyDigits(value);
  if (digits.length <= MAX_SAP_CODE_DIGITS) return value; // Código SAP → cru
  if (digits.length <= CPF_MAX_DIGITS) {
    return applyMask(digits.slice(0, CPF_MAX_DIGITS), '###.###.###-##'); // CPF
  }
  return applyMask(digits.slice(0, 14), '##.###.###/####-##'); // CNPJ
}

/**
 * Formats a stored CNPJ/CPF for display. Output-side counterpart to
 * {@link maskClientQuery}: the value is known to be a document, so it is always
 * masked by its digit count (no SAP/free-text branch). Non-numeric values (e.g.
 * "CNPJ pendente" for a prospect) are returned unchanged.
 */
export function formatTaxId(taxId: string): string {
  const digits = onlyDigits(taxId);
  if (digits.length === 0) return taxId;
  if (digits.length <= CPF_MAX_DIGITS) {
    return applyMask(digits.slice(0, CPF_MAX_DIGITS), '###.###.###-##');
  }
  return applyMask(digits.slice(0, 14), '##.###.###/####-##');
}

/**
 * Rótulo do documento da conta — "CPF" ou "CNPJ", pela mesma contagem de dígitos
 * que decide a máscara em {@link formatTaxId}.
 *
 * A tela da 360º trazia `label: 'CNPJ'` fixo, então um cliente pessoa física
 * aparecia com o valor mascarado como CPF (`584.440.403-39`) sob o rótulo
 * "CNPJ" — o rótulo contradizendo o número logo ao lado. E não é caso de borda:
 * boa parte do cadastro guarda CPF em `Numero_Do_Documento__c`.
 *
 * ⚠️ **Sem dígito nenhum o rótulo NÃO chuta.** Um prospect guarda texto no
 * campo ("CNPJ pendente"), e aí não há como saber qual dos dois é — o rótulo
 * neutro "CPF / CNPJ" é o mesmo que o formulário de fiador já usa
 * (`pendencia-ticket`), então a tela não inventa vocabulário novo.
 */
export function taxIdLabel(taxId: string): string {
  const digits = onlyDigits(taxId);
  if (digits.length === 0) return 'CPF / CNPJ';
  return digits.length <= CPF_MAX_DIGITS ? 'CPF' : 'CNPJ';
}

/** Formats a numeric amount as BRL currency (e.g. exposição financeira, garantias). */
export function formatCurrencyBRL(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
}

/** Formats a volume in cubic metres (e.g. `24000` → `24.000 m³`). */
export function formatVolumeM3(amount: number): string {
  return `${new Intl.NumberFormat('pt-BR').format(amount)} m³`;
}

/** Formats the R$/L profitability index (e.g. `0.058` → `R$ 0,058/L`). */
export function formatRevenuePerLiter(amount: number): string {
  return `R$ ${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount)}/L`;
}

/** Formats an ISO date (`YYYY-MM-DD`) as `dd/mm/aaaa`; passes through anything else unchanged. */
export function formatIsoDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
