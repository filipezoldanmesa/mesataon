/**
 * Garantia domain — frontend constants derived from the backend enums.
 *
 * This file is the SINGLE source for the garantia select options.
 * Values (machine codes) mirror the backend enums exactly so the indicar
 * endpoint receives what it expects. Labels are the same pt-BR display strings
 * used in the prototype (12a-pendencia-ticket.html).
 *
 * Canonical backend sources (ADR-0023 §D1):
 *   - `TipoGarantia`   → apps/api/src/garantia/domain/tipo-garantia.enum.ts
 *   - `CategoriaBem`   → apps/api/src/garantia/domain/categoria-bem.enum.ts
 *   - `OrigemGarantia` → apps/api/src/garantia/domain/origem-garantia.enum.ts
 *   - `EstadoCivil`    → apps/api/src/garantia/domain/estado-civil.enum.ts
 *
 * ⚠️ Do NOT derive these from regex or prototype text. Backend enum is the authority.
 */

// ---------------------------------------------------------------------------
// Tipo de garantia
// ---------------------------------------------------------------------------

/** Machine codes that mirror `TipoGarantia` on the backend. */
export const TIPO_GARANTIA = {
  GARANTIA_REAL: 'GARANTIA_REAL',
  FIANCA_BANCARIA: 'FIANCA_BANCARIA',
  FIANCA_COM_LASTRO: 'FIANCA_COM_LASTRO',
  FIANCA_SEM_LASTRO: 'FIANCA_SEM_LASTRO',
} as const;

export type TipoGarantia = (typeof TIPO_GARANTIA)[keyof typeof TIPO_GARANTIA];

/**
 * Type a new indication starts on (RN-F1-07) — mirrors `TIPO_GARANTIA_PADRAO`
 * on the backend.
 *
 * A suggested default, never a constraint: the rule itself grants an exception
 * (nova imagem may go by fiança), and only the LT knows which case applies. Every
 * other type stays selectable.
 */
export const TIPO_GARANTIA_PADRAO: TipoGarantia = TIPO_GARANTIA.GARANTIA_REAL;

/** Human-readable labels — exact strings from backend `TIPO_GARANTIA_LABEL`. */
export const TIPO_GARANTIA_LABEL: Record<TipoGarantia, string> = {
  GARANTIA_REAL: 'Garantia real (hipoteca / alienação fiduciária)',
  FIANCA_BANCARIA: 'Fiança bancária',
  FIANCA_COM_LASTRO: 'Fiança com lastro',
  FIANCA_SEM_LASTRO: 'Fiança sem lastro',
};

/** Select options: value = machine code, label = display string. */
export const TIPO_GARANTIA_OPTIONS = Object.entries(TIPO_GARANTIA_LABEL).map(
  ([value, label]) => ({ value: value as TipoGarantia, label }),
);

// ---------------------------------------------------------------------------
// Categoria do bem
// ---------------------------------------------------------------------------

/** Machine codes that mirror `CategoriaBem` on the backend. */
export const CATEGORIA_BEM = {
  POSTO: 'POSTO',
  COMERCIAL: 'COMERCIAL',
  RESIDENCIAL: 'RESIDENCIAL',
  RURAL: 'RURAL',
} as const;

export type CategoriaBem = (typeof CATEGORIA_BEM)[keyof typeof CATEGORIA_BEM];

/** Human-readable labels — exact strings from backend `CATEGORIA_BEM_LABEL`. */
export const CATEGORIA_BEM_LABEL: Record<CategoriaBem, string> = {
  POSTO: 'Posto',
  COMERCIAL: 'Comercial',
  RESIDENCIAL: 'Residencial',
  RURAL: 'Rural',
};

/** Select options: value = machine code, label = display string. */
export const CATEGORIA_GARANTIA_OPTIONS = Object.entries(CATEGORIA_BEM_LABEL).map(
  ([value, label]) => ({ value: value as CategoriaBem, label }),
);

// ---------------------------------------------------------------------------
// Origem da garantia
// ---------------------------------------------------------------------------

/** Machine codes that mirror `OrigemGarantia` on the backend. */
export const ORIGEM_GARANTIA = {
  NOVA: 'NOVA',
  EXISTENTE: 'EXISTENTE',
} as const;

export type OrigemGarantia = (typeof ORIGEM_GARANTIA)[keyof typeof ORIGEM_GARANTIA];

/** Select options: value = machine code, label = display string. */
export const ORIGEM_GARANTIA_OPTIONS = [
  { value: ORIGEM_GARANTIA.NOVA, label: 'Nova' },
  { value: ORIGEM_GARANTIA.EXISTENTE, label: 'Existente' },
] as const;

// ---------------------------------------------------------------------------
// Estado civil
// ---------------------------------------------------------------------------

/** Machine codes that mirror `EstadoCivil` on the backend. */
export const ESTADO_CIVIL = {
  SOLTEIRO: 'SOLTEIRO',
  CASADO: 'CASADO',
  DIVORCIADO: 'DIVORCIADO',
  VIUVO: 'VIUVO',
  UNIAO_ESTAVEL: 'UNIAO_ESTAVEL',
} as const;

export type EstadoCivil = (typeof ESTADO_CIVIL)[keyof typeof ESTADO_CIVIL];

/** Human-readable labels — exact strings from backend `ESTADO_CIVIL_LABEL`. */
export const ESTADO_CIVIL_LABEL: Record<EstadoCivil, string> = {
  SOLTEIRO: 'Solteiro(a)',
  CASADO: 'Casado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUVO: 'Viúvo(a)',
  UNIAO_ESTAVEL: 'União estável',
};

/** Select options: value = machine code, label = display string. */
export const ESTADO_CIVIL_OPTIONS = Object.entries(ESTADO_CIVIL_LABEL).map(
  ([value, label]) => ({ value: value as EstadoCivil, label }),
);

// ---------------------------------------------------------------------------
// Business-rule predicates — mirror backend `exigePrevia` / `exigeFiador`
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the tipo requires a preliminary analysis (prévia).
 * All types except `FIANCA_SEM_LASTRO` go through the prévia (PRD §7.2).
 * Mirrors `exigePrevia()` in `apps/api/src/garantia/domain/tipo-garantia.enum.ts`.
 */
export function exigePrevia(tipo: string): boolean {
  return tipo !== TIPO_GARANTIA.FIANCA_SEM_LASTRO;
}

/**
 * Returns `true` when the tipo requires at least one fiador (RN-F1-03).
 * All three `FIANCA_*` types require a fiador.
 * Mirrors `exigeFiador()` in `apps/api/src/garantia/domain/tipo-garantia.enum.ts`.
 */
export function exigeFiador(tipo: string): boolean {
  return (
    tipo === TIPO_GARANTIA.FIANCA_BANCARIA ||
    tipo === TIPO_GARANTIA.FIANCA_COM_LASTRO ||
    tipo === TIPO_GARANTIA.FIANCA_SEM_LASTRO
  );
}

/**
 * Returns `true` when `estadoCivil` requires spouse (cônjuge) data.
 * `CASADO` and `UNIAO_ESTAVEL` make the spouse a co-obligor on the guarantee
 * (RN-F1-03). Mirrors the `@ValidateIf` in `FiadorDto`.
 */
export function exigeConjuge(estadoCivil: string): boolean {
  return estadoCivil === ESTADO_CIVIL.CASADO || estadoCivil === ESTADO_CIVIL.UNIAO_ESTAVEL;
}

/**
 * Returns `true` when the fiador is a legal entity (pessoa jurídica).
 *
 * A `FIANCA_BANCARIA` has the **bank** as fiador — a CNPJ — and a company has
 * no marital status, so "Estado civil" (and the cônjuge block behind it) must
 * not be asked, let alone required. The answer comes from the DOCUMENT, the one
 * field the form already collects: 14 digits ⇒ CNPJ.
 *
 * A document that is neither 11 nor 14 digits (mid-typing, malformed) returns
 * `false`, keeping the field required — the rule only relaxes once the document
 * positively says "company". Defaulting the other way would let a CPF fiador
 * skip the marital status the guarantee depends on (RN-F1-03).
 *
 * NOT a document validator: check digits are deliberately not verified (opaque
 * identifiers are validated by existence in the source, never by format). The
 * digit count only decides which fields the person is asked for.
 *
 * Mirrors `fiadorEhPessoaJuridica` in
 * `apps/api/src/garantia/domain/fiador-pessoa.ts` — the form must hide exactly
 * the fields the DTO stops requiring, or screen and gate disagree.
 */
export function fiadorEhPessoaJuridica(documento: string): boolean {
  return documento.replace(/\D/g, '').length === 14;
}

/**
 * Returns `true` quando o tipo tem **bem dado em garantia** — e portanto o grupo
 * "Imóvel / bem" inteiro: endereço, matrícula, cidade/UF, categoria, valor
 * avaliado e os documentos do bem (certidão de inteiro teor e laudo).
 *
 * ## Não confundir com `exigePrevia`
 *
 * `exigePrevia` responde "a CCOB analisa?" (todos, menos fiança sem lastro);
 * `exigeImovel` responde "existe bem a avaliar?". Os dois formulários usavam
 * `exigePrevia` para os campos de imóvel, então **fiança bancária pedia endereço,
 * matrícula e laudo** de um imóvel que não existe — na bancária o garantidor é o
 * banco (PRD Garantias v1.0 §7.2: "Imóvel / bem … Base da avaliação (garantia
 * real)"; `CA-F1-01.2`/`RN-F1-03`: fiança pede fiador e, na bancária, o estatuto
 * do banco — nunca imóvel).
 *
 * | Tipo | `exigePrevia` | `exigeImovel` | `exigeFiador` |
 * |---|---|---|---|
 * | `GARANTIA_REAL`     | ✅ | ✅ | ❌ |
 * | `FIANCA_COM_LASTRO` | ✅ | ✅ | ✅ |
 * | `FIANCA_BANCARIA`   | ✅ | ❌ | ✅ (+ estatuto) |
 * | `FIANCA_SEM_LASTRO` | ❌ | ❌ | ✅ |
 *
 * Substitui `exigeCategoria`, que já tinha este mesmo conjunto — a categoria é
 * parte do grupo "Imóvel / bem" no dicionário do PRD.
 *
 * Mirrors `exigeImovel()` in `apps/api/src/garantia/domain/tipo-garantia.enum.ts`.
 */
export function exigeImovel(tipo: string): boolean {
  return tipo === TIPO_GARANTIA.GARANTIA_REAL || tipo === TIPO_GARANTIA.FIANCA_COM_LASTRO;
}

/**
 * Returns `true` quando o tipo pede o **estado civil do fiador** e a **certidão
 * de casamento** — decisão de negócio de 31/08/2026, no modal "Adicionar
 * garantia". Exatamente `FIANCA_COM_LASTRO` e `FIANCA_SEM_LASTRO`.
 *
 * ## Não é `exigeFiador`
 *
 * `exigeFiador` inclui a bancária, e ali o garantidor é o **banco**: pessoa
 * jurídica não tem estado civil nem certidão de casamento — o que aquele tipo
 * pede é o estatuto (RN-F1-03), que já tem slot próprio. Reusá-lo poria "Estado
 * civil: Solteiro(a)" num formulário cujo garantidor é uma instituição
 * financeira: valor plausível, gravado, e sobre ninguém.
 *
 * | Tipo | `exigeImovel` | `exigeFiador` | `exigeEstadoCivil` |
 * |---|---|---|---|
 * | `GARANTIA_REAL`     | ✅ | ❌ | ❌ |
 * | `FIANCA_COM_LASTRO` | ✅ | ✅ | ✅ |
 * | `FIANCA_BANCARIA`   | ❌ | ✅ | ❌ |
 * | `FIANCA_SEM_LASTRO` | ❌ | ✅ | ✅ |
 *
 * ⚠️ A certidão de casamento deixou de seguir este predicado em 01/09/2026: ela
 * segue o estado civil RESPONDIDO (`exigeConjuge`), porque um fiador solteiro não
 * tem certidão de casamento. Este predicado governa o **campo** "Estado civil",
 * cuja resposta decide aquele slot — ver `showCertidaoCasamento` em
 * `garantias-indicadas-card.tsx`.
 *
 * Mirrors `exigeEstadoCivil()` in `apps/api/src/garantia/domain/tipo-garantia.enum.ts`.
 */
export function exigeEstadoCivil(tipo: string): boolean {
  return (
    tipo === TIPO_GARANTIA.FIANCA_COM_LASTRO || tipo === TIPO_GARANTIA.FIANCA_SEM_LASTRO
  );
}

// ---------------------------------------------------------------------------
// Document checklist keys for uploads inside the form
// ---------------------------------------------------------------------------

/** `category::type` composite key used with `attachDoc` for the certidão upload. */
export const CERTIDAO_DOC_ID = 'Garantia::Certidão de Inteiro Teor atualizada' as const;

/** `category::type` composite key used with `attachDoc` for the laudo upload. */
export const LAUDO_DOC_ID = 'Garantia::Laudo de Avaliação' as const;

/**
 * `category::type` do upload da MINUTA do contrato de fiança bancária — o único
 * anexo obrigatório da bancária desde 02/09/2026.
 *
 * Substituiu o `ESTATUTO_DOC_ID`: o estatuto do banco foi RETIRADO (pedido do
 * negócio, *"não existe mais o anexo Estatuto"*) e sua linha do catálogo virou
 * `selectable = false` na migration `…133` — escondida, nunca apagada, porque
 * `opportunity_repository_documents` a referencia por `(category, type)`.
 *
 * ⚠️ O `type` casa VERBATIM com `DOC_TIPO_MINUTA_FIANCA_BANCARIA` do backend;
 * `matriculas-laudos-compartilhados.test.ts` afere o par contra o fonte de lá.
 */
export const MINUTA_FIANCA_DOC_ID = 'Garantia::Minuta do Contrato de Fiança Bancária' as const;

/**
 * O `accept` de TODO anexo de garantia — espelho da regra uniforme do catálogo:
 * **PDF, PNG, JPEG e Word** (decisão do negócio de 02/09/2026, migration `…138`).
 *
 * ⚠️ **Um constante só, para os dois formulários e todos os slots.** A versão
 * anterior tinha uma por recorte (`ACEITOS_MINUTA_FIANCA` = `pdf,word`,
 * `ACEITOS_PDF_IMAGEM` = `pdf,png,jpeg`) porque o CATÁLOGO era recortado assim —
 * e foi justamente esse recorte que produziu o erro em produção: o slot da minuta
 * oferecia imagem numa linha que só aceitava `pdf,word`, então a garantia era
 * criada e só o anexo era recusado. Com a regra uniforme, duas constantes seriam
 * duas oportunidades de divergir de novo.
 *
 * ⚠️ O `accept` é **dica, não garantia** — o usuário pode escolher "todos os
 * arquivos", e quem recusa de verdade é `DocumentsService.attach` contra
 * `document_parametrizations`. Ele evita a escolha errada; não a substitui.
 *
 * ⚠️ **`Documento complementar` aceita `excel` ALÉM disto** (é a área geral do
 * GER-01, e ali cabe planilha). O `accept` daquele campo é composto no call site,
 * e não aqui: uma constante "quase uniforme" convidaria a usá-la nos outros
 * slots, onde a planilha não é aceita.
 */
export const ACEITOS_DOCUMENTO_GARANTIA =
  'application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx';

/** O `accept` da área de complementares — o uniforme mais planilha (GER-01). */
export const ACEITOS_DOCUMENTO_COMPLEMENTAR =
  `${ACEITOS_DOCUMENTO_GARANTIA},application/vnd.ms-excel,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx`;


/** `category::type` composite key used with `attachDoc` for generic document pendências. */
export const PENDENCIA_DOC_ID = 'Pendência::Documento de pendência' as const;

// ---------------------------------------------------------------------------
// Matrículas e laudos (HIP-01 / HIP-02)
// ---------------------------------------------------------------------------

/**
 * Teto de matrículas por garantia — espelho de `MAX_MATRICULAS` no backend
 * (`garantia/domain/matriculas-da-garantia.ts`).
 *
 * A tela o usa para desabilitar o "+ Adicionar matrícula" ANTES do submit: sem
 * isso o usuário monta 25 linhas, preenche todas, e o backend recusa o lote
 * inteiro numa mensagem só.
 *
 * ⚠️ Espelho, não fonte. Quem recusa é o backend; este número existe para a tela
 * não oferecer o que a API vai negar.
 */
export const MAX_MATRICULAS = 20;

/**
 * Quantos laudos uma garantia exige quando não declarou nenhuma quantidade —
 * espelho de `QUANTIDADE_LAUDOS_PADRAO` no backend.
 *
 * `null` em `quantidadeLaudos` é linha anterior a HIP-02, e o comportamento de
 * antes era exatamente um laudo. A tela lê `null` como **1**, nunca como `0`.
 */
export const QUANTIDADE_LAUDOS_PADRAO = 1;
/**
 * Teto de laudos de avaliação por garantia (HIP-02).
 *
 * ⚠️ **É o MESMO número de {@link MAX_MATRICULAS}, e de propósito**: o backend
 * valida `quantidadeLaudos` com `@Max(MAX_MATRICULAS)` — uma constante só,
 * reusada. O alias existe para o call site do repetidor de laudos não dizer
 * `laudos.length >= MAX_MATRICULAS`, que lê como bug; não para abrir um segundo
 * limite que o backend não conhece.
 *
 * Se um dos dois precisar de teto próprio, o conserto começa no DTO do backend.
 */
export const MAX_LAUDOS = MAX_MATRICULAS;


// ---------------------------------------------------------------------------
// Compartilhamento com outras oportunidades (GER-03)
// ---------------------------------------------------------------------------

/**
 * O texto da pergunta obrigatória de GER-03 — verbatim do documento
 * (`Ajustes_Fluxo_Garantia_GOP_v0.1` §2).
 *
 * Vive aqui porque as DUAS superfícies que a fazem (o card da 01b e o ticket de
 * pendência) precisam da mesma frase: duas cópias divergiriam, e a pergunta é o
 * que dá sentido ao "Sim"/"Não" gravado.
 */
export const PERGUNTA_COMPARTILHAMENTO =
  'Essa garantia será compartilhada com outras oportunidades?';

/**
 * FL-01 — o texto informativo da fiança com lastro.
 *
 * *"Exibir texto informando que os fiadores serão os proprietários do imóvel."*
 * Mesma razão de morar aqui: card e ticket exibem a mesma frase.
 */
export const AVISO_FIANCA_COM_LASTRO =
  'Nesta modalidade os fiadores serão os proprietários do imóvel dado em garantia.';

/**
 * O aviso do Comitê de Crédito na FIANÇA SEM LASTRO.
 *
 * Pedido do negócio, verbatim: *"ao selecionar uma garantia do tipo Fiança sem
 * lastro, devemos mostrar um disclaimer abaixo do tipo de garantia informando
 * que a oportunidade passará pelo comitê de crédito"*.
 *
 * ⚠️ **Esta caixa já foi removida uma vez, por engano.** Ela nasceu como
 * "Garantia não real" (`garantia-fianca-alert`, verbatim do protótipo
 * `01b-oportunidade-nova.html:301`, acendendo para as TRÊS fianças), saiu em
 * 02/09/2026 a pedido de um usuário — *"pode remover também os boxes amarelos
 * que falam sobre 'Garantia não real' e afins"* — e voltou em 03/09/2026, quando
 * o negócio esclareceu que aquele pedido tinha sido um mal-entendido.
 *
 * **O escopo voltou ESTREITO, e isso é a decisão, não um resíduo:** só
 * `FIANCA_SEM_LASTRO`, que é justamente o único tipo com `exigePrevia = false`
 * — o que NÃO segue o rito da CCOB. Acender nas outras duas fianças diria que a
 * prévia delas também muda de foro, o que é falso, e é onde a versão original
 * errava.
 *
 * ⚠️ **"Sem garantia" (a outra metade do report) não é alcançável por esta
 * tela:** `TipoGarantia` tem quatro valores e nenhum é ele — "Sem Garantia" é
 * valor do picklist `TipoGarantiaProposta` do Salesforce e do cadastro de
 * garantias do cliente. Cobri-lo exige valor novo no enum do backend, não uma
 * linha aqui.
 *
 * Mora nesta constante pela mesma razão do FL-01: card da 01b e ticket de
 * pendência fazem a MESMA afirmação, e duas cópias divergem —
 * `matriculas-laudos-compartilhados.test.ts` falha se alguma das telas escrever
 * a frase inline.
 */
export const AVISO_FIANCA_SEM_LASTRO =
  'Garantia não real: nesta modalidade a análise prévia passa pelo Comitê de Crédito — o rito é diferente.';

// ---------------------------------------------------------------------------
// Documentos complementares (GER-01)
// ---------------------------------------------------------------------------

/**
 * O tipo do catálogo da área de "Documentos complementares" (GER-01).
 *
 * ⚠️ **String literal, e tem de casar VERBATIM** com a linha que a migration
 * `…130` insere em `document_parametrizations` (categoria `Garantia`,
 * `single: false`). O backend valida o `type` contra o catálogo e recusa o que não
 * reconhece, então um typo aqui viraria 400 em todo upload complementar.
 *
 * Não vem de uma leitura do catálogo porque é a ÁREA, não uma escolha: GER-01 pede
 * que ela esteja sempre disponível, em todos os tipos de garantia. Os tipos que o
 * usuário ESCOLHE (certidão, laudo, estatuto, minuta da fiança) continuam vindo do
 * catálogo pela rota própria.
 */
export const TIPO_DOCUMENTO_COMPLEMENTAR = 'Documento complementar';

/**
 * O `type` da certidão de inteiro teor e do laudo no catálogo de documentos —
 * verbatim como o backend os declara (`DOC_TIPO_CERTIDAO`/`DOC_TIPO_LAUDO`).
 *
 * Existem aqui porque desde 01/09/2026 os dois sobem pela rota TIPADA (uma
 * certidão por matrícula, N laudos por garantia) e não mais pelos slots fixos
 * `certidao`/`laudo`, que aceitavam um de cada. Mesmo precedente de
 * {@link TIPO_DOCUMENTO_COMPLEMENTAR}.
 *
 * ⚠️ Strings acopladas ao catálogo: `matriculas-laudos-compartilhados.test.ts`
 * as afere contra o fonte do backend, senão um upload silenciosamente cairia em
 * "tipo não parametrizado" (400) só em runtime.
 */
export const TIPO_DOCUMENTO_CERTIDAO = 'Certidão de Inteiro Teor atualizada';
export const TIPO_DOCUMENTO_LAUDO = 'Laudo de Avaliação';

/**
 * O `type` da certidão de casamento do fiador no catálogo — verbatim como a
 * migration `…132` a semeou e como `TIPO_DOCUMENTO_POR_SLOT` a declara.
 *
 * Vivia como constante local do `garantias-indicadas-card.tsx`, onde servia só
 * para reconhecer o "✓ Anexado" na reabertura do modal. Subiu para cá quando a
 * organização dos documentos da linha passou a agrupá-los por tipo: duas cópias
 * do mesmo literal divergiriam, e o sintoma seria a certidão de casamento
 * caindo em "Outros documentos" sem nada quebrar.
 */
export const TIPO_DOCUMENTO_CASAMENTO = 'Certidão de Casamento do fiador';

/**
 * Os documentos da FIANÇA BANCÁRIA, verbatim como o backend os declara
 * (`DOC_TIPO_ESTATUTO` / `DOC_TIPO_MINUTA_FIANCA_BANCARIA`).
 *
 * **Desde 02/09/2026 é só a MINUTA, e ela é obrigatória** — pedido do negócio:
 * *"em Fiança Bancária não existe mais o anexo Estatuto. Deve ter apenas a
 * Minuta, e ela deve ser obrigatória."* Isto revisa FB-03 (31/08/2026), que a
 * tinha entregado opcional ao lado do estatuto.
 *
 * O asterisco do formulário não é regra própria: quem cobra a falta é
 * `documentosObrigatoriosDoTipo` + `garantiaApta`, no backend.
 *
 * ⚠️ **`TIPO_DOCUMENTO_ESTATUTO` permanece exportado, e nenhum formulário o
 * usa.** Ele é o `type` de um documento que pode ESTAR anexado numa bancária
 * antiga: `documentoPertenceAoTipoDeGarantia` continua exibindo-o no dossiê, e a
 * linha do catálogo virou `selectable = false` (migration `…133`) em vez de ser
 * apagada — `opportunity_repository_documents` a referencia por
 * `(category, type)`. É o `isKnown` × `isSelectable` do catálogo de picklists.
 *
 * ⚠️ Strings acopladas ao catálogo: `matriculas-laudos-compartilhados.test.ts` as
 * afere contra o fonte do backend, senão um upload cairia em "tipo não
 * parametrizado" (400) só em runtime.
 */
export const TIPO_DOCUMENTO_ESTATUTO = 'Estatuto do banco (fiança bancária)';
export const TIPO_DOCUMENTO_MINUTA_FIANCA = 'Minuta do Contrato de Fiança Bancária';
