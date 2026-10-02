/**
 * BFF mapping for the inline indicated guarantees (GAR-F1).
 *
 * The backend speaks enum CODES (`GARANTIA_REAL`, `NOVA`, `POSTO`) and a raw
 * numeric value ("3200000.00"); the UI speaks display LABELS ("Garantia real
 * (hipoteca / alienação fiduciária)", "Nova", "Posto") and a formatted currency
 * string ("R$ 3.200.000"). The backend's `*Label` fields already carry exactly
 * the UI option strings, so read maps label→display and write maps display→code.
 *
 * The signed storage URL is NEVER exposed to the browser: `mapBackendToItem`
 * rewrites `certidaoUrl`/`laudoUrl` to same-origin BFF stream routes.
 */
import type {
  EnderecoPessoa,
  GarantiaCategoria,
  GarantiaDocSlot,
  GarantiaIndicacaoInput,
  GarantiaIndicacaoItem,
  GarantiaOrigem,
  GarantiaTipoOption,
} from './indicacoes.types';
import { apiUrl } from '@/lib/base-path';

/** Backend response shape (`GarantiaIndicacaoItemDto`). */
export interface BackendGarantiaIndicacao {
  id: string;
  tipo: string;
  tipoLabel: string;
  origem: string;
  origemLabel: string;
  utilizacao: string | null;
  imovel: string | null;
  matricula: string | null;
  matriculas?: Array<{ id: string; ordem: number; numero: string; certidaoAnexada: boolean }>;
  quantidadeLaudos?: number | null;
  laudosAnexados?: number;
  compartilhadaComOutrasOportunidades?: boolean | null;
  detalhesCompartilhamento?: string | null;
  categoria: string | null;
  categoriaLabel: string | null;
  /**
   * Código de máquina do estado civil do fiador (31/08/2026).
   *
   * ⚠️ Lido do CÓDIGO, não do `estadoCivilLabel`: o seletor da tela é
   * `ESTADO_CIVIL_OPTIONS`, que é `{value: código, label}`. Ler o rótulo aqui
   * (como `categoria` faz) obrigaria a um par rótulo↔código só para este campo.
   */
  estadoCivil?: string | null;
  estadoCivilLabel?: string | null;
  valorAvaliadoBrl: string | null;
  observacoes: string | null;
  criadaEm?: string | null;
  certidaoUrl: string | null;
  certidaoFileName: string | null;
  laudoUrl: string | null;
  documentos?: Array<{
    id: string;
    type: string;
    fileName: string;
    uploadedAt: string | null;
    origem: 'REPOSITORIO' | 'LEGADO';
    /** HIP-03 — a matrícula que a certidão lastreia. Ausente fora dela. */
    garantiaMatriculaId?: string | null;
  }>;
  /** FB-01/FB-02 — fiadores da garantia (na bancária, o banco). PII. */
  fiadores?: Array<{
    id: string;
    nome: string;
    documento: string;
    estadoCivil?: string | null;
    conjugeNome?: string | null;
    conjugeDocumento?: string | null;
    email?: string | null;
    profissao?: string | null;
    endereco?: EnderecoPessoa | null;
    conjugeEmail?: string | null;
    conjugeProfissao?: string | null;
    conjugeEndereco?: EnderecoPessoa | null;
    /** Migration `…139` — a certidão de casamento DESTE fiador já está anexada. */
    certidaoCasamentoAnexada?: boolean;
  }>;
  imovelCidade?: string | null;
  imovelUf?: string | null;
  percentualAproveitamentoLabel?: string | null;
  valorAproveitadoLabel?: string | null;
  laudoFileName: string | null;
}

/** Backend upsert body (`GarantiaIndicacaoUpsertDto`). */
export interface BackendGarantiaUpsert {
  tipo: string;
  origem: string;
  /** `null` = "Nenhum" — o campo é `nillable` no org (ver `mapInputToBackend`). */
  utilizacao?: string | null;
  imovel?: string;
  /** HIP-01 — os números, na ordem da tela. */
  matriculas?: Array<{ numero: string }>;
  /** HIP-02 — quantos laudos. Omitido ⇒ o backend lê como 1. */
  quantidadeLaudos?: number;
  categoria?: string;
  /** Código de máquina; ausente = não informado. */
  estadoCivil?: string;
  valorAvaliadoBRL?: number;
  /** GER-03 — obrigatória no DTO do backend. */
  compartilhadaComOutrasOportunidades: boolean;
  /** FB-01/FB-02 — o fiador (na bancária, o banco). Recusado nos tipos sem fiador. */
  fiadores?: Array<{
    nome: string;
    documento: string;
    estadoCivil?: string;
    conjugeNome?: string;
    conjugeDocumento?: string;
    email?: string;
    profissao?: string;
    endereco?: EnderecoPessoa;
    conjugeEmail?: string;
    conjugeProfissao?: string;
    conjugeEndereco?: EnderecoPessoa;
  }>;
  imovelCidade?: string;
  imovelUf?: string;
  /** GER-03 — só com a resposta "Sim"; o backend recusa (400) o inverso. */
  detalhesCompartilhamento?: string;
  observacoes?: string;
}

/**
 * O tipo tem bem dado em garantia? — espelho de `exigeImovel` do backend, na
 * forma dos RÓTULOS que a tela usa.
 *
 * ⚠️ Existe aqui, e não em `lib/garantia/constants.ts`, porque este mapper fala
 * rótulos e aquele arquivo fala códigos de enum. Os dois derivam do MESMO
 * conjunto (`GARANTIA_REAL`, `FIANCA_COM_LASTRO`); um terceiro conjunto escrito à
 * mão é o que deixaria o formulário e o payload discordarem sobre o que a
 * garantia tem.
 */
function tipoTemBem(tipo: GarantiaTipoOption): boolean {
  const codigo = TIPO_LABEL_TO_CODE[tipo];
  return codigo === 'GARANTIA_REAL' || codigo === 'FIANCA_COM_LASTRO';
}

export const TIPO_LABEL_TO_CODE: Record<GarantiaTipoOption, string> = {
  'Garantia real (hipoteca / alienação fiduciária)': 'GARANTIA_REAL',
  'Fiança bancária': 'FIANCA_BANCARIA',
  'Fiança com lastro': 'FIANCA_COM_LASTRO',
  'Fiança sem lastro': 'FIANCA_SEM_LASTRO',
};

const ORIGEM_LABEL_TO_CODE: Record<GarantiaOrigem, string> = {
  Nova: 'NOVA',
  Existente: 'EXISTENTE',
};

const CATEGORIA_LABEL_TO_CODE: Record<GarantiaCategoria, string> = {
  Posto: 'POSTO',
  Comercial: 'COMERCIAL',
  Residencial: 'RESIDENCIAL',
  Rural: 'RURAL',
};

/**
 * Formats a raw numeric string ("3200000.00") as "R$ 3.200.000,00" (pt-BR,
 * always 2 decimals — like every other money surface in the app). Dropping the
 * cents here would silently destroy them on the edit round-trip: the modal
 * hydrates from this display string.
 */
export function formatValorBrl(raw: string | null): string {
  if (!raw) return '';
  const n = Number(raw);
  if (!Number.isFinite(n)) return '';
  return `R$ ${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}`;
}

/** Parses a display value ("R$ 3.200.000" / "3.200.000,50") into a number, or undefined when empty/invalid. */
export function parseValorBrl(display: string): number | undefined {
  const cleaned = display
    .replace(/r\$/i, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Maps a backend row to the UI item. `opportunityId` is needed to build the
 * same-origin stream URL for the attached documents.
 */
export function mapBackendToItem(
  opportunityId: string,
  b: BackendGarantiaIndicacao,
): GarantiaIndicacaoItem {
  const streamUrl = (slot: GarantiaDocSlot, url: string | null) =>
    url
      ? apiUrl('opportunities', opportunityId, 'garantias', b.id, slot, 'view')
      : null;

  return {
    id: b.id,
    // `tipoLabel`/`origemLabel`/`categoriaLabel` ARE the UI option strings.
    tipo: b.tipoLabel as GarantiaTipoOption,
    origem: b.origemLabel as GarantiaOrigem,
    // O API name do org já é o rótulo pt-BR desta picklist — sem par
    // código/label a traduzir aqui.
    utilizacao: b.utilizacao ?? '',
    imovel: b.imovel ?? '',
    matricula: b.matricula ?? '',
    /*
     * `?? []` e não `!`: um payload de um build anterior (ou a projeção do read
     * model antes de carregar as matrículas) simplesmente não traz o campo, e a
     * tela precisa renderizar a garantia sem as matrículas em vez de estourar.
     */
    matriculas: (b.matriculas ?? []).map((m) => ({
      id: m.id,
      ordem: m.ordem,
      numero: m.numero,
      certidaoAnexada: m.certidaoAnexada,
    })),
    quantidadeLaudos: b.quantidadeLaudos ?? null,
    laudosAnexados: b.laudosAnexados ?? 0,
    /*
     * `?? null`, NUNCA `?? false`: `null` é "não respondida" (linha anterior a
     * 31/08/2026), e carimbá-la com "Não" na leitura afirmaria uma resposta que
     * ninguém deu — a classe de defeito do default `CIF` do incoterm.
     */
    compartilhada: b.compartilhadaComOutrasOportunidades ?? null,
    detalhesCompartilhamento: b.detalhesCompartilhamento ?? '',
    categoria: (b.categoriaLabel as GarantiaCategoria | null) ?? null,
    /*
     * CÓDIGO, não rótulo — ver `BackendGarantiaIndicacao.estadoCivil`. Ausente
     * (linha anterior à coluna, ou tipo que não pergunta) ⇒ `null`, que é o que
     * deixa o seletor no placeholder em vez de escolher por ninguém.
     */
    estadoCivil: (b.estadoCivil as GarantiaIndicacaoItem['estadoCivil']) ?? null,
    valor: formatValorBrl(b.valorAvaliadoBrl),
    certidaoUrl: streamUrl('certidao', b.certidaoUrl),
    certidaoFileName: b.certidaoFileName,
    laudoUrl: streamUrl('laudo', b.laudoUrl),
    laudoFileName: b.laudoFileName,
    observacoes: b.observacoes ?? '',
    /*
     * `?? null` porque o campo é NOVO: um backend anterior a esta entrega não o
     * manda, e `foiRecusadaNaPrevia` responde `false` sem data — a tela degrada
     * para "nenhuma linha rotulada", nunca para um rótulo inventado.
     */
    criadaEm: b.criadaEm ?? null,
    /*
     * Duas rotas, porque são dois lugares de armazenamento: o documento do
     * REPOSITÓRIO é endereçado pelo `repositoryDocumentId`; o LEGADO, que vive
     * nas colunas da linha, pelo slot — e o `id` que o backend manda já é o
     * slot. Nenhuma URL assinada do document store chega ao browser nos dois
     * casos (mesma regra do token de sessão).
     */
    /*
     * FB-01/FB-02 — `?? []` e nunca `null`: o consumidor lê `fiadores[0]` para
     * reabrir o bloco do banco, e um `null` ali obrigaria toda leitura a
     * defender-se de dois "vazios" diferentes.
     */
    fiadores: (b.fiadores ?? []).map((f) => ({
      id: f.id,
      nome: f.nome,
      documento: f.documento,
      // `?? null` em cada um: pessoa jurídica (o banco) não tem nenhum dos três,
      // e linha anterior a 02/09/2026 também não.
      estadoCivil: f.estadoCivil ?? null,
      conjugeNome: f.conjugeNome ?? null,
      conjugeDocumento: f.conjugeDocumento ?? null,
      // Same `?? null`: a legal entity and rows from before the contact fields
      // existed have none, and the form must show them empty, not invented.
      email: f.email ?? null,
      profissao: f.profissao ?? null,
      endereco: f.endereco ?? null,
      conjugeEmail: f.conjugeEmail ?? null,
      conjugeProfissao: f.conjugeProfissao ?? null,
      conjugeEndereco: f.conjugeEndereco ?? null,
      /*
       * `?? false` — backend anterior à `…139` não manda o campo, e "não sei"
       * tem de ler como "não anexada": o contrário mostraria "✓ Anexado" num
       * slot vazio, e o LT não subiria a certidão que a CCOB espera.
       */
      certidaoCasamentoAnexada: f.certidaoCasamentoAnexada ?? false,
    })),
    imovelCidade: b.imovelCidade ?? '',
    imovelUf: b.imovelUf ?? '',
    percentualAproveitamentoLabel: b.percentualAproveitamentoLabel ?? null,
    valorAproveitadoLabel: b.valorAproveitadoLabel ?? null,
    documentos: (b.documentos ?? []).map((d) => {
      const legado = d.origem === 'LEGADO';
      return {
        id: d.id,
        type: d.type,
        fileName: d.fileName,
        uploadedAt: d.uploadedAt,
        legado,
        /*
         * HIP-03 — o vínculo com a matrícula. Era descartado aqui, e por isso a
         * linha do card só conseguia rotular a certidão pelo TIPO: com três
         * matrículas saíam três links de texto idêntico, sem dizer qual
         * matrícula cada um lastreia.
         */
        garantiaMatriculaId: d.garantiaMatriculaId ?? null,
        /*
         * `apiUrl` recebe SEGMENTOS e codifica cada um — o caminho nunca é
         * montado como template aqui. Era, e o `${slot}` de `streamUrl` logo
         * acima ia cru: um `/` vindo do valor deixaria de ser dado e viraria
         * estrutura da URL (CWE-73).
         */
        url: legado
          ? apiUrl('opportunities', opportunityId, 'garantias', b.id, d.id, 'view')
          : apiUrl('opportunities', opportunityId, 'documents', d.id, 'download'),
      };
    }),
  };
}

/** Maps the UI input (display labels + "R$ …") to the backend upsert body (codes + number). */
export function mapInputToBackend(input: GarantiaIndicacaoInput): BackendGarantiaUpsert {
  const body: BackendGarantiaUpsert = {
    tipo: TIPO_LABEL_TO_CODE[input.tipo],
    origem: ORIGEM_LABEL_TO_CODE[input.origem],
    // GER-03 — sempre presente: o DTO do backend a exige (`@IsBoolean()` sem
    // `@IsOptional()`), e omiti-la responderia 400.
    compartilhadaComOutrasOportunidades: input.compartilhada,
  };
  /*
   * FB-01/FB-02 — só quando há fiador para enviar. O DTO recusa o campo nos
   * tipos que não têm fiador, e mandar `[]` seria enviar uma resposta vazia onde
   * a ausência é a resposta.
   */
  if (input.fiadores?.length) body.fiadores = input.fiadores;
  // Cidade/UF só viajam com valor: o backend as trata como opcionais, e string
  // vazia seria gravada como resposta ("não informado" é `null`, não `""`).
  if (input.imovelCidade?.trim()) body.imovelCidade = input.imovelCidade.trim();
  if (input.imovelUf?.trim()) body.imovelUf = input.imovelUf.trim();
  /*
   * `null` explícito, nunca omissão, para "Nenhum".
   *
   * O upsert substitui o registro inteiro: omitir o campo e mandar `null`
   * chegam ao mesmo lugar na CRIAÇÃO, mas na EDIÇÃO o serviço faz
   * `entity.utilizacao = dto.utilizacao ?? null` — então o `null` é o que
   * apaga uma utilização que já existia. Sem ele, escolher "Nenhum" numa
   * garantia já salva não a limparia, e a tela mostraria "Nenhum" com o valor
   * anterior ainda no banco.
   *
   * String vazia não vai: `@IsPicklistValue` a recusaria (ela não é um API name
   * da picklist), e `@IsOptional` só dispensa `null`/`undefined`.
   */
  body.utilizacao = input.utilizacao === '' ? null : input.utilizacao;
  const imovel = input.imovel.trim();
  const observacoes = input.observacoes.trim();
  if (imovel) body.imovel = imovel;
  if (input.categoria) body.categoria = CATEGORIA_LABEL_TO_CODE[input.categoria];
  /*
   * OMITIDO quando não informado, não `null`: o DTO tem `@IsEnum` sob
   * `@IsOptional`, então `null` explícito passaria (o `@IsOptional` o dispensa) —
   * mas o `@IsEmptyWhen` do tipo N/A também o veria como "vazio", e omitir é a
   * forma que o resto deste mapper já usa para os campos escalares.
   *
   * O serviço faz `entity.estadoCivil = dto.estadoCivil ?? null`, então a
   * ausência LIMPA o campo na edição — que é o que precisa acontecer quando o
   * usuário troca o tipo para um que não pergunta.
   */
  if (input.estadoCivil) body.estadoCivil = input.estadoCivil;
  const valor = parseValorBrl(input.valor);
  if (valor !== undefined) body.valorAvaliadoBRL = valor;
  if (observacoes) body.observacoes = observacoes;

  /*
   * HIP-01 — só as linhas com número. A tela mantém uma linha em branco enquanto
   * o usuário digita (é o repetidor), e mandá-la faria o backend recusar com "a
   * matrícula N está sem número" por causa de um campo que o usuário ainda não
   * preencheu.
   *
   * ⚠️ Enviado mesmo VAZIO quando o tipo tem bem — o upsert substitui o registro
   * inteiro, e omitir o array deixaria as matrículas anteriores no banco depois
   * de o usuário removê-las todas na tela.
   */
  const matriculas = input.matriculas
    .map((numero) => numero.trim())
    .filter((numero) => numero !== '')
    .map((numero) => ({ numero }));
  if (matriculas.length > 0 || tipoTemBem(input.tipo)) body.matriculas = matriculas;

  /*
   * HIP-02 — omitido quando não declarado: o backend lê ausência como 1, e
   * mandar `null` seria recusado pelo `@IsInt` (o campo não é nullable no DTO).
   */
  if (input.quantidadeLaudos != null) body.quantidadeLaudos = input.quantidadeLaudos;

  /*
   * GER-03 — o detalhe só viaja com a resposta "Sim". O backend recusa (400) o
   * detalhe com a resposta "Não" (`@IsEmptyWhen`), e o CHECK do banco proíbe o
   * estado — mandar mesmo assim viraria erro na tela por um campo que o usuário
   * já não vê.
   */
  if (input.compartilhada) {
    const detalhes = input.detalhesCompartilhamento.trim();
    if (detalhes) body.detalhesCompartilhamento = detalhes;
  }

  return body;
}
