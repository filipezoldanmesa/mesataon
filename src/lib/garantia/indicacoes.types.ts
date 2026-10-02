/**
 * Types for the opportunity fill-in "Garantias" card (01b-oportunidade.html).
 *
 * This is the LT's inline list of INDICATED guarantees, created during the
 * opportunity preenchimento — multiple per opportunity (add / edit / remove).
 *
 * Backed by the real 1:N backend via the BFF (`/api/opportunities/:id/garantias`),
 * mapped in `indicacoes-mapping.ts`. The component consumes the data functions
 * via injectable props; `indicacoes.data.ts` is the single import point.
 *
 * The option strings mirror the prototype's selects verbatim so the screen reads
 * identically — and they are ALSO the backend's `*Label` values, so the BFF maps
 * label ↔ enum code (`TipoGarantia` / `OrigemGarantia` / `CategoriaBem`).
 */

import type { EstadoCivil } from './constants';

/**
 * Full address of a fiador or of the fiador's spouse. Typed by the user (the
 * CPF lookup does not return it). Every part is required except `complemento`.
 * PII — never in logs or URLs.
 */
export interface EnderecoPessoa {
  /** 8 digits, masked as 00000-000. */
  cep: string;
  logradouro: string;
  numero: string;
  /** Optional (apto, bloco, sala…). */
  complemento: string;
  bairro: string;
  cidade: string;
  /** Two uppercase letters. */
  uf: string;
}

export const ENDERECO_VAZIO: EnderecoPessoa = {
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
};

/** True when every required part of the address is filled (`complemento` is optional). */
export function enderecoCompleto(e: EnderecoPessoa): boolean {
  return (
    e.cep.replace(/\D/g, '').length === 8 &&
    [e.logradouro, e.numero, e.bairro, e.cidade].every((p) => p.trim() !== '') &&
    e.uf.trim().length === 2
  );
}

/** Guarantee type — mirrors the prototype select (01b:264). */
export const GARANTIA_TIPO_OPTIONS = [
  'Garantia real (hipoteca / alienação fiduciária)',
  'Fiança bancária',
  'Fiança com lastro',
  'Fiança sem lastro',
] as const;
export type GarantiaTipoOption = (typeof GARANTIA_TIPO_OPTIONS)[number];

/** Existing (SAP) vs newly-registered guarantee — mirrors the prototype select. */
export const GARANTIA_ORIGEM_OPTIONS = ['Nova', 'Existente'] as const;
export type GarantiaOrigem = (typeof GARANTIA_ORIGEM_OPTIONS)[number];

/**
 * Utilização da garantia — `Garantia_Da_Cotacao__c.Utilizacao__c` (ADO 67858).
 *
 * ⚠️ As opções NÃO ficam aqui: elas vêm do catálogo pelo `PicklistSelect`
 * (`PicklistField.GarantiaUtilizacao`), como toda picklist do Salesforce nesta
 * base. O tipo é `string` porque o valor persistido é o API name verbatim, e
 * uma união literal seria a segunda lista a apodrecer.
 */
export type GarantiaUtilizacao = string;

/** Asset category — mirrors the prototype select (01b:269). */
export const GARANTIA_CATEGORIA_OPTIONS = ['Posto', 'Comercial', 'Residencial', 'Rural'] as const;
export type GarantiaCategoria = (typeof GARANTIA_CATEGORIA_OPTIONS)[number];

/**
 * Estado civil do fiador — reexportado de `lib/garantia/constants.ts`, que é a
 * fonte única (o formulário do ticket de pendência já a usa).
 *
 * Reexport, e não uma segunda união literal aqui: os dois formulários pedem o
 * MESMO campo, e duas listas divergiriam no dia em que o negócio acrescentar um
 * estado civil.
 */
export type { EstadoCivil };

/** One indicated guarantee in the opportunity's list. */
export interface GarantiaIndicacaoItem {
  id: string;
  tipo: GarantiaTipoOption;
  origem: GarantiaOrigem;
  /**
   * Quando esta garantia foi cadastrada (ISO).
   *
   * Serve a UMA pergunta — `foiRecusadaNaPrevia`: ela estava no conjunto que a
   * CCOB recusou? Nunca é exibida como data.
   */
  criadaEm: string | null;
  /** Utilização (`Fornecimento` | `Concessão Financeira`). `''` em linhas anteriores a ADO 67858. */
  utilizacao: GarantiaUtilizacao;
  /** Property/asset description, e.g. "Av. Paulista, 1000 · São Paulo/SP". Free text. */
  imovel: string;
  /**
   * ⚠️ **LEGADO** — a matrícula virou coleção (`matriculas`, HIP-01/HIP-03).
   *
   * Preenchido só em linhas anteriores a 31/08/2026; nenhuma escrita nova o toca.
   * Consumidor novo lê `matriculas`.
   */
  matricula: string;

  /**
   * As matrículas do bem, na ordem da tela (HIP-01/HIP-03).
   *
   * `[]` quando nenhuma foi informada, ou quando o tipo não tem bem
   * (`Fiança bancária`, `Fiança sem lastro`). Cada linha sabe se a SUA certidão
   * de inteiro teor está anexada — veredito do backend, nunca derivado aqui: a
   * regra inclui a certidão sem vínculo contando para a matrícula única
   * (garantias documentadas antes de HIP-03), e uma segunda implementação
   * divergiria exatamente ali.
   */
  matriculas: GarantiaMatriculaItem[];

  /**
   * Quantos laudos de avaliação esta garantia declara (HIP-02).
   *
   * `null` = não declarado, e a tela lê como **1** — o comportamento anterior a
   * HIP-02. Nunca `0`.
   */
  quantidadeLaudos: number | null;

  /** Quantos laudos de fato estão anexados — par de `quantidadeLaudos`. */
  laudosAnexados: number;

  /**
   * GER-03 — esta garantia será compartilhada com outras oportunidades?
   *
   * `null` = **não respondida** (linha anterior a 31/08/2026). ⚠️ Nunca renderize
   * `null` como "Não": a pergunta é obrigatória em toda escrita nova, mas as
   * linhas antigas não foram carimbadas com uma resposta que ninguém deu.
   */
  compartilhada: boolean | null;

  /** Os números das oportunidades e/ou detalhes do compartilhamento (GER-03). */
  detalhesCompartilhamento: string;
  /**
   * Cidade e UF do imóvel — `''` quando não informados ou N/A para o tipo.
   *
   * O card passou a coletá-los em 02/09/2026 (o ticket sempre coletou), e é a
   * escrita replace-all que os torna necessários na LEITURA: sem eles a
   * reabertura vinha em branco e o save seguinte apagaria a resposta.
   */
  imovelCidade: string;
  imovelUf: string;
  /** Asset category — `null` when not set. */
  categoria: GarantiaCategoria | null;
  /**
   * Estado civil do fiador (31/08/2026) — código de MÁQUINA (`CASADO`, …),
   * `null` quando não informado ou N/A para o tipo.
   *
   * ⚠️ **PII de pessoa natural.** Nunca em log nem em URL.
   *
   * ⚠️ Diferente de `tipo`/`origem`/`categoria`, que circulam como RÓTULO neste
   * card: aqui o valor é o código, porque `ESTADO_CIVIL_OPTIONS`
   * (`lib/garantia/constants.ts`) já é `{value: código, label}` e é o mesmo
   * seletor que o formulário do ticket usa. Criar um par rótulo↔código só para
   * este campo seria a segunda lista a apodrecer.
   */
  estadoCivil: EstadoCivil | null;
  /** Appraised value, kept as the display string the UI shows ("R$ 3.200.000"). */
  valor: string;
  /**
   * Same-origin BFF stream URL for the attached "Certidão de inteiro teor" —
   * `null` when not attached. Never a raw signed storage URL (the BFF rewrites it).
   */
  certidaoUrl: string | null;
  /** Original filename of the certidão (download attribute). `null` when not attached. */
  certidaoFileName: string | null;
  /** Same-origin BFF stream URL for the attached "Laudo de avaliação". `null` when not attached. */
  laudoUrl: string | null;
  /** Original filename of the laudo (download attribute). `null` when not attached. */
  laudoFileName: string | null;
  observacoes: string;
  /**
   * Documentos anexados A ESTA garantia (spec 28/08/2026).
   *
   * `[]` quando não houver — nunca `null`. `url` é a rota BFF same-origin de
   * download; nenhuma URL assinada do document store chega ao browser.
   *
   * ⚠️ Vem preenchido pelo read model (`GET .../garantia`). A listagem
   * `GET .../garantia/indicacoes` devolve `[]`, porque ali os documentos são
   * carregados por rota própria.
   */
  documentos: GarantiaDocumentoItem[];
  /**
   * FB-01/FB-02 — os fiadores desta garantia. **Na fiança bancária é o BANCO**
   * (nome + CNPJ), que é o garantidor daquela modalidade.
   *
   * `[]` quando não houver — nunca `null`. O modal reabre PREENCHIDO a partir
   * daqui, e isso não é conforto: o upsert é replace-all, então um bloco em
   * branco faria a gravação seguinte APAGAR o banco cadastrado.
   *
   * ⚠️ **PII** — nome e documento nunca em log nem em URL.
   */
  fiadores: GarantiaFiadorItem[];
  /** "90% (posto)" — `null` quando a categoria não tem percentual aprovado. */
  percentualAproveitamentoLabel: string | null;
  /**
   * "R$ 90.000,00" — o aproveitável DESTA garantia.
   *
   * Sem veredito: "cobre" / "não cobre" é do conjunto, e vive abaixo da lista.
   */
  valorAproveitadoLabel: string | null;
}

/**
 * Uma matrícula do bem (HIP-01/HIP-03).
 *
 * `certidaoAnexada` é veredito do backend — ver `GarantiaIndicacaoItem.matriculas`.
 */
export interface GarantiaMatriculaItem {
  id: string;
  ordem: number;
  numero: string;
  certidaoAnexada: boolean;
}

/**
 * Um documento de uma garantia, já com a rota de download same-origin.
 *
 * `legado` são os anexos que ainda vivem nas colunas da própria linha (o caminho
 * anterior a 28/08/2026, que nada mais escreve). Eles baixam por outra rota, e a
 * coluna não guarda a data — daí `uploadedAt` poder ser `null`.
 */
/**
 * Um fiador da garantia (FB-01/FB-02) — o par mínimo que o card coleta.
 *
 * O ticket de pendência coleta mais (estado civil, cônjuge); aqui é nome +
 * documento, porque o único tipo que o card pergunta é a BANCÁRIA, cujo
 * garantidor é o banco — pessoa jurídica não tem estado civil.
 *
 * ⚠️ **PII** — nunca em log nem em URL.
 */
export interface GarantiaFiadorItem {
  id: string;
  nome: string;
  documento: string;
  /**
   * Contact data of the fiador (natural person). Typed by the user; the CPF
   * lookup does not return them. `null` for a legal entity (the bank) and for
   * rows created before this field existed. PII — never in logs or URLs.
   */
  email: string | null;
  profissao: string | null;
  endereco: EnderecoPessoa | null;
  /** Same three fields for the co-obligated spouse. `null` outside CASADO/UNIAO_ESTAVEL. PII. */
  conjugeEmail: string | null;
  conjugeProfissao: string | null;
  conjugeEndereco: EnderecoPessoa | null;
  /**
   * Estado civil do fiador — `null` em pessoa JURÍDICA (o banco não casa) e nas
   * linhas anteriores a 02/09/2026.
   *
   * ⚠️ **PII de pessoa natural.** Nunca em log nem em URL.
   */
  estadoCivil: string | null;
  /** Nome do cônjuge co-obrigado — `null` fora de `CASADO`/`UNIAO_ESTAVEL`. PII. */
  conjugeNome: string | null;
  /** Documento do cônjuge co-obrigado. PII. */
  conjugeDocumento: string | null;
  /**
   * A certidão de casamento DESTE fiador já está anexada — veredito do backend
   * (migration `…139`).
   *
   * Com uma certidão por fiador, sem isto os N blocos mostrariam o mesmo estado
   * e trocar o arquivo de um pareceria trocar de todos.
   */
  certidaoCasamentoAnexada: boolean;
}

export interface GarantiaDocumentoItem {
  id: string;
  /** Tipo do catálogo, ex. "Laudo de Avaliação". */
  type: string;
  fileName: string;
  /** ISO 8601. `null` no legado — a coluna não guarda quando foi anexado. */
  uploadedAt: string | null;
  legado: boolean;
  url: string;
  /**
   * A matrícula que este documento lastreia (HIP-03) — só a certidão de inteiro
   * teor a tem.
   *
   * `null` fora da certidão, e também na certidão anexada antes de HIP-03 (que
   * subiu pelo slot fixo, sem vínculo) e em toda linha LEGADA. Quem decide se
   * uma certidão sem vínculo cobre a matrícula única é o backend, em
   * `GarantiaMatriculaItem.certidaoAnexada` — nunca este campo sozinho.
   */
  garantiaMatriculaId: string | null;
}

/**
 * Payload for creating/updating an indicated guarantee — CORE fields only.
 * Documents (certidão/laudo) are uploaded separately (multipart), never part of
 * this JSON body.
 */
export interface GarantiaIndicacaoInput {
  tipo: GarantiaTipoOption;
  /**
   * FB-01/FB-02 — o fiador. Omitido nos tipos que não têm fiador (o DTO recusa
   * o campo ali), e na bancária é o banco.
   */
  fiadores?: Array<{
    nome: string;
    documento: string;
    /** Ausente em pessoa jurídica (o banco) — o DTO o recusa ali. */
    estadoCivil?: EstadoCivil;
    conjugeNome?: string;
    conjugeDocumento?: string;
    email?: string;
    profissao?: string;
    endereco?: EnderecoPessoa;
    conjugeEmail?: string;
    conjugeProfissao?: string;
    conjugeEndereco?: EnderecoPessoa;
  }>;
  origem: GarantiaOrigem;
  utilizacao: GarantiaUtilizacao;
  imovel: string;
  imovelCidade?: string;
  imovelUf?: string;
  /**
   * Os NÚMEROS das matrículas, na ordem da tela (HIP-01).
   *
   * A ordem é a do array — o backend não aceita uma posição do cliente, porque é
   * ela que rotula o slot da certidão e duas linhas na mesma posição fariam dois
   * slots disputarem o mesmo documento.
   */
  matriculas: string[];
  /** Quantos laudos (HIP-02). `null`/ausente ⇒ o backend lê como 1. */
  quantidadeLaudos: number | null;
  categoria: GarantiaCategoria | null;
  /** Código de máquina; `null` = não informado (ver `GarantiaIndicacaoItem`). */
  estadoCivil: EstadoCivil | null;
  valor: string;
  /**
   * GER-03 — obrigatória. A tela pré-marca "Não" (o padrão vive no FORMULÁRIO,
   * nunca no DTO), e o usuário pode contradizê-la.
   */
  compartilhada: boolean;
  /** Obrigatório quando `compartilhada`; recusado (400) quando não. */
  detalhesCompartilhamento: string;
  observacoes: string;
}

/**
 * Document slots that can be attached to an indicated guarantee.
 *
 * `certidaoCasamento` entrou em 31/08/2026, junto do "Estado civil", e só
 * aparece nos tipos de `exigeEstadoCivil`. Espelha `GARANTIA_DOC_SLOTS` do
 * backend — a rota BFF `[slot]` valida contra a MESMA lista, senão o upload
 * volta 400 "Slot inválido" com o campo na tela.
 */
export type GarantiaDocSlot = 'certidao' | 'laudo' | 'certidaoCasamento';
