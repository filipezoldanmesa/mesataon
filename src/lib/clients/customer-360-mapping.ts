import { SHOW_COMPANY_GROUP_CARD } from './company-group-visibility';
import {
  formatCurrencyBRL,
  formatIsoDate,
  formatRevenuePerLiter,
  formatTaxId,
  formatVolumeM3,
  taxIdLabel,
} from './format';
import {
  sectionGapMessage,
  type BackendSectionSourceGap,
} from '@/lib/section-gaps/gap-message';
import { narrowDdiRiskLevel } from '@/lib/opportunities/ddi-mapping';
import { formatCalendarDateBR } from '@/lib/date-format';
import {
  MAPA_DA_REDE_FORA_DO_MAPA,
  SITUACAO_MAPA_DA_REDE_FIELD_LABEL,
  STATUS_MAPA_DA_REDE_FIELD_LABEL,
  STATUS_MAPA_DA_REDE_HELP,
  textoSituacaoMapaDaRede,
  textoStatusMapaDaRede,
} from '@/lib/mapa-da-rede';
import type { SituacaoMapaDaRede, StatusMapaDaRede } from '@/lib/mapa-da-rede';

import type {
  ClientDetail,
  ClientSection,
  DetailField,
  ExpandableTable,
} from './types';

/** Wraps a 360º section with a source-availability flag (mirrors the backend). */
export type BackendSectionResult<T> = {
  available: boolean;
  data: T | null;
};

export type BackendCustomerAccountDetail = {
  sapCode: string;
  legalName: string;
  taxId: string;
  city: string | null;
  state: string | null;
  profitCenter: string | null;
  salesTeam: string | null;
  salesOffice: string | null;
  vp: string | null;
  territoryLeader: string | null;
  setorAtividade: string | null;
  sucessaoAtiva: boolean | null;
  /**
   * Seção "Mapa da Rede" do cadastro. `null` = a conta não participa do mapa.
   *
   * Opcional no TIPO para o skew de deploy degradar: um backend anterior a
   * esta entrega não manda a chave, e a tela simplesmente não monta o bloco.
   */
  mapaDaRede?: BackendCustomerMapaDaRede | null;
};

export type BackendCustomerMapaDaRede = {
  status: StatusMapaDaRede | null;
  situacao: SituacaoMapaDaRede | null;
  justificativaPendente: boolean | null;
  dataEntrada: string | null;
  novaImagem: string | null;
  inativoDesde: string | null;
  dataSaida: string | null;
};

export type BackendCustomerContact = {
  name: string;
  mobilePhone: string | null;
  phone: string | null;
  email: string | null;
};

export type BackendCustomerPartner = {
  name: string;
  /**
   * `Socio__c.Tipo_De_Cadastro__c`, normalizado pelo backend.
   *
   * ⚠️ Na fonte são os CÓDIGOS `1`/`2`/`3`; até 03/09/2026 o mapper do backend
   * comparava os RÓTULOS e mandava 100% dos sócios para `UNKNOWN` — era o "Não
   * informado" que o TC reportou.
   */
  registrationType: 'INDIVIDUAL' | 'COMPANY' | 'FOREIGN' | 'UNKNOWN';
  taxId: string | null;
  participationPercent: number | null;
  isContractRepresentative: boolean;
  /**
   * O dossiê da pessoa que representa ESTE sócio — o bloco "Dados do
   * Representante" da linha no Salesforce.
   *
   * ⚠️ **Opcional no TIPO** para o skew de deploy degradar: um backend anterior
   * a 09/09/2026 manda `maritalStatus`/`city`/`state` soltos e não manda este
   * campo, e a tela simplesmente não desenha a sub-linha — nunca estoura.
   */
  representative?: BackendCustomerPartnerRepresentative | null;
};

/**
 * O bloco "Dados do Representante" de uma linha de sócio.
 *
 * ⚠️ **Sem NOME, e a ausência é da FONTE.** O cadastro do cliente no Salesforce
 * não tem campo para o nome do representante de um sócio pessoa jurídica — ver
 * `representanteDaLinha`. Todo campo é opcional no tipo pela mesma razão de
 * `representative`: o payload cresce sem quebrar a tela.
 */
export type BackendCustomerPartnerRepresentative = {
  maritalStatus?: string | null;
  profession?: string | null;
  nationality?: string | null;
  idDocumentType?: string | null;
  idDocumentNumber?: string | null;
  idDocumentIssuer?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  complement?: string | null;
  district?: string | null;
  zipCode?: string | null;
  city?: string | null;
  state?: string | null;
};

/**
 * O veredito de "os percentuais somam corretamente?", calculado no backend
 * (`partnershipTotal`). A tela só o escreve — ver `partnershipTotalNote`.
 */
export type BackendCustomerPartnershipTotal = {
  /** Soma dos percentuais informados. `null` = nenhum sócio informa percentual. */
  percentTotal: number | null;
  partnersWithoutPercent: number;
  /** `null` = não há percentual a julgar. ⚠️ Nunca leia `null` como `false`. */
  closes: boolean | null;
};

export type BackendCustomerBankAccount = {
  /** COMPE de 3 dígitos, ou a chave inteira quando o layout não é reconhecido. */
  bankCode: string;
  /** Sempre `null` — a fonte não carrega, e derivar de tabela local é proibido. */
  bankName: string | null;
  /** Agência com DV, ou `''` quando o layout da chave não é reconhecido. */
  branch: string;
  /** Sempre `null` — o SAP não reporta corrente/poupança neste contrato. */
  accountType: string | null;
  accountNumber: string;
};

/**
 * Uma garantia cadastrada para o cliente.
 *
 * Fonte: Salesforce `Garantia_Do_Cliente__c`, o espelho do Oracle EBS dentro do
 * CRM (ADR-0046). Todo campo de valor é nullable, e `validFrom`/`validTo` vêm
 * SEMPRE `null` — a fonte não tem vigência, e o dono do dado (SAP) não tem
 * contrato. A seção declara a lacuna; a tela não inventa data.
 */
export type BackendCustomerGuarantee = {
  type: string;
  validFrom: string | null;
  validTo: string | null;
  /** Teto efetivo (`valMaxFiaGar`). `null` quando quem responde é o espelho. */
  ceilingBRL: number | null;
  /** Saldo disponível (`saldo`). `null` no espelho. */
  availableBRL: number | null;
  amount: number | null;
  /** `VU_Fornecimento__c` — o "valor utilizado limite de crédito" do ADO. */
  usedSupplyBRL: number | null;
  usedInstallmentBRL: number | null;
  usedFinancialGrantBRL: number | null;
};

/**
 * Declares which integration a group of missing fields depends on. The backend
 * owns this verdict (it knows the sources); the UI only renders `sourceLabel`.
 *
 * Definido em `lib/section-gaps/gap-message.ts` e re-exportado aqui para não
 * quebrar os importadores existentes: a mesma forma é lida pelo painel
 * "Andamento da análise", e duas declarações permitiriam a segunda divergir do
 * DTO em silêncio — que é exatamente o defeito que essa consolidação fecha.
 */
export type { BackendSectionSourceGap };

export type BackendCustomerEconomicGroup = {
  /**
   * `null` WITHOUT a `salesforce` entry in `gaps` = the account belongs to no
   * economic group (true for most accounts). `null` WITH that gap = Salesforce
   * was unreachable. The two must render differently.
   */
  groupId: string | null;
  groupName: string | null;
  memberCount: number | null;
  /**
   * Integrantes do grupo (ADO 68082). Opcional no tipo porque um backend
   * anterior a esta entrega não manda o campo — e aí a tabela simplesmente não
   * é oferecida, em vez de renderizar vazia.
   */
  members?: BackendCustomerEconomicGroupMember[] | null;
  /** A tabela mostra menos integrantes do que `memberCount` (ADO 68082). */
  membersTruncated?: boolean | null;
  exposureAmount: number | null;
  criterion: string | null;
  gaps: BackendSectionSourceGap[];
};

export type BackendCustomerEconomicGroupMember = {
  sapCode: string;
  name: string | null;
  /** CNPJ/CPF SEM formatação — quem formata é esta camada. */
  taxId: string | null;
  city: string | null;
  state: string | null;
};

export type BackendCustomerCompanyGroupBonus = {
  percent: number;
  amountBRL: number;
};

export type BackendCustomerCompanyGroup = {
  code: string | null;
  name: string | null;
  /** "3624 · REDE ALEM DO RIO" — already composed by the backend. */
  label: string | null;
  contractedVolumeM3: number | null;
  performedVolumeM3: number | null;
  complianceRatioPercent: number | null;
  validity: { from: string; to: string } | null;
  advanceBonus: BackendCustomerCompanyGroupBonus | null;
  deferredBonus: BackendCustomerCompanyGroupBonus | null;
  revenuePerLiterBRL: number | null;
  gaps: BackendSectionSourceGap[];
};

export type BackendCustomerRegulatoryStatus = {
  flag: string;
  status: string;
  statusSigaf: string | null;
  authorizationNumber: string | null;
  lastUpdatedAt: string;
  dataObtencao: string | null;
  /** Posto address from ANP — the billing address (account) is often empty. */
  municipio: string | null;
  uf: string | null;
  endereco: string | null;
  /**
   * Which ANP source answered (ADR-0041). `mirror` = the local copy of the
   * open register, served because the live call failed.
   */
  source?: 'api' | 'mirror';
  /** Publication date of the mirrored dataset (`YYYY-MM-DD`); null when live. */
  asOf?: string | null;
};

/**
 * Normalized bandeira for a franchise unit (sourced from Salesforce DCF).
 * `UNKNOWN` means the RecordType DeveloperName was not in the known set.
 */
export type BackendCustomerFranchiseBandeira = 'BR_MANIA' | 'LUBRAX' | 'UNKNOWN';

export type BackendCustomerFranchiseLink = {
  sapCode: string;
  legalName: string;
  bandeira: BackendCustomerFranchiseBandeira;
  executivo: string | null;
};

export type BackendCustomerFranchises = {
  items: BackendCustomerFranchiseLink[];
};

export type BackendCustomerDocument360Item = {
  /** Display name for the card — maps to `RepositoryDocument.type`. */
  name: string;
  status: 'ok' | 'vencido';
};

export type BackendCustomerDocuments360 = {
  items: BackendCustomerDocument360Item[];
};

/** An opportunity linked to the client (opportunities module). */
export type BackendCustomerOpportunity = {
  id: string;
  code: string;
  title: string;
  status: string;
};

/**
 * Risco DDI já calculado para o cliente (TC 68060) — valor de MÁQUINA, como o
 * módulo `ddi` o persistiu. Quem traduz para "Baixo/Médio/Alto" e escolhe a cor
 * da pílula é `DDI_RISK_PILL`, o mesmo mapa da tela da oportunidade.
 */
export type BackendCustomerDdiRisk = {
  /** `BAIXO｜MEDIO｜ALTO`. */
  nivel: string;
};

/** The consolidated 360º view returned by `GET /v1/customers/:sapCode/360`. */
export type BackendCustomer360 = {
  sapCode: string;
  account: BackendSectionResult<BackendCustomerAccountDetail>;
  contacts: BackendSectionResult<BackendCustomerContact[]>;
  partners: BackendSectionResult<BackendCustomerPartner[]> & {
    /**
     * Veredito do total de participação (TC 03/09/2026).
     *
     * ⚠️ **Opcional no tipo**, para o skew de deploy degradar: um backend
     * anterior a esta entrega não manda o campo, e a tela simplesmente não
     * escreve a frase do total. Recalculá-lo aqui daria duas somas que divergem
     * na tolerância.
     */
    total?: BackendCustomerPartnershipTotal | null;
  };
  bank: BackendSectionResult<BackendCustomerBankAccount> & {
    /**
     * Optional so an older backend (one deployed before the section carried
     * gaps) degrades to the previous behaviour — no card — instead of throwing.
     */
    gaps?: BackendSectionSourceGap[];
  };
  /**
   * `gaps` sits on the section here (not inside `data`, which is a list) so the
   * screen can name the source and tell "não contratada" from "indisponível".
   * Optional in the type: a backend older than this change does not send it.
   */
  guarantees: BackendSectionResult<BackendCustomerGuarantee[]> & {
    /**
     * Por que a lista está vazia, quando está. `NO_CREDIT_ACCOUNT` e
     * `NO_GUARANTEES` são fatos DIFERENTES — a fonte responde os dois com o
     * mesmo HTTP 404 e nenhum é erro. `null` só quando a seção caiu.
     */
    outcome?: 'FOUND' | 'NO_CREDIT_ACCOUNT' | 'NO_GUARANTEES' | null;
    gaps?: BackendSectionSourceGap[];
  };
  economicGroup: BackendSectionResult<BackendCustomerEconomicGroup>;
  companyGroup: BackendSectionResult<BackendCustomerCompanyGroup>;
  /** `gaps` optional in the type: a backend older than VBR-539 does not send it. */
  anp: BackendSectionResult<BackendCustomerRegulatoryStatus> & {
    gaps?: BackendSectionSourceGap[];
  };
  /**
   * Franchise units linked to the posto (source: Salesforce DCF).
   * Optional in the type: a backend older than Bug 67504 does not send it.
   * `available: true` with `data.items: []` = no franchise (sem franquia vinculada).
   * `available: false` = Salesforce indisponível.
   */
  franchises?: BackendSectionResult<BackendCustomerFranchises>;
  documents: BackendSectionResult<BackendCustomerDocuments360>;
  opportunities: BackendSectionResult<BackendCustomerOpportunity[]>;
  /**
   * Risco DDI já calculado — a pílula do cabeçalho (TC 68060).
   *
   * Opcional no tipo: um backend anterior a esta entrega não manda a seção, e o
   * skew de deploy tem de degradar para "sem pílula" em vez de estourar.
   * `available: true` com `data: null` é o caso COMUM (cliente sem oportunidade
   * ou sem risco calculado) e não é lacuna; `available: false` é a leitura que
   * falhou — nos dois casos a tela não renderiza pílula, e é o payload que
   * mantém os dois separados para o suporte.
   */
  ddiRisk?: BackendSectionResult<BackendCustomerDdiRisk>;
};

const PARTNER_TYPE_LABEL: Record<BackendCustomerPartner['registrationType'], string> = {
  INDIVIDUAL: 'PF',
  COMPANY: 'PJ',
  /**
   * `3 - Estrangeiro` no org. Rótulo próprio, e não dobrado em `PF`: o org
   * distingue os três, e um estrangeiro exibido como Pessoa Física afirmaria um
   * tipo de cadastro que ninguém registrou.
   */
  FOREIGN: 'Estrangeiro',
  /**
   * O campo genuinamente vazio (8,6% dos sócios medidos). ⚠️ Até 03/09/2026
   * TODOS caíam aqui, porque o mapper do backend comparava o RÓTULO da picklist
   * enquanto a API devolve o CÓDIGO — era o "Não informado" do print do TC.
   */
  UNKNOWN: 'Não informado',
};

/** `Fortaleza/CE`, `Fortaleza` ou `CE` — o que a fonte tiver, `null` se nada. */
function formatCidadeUf(cidade?: string | null, uf?: string | null): string | null {
  const c = cidade?.trim();
  const u = uf?.trim();
  if (c && u) return `${c}/${u}`;
  return c || u || null;
}

/** `Avenida da Abolição, 4573, apt. 300 — Mucuripe, Fortaleza/CE, CEP 60165-085`. */
function enderecoDoRepresentante(rep: BackendCustomerPartnerRepresentative): string | null {
  const logradouro = [rep.street, rep.streetNumber, rep.complement]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ');
  const local = [rep.district?.trim(), formatCidadeUf(rep.city, rep.state)]
    .filter(Boolean)
    .join(', ');
  const cep = rep.zipCode?.trim() ? `CEP ${rep.zipCode.trim()}` : '';

  // Cada pedaço entra só se existir: um "—" órfão ou uma vírgula solta lê como
  // dado corrompido, não como cadastro parcial.
  const partes = [logradouro, [local, cep].filter(Boolean).join(', ')].filter(Boolean);
  return partes.length > 0 ? partes.join(' — ') : null;
}

/** `RG 94004008187 (SSP/CE)`, ou o que a fonte tiver dos três. */
function documentoDoRepresentante(
  rep: BackendCustomerPartnerRepresentative,
): string | null {
  const numero = rep.idDocumentNumber?.trim();
  const tipo = rep.idDocumentType?.trim();
  const emissor = rep.idDocumentIssuer?.trim();
  if (!numero) return tipo || null;
  return `${[tipo, numero].filter(Boolean).join(' ')}${emissor ? ` (${emissor})` : ''}`;
}

/**
 * A linha de dossiê que aparece SOB o sócio — o bloco "Dados do Representante"
 * daquela linha do `Socio__c`.
 *
 * ## Por que sob a linha, e não numa nota do card
 *
 * Até 09/09/2026 estes campos viravam uma frase única sob a TABELA
 * (`Representante: MARILANE BATISTA CORREIA · Casado · Fortaleza/CE.`), e o
 * negócio recusou por duas razões, ambas certas:
 *
 * 1. **Ela repetia o representante.** A coluna "Representa?" já responde quem
 *    representa o posto; escrever o nome de novo não acrescentava nada.
 * 2. **Ela atribuía os dados ao SÓCIO.** Com sócios pessoa jurídica a frase
 *    saía `DIFERENCIAL PARTICIPACOES LTDA · Casado · Fortaleza/CE` — estado
 *    civil de uma **empresa**. O bloco é da pessoa que REPRESENTA aquele sócio
 *    (o layout do org chama as duas seções de "Dados do Representante"), e a
 *    nota, por ser do card inteiro, não tinha como dizer de qual sócio era.
 *
 * Sob a linha as duas coisas se resolvem: o dossiê fica ao lado do sócio a que
 * pertence, e o nome não é repetido.
 *
 * ## ⚠️ O NOME não entra porque não existe
 *
 * Para um sócio PJ, quem representa é outra pessoa — e o cadastro do cliente no
 * Salesforce **não tem campo para o nome dela** (org varrido em 09/09/2026; ver
 * `CustomerPartnerRepresentativeDto` no backend). Medido na conta do print, as
 * duas linhas PJ trazem o **mesmo RG e o mesmo endereço**: uma pessoa
 * representando as duas holdings, com o dossiê repetido e sem nome em lugar
 * nenhum. Derivá-lo do primeiro contato da conta ou do primeiro sócio PF poria
 * na tela uma pessoa que ninguém cadastrou. Quem nomeia a lacuna é
 * {@link nomeDoRepresentantePjNote}, uma vez, na nota do card.
 *
 * `null` quando a fonte não cadastrou nada — a linha simplesmente não ganha
 * sub-linha, em vez de uma fileira de traços.
 */
function representanteDaLinha(partner: BackendCustomerPartner): string | null {
  const rep = partner.representative;
  if (!rep) return null;

  const corpo = [
    [rep.maritalStatus, rep.profession, rep.nationality]
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(' · '),
    documentoDoRepresentante(rep),
    enderecoDoRepresentante(rep),
  ]
    .filter(Boolean)
    .join(' · ');
  if (corpo === '') return null;

  /*
   * O rótulo distingue os dois fatos. Num sócio PJ o representante é OUTRA
   * pessoa, e é isso que o negócio pediu para ver; num sócio pessoa física é ele
   * mesmo, e aí o nome já está na primeira coluna da linha de cima.
   */
  const rotulo =
    partner.registrationType === 'COMPANY'
      ? 'Representante da empresa'
      : 'Dados do representante';
  return `${rotulo}: ${corpo}`;
}

/**
 * A lacuna do NOME, dita uma vez no card — só quando algum sócio PJ de fato
 * mostra o dossiê.
 *
 * Repeti-la em cada sub-linha encheria a tabela da mesma frase; omiti-la de todo
 * deixaria um bloco de dados sem dono aparente, que é como o print do negócio
 * chegou ("não sabemos a pessoa que os representa").
 */
function nomeDoRepresentantePjNote(
  partners: readonly BackendCustomerPartner[],
): string | null {
  const temPjComDossie = partners.some(
    (p) => p.registrationType === 'COMPANY' && representanteDaLinha(p) !== null,
  );
  return temPjComDossie
    ? 'O cadastro do Salesforce não guarda o NOME do representante de sócio ' +
        'pessoa jurídica — apenas os dados dele, exibidos sob cada sócio.'
    : null;
}

/**
 * A nota do card de sócios: a lacuna do nome (quando cabe) + o total de
 * participação.
 *
 * ⚠️ O detalhe do representante **saiu daqui** em 09/09/2026 e passou a ser uma
 * sub-linha por sócio — ver {@link representanteDaLinha} para as duas razões.
 */
function partnersNote(
  partners: readonly BackendCustomerPartner[],
  total: BackendCustomerPartnershipTotal | null | undefined,
): string | null {
  const frases = [
    nomeDoRepresentantePjNote(partners),
    partnershipTotalNote(total),
  ].filter(Boolean);
  return frases.length > 0 ? frases.join(' ') : null;
}

/**
 * A frase do total de participação, para a nota do card.
 *
 * O veredito (soma, quantos não informam, fecha ou não) é do BACKEND — a tela só
 * o escreve. ⚠️ **Nada aqui normaliza:** quando o quadro não fecha 100% a frase
 * diz isso, que é o que o TC pede ("os percentuais somam corretamente") e o
 * único jeito de o usuário perceber um cadastro desatualizado. Medido na UAT: 38
 * de 44 contas com sócio fecham; as que não fecham dão 200% (duas gerações do
 * quadro coexistindo, ou sucessão não baixada) e 50% (sócios faltando).
 *
 * `null` em dois casos, ambos "não há o que afirmar": backend anterior a esta
 * entrega (campo ausente) e nenhum sócio com percentual (`percentTotal: null`) —
 * uma frase dizendo "0%" inventaria o que ninguém cadastrou.
 */
function partnershipTotalNote(
  total: BackendCustomerPartnershipTotal | null | undefined,
): string | null {
  if (!total || total.percentTotal === null) return null;

  const soma = `Total de participação: ${formatPercent(total.percentTotal)}`;
  const faltando =
    total.partnersWithoutPercent > 0
      ? ` · ${total.partnersWithoutPercent} sócio${
          total.partnersWithoutPercent > 1 ? 's' : ''
        } sem percentual informado`
      : '';
  /*
   * `closes === false`, nunca `!closes`: `null` é "não sei" (o backend não julga
   * quadro sem percentual nenhum) e não pode acender um aviso de cadastro errado.
   */
  const aviso =
    total.closes === false
      ? ' — o quadro não fecha 100%; confira o cadastro de sócios no Salesforce.'
      : '.';

  return `${soma}${faltando}${aviso}`;
}

/** `100%`, `99,9%` — sem casas decimais quando é inteiro. */
function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

/**
 * Moeda quando há valor, `-` quando não há.
 *
 * `0` é valor MEDIDO e formata como `R$ 0,00`: a esmagadora maioria dos pares
 * `VR_`/`VU_` do cadastro é zero, e mostrar `-` ali diria "não informado" sobre
 * um número que a fonte informou.
 */
function formatOptionalCurrencyBRL(value: number | null): string {
  return value === null ? '-' : formatCurrencyBRL(value);
}

/**
 * ISO date → `DD/MM/AAAA`, or an em dash when the source did not carry one.
 *
 * Em dash rather than `-`: the dash means "the source has no value for this
 * line", and the card's `note` names the reason once. Building the date from
 * anything else — today, a default — would state a validity nobody declared.
 */
function formatOptionalDateBR(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : '—';
}

/** Formats a bonus tranche as "40% · R$ 1.500.000,00" (or "-" when absent). */
function formatBonus(bonus: BackendCustomerCompanyGroupBonus | null): string {
  return bonus ? `${bonus.percent}% · ${formatCurrencyBRL(bonus.amountBRL)}` : '-';
}

/**
 * Builds a lookup that turns a field name into the text explaining WHY it has no
 * value, or `undefined` when no gap covers it (so the caller falls back to "-").
 *
 * The wording distinguishes the two reasons on purpose: "Aguardando integração
 * Tableau" tells the reader the number does not exist yet anywhere, while
 * "Tableau indisponível" says it exists but could not be fetched now. A bare "-"
 * says neither, and reads as "this client has no such value".
 */
function gapResolver(
  gaps: BackendSectionSourceGap[],
): (field: string) => string | undefined {
  return (field) => {
    const gap = gaps.find((g) => g.fields.includes(field));
    if (!gap) return undefined;
    /*
     * A composição da frase vive em `lib/section-gaps/gap-message.ts` — o
     * painel "Andamento da análise" precisa do mesmo texto, e duas cópias
     * divergiriam no nome da integração, que é a única palavra que o usuário
     * repete ao suporte.
     */
    return sectionGapMessage(gap);
  };
}

/**
 * One field, with the gap sentence marked as such.
 *
 * Three outcomes, and they must stay three (CLAUDE.md §"Campo sem fonte nomeia a
 * integração que falta"):
 *
 *  - value resolved ⇒ data, rendered normally;
 *  - value absent AND a gap covers the field ⇒ the sentence naming the source,
 *    flagged `pending` so it is not read as an answer;
 *  - value absent and NO gap ⇒ plain `-`, which means "this client has no such
 *    value" and is a legitimate business answer.
 */
function gapAwareField(
  label: string,
  resolved: string | null,
  gapKey: string,
  gapText: (field: string) => string | undefined,
): DetailField {
  if (resolved !== null) return { label, value: resolved };
  const gap = gapText(gapKey);
  return gap !== undefined ? { label, value: gap, pending: true } : { label, value: '-' };
}

/**
 * Tabela expansível dos integrantes do grupo econômico (ADO 68082 / TC UAT-031).
 *
 * `undefined` — e não uma tabela vazia — quando não há integrante a listar: o
 * `ExpandableTableView` deriva o botão da existência da tabela, e um
 * "+ Ver integrantes do grupo" que abre em branco é controle morto.
 *
 * O rótulo do botão é o do protótipo (`11-cliente-360.html`), verbatim.
 */
function buildGroupMembersTable(
  economicGroup: BackendCustomerEconomicGroup,
): ExpandableTable | undefined {
  const members = economicGroup.members ?? [];
  if (members.length === 0) return undefined;

  return {
    toggleLabel: `+ Ver integrantes do grupo (${members.length})`,
    closeLabel: '− Ocultar integrantes',
    columns: [
      { key: 'integrante', label: 'Integrante' },
      { key: 'documento', label: 'Documento' },
      { key: 'localizacao', label: 'Localização' },
    ],
    rows: members.map((member) => ({
      /*
       * Código SAP + razão social na mesma célula, como o protótipo faz
       * ("152201 · Posto Vibra Centro-SP"): o código é a identidade que cruza
       * com o SAP, e o nome é o que se lê.
       */
      integrante: member.name
        ? `${member.sapCode} · ${member.name}`
        : member.sapCode,
      /*
       * `-` é resposta: significa "esta conta não publica o campo". Nenhum
       * marcador é inventado — é a regra que a ADR-0021 §2 fixou nesta tela.
       */
      documento: member.taxId ? formatTaxId(member.taxId) : '-',
      localizacao: formatLocation(member.city, member.state),
    })),
    /*
     * A tabela é limitada; a contagem, não. Sem esta nota o leitor concluiria
     * que o grupo acabou na última linha — o mesmo motivo pelo qual a lacuna
     * `LIMITE_EXCEDIDO` nomeia o limite em vez de dizer "indisponível".
     */
    note:
      economicGroup.membersTruncated === true
        ? `Mostrando ${members.length} de ${economicGroup.memberCount ?? members.length} integrantes.`
        : undefined,
  };
}

/** "MOSSORO/RN", "MOSSORO", "RN" ou `-` — nunca uma barra órfã. */
function formatLocation(city: string | null, state: string | null): string {
  if (city && state) return `${city}/${state}`;
  return city ?? state ?? '-';
}

/** Maps a `CrmFranchiseBandeira` enum value to its human-readable label. */
function franquiaBandeiraLabel(bandeira: BackendCustomerFranchiseBandeira): string {
  switch (bandeira) {
    case 'BR_MANIA': return 'BR Mania';
    case 'LUBRAX': return 'Lubrax+';
    default: return bandeira;
  }
}

/**
 * Map the backend 360º DTO to the frontend `ClientDetail`. `account` is
 * assumed present — a 200 response only happens when the (gating) Salesforce
 * call for account/contacts/partners succeeded (see the backend's
 * `Customer360Dto` doc). The remaining sections (`bank`, `guarantees`,
 * `economicGroup`, `companyGroup`, `anp`, `documents`) degrade independently,
 * so each becomes its own `ClientSection` only `when available` — an
 * unavailable section is simply omitted rather than shown empty.
 *
 * `opportunities` is its own degradable section (opportunities module, DB) —
 * mapped to `ClientDetail.opportunities`, or `[]` when unavailable.
 */
/**
 * Data de CALENDÁRIO do cadastro, ou o traço que o resto da 360º usa.
 *
 * `formatCalendarDateBR` devolve `—` (travessão) para ausência, e o resto
 * desta tela escreve `-` (hífen): dois traços diferentes no MESMO card se leem
 * como dois significados. Aqui o traço é o da tela.
 *
 * ⚠️ Nunca `new Date(iso).toLocaleDateString('pt-BR')` — estas são datas de
 * calendário, e em Brasília aquilo rende o dia ANTERIOR (precedente ADO 67993).
 */
function dataDoCadastro(iso: string | null): string {
  if (!iso) return '-';
  const formatada = formatCalendarDateBR(iso);
  return formatada === '—' ? '-' : formatada;
}

/**
 * `customerRef` is the reference the 360º route was requested with (SAP code
 * or CRM id — the backend resolves both). A prospect has no SAP code
 * (ADR-0055: the backend sends `sapCode: ""`), so its `id` falls back to that
 * reference; with `""` the "+ Nova oportunidade" preselect called the prefill
 * with an empty `customerId` and the BFF refused it with 400. Registered
 * accounts keep the SAP code as `id`, same precedence as `customer-mapping.ts`.
 */
export function mapCustomer360ToClientDetail(
  dto: BackendCustomer360,
  customerRef?: string,
): ClientDetail {
  const account = dto.account.data;
  const anp = dto.anp.available ? dto.anp.data : null;

  const sections: ClientSection[] = [];

  if (account) {
    sections.push({
      key: 'conta',
      title: 'Dados da conta',
      kind: 'fields',
      // Field order mirrors the prototype (11-cliente-360.html:66-75) exactly:
      // Setor de Atividade comes right after Centro de Lucro Principal (5th),
      // before Gerência (RP).
      fields: [
        { label: 'Razão social', value: account.legalName },
        // Rótulo derivado do próprio documento: a conta pode ser pessoa física
        // (CPF), e `CNPJ` fixo contradizia o valor mascarado ao lado.
        { label: taxIdLabel(account.taxId), value: formatTaxId(account.taxId) },
        { label: 'Código SAP', value: account.sapCode || '-' },
        { label: 'Centro de Lucro Principal', value: account.profitCenter || '-' },
        { label: 'Setor de Atividade', value: account.setorAtividade || '-' },
        { label: 'Gerência (RP)', value: account.salesTeam || '-' },
        { label: 'Diretoria (DREG)', value: account.salesOffice || '-' },
        { label: 'VP', value: account.vp || '-' },
        { label: 'Líder de Território', value: account.territoryLeader || '-' },
        {
          label: 'Sucessão',
          value:
            account.sucessaoAtiva === null
              ? '-'
              : account.sucessaoAtiva
                ? 'Ativa'
                : 'Inativa',
        },
      ],
    });

    /*
     * Bloco "Mapa da Rede", logo abaixo de "Dados da conta" (pedido de
     * 09/09/2026, com o print da seção homônima do layout de Account).
     *
     * ⚠️ Não é seção degradável irmã: vem na MESMA leitura do Salesforce que
     * responde pela conta, então não existe estado em que ele caia sozinho —
     * uma seção própria prometeria uma degradação que não pode acontecer.
     *
     * ⚠️ **`null` passou a renderizar o card DESABILITADO (10/09/2026)** — antes
     * ele sumia. A razão de sumir era boa (sete traços afirmariam cadastro
     * vazio onde a resposta é "não se aplica"), mas produzia o problema
     * oposto: numa tela cujos outros cards TAMBÉM aparecem e somem por conta
     * própria, a ausência não se distingue de "o bloco não foi entregue" nem
     * de "a fonte caiu". O molde é o de "Dados bancários" quando o cliente não
     * é fornecedor no SAP — `fields: []` + `pending` + a frase — e ele resolve
     * as duas coisas: o card existe (então o leitor sabe que a pergunta foi
     * feita) e o corpo é a resposta, não sete lacunas.
     */
    const mapa = account.mapaDaRede;
    if (mapa) {
      sections.push({
        key: 'mapa-da-rede',
        title: 'Mapa da Rede',
        kind: 'fields',
        // A ordem é a das duas colunas do layout do Salesforce, lida em Z:
        // Status · Nova imagem · Situação · Inativo desde · Justificativa ·
        // Data da saída · Data da entrada. A grade da 360º é de 2 colunas, e
        // preservar a ordem é o que faz a tela cruzar com o print do org.
        fields: [
          {
            label: STATUS_MAPA_DA_REDE_FIELD_LABEL,
            // `—` e NÃO "Vazio": o `''` da fórmula é ausência de status, e
            // quem diz que o cliente está fora do mapa é a Situação ao lado.
            value: textoStatusMapaDaRede(mapa.status) ?? '-',
            hint: STATUS_MAPA_DA_REDE_HELP,
          },
          { label: 'Nova imagem', value: mapa.novaImagem ?? '-' },
          {
            label: SITUACAO_MAPA_DA_REDE_FIELD_LABEL,
            value: textoSituacaoMapaDaRede(mapa.situacao) ?? '-',
          },
          {
            label: 'Inativo desde',
            value: dataDoCadastro(mapa.inativoDesde),
          },
          {
            label: 'Justificativa pendente?',
            value:
              mapa.justificativaPendente === null
                ? '-'
                : mapa.justificativaPendente
                  ? 'Sim'
                  : 'Não',
          },
          {
            label: 'Data da saída',
            value: dataDoCadastro(mapa.dataSaida),
          },
          {
            label: 'Data da entrada',
            value: dataDoCadastro(mapa.dataEntrada),
          },
        ],
      });
    } else if (mapa === null) {
      /*
       * A conta não participa do mapa da rede — 82,5 % das contas DCVIM.
       *
       * ⚠️ `null` e `undefined` NÃO são a mesma coisa aqui, e é por isso que a
       * comparação é estrita. `null` é o backend AFIRMANDO que a conta está
       * fora do mapa; `undefined` é um backend anterior a esta entrega que não
       * manda a chave (skew de deploy), e ali a tela não sabe de nada —
       * escrever "Este cliente não está no Mapa da Rede" seria afirmar sobre o
       * cadastro a partir de uma resposta que ninguém deu. Sem a chave, segue
       * sem card.
       *
       * A frase é DIRETA e não nomeia fonte nem integração: diferente do card
       * de "Dados bancários", aqui não há lacuna de integração a explicar — o
       * Salesforce respondeu, e a resposta é essa.
       */
      sections.push({
        key: 'mapa-da-rede',
        title: 'Mapa da Rede',
        kind: 'fields',
        // Sem rótulos, pelo mesmo motivo de "Dados bancários": os sete campos
        // em branco sugeririam que algum deles ainda pode chegar. A frase é o
        // conteúdo inteiro.
        fields: [],
        pending: true,
        note: MAPA_DA_REDE_FORA_DO_MAPA,
      });
    }
  }

  /*
   * The card must survive the no-data cases (ADO 67553). It used to be built
   * only when an account resolved, so BOTH remaining answers — "este cliente não
   * é fornecedor no SAP" and "o SAP não respondeu" — reached the screen as the
   * same nothing: no card. They are both common (190 of 400 sampled DCVIM
   * accounts are suppliers) and lead to different next steps.
   *
   * Three branches, mirroring the three the backend now distinguishes:
   *   account resolved  → the card, as data;
   *   no account + gap  → the card, dimmed, carrying the gap's sentence;
   *   no account, no gap→ no card, the previous behaviour (an older backend has
   *                       no gap to offer, and inventing a sentence for a reason
   *                       we do not know would be worse than saying nothing).
   */
  if (dto.bank.available && dto.bank.data) {
    const bank = dto.bank.data;
    sections.push({
      key: 'bancario',
      title: 'Dados bancários',
      kind: 'fields',
      /*
       * A field is only pushed when it HAS a value. `bankName` and `accountType`
       * are always null (the iFlow does not carry them and ADR-0025 forbids
       * deriving either), and `branch` is empty when the bank key layout is not
       * recognized — all three used to reach `DetailField.value`, typed `string`,
       * and render as a label with nothing under it. A label with no value is
       * worse than an absent one: it reads as data the system failed to load.
       */
      fields: [
        { label: 'Banco', value: bank.bankCode || '-' },
        { label: 'Agência', value: bank.branch || '-' },
        ...(bank.accountType ? [{ label: 'Tipo de conta', value: bank.accountType }] : []),
        { label: 'Número da conta', value: bank.accountNumber || '-' },
      ],
    });
  } else {
    const bankGap = gapResolver(dto.bank.gaps ?? [])('bank');
    if (bankGap !== undefined) {
      sections.push({
        key: 'bancario',
        title: 'Dados bancários',
        kind: 'fields',
        // Deliberately no labels: `accountType` and `bankName` are fields the
        // source NEVER carries, so rendering them blank would suggest they might
        // arrive one day. The sentence is the whole content.
        fields: [],
        pending: true,
        note: bankGap,
      });
    }
  }

  if (dto.contacts.available && dto.contacts.data) {
    sections.push({
      key: 'contatos',
      title: 'Contatos',
      kind: 'table',
      columns: [
        { key: 'nome', label: 'Nome' },
        { key: 'celular', label: 'Celular' },
        { key: 'email', label: 'E-mail' },
      ],
      rows: dto.contacts.data.map((contact) => ({
        nome: contact.name,
        celular: contact.mobilePhone ?? '—',
        email: contact.email ?? '—',
      })),
      emptyLabel: 'Nenhum contato cadastrado para este cliente no Salesforce.',
    });
  }

  if (dto.partners.available && dto.partners.data) {
    sections.push({
      key: 'socios',
      title: 'Sócios e representantes',
      kind: 'table',
      /*
       * As 5 colunas do protótipo (`11-cliente-360.html:97`), sem acréscimo. O
       * dossiê do representante NÃO vira coluna: são treze campos, em branco na
       * esmagadora maioria dos sócios (5.888 de 1,24 M têm algum) — ele desce
       * para a sub-linha `representante`, declarada em `detailKey`.
       */
      columns: [
        { key: 'nome', label: 'Sócio' },
        { key: 'tipo', label: 'Tipo de cadastro' },
        { key: 'documento', label: 'Documento' },
        { key: 'part', label: '% part.' },
        { key: 'representa', label: 'Representa?' },
      ],
      detailKey: 'representante',
      rows: dto.partners.data.map((partner) => {
        const representante = representanteDaLinha(partner);
        return {
          nome: partner.name,
          tipo: PARTNER_TYPE_LABEL[partner.registrationType],
          documento: partner.taxId ? formatTaxId(partner.taxId) : '—',
          part:
            partner.participationPercent === null
              ? '—'
              : formatPercent(partner.participationPercent),
          representa: partner.isContractRepresentative ? 'Sim' : 'Não',
          /*
           * A chave só entra quando HÁ dossiê: presente e vazia, a `MiniTable`
           * abriria uma sub-linha em branco sob cada sócio — o mesmo ruído que
           * uma coluna de traços, com mais altura.
           */
          ...(representante === null ? {} : { representante }),
        };
      }),
      /*
       * A lacuna do nome + o total de participação. Nenhum dos dois é uma linha
       * de sócio: o `MiniTable` renderiza `rows` como sócios, e um "sócio"
       * chamado "Total" seria dado falso na mesma tabela.
       */
      note: partnersNote(dto.partners.data, dto.partners.total) ?? undefined,
      emptyLabel:
        'Nenhum sócio ou representante cadastrado para este cliente no Salesforce.',
    });
  }

  if (dto.economicGroup.available && dto.economicGroup.data) {
    const economicGroup = dto.economicGroup.data;
    const gapText = gapResolver(economicGroup.gaps);
    // No group is a business fact, not a hole: say so in words. Falling back to
    // "-" here would be indistinguishable from a Salesforce outage, and since
    // most accounts genuinely have no group the mistake would never be noticed.
    const unlinked = economicGroup.groupId === null && !gapText('groupId');

    sections.push({
      key: 'grupo-economico',
      title: 'Grupo Econômico',
      kind: 'fields',
      fields: unlinked
        ? [{ label: 'Grupo econômico', value: 'Não vinculado a grupo econômico' }]
        : [
            // groupName already carries the id ("Grupo Econômico - 0000000775"),
            // so the id is not repeated as its own field.
            gapAwareField('Grupo econômico', economicGroup.groupName, 'groupName', gapText),
            gapAwareField(
              'Integrantes',
              economicGroup.memberCount === null ? null : String(economicGroup.memberCount),
              'memberCount',
              gapText,
            ),
            gapAwareField(
              'Exposição financeira (ARP)',
              economicGroup.exposureAmount === null
                ? null
                : formatCurrencyBRL(economicGroup.exposureAmount),
              'exposureAmount',
              gapText,
            ),
            gapAwareField('Critério', economicGroup.criterion, 'criterion', gapText),
          ],
      /*
       * ADO 68082 / TC UAT-031 — *"E expandir os integrantes do grupo … a
       * tabela de integrantes apresenta os dados por conta"*. O card mostrava
       * só a contagem e não havia como expandir.
       *
       * ⚠️ **Não é a tabela que a ADR-0021 §2 removeu.** Aquela listava *Vol.
       * pactuado*, *Vol. performado*, *% cumpr.*, *Índice R$/L*, *% antecip.* e
       * *% postecip.* — medidas devidas ao Tableau (sem contrato) e ao ARP
       * (G11), ou seja, colunas que a tela teria de FABRICAR. Estas são
       * cadastrais, lidas do master na mesma query que já roda para o ARP.
       *
       * Ausente quando não há integrante a listar: o `ExpandableTableView`
       * renderiza o botão a partir da existência da tabela, e um "+ Ver
       * integrantes" que abre vazio é controle morto.
       */
      expandable: unlinked ? undefined : buildGroupMembersTable(economicGroup),
    });
  }

  /*
   * Hidden by product decision (24/08/2026). The switch is
   * `SHOW_COMPANY_GROUP_CARD` (`./company-group-visibility`), where the reason,
   * the accepted consequence, the revisit trigger and the how-to-revert live.
   *
   * ⚠️ Eixo PRÓPRIO desde o ADO 68073: a COLUNA da carteira voltou a ser
   * exibida e o card não — o pedido do negócio era sobre a tabela, e a razão de
   * esconder este card (um fato ao lado de oito lacunas) não mudou.
   *
   * The block below is kept WHOLE on purpose: reverting is a flip, and what has
   * to come back correct is the per-field VBR-493 treatment documented inside it
   * — not a rewrite. Gated here, in the mapper, and not by pruning `sections` in
   * the view: the mapper is the single authority over what the BFF serves
   * (`app/api/clients/[id]/route.ts`), and a second one would let a test assert
   * a section that never reaches the screen.
   */
  if (SHOW_COMPANY_GROUP_CARD && dto.companyGroup.available && dto.companyGroup.data) {
    const companyGroup = dto.companyGroup.data;
    const gapText = gapResolver(companyGroup.gaps);
    const unlinked = companyGroup.code === null && !gapText('code');

    /*
     * "18.000 m³ · 75%" (volume + % cumprimento), both from Tableau. `null` when
     * the volume is absent — resolving the gap sentence here would hand
     * `gapAwareField` a non-null value and lose the `pending` flag.
     */
    const performedValue =
      companyGroup.performedVolumeM3 === null
        ? null
        : `${formatVolumeM3(companyGroup.performedVolumeM3)}${
            companyGroup.complianceRatioPercent === null
              ? ''
              : ` · ${companyGroup.complianceRatioPercent}%`
          }`;

    sections.push({
      key: 'grupo-empresa',
      title: 'Grupo Empresa',
      kind: 'fields',
      /*
       * Section-level dimming PLUS per-field opt-out — the two together, not
       * one or the other.
       *
       * The card mixes two kinds of answer: "Grupo empresa" is a fact the CRM
       * knows (a name, or "Não vinculado a grupo empresa"), while the six
       * measures below are owed by Tableau and the ARP. A section flag alone
       * can only fade both or neither, and both halves of that are wrong:
       *
       *  - fading both subordinates the fact, which is real data (CA-2);
       *  - fading neither promotes six gap sentences to data — which is what
       *    used to happen, since ~81% of accounts genuinely have no company
       *    group, so the majority case rendered "Aguardando integração Tableau"
       *    in the same bold black as a real number (CA-1).
       *
       * So the section dims (that is the "this card is not integrated" signal
       * the UAT asked for) and `FieldValue` restores full opacity for any value
       * that actually resolved. Both criteria hold.
       *
       * `pending` is set only when a gap EXISTS: a card whose sources all
       * answered has nothing to apologise for.
       */
      pending: companyGroup.gaps.length > 0,
      // Field order mirrors the prototype (11-cliente-360.html:118-125) exactly.
      fields: [
        unlinked
          ? { label: 'Grupo empresa', value: 'Não vinculado a grupo empresa' }
          : gapAwareField('Grupo empresa', companyGroup.label, 'label', gapText),
        // No backend source exists yet for this field — resolves to the gap text
        // if a gap ever covers it, or '-' until then. No mock kept (CA-3).
        gapAwareField('Última oportunidade concluída', null, 'ultimaOportunidade', gapText),
        gapAwareField(
          'Volume pactuado',
          companyGroup.contractedVolumeM3 === null
            ? null
            : formatVolumeM3(companyGroup.contractedVolumeM3),
          'contractedVolumeM3',
          gapText,
        ),
        gapAwareField('Volume performado', performedValue, 'performedVolumeM3', gapText),
        gapAwareField(
          'Vigência',
          companyGroup.validity
            ? `${formatIsoDate(companyGroup.validity.from)} → ${formatIsoDate(companyGroup.validity.to)}`
            : null,
          'validity',
          gapText,
        ),
        gapAwareField(
          'Bonificação antecipada',
          companyGroup.advanceBonus ? formatBonus(companyGroup.advanceBonus) : null,
          'advanceBonus',
          gapText,
        ),
        gapAwareField(
          'Bonificação postecipada',
          companyGroup.deferredBonus ? formatBonus(companyGroup.deferredBonus) : null,
          'deferredBonus',
          gapText,
        ),
        gapAwareField(
          'Índice R$/L',
          companyGroup.revenuePerLiterBRL === null
            ? null
            : formatRevenuePerLiter(companyGroup.revenuePerLiterBRL),
          'revenuePerLiterBRL',
          gapText,
        ),
      ],
    });
  }

  // ANP e Franquias são duas seções distintas (protótipo). Ambas sempre
  // renderizadas para preservar o layout do painel.
  //
  // Os campos da ANP passam por `gapAwareField` (VBR-539): sem a lacuna, "posto
  // fora do cadastro da ANP", "ANP indisponível" e "cliente sem CNPJ"
  // renderizavam o MESMO traço — e foi exatamente por isso que não se
  // conseguia dizer, olhando a tela de stage, se o defeito era nosso ou da
  // fonte. A frase vem do backend (`detail`); a tela não a inventa.
  const anpGapText = gapResolver(dto.anp.gaps ?? []);
  sections.push({
    key: 'anp',
    title: 'ANP',
    kind: 'fields',
    fields: [
      gapAwareField('Bandeira ANP', anp?.flag || null, 'flag', anpGapText),
      // statusSIGAF cru da ANP (Interdição/Desinterdição/vazio). Vazio = sem
      // interdição → "-". NÃO usa o enum normalizado (status), que era um
      // rótulo inventado ("AUTHORIZED") e não um valor que a ANP retorna.
      // Com registro resolvido, o "-" continua significando "sem interdição" —
      // um fato, não uma lacuna.
      gapAwareField('Status ANP', anp?.statusSigaf || null, 'statusSigaf', anpGapText),
      gapAwareField(
        'Nº autorização',
        anp?.authorizationNumber || null,
        'authorizationNumber',
        anpGapText,
      ),
      // "Última atualização ANP" no protótipo (11-cliente-360.html:148) = a
      // dataPublicacao da ANP (lastUpdatedAt, ISO) → formatada dd/mm/yyyy.
      gapAwareField(
        'Última atualização ANP',
        anp?.lastUpdatedAt ? formatIsoDate(anp.lastUpdatedAt) : null,
        'lastUpdatedAt',
        anpGapText,
      ),
      // Only shown when the answer came from the mirrored register (ADR-0041):
      // on the live path there is nothing to qualify, and a permanent "Origem:
      // consulta ao vivo" row would just be noise. `statusSigaf` reads "-"
      // here because the open dataset does not publish it — this row is what
      // explains that.
      ...(anp?.source === 'mirror'
        ? [
            {
              label: 'Origem do dado',
              value: anp.asOf
                ? `Cadastro aberto da ANP (${formatIsoDate(anp.asOf)})`
                : 'Cadastro aberto da ANP',
            },
          ]
        : []),
    ],
  });

  // ─── Franquias (sourced from Salesforce DCF — Bug 67504) ───────────────────
  //
  // Three distinct states must render differently (same discipline as ANP/VBR-539):
  //
  //   1. available: true, items: []          → "sem franquia vinculada" (business fact)
  //   2. available: true, items: [...]       → list of franchise units
  //   3. available: false                    → "Salesforce indisponível"
  //   4. section absent (old backend before Bug 67504) → "-" (feature not yet deployed)
  //
  // Each franchise may have its own executivo (or none).  When a posto has two
  // franchises with different executives the card lists them per franchise.
  {
    const franchisesSection = dto.franchises;
    // Four distinct states — each must render differently:
    //   absent (undefined) = old backend before Bug 67504 → plain "-" for all fields
    //   available: false   = backend knows the feature, Salesforce is currently down
    //                        → "Salesforce indisponível" (pending)
    //   available + items  = real franchise units → list
    //   available + empty  = posto has no franchise → "Sem franquia vinculada"
    const franchisesAbsent = franchisesSection === undefined;
    const franchisesUnavailable =
      !franchisesAbsent && franchisesSection !== undefined && !franchisesSection.available;

    const franchisesItems =
      !franchisesAbsent && franchisesSection?.available && franchisesSection.data
        ? franchisesSection.data.items
        : [];

    const franquiasValue = franchisesAbsent
      ? '-'
      : franchisesUnavailable
        ? 'Salesforce indisponível'
        : franchisesItems.length === 0
          ? 'Sem franquia vinculada'
          : franchisesItems.map((f) => `${franquiaBandeiraLabel(f.bandeira)} (SAP ${f.sapCode})`).join(' · ');

    const executivoValue = franchisesAbsent
      ? '-'
      : franchisesUnavailable
        ? 'Salesforce indisponível'
        : franchisesItems.length === 0
          ? '-'
          : franchisesItems
              .map((f) => (f.executivo ? `${f.executivo} (${franquiaBandeiraLabel(f.bandeira)})` : null))
              .filter((v): v is string => v !== null)
              .join(' · ') || '-';

    sections.push({
      key: 'franquias',
      title: 'Franquias',
      kind: 'fields',
      fields: [
        {
          label: 'Franquias',
          value: franquiasValue,
          ...(franchisesUnavailable ? { pending: true } : {}),
        },
        {
          label: 'Executivo de franquia',
          value: executivoValue,
          ...(franchisesUnavailable ? { pending: true } : {}),
        },
      ],
    });
  }

  // Garantias are always rendered — a section that silently disappears is
  // indistinguishable from one that simply has no data (CA-4). When the ERP
  // integration is not available the section appears with reduced opacity and a
  // note explaining the source, instead of vanishing entirely.
  //
  // Columns mirror the prototype (11-cliente-360.html:165) exactly:
  // "Posto vinculado" comes right after "Tipo".
  const garantiasColumns = [
    { key: 'tipo', label: 'Tipo' },
    { key: 'posto', label: 'Posto vinculado' },
    { key: 'vigencia', label: 'Vigência' },
    { key: 'valor', label: 'Valor avaliado' },
    // Teto e saldo vêm do SAP. Antes a coluna "Valor" era o avaliado e lia como
    // disponível — numa garantia medida, avaliado R$ 207 M contra teto R$ 132 M,
    // uma superdeclaração de 57 % (VBR-646).
    { key: 'teto', label: 'Teto' },
    { key: 'disponivel', label: 'Disponível' },
    { key: 'limite', label: 'Lim. crédito' },
    { key: 'parcelamento', label: 'Parcelamento' },
    { key: 'concessao', label: 'Concessão fin.' },
  ];

  /*
   * A frase vem SEMPRE do gap, nunca de um literal aqui. O literal anterior dizia
   * "Aguardando integração ERP" para os dois motivos ao mesmo tempo — não
   * distinguia "não contratada" de "indisponível", e nomeava "ERP" enquanto o
   * catálogo de fontes chama a fonte de "SAP", então tela e catálogo discordavam
   * na única palavra que o leitor repetiria ao suporte.
   *
   * Desde a ADR-0046 há DOIS gaps possíveis, e a distinção é o conteúdo do card:
   *  - `validFrom` — permanente: a fonte lida não tem vigência, e o SAP, que a
   *    deve, não tem contrato (VBR-98). Aparece no caminho felizmente também.
   *  - `guarantees` — só quando a fonte lida cai.
   */
  const guaranteeGapText = gapResolver(dto.guarantees.gaps ?? []);
  const vigenciaGap = guaranteeGapText('validFrom');

  /*
   * Uma lista vazia tem DOIS motivos possíveis, e eles levam o leitor a
   * conclusões diferentes (VBR-646): o cliente não tem conta de crédito no SAP,
   * ou tem a conta e nenhuma garantia constituída. Nenhum dos dois é falha —
   * ambos chegam como HTTP 404 na fonte. Sem essa frase a tela diria apenas
   * "nada aqui" e apagaria a distinção.
   */
  const emptyGuaranteeNote =
    dto.guarantees.outcome === 'NO_CREDIT_ACCOUNT'
      ? 'Cliente sem conta de crédito no SAP.'
      : dto.guarantees.outcome === 'NO_GUARANTEES'
        ? 'Conta de crédito sem garantia constituída.'
        : null;

  if (dto.guarantees.available && dto.guarantees.data) {
    const hasRows = dto.guarantees.data.length > 0;
    sections.push({
      key: 'garantias',
      title: 'Garantias vigentes',
      kind: 'table',
      columns: garantiasColumns,
      rows: dto.guarantees.data.map((guarantee) => ({
        tipo: guarantee.type,
        // As garantias são lidas pelo Código SAP DESTA conta, então o posto
        // vinculado é a própria conta (o sujeito da 360º). O registro da fonte
        // não tem campo de posto.
        posto: account?.legalName ?? '-',
        /*
         * A vigência passou a ter fonte com o SAP (`datMaxFiaSpot`). Travessão
         * apenas quando a linha não a traz — e aí o motivo vai no `note` do
         * card, uma vez, nunca repetido em cada linha: a lacuna é propriedade da
         * FONTE, idêntica em todas elas, e repetir a frase numa das colunas × N
         * linhas empurra os valores reais para fora da tela.
         */
        vigencia: formatOptionalDateBR(guarantee.validTo),
        valor: formatOptionalCurrencyBRL(guarantee.amount),
        teto: formatOptionalCurrencyBRL(guarantee.ceilingBRL),
        disponivel: formatOptionalCurrencyBRL(guarantee.availableBRL),
        limite: formatOptionalCurrencyBRL(guarantee.usedSupplyBRL),
        parcelamento: formatOptionalCurrencyBRL(guarantee.usedInstallmentBRL),
        concessao: formatOptionalCurrencyBRL(guarantee.usedFinancialGrantBRL),
      })),
      /*
       * `pending` fica FALSO com dado real, mesmo havendo lacuna de vigência.
       * Ligá-lo aqui esmaeceria seis valores reais por causa de uma coluna — a
       * regressão da VBR-493, invertida.
       */
      /*
       * Com linhas, a nota é a lacuna da fonte; sem linhas, é o MOTIVO de não
       * haver nenhuma. `pending` fica FALSO nos dois casos: nada falhou, e
       * ligá-lo esmaeceria valores reais por causa de uma coluna — a regressão
       * da VBR-493, invertida.
       */
      ...(hasRows
        ? vigenciaGap
          ? { note: vigenciaGap }
          : {}
        : emptyGuaranteeNote
          ? { note: emptyGuaranteeNote }
          : vigenciaGap
            ? { note: vigenciaGap }
            : {}),
    });
  } else {
    const guaranteesGap = guaranteeGapText('guarantees');
    sections.push({
      key: 'garantias',
      title: 'Garantias vigentes',
      kind: 'table',
      columns: garantiasColumns,
      rows: [],
      pending: true,
      note: guaranteesGap ?? vigenciaGap ?? 'Fonte de garantias indisponível',
    });
  }

  const docsData = dto.documents.available ? dto.documents.data : null;

  return {
    id: dto.sapCode || (customerRef ?? ''),
    sapCode: dto.sapCode,
    name: account?.legalName ?? dto.sapCode,
    legalName: account?.legalName ?? dto.sapCode,
    document: account ? formatTaxId(account.taxId) : '',
    kind: dto.sapCode ? 'cadastrado' : 'prospect',
    flag: anp?.flag ?? '',
    // Billing address (account) is frequently empty in the CRM — fall back to
    // the posto's regulatory location from ANP (municipio/uf).
    location:
      [account?.city, account?.state].filter(Boolean).join('/') ||
      [anp?.municipio, anp?.uf].filter(Boolean).join('/'),
    /*
     * Risco DDI já calculado (TC 68060). Só a seção DISPONÍVEL preenche a pílula:
     * `available: false` é a leitura ter falhado, e nesse caso `null` — que a
     * tela renderiza como ausência de pílula — é a única leitura honesta.
     * `narrowDdiRiskLevel` devolve `null` para nível desconhecido, então um
     * backend à frente deste nunca pinta a pílula com uma cor chutada.
     */
    risk: dto.ddiRisk?.available ? narrowDdiRiskLevel(dto.ddiRisk.data?.nivel) : null,
    docsCount: docsData?.items.length ?? 0,
    sections,
    documents: docsData ? docsData.items.map((d) => ({ name: d.name, status: d.status })) : [],
    // Opportunities linked to the client; degrades to [] when the section is
    // unavailable (backend DB outage) — the detail then shows the empty state.
    opportunities: dto.opportunities?.available
      ? (dto.opportunities.data ?? []).map((o) => ({
          id: o.id,
          code: o.code,
          title: o.title,
          status: o.status,
        }))
      : [],
  };
}
