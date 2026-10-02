'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { StatusPill, type PillVariant } from '@/components/status-pill';
import {
  AdicionarGarantiaBotao,
  GarantiasLista,
  GarantiasVazio,
  type GarantiaLinhaVM,
} from '@/components/garantia/garantias-lista';
import { linhaGarantiaPersistida } from '@/components/garantia/linha-garantia-persistida';
import { DocumentoSuporteCcob } from '@/components/garantia/documento-suporte-ccob';
import {
  FIADOR_EMPTY,
  FiadoresRepetidor,
  type FiadorField,
} from '@/components/garantia/fiadores-repetidor';
import {
  LAUDO_BLOCO_VAZIO,
  LaudosBlocos,
  MATRICULA_BLOCO_VAZIO,
  MatriculasBlocos,
  blocosDeLaudos,
  blocosDeMatriculas,
  type LaudoBloco,
  type MatriculaBloco,
} from '@/components/garantia/matriculas-laudos-blocos';
import { SECONDARY_OUTLINE_BTN } from '@/components/button';
import { useConfirm } from '@/components/confirm-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  createGarantiaIndicada as defaultCreate,
  deleteGarantiaIndicada as defaultDelete,
  loadGarantiasIndicadas as defaultLoad,
  updateGarantiaIndicada as defaultUpdate,
  uploadGarantiaDoc as defaultUploadDoc,
} from '@/lib/garantia/indicacoes.data';
import { maskMoneyInput } from '@/lib/franquia/format';
import {
  ENDERECO_VAZIO,
  enderecoCompleto,
  GARANTIA_CATEGORIA_OPTIONS,
  GARANTIA_ORIGEM_OPTIONS,
  GARANTIA_TIPO_OPTIONS,
  type EnderecoPessoa,
  type GarantiaCategoria,
  type GarantiaDocSlot,
  type GarantiaIndicacaoInput,
  type GarantiaIndicacaoItem,
  type GarantiaOrigem,
  type GarantiaTipoOption,
} from '@/lib/garantia/indicacoes.types';
import { anexarDocumentoGarantia as defaultAnexarComplementar } from '@/lib/garantia/indicacoes.api';
import {
  TIPO_LABEL_TO_CODE,
  parseValorBrl,
} from '@/lib/garantia/indicacoes-mapping';
import { getGarantiaTrack as defaultGetTrilha } from '@/lib/garantia/garantia.data';
import type { GarantiaTrackResult } from '@/lib/garantia/garantia-track.types';
import { AvisoGarantia } from '@/components/garantia/aviso-garantia';
import {
  AVISO_FIANCA_COM_LASTRO,
  AVISO_FIANCA_SEM_LASTRO,
  ACEITOS_DOCUMENTO_COMPLEMENTAR,
  ACEITOS_DOCUMENTO_GARANTIA,
  TIPO_DOCUMENTO_CASAMENTO,
  TIPO_DOCUMENTO_CERTIDAO,
  TIPO_DOCUMENTO_COMPLEMENTAR,
  TIPO_DOCUMENTO_MINUTA_FIANCA,
  TIPO_DOCUMENTO_LAUDO,
  PERGUNTA_COMPARTILHAMENTO,
  TIPO_GARANTIA,
  exigeConjuge,
  exigeFiador,
  fiadorEhPessoaJuridica,
  exigeEstadoCivil,
  exigeImovel,
  type EstadoCivil,
} from '@/lib/garantia/constants';
import { RequiredMark } from '@/components/ui/required-mark';
import { Select } from '@/components/ui/select';
import { PicklistSelect } from '@/components/picklists/picklist-select';
import { PicklistField } from '@/lib/picklists/picklists.types';
import { nomeDeArquivoSeguro } from '@/lib/arquivo/nome-de-arquivo';
import { urlDeMidiaSegura } from '@/lib/arquivo/url-de-midia';

// ---------------------------------------------------------------------------
// Editable "Garantias" card for the opportunity fill-in screen (01b).
//
// The LT registers MULTIPLE indicated guarantees inline (add / edit / remove)
// via a modal — faithful to 01b-oportunidade.html §Garantias.
//
// Backed by the real 1:N backend via the BFF (`/api/opportunities/:id/garantias`)
// through an injectable data layer (tests swap it). Documents (certidão/laudo)
// are uploaded on save (multipart) and streamed back for download. Write controls
// are gated by `canWrite`; remove asks for confirmation (destructive — apaga dado).
//
// ### Conditional fields (table 6c — VBR-476)
// Fields visible/applicable by tipo, governed by `exigeImovel`:
// | Campo        | GARANTIA_REAL | FIANCA_BANCARIA | FIANCA_COM_LASTRO | FIANCA_SEM_LASTRO |
// |---|---|---|---|---|
// | Imóvel       | VIS | N/A | VIS | N/A |
// | Matrícula    | VIS | N/A | VIS | N/A |
// | Categoria    | VIS | N/A | VIS | N/A |
// | Certidão/Laudo | VIS | N/A | VIS | N/A |
//
// `exigeImovel` = tipo === GARANTIA_REAL || tipo === FIANCA_COM_LASTRO
// (NÃO `exigePrevia`, que inclui a fiança bancária — lá o garantidor é o banco)
//
// ⚠️ O **Valor** saiu desta tabela: desde o ADO 67858 ele vale para todo tipo, e
// desde o ADO 68002 é OBRIGATÓRIO em todo tipo (é o `Valor` do org, não o laudo
// do bem — numa fiança bancária, o da carta do banco).
// ---------------------------------------------------------------------------

type LoadStatus = 'loading' | 'loaded' | 'error';

type Props = {
  opportunityId: string;
  /** Injectable for tests; default to the real (mock, Stage 1) data layer. */
  load?: (opportunityId: string) => Promise<GarantiaIndicacaoItem[]>;
  create?: (
    opportunityId: string,
    input: GarantiaIndicacaoInput,
  ) => Promise<GarantiaIndicacaoItem>;
  update?: (
    opportunityId: string,
    id: string,
    input: GarantiaIndicacaoInput,
  ) => Promise<GarantiaIndicacaoItem>;
  remove?: (opportunityId: string, id: string) => Promise<void>;
  uploadDoc?: (
    opportunityId: string,
    id: string,
    slot: GarantiaDocSlot,
    file: File,
  ) => Promise<GarantiaIndicacaoItem>;
  /**
   * Subprocess state for the SET-level head pill (VBR-500). Injectable for
   * tests; defaults to the real read model.
   */
  getTrilha?: (opportunityId: string) => Promise<GarantiaTrackResult>;
  /**
   * Called after any successful create / update / remove so that the parent
   * can revalidate sibling panels (e.g. OpportunityFlowTabs garantia track).
   * CA-1 VBR-536.
   */
  onMutated?: () => void;
  /**
   * Abre os detalhes (somente leitura) de UMA garantia — spec 28/08/2026 §8.1.
   *
   * Opcional de propósito: a tela de preenchimento da oportunidade NÃO a passa e
   * fica inalterada. Só a tela dedicada `/garantia` monta o modal, porque é lá
   * que a CCOB precisa abrir garantia por garantia com os documentos dela.
   */
  /**
   * Presente ⇒ modo SELEÇÃO: a linha é uma PORTA para a página da garantia
   * (TW-01), não um registro editável.
   *
   * Substituiu o `onSelect` que abria modal. É uma função e não um prefixo porque
   * quem monta a rota é a tela dona dela — o card não sabe (nem deve saber) o
   * formato da URL.
   */
  linkDaGarantia?: (item: GarantiaIndicacaoItem) => string;
  /**
   * Anexa um documento pela rota TIPADA — a área complementar (GER-01), a
   * certidão de inteiro teor de UMA matrícula (HIP-03) e cada laudo (HIP-02).
   *
   * `matriculaOrdem` é a posição (1..N) que escopa o `single` a
   * `(garantia, matrícula)`; `fiadorOrdem` faz o mesmo para a certidão de
   * CASAMENTO, que é uma por fiador (migration `…139`). Ausentes para tudo que
   * não pertence a uma matrícula nem a um fiador.
   *
   * `substituirDocumentoId` nomeia o documento que o anexo novo substitui — só o
   * LAUDO manda, porque ele é `single: false` e não tem slot único para o
   * backend resolver sozinho (relato de 03/09/2026).
   *
   * ⚠️ Distinta de `uploadDoc`, que endereça os slots FIXOS da linha — e desde a
   * `…139` **nenhum** documento deste formulário passa por lá: certidão de
   * inteiro teor, laudo e certidão de casamento são N por garantia, e um slot
   * fixo aceita um. `uploadDoc` fica para o legado (a rota continua publicada).
   *
   * Injetável para teste, como as demais funções de dados.
   */
  anexarComplementar?: (
    opportunityId: string,
    indicacaoId: string,
    type: string,
    file: File,
    matriculaOrdem?: number,
    fiadorOrdem?: number,
    substituirDocumentoId?: string,
  ) => Promise<void>;
};

// ── Form model ──────────────────────────────────────────────────────────────

type FormState = {
  tipo: GarantiaTipoOption | '';
  origem: GarantiaOrigem;
  /** `Utilizacao__c` — API name verbatim, vindo do catálogo (ADO 67858). */
  utilizacao: string;
  /**
   * Estado civil do fiador (31/08/2026) — CÓDIGO de máquina, `''` = não
   * respondido. Só nos tipos de `exigeEstadoCivil`.
   */
  imovel: string;
  /**
   * HIP-01 — os números das matrículas, na ordem da tela.
   *
   * Sempre ao menos uma posição enquanto o tipo tem bem: é o repetidor, e a linha
   * em branco é onde o usuário digita. Quem a descarta antes de enviar é
   * `mapInputToBackend` — mandá-la faria o backend recusar por um campo que o
   * usuário ainda não preencheu.
   */
  matriculas: MatriculaBloco[];
  /**
   * HIP-02 — os laudos, um bloco por laudo (01/09/2026).
   *
   * Era um campo NUMÉRICO ("quantidade de laudos") mais um slot fixo de anexo:
   * declarar 3 e ter onde anexar 1. A QUANTIDADE agora é `laudos.length`, e é ela
   * que viaja como `quantidadeLaudos`.
   */
  laudos: LaudoBloco[];
  categoria: GarantiaCategoria;
  valor: string;
  /**
   * GER-03 — pré-marcada em "Não".
   *
   * O padrão vive AQUI, no formulário, onde a pessoa o vê e pode contradizê-lo —
   * nunca no DTO, que exige a resposta e recusaria um payload que a omitisse.
   */
  compartilhada: boolean;
  detalhesCompartilhamento: string;
  /**
   * Certidão de casamento do fiador (31/08/2026) — só em `exigeEstadoCivil`.
   *
   * ⚠️ Último slot FIXO do formulário: a certidão de inteiro teor e o laudo
   * saíram daqui em 01/09/2026 e viraram bloco por matrícula / por laudo, porque
   * cada um deles é N por garantia. A certidão de casamento é uma só.
   */

  /** Filename of an already-attached doc (edit mode) — for the "✓ Anexado" state. */
  /**
   * GER-01 — os arquivos da área de "Documentos complementares", escolhidos e
   * pendentes de upload (sobem no save, como os dois slots acima).
   *
   * Array porque é uma ÁREA, não um slot: o tipo é `single: false` no catálogo, e
   * a garantia aceita quantos o usuário anexar. Os JÁ anexados não vivem aqui —
   * eles aparecem na lista de `documentos` da linha, que vem do backend.
   */
  complementares: File[];
  /**
   * FB-01/FB-02 — o BANCO da fiança bancária, que é o fiador daquela modalidade.
   *
   * Um só, não um repetidor: a bancária tem UM banco. As outras duas fianças têm
   * fiador pessoa física e o card **não** os pergunta — ali os fiadores são os
   * proprietários do imóvel (FL-01), e é o aviso na tela que diz isso.
   */
  imovelCidade: string;
  imovelUf: string;
  /**
   * Os fiadores da garantia (02/09/2026) — o MESMO repetidor do ticket.
   *
   * Substituiu `bancoNome`/`bancoDocumento`: numa `FIANCA_BANCARIA` o garantidor
   * É o banco, e `nome`/`documento` guardam exatamente aquele par (FB-01/FB-02),
   * com os rótulos mudando por `ehBanco`. Dois pares para o mesmo fato era a
   * duplicação que fazia a tela e o payload discordarem sobre qual é o banco.
   *
   * ⚠️ **E o card não coletava fiador nos outros dois tipos.**
   * `motivosDeInaptidao` exige `temFiador` em TODO `FIANCA_*`, então uma fiança
   * **com lastro** ou **sem lastro** cadastrada aqui NUNCA ficava apta — dois dos
   * quatro tipos impossíveis de completar, por construção.
   */
  fiadores: FiadorField[];
  /**
   * FB-03 — a MINUTA do contrato, único anexo da bancária desde 02/09/2026.
   *
   * O `estatutoFile`/`estatutoName` saíram: o estatuto do banco foi RETIRADO
   * (pedido do negócio, *"não existe mais o anexo Estatuto"*) e a minuta passou
   * a ser a obrigatória.
   */
  minutaFiancaFile: File | null;
  minutaFiancaName: string | null;
  observacoes: string;
};

const EMPTY_FORM: FormState = {
  tipo: '',
  origem: 'Nova',
  // Vazio de propósito: valor de picklist do Salesforce nunca nasce escolhido
  // — no org `Fornecimento` é o default, e adotá-lo aqui gravaria uma resposta
  // que ninguém deu (mesmo defeito do default `CIF` do incoterm).
  utilizacao: '',
  imovel: '',
  matriculas: [{ ...MATRICULA_BLOCO_VAZIO }],
  laudos: [{ ...LAUDO_BLOCO_VAZIO }],
  categoria: 'Posto',
  // Vazio pela mesma razão da utilização: estado civil é fato sobre uma pessoa,
  // e um `SOLTEIRO` pré-escolhido seria resposta que ninguém deu.
  valor: "",
  compartilhada: false,
  detalhesCompartilhamento: '',
  complementares: [],
  imovelCidade: "",
  imovelUf: "",
  fiadores: [{ ...FIADOR_EMPTY }],
  minutaFiancaFile: null,
  minutaFiancaName: null,
  observacoes: '',
};

function itemToForm(item: GarantiaIndicacaoItem): FormState {
  return {
    tipo: item.tipo,
    origem: item.origem,
    utilizacao: item.utilizacao,
    imovel: item.imovel,
    /*
     * `['']` quando não há nenhuma: o repetidor precisa de uma linha para o
     * usuário digitar. E a coluna LEGADA (`item.matricula`) hidrata a primeira
     * linha quando a coleção está vazia — sem isso, abrir para editar uma
     * garantia anterior a HIP-01 mostraria o campo em branco e o "Salvar"
     * apagaria a matrícula que estava lá.
     */
    matriculas:
      (item.matriculas ?? []).length > 0
        ? blocosDeMatriculas(item.matriculas ?? [])
        : blocosDeMatriculas(
            item.matricula
              ? [{ numero: item.matricula, certidaoAnexada: false }]
              : [],
          ),
    /*
     * HIP-02 — quantos blocos abrir e quais já vêm marcados. A correspondência
     * bloco ↔ documento é posicional (ver `LaudoBloco`), e `blocosDeLaudos`
     * também cobre o caso de haver mais anexados que declarados.
     */
    /*
     * Os IDS, não a contagem: é deles que sai o `substituirDocumentoId` do save
     * — sem isso, escolher outro arquivo no "Laudo 1" anexava um SEGUNDO laudo
     * (03/09/2026). A ordem é a que o backend devolve (`ORDER BY linked_at`), a
     * mesma de que `laudosAnexados` é o `length`.
     */
    laudos: blocosDeLaudos(
      item.quantidadeLaudos,
      item.documentos
        .filter((d) => d.type === TIPO_DOCUMENTO_LAUDO)
        // `null` no LEGADO: ali o `id` é o SLOT (`"laudo"`), não um documento do
        // repositório — mandá-lo como `substituirDocumentoId` chegaria ao
        // Postgres como uuid inválido (22P02 ⇒ 400) e derrubaria o upload.
        .map((d) => (d.legado ? null : d.id)),
    ),
    categoria: item.categoria ?? 'Posto',
    // `?? ''` e não um default: `null` é "não informado", e escolher por ele na
    // reabertura gravaria a resposta no próximo save.
    // Strip the "R$ " prefix (prototype 01b:328) — the remainder ("3.200.000,00")
    // is already in the pt-BR masked format the input maintains.
    valor: item.valor.replace(/^R\$\s?/, ''),
    // Escolha pendente, nunca hidratada: os anexados já estão em `documentos`.
    complementares: [],
    /*
     * FB-01/FB-02 — o banco. Reabrir PREENCHIDO não é conforto: o upsert é
     * replace-all, então um bloco em branco faria o save seguinte APAGAR o
     * fiador cadastrado. `fiadores[0]` porque a bancária tem um banco.
     */
    /*
     * `?.` embora o tipo diga que `fiadores` sempre existe: a BFF garante `[]`,
     * mas um payload que chegue sem o campo (build antigo servindo a tela nova)
     * derrubaria o `itemToForm` inteiro — e o sintoma seria o modal não ABRIR,
     * não um campo vazio.
     */
    imovelCidade: item.imovelCidade ?? "",
    imovelUf: item.imovelUf ?? "",
    /*
     * Reabrir PREENCHIDO não é conforto: a escrita é replace-all, então um
     * repetidor em branco faria o save seguinte APAGAR os fiadores cadastrados.
     * `[{...FIADOR_EMPTY}]` quando não há nenhum — o repetidor precisa de uma
     * linha para o usuário digitar.
     */
    fiadores:
      (item.fiadores ?? []).length > 0
        ? (item.fiadores ?? []).map((f) => ({
            nome: f.nome,
            documento: f.documento,
            estadoCivil: (f.estadoCivil ?? "") as EstadoCivil | "",
            conjugeNome: f.conjugeNome ?? "",
            conjugeDocumento: f.conjugeDocumento ?? "",
            email: f.email ?? "",
            profissao: f.profissao ?? "",
            endereco: f.endereco ?? { ...ENDERECO_VAZIO },
            conjugeEmail: f.conjugeEmail ?? "",
            conjugeProfissao: f.conjugeProfissao ?? "",
            conjugeEndereco: f.conjugeEndereco ?? { ...ENDERECO_VAZIO },
            certidaoFile: null,
            // Veredito do backend, POR fiador (migration `…139`) — nunca
            // derivado da lista de documentos aqui: com N fiadores, o tipo
            // sozinho não diz de quem é a certidão que chegou.
            certidaoAnexada: f.certidaoCasamentoAnexada,
          }))
        : [{ ...FIADOR_EMPTY }],

    minutaFiancaFile: null,
    minutaFiancaName:
      item.documentos.find((d) => d.type === TIPO_DOCUMENTO_MINUTA_FIANCA)
        ?.fileName ?? null,
    /*
     * `?? false` na HIDRATAÇÃO, e isso é diferente de carimbar a leitura: aqui o
     * `null` (linha anterior a GER-03) precisa virar uma resposta porque o
     * formulário exige uma, e o padrão é "Não" — o mesmo default que uma garantia
     * nova recebe. O `item.compartilhada` continua `null` na LISTA, que é onde a
     * ausência de resposta tem de ficar visível.
     */
    compartilhada: item.compartilhada ?? false,
    detalhesCompartilhamento: item.detalhesCompartilhamento,
    observacoes: item.observacoes,
  };
}

/** Formats the appraised value like the prototype: prepend "R$ " when missing. */
function formatValor(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  return /^r\$/i.test(v) ? v : `R$ ${v}`;
}

/**
 * A linha de meta das matrículas (HIP-01) — "Matrícula 4354" ou
 * "3 matrículas (2 com certidão)".
 *
 * Com UMA matrícula o número é mais útil que a contagem; com várias, a contagem
 * mais o quanto já está documentado é o que o leitor precisa. A coluna LEGADA
 * entra quando a coleção está vazia, senão uma garantia anterior a HIP-01
 * perderia a matrícula da linha de meta.
 */
/**
 * Resolve a label-based tipo to its machine code (for predicate evaluation).
 * The card form works with display labels; predicates work with codes.
 * Returns empty string when tipo is empty (no selection).
 */
function tipoLabelToCode(tipoLabel: GarantiaTipoOption | ''): string {
  if (!tipoLabel) return '';
  return TIPO_LABEL_TO_CODE[tipoLabel] ?? '';
}

/**
 * Form-control className — mirrors the prototype's `.in` (vibra-ui.css): a
 * FILLED, underline-only field — gray `--neutral-40` background, NO border
 * except a 2px bottom (`--neutral-600`), no radius, `--t-caption` font, and a
 * green bottom-border on focus (`--secondary-600`). Shared by every
 * select/input; the textarea appends min-height + vertical resize.
 */
const IN_CLASS =
  'w-full rounded-none border-0 border-b-2 border-(--neutral-600) bg-(--neutral-40) px-3 py-[11px] text-(length:--t-caption) text-(--neutral-800) placeholder:text-(--neutral-500) focus:border-(--secondary-600) focus:outline-none';

/** Field-label font — compact uppercase muted label (`.f`-style, `--t-small`). */
const LABEL_FONT =
  "text-(length:--t-small) uppercase tracking-[0.3px] text-(--color-text-muted)";

// ── Component ─────────────────────────────────────────────────────────────

/**
 * Um slot de documento do BANCO (FB-03) — estatuto ou minuta.
 *
 * Um componente para os dois porque a linha é idêntica; o que muda é o rótulo e
 * o asterisco. Mesma forma visual do slot da certidão de casamento, para o
 * modal não ter dois desenhos de "anexar um arquivo".
 */
function DocSlotBanco({
  testId,
  rotulo,
  nome,
  obrigatorio = false,
  accept,
  onPick,
}: {
  testId: string;
  rotulo: string;
  nome: string | null;
  obrigatorio?: boolean;
  /**
   * Os formatos que a PARAMETRIZAÇÃO daquele tipo aceita — obrigatório, sem
   * default: um default aqui foi exatamente o defeito (o slot oferecia imagem
   * numa linha do catálogo que só aceita `pdf,word`).
   */
  accept: string;
  onPick: (file: File) => void;
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2.5 text-(length:--t-caption)"
    >
      <span className="min-w-0">
        {rotulo}
        {obrigatorio && <RequiredMark />}
        {nome && (
          <span className="ml-1 truncate text-(--color-text-muted)">
            · {nome}
          </span>
        )}
      </span>
      <label className={`${SECONDARY_OUTLINE_BTN} shrink-0 cursor-pointer`}>
        {nome ? '✓ Anexado' : 'Anexar'}
        <input
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onPick(file);
            // Permite reescolher o MESMO arquivo depois de uma recusa do
            // backend: sem isto o `change` não dispara na segunda vez.
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}

export function GarantiasIndicadasCard({
  opportunityId,
  load = defaultLoad,
  create = defaultCreate,
  update = defaultUpdate,
  remove = defaultDelete,
  uploadDoc = defaultUploadDoc,
  getTrilha = defaultGetTrilha,
  onMutated,
  linkDaGarantia,
  anexarComplementar = defaultAnexarComplementar,
}: Props) {
  const { can } = usePermissions();
  // GAR-F1: registrar/editar/remover a indicação pelo CARD é do LT, da SNEG e do
  // Admin (`@Roles(...GARANTIA_CARD_WRITE_ROLES)` nas cinco rotas de escrita) —
  // a CCOB lê e nunca edita, porque é autoridade oposta.
  //
  // Dois gates, e nenhum é redundante: a PERMISSÃO diz quem, a FASE diz quando.
  // O veredito de fase é LIDO do backend (`indicacoesEditaveis`, o mesmo
  // `indicacaoMutavel` que a escrita aplica em 409) — recalcular aqui criaria o
  // par que acaba discordando.
  //
  // ⚠️ Desde 02/09/2026 a fase é a DA OPORTUNIDADE: passado o preenchimento este
  // card fica somente leitura, e o caminho é o ticket de pendência.
  //
  // ⚠️ **`GarantiaIndicarNoCard`, NUNCA `GarantiaIndicar` (11/09/2026).** São
  // permissões distintas de propósito: esta cobre o card e inclui a SNEG, que o
  // negócio liberou a cadastrar garantia **em preenchimento** (ADO 67947 — a
  // frase da reversão sempre disse "em análise"); a outra cobre a via da ANÁLISE
  // (o ticket e o envio à prévia) e segue sem ela. É a composição com
  // `indicacoesEditaveis` que entrega a regra: em análise este card fecha para
  // todo mundo, então a SNEG não reentra por aqui.
  //
  // Inicial `false`, nunca `true`: enquanto a trilha não respondeu, abrir o
  // controle oferece uma ação que a API recusa. Falha na leitura da trilha
  // degrada para bloqueado pela mesma razão (GAR-9).
  const [indicacoesEditaveis, setIndicacoesEditaveis] = useState(false);
  const canWrite = can(Permission.GarantiaIndicarNoCard) && indicacoesEditaveis;
  const confirm = useConfirm();

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<GarantiaIndicacaoItem[]>([]);

  /*
   * VBR-500 — SET-level subprocess state for the head pill.
   *
   * `null` covers three cases that all mean "no state to show": still loading,
   * the source failed, and the backend deliberately sent no state (subprocess
   * does not apply, or a member this build does not know). None of them may
   * render an optimistic state (CA-4), and the pill is decoration over a list
   * that stands on its own — so a failure here degrades to no pill, never to an
   * error that hides the guarantees the LT just registered.
   */
  const [estadoConjunto, setEstadoConjunto] = useState<{
    label: string;
    variant: PillVariant;
  } | null>(null);

  /*
   * ADO 67997 — "a garantia não é obrigatória nesta oportunidade".
   *
   * Frase composta pelo backend (`avisoNaoObrigatoria` da trilha) e renderizada
   * verbatim. `null` cobre os três casos que significam "nada a avisar": ainda
   * carregando, a leitura falhou, e o backend decidiu não avisar (a concessão
   * exige garantia, ou o subprocesso foi encerrado).
   *
   * ⚠️ Não é derivado de `naoSeAplica`: aquele flag também é `true` quando todas
   * as indicações são fiança sem lastro — caso em que a concessão EXIGE garantia
   * e a frase seria falsa.
   */
  const [avisoNaoObrigatoria, setAvisoNaoObrigatoria] = useState<string | null>(
    null,
  );


  /*
   * Contador que faz a TRILHA ser relida depois de uma escrita.
   *
   * O efeito da trilha dependia só de `[opportunityId, getTrilha]`, e as
   * mutações só chamavam `onMutated?.()` — que bumpa um sinal do PAI (para o
   * stepper ao lado revalidar). Ou seja: nada relia a trilha deste card, e os
   * três vereditos que ela carrega ficavam velhos até a próxima navegação.
   *
   * Para o aviso de não obrigatoriedade isso seria o defeito da VBR-478 de
   * novo: o LT cadastra uma hipoteca, a linha aparece na lista, e a frase logo
   * acima continua dizendo que a concessão não exige garantia — "frase falsa
   * para quem acabou de cadastrar no card ao lado". A releitura conserta junto
   * a pill de estado do conjunto e o gate `indicacoesEditaveis`.
   */
  const [trilhaRefresh, setTrilhaRefresh] = useState(0);

  /**
   * Um ponto só para "algo mudou": relê a trilha DESTE card e avisa o pai.
   *
   * Os dois sempre andam juntos — uma escrita que revalidasse o painel vizinho
   * e não o próprio card é exatamente o estado que produziu a frase velha.
   */
  const notifyMutated = useCallback(() => {
    setTrilhaRefresh((n) => n + 1);
    onMutated?.();
  }, [onMutated]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Keep the latest form in a ref so the Esc handler closes without re-binding.
  const modalOpenRef = useRef(false);
  modalOpenRef.current = modalOpen;

  // ── Derived predicates from current tipo ──────────────────────────────────
  // The card stores tipos as LABELS (GarantiaTipoOption) — convert to code
  // first, then apply the canonical predicate functions (ADR-0023 §D1, CA-5).
  const tipoCode = tipoLabelToCode(form.tipo);
  /**
   * Whether the tipo has a **bem dado em garantia** — governs the whole "Imóvel /
   * bem" group (imóvel, matrícula, categoria, valor avaliado, certidão, laudo).
   *
   * NÃO é `exigePrevia`: aquele responde "a CCOB analisa?" e inclui a fiança
   * bancária, onde o garantidor é o banco e não existe imóvel. Usar `exigePrevia`
   * aqui era o que fazia o formulário pedir endereço/matrícula/laudo numa fiança
   * bancária (PRD §7.2 + RN-F1-03).
   */
  const needsImovel = tipoCode ? exigeImovel(tipoCode) : false;
  /**
   * Estado civil do fiador + certidão de casamento (31/08/2026) — fiança com
   * lastro e fiança sem lastro.
   *
   * ⚠️ NÃO é `exigeFiador`: aquele inclui a bancária, cujo garantidor é o banco —
   * pessoa jurídica não tem estado civil nem certidão de casamento (ali o
   * documento é a minuta do contrato). Ver `exigeEstadoCivil`.
   */
  const needsEstadoCivil = tipoCode ? exigeEstadoCivil(tipoCode) : false;
  /**
   * FB-01/FB-02/FB-03 — o banco e os documentos dele, só na FIANÇA BANCÁRIA.
   *
   * O card não coletava fiador nenhum, e `motivosDeInaptidao` exige `temFiador`
   * em todo `FIANCA_*`: nenhuma fiança cadastrada aqui ficava apta, então
   * `reconciliar` abria a pendência "Cadastrar garantia" em vez de promover para
   * a prévia — e a pendência deixou de ser o caminho (a análise prévia dispara
   * com o que está cadastrado no card).
   *
   * ⚠️ Só a bancária, por decisão de produto (01/09/2026): nas outras duas
   * fianças os fiadores são os proprietários do imóvel (FL-01). **Consequência
   * conhecida:** aquelas duas seguem sem poder ficar aptas pelo card.
   */
  const needsBanco = tipoCode === TIPO_GARANTIA.FIANCA_BANCARIA;

  /**
   * Os fiadores preenchidos, no shape que o DTO recebe — `undefined` quando
   * nenhum tem nome E documento.
   *
   * O repetidor mantém sempre uma linha (é onde se digita), então mandá-la em
   * branco faria o backend recusar por um campo que o usuário ainda não
   * preencheu. A falta de fiador é reportada pelo GATE de aptidão, com a frase
   * que nomeia o que falta — não por 400 aqui.
   */
  const fiadoresPreenchidos = ():
    | Array<{
        nome: string;
        documento: string;
        estadoCivil?: EstadoCivil;
        conjugeNome?: string;
        conjugeDocumento?: string;
        email?: string;
        profissao?: string;
        endereco?: EnderecoPessoa;
        conjugeEmail?: string;
        conjugeProfissao?: string;
        conjugeEndereco?: EnderecoPessoa;
      }>
    | undefined => {
    const preenchidos = form.fiadores
      .filter((f) => f.nome.trim() !== "" && f.documento.trim() !== "")
      .map((f) => {
        const base: NonNullable<
          ReturnType<typeof fiadoresPreenchidos>
        >[number] = { nome: f.nome.trim(), documento: f.documento.trim() };

        // Pessoa jurídica (o banco) não tem estado civil nem cônjuge — o DTO os
        // recusa ali, e string vazia reprovaria o `@IsEnum`. O mesmo vale para
        // e-mail, profissão e endereço.
        if (!fiadorEhPessoaJuridica(f.documento)) {
          base.email = f.email.trim();
          base.profissao = f.profissao.trim();
          base.endereco = f.endereco;
        }
        if (!fiadorEhPessoaJuridica(f.documento) && f.estadoCivil !== "") {
          base.estadoCivil = f.estadoCivil;
          if (exigeConjuge(f.estadoCivil)) {
            base.conjugeNome = f.conjugeNome.trim();
            base.conjugeDocumento = f.conjugeDocumento.trim();
            base.conjugeEmail = f.conjugeEmail.trim();
            base.conjugeProfissao = f.conjugeProfissao.trim();
            base.conjugeEndereco = f.conjugeEndereco;
          }
        }
        return base;
      });

    return preenchidos.length > 0 ? preenchidos : undefined;
  };

  /**
   * Os documentos complementares JÁ anexados à garantia em edição (GER-01).
   *
   * Vem da linha (`documentos`), não do formulário: `complementares` guarda só
   * as escolhas pendentes de upload. `[]` na criação — não há garantia ainda.
   *
   * Filtra pelo `type` do catálogo em vez de listar tudo: os outros documentos
   * têm slot próprio no formulário (certidão por matrícula, laudo, minuta,
   * certidão de casamento) e apareceriam duas vezes.
   */
  const complementaresAnexados = editingId
    ? (items
        .find((g) => g.id === editingId)
        ?.documentos.filter((d) => d.type === TIPO_DOCUMENTO_COMPLEMENTAR) ??
      [])
    : [];
  /**
   * `needsFiadores` — os tipos que têm fiador (as três fianças).
   *
   * É `exigeFiador`, o mesmo predicado que `motivosDeInaptidao` usa para cobrar
   * `temFiador`: sem essa correspondência o formulário volta a não coletar o que
   * o gate exige, que é o defeito de 01/09/2026.
   */
  const needsFiadores = tipoCode ? exigeFiador(tipoCode) : false;

  // Load the list on mount / opportunity change.
  useEffect(() => {
    let active = true;
    setStatus('loading');
    load(opportunityId)
      .then((data) => {
        if (!active) return;
        setItems(data);
        setStatus('loaded');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [opportunityId, load]);

  /*
   * Separate effect on purpose: the head pill must never gate the list. If the
   * trilha is slow or down, the guarantees still render — the pill simply does
   * not appear (CA-4: no inferred state).
   */
  useEffect(() => {
    let active = true;
    getTrilha(opportunityId)
      .then((trilha) => {
        if (!active) return;
        setEstadoConjunto(
          trilha.estadoConjuntoLabel !== null &&
            trilha.estadoConjuntoPill !== null
            ? {
                label: trilha.estadoConjuntoLabel,
                variant: trilha.estadoConjuntoPill,
              }
            : null,
        );
        // GAR-9 (Task 7) — same fetch, same verdict: the phase gate for the
        // write controls travels with the pill.
        setIndicacoesEditaveis(trilha.indicacoesEditaveis);
        // ADO 67997 — mesma leitura, mesmo payload: o aviso de não
        // obrigatoriedade viaja junto da pill e do gate de fase.
        setAvisoNaoObrigatoria(trilha.avisoNaoObrigatoria);
      })
      .catch(() => {
        if (!active) return;
        setEstadoConjunto(null);
        // Falha de leitura NÃO inventa o aviso: afirmar "não é obrigatória" sem
        // ter lido o veredito dispensaria uma garantia que a concessão exige.
        setAvisoNaoObrigatoria(null);
        // A failed read degrades to blocked, never to writable — offering
        // the control on a guess would let the LT hit a 409 for a reason
        // the screen never told them about.
        setIndicacoesEditaveis(false);
      });
    return () => {
      active = false;
    };
  }, [opportunityId, getTrilha, trilhaRefresh]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }, []);

  // Esc closes the modal (ConfirmDialog convention).
  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen, closeModal]);

  const openAdd = useCallback(() => {
    if (!canWrite) return;
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  }, [canWrite]);

  const openEdit = useCallback(
    (item: GarantiaIndicacaoItem) => {
      if (!canWrite) return;
      setEditingId(item.id);
      setForm(itemToForm(item));
      setFormError('');
      setModalOpen(true);
    },
    [canWrite],
  );

  /**
   * Handles tipo change with field reset.
   *
   * When the tipo changes, fields that no longer apply to the new tipo are
   * cleared so they don't travel in the payload (CA-3). Pattern mirrors
   * `pendencia-ticket.tsx:1048-1059`.
   */
  const handleTipoChange = useCallback((nextLabel: GarantiaTipoOption | '') => {
    const nextCode = tipoLabelToCode(nextLabel);
    const nextNeedsImovel = nextCode ? exigeImovel(nextCode) : false;

    setForm((f) => {
      const next: FormState = { ...f, tipo: nextLabel };

      /*
       * Não há mais estado civil nem certidão de casamento a limpar AQUI: desde a
       * migration `…139` os dois vivem POR FIADOR, e `fiadores` é zerado logo
       * abaixo quando o tipo novo não tem fiador nenhum — o que leva os dois
       * junto, com o arquivo escolhido.
       */
      /*
       * O banco é resposta EXCLUSIVA da bancária: numa fiança sem lastro o fiador
       * é pessoa física, e o DTO recusa `fiadores` fora das fianças. Preservar o
       * que foi digitado mandaria o banco como fiador de outra modalidade — ou um
       * 400 que o usuário não tem como ler no campo.
       */
      if (nextCode !== TIPO_GARANTIA.FIANCA_BANCARIA) {
        next.fiadores = [{ ...FIADOR_EMPTY }];
        next.minutaFiancaFile = null;
        next.minutaFiancaName = null;
      }

      // Reset property fields when the new tipo has no bem dado em garantia.
      // `valor` NÃO entra aqui desde ADO 67858: o campo passou a valer para
      // todo tipo (é o `Valor` do org), então limpá-lo apagaria uma resposta
      // que continua aplicável.
      /*
       * ⚠️ `complementares` NÃO entra no reset. GER-01 pede a área "sempre
       * disponível, em todos os tipos de garantia", então o arquivo que o usuário
       * já escolheu continua aplicável depois de trocar o tipo — limpá-lo
       * destruiria uma resposta ainda válida (mesmo raciocínio do `valor` desde
       * ADO 67858).
       */
      if (!nextNeedsImovel) {
        next.imovel = '';
        next.imovelCidade = "";
        next.imovelUf = "";
        // Volta ao estado inicial do repetidor (um bloco vazio), não a `[]`:
        // trocar de volta para um tipo com bem tem de reencontrar onde digitar.
        next.matriculas = [{ ...MATRICULA_BLOCO_VAZIO }];
        next.laudos = [{ ...LAUDO_BLOCO_VAZIO }];
      }

      // Reset categoria when the new tipo does not use it.
      if (!nextNeedsImovel) {
        next.categoria = "Posto"; // reset to default (hidden, won't travel)
      }

      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    // Read-only profiles: the API answers 403; guard here since the form
    // submits even with the button hidden (CLAUDE.md write-controls rule).
    if (!canWrite) return;
    if (!form.tipo) {
      setFormError('Selecione o tipo de garantia.');
      return;
    }
    /*
     * ADO 68002 — o VALOR é obrigatório em todo tipo. Quem já obriga é o org: a
     * VR ativa `Valor_Proposto_Obrigatorio` exige `Valor_Avaliado__c`, e uma
     * garantia sem valor faz o org recusar a sincronização da cotação em
     * silêncio — a tela fica em "Sincronizando…" para sempre.
     *
     * O parse é o `parseValorBrl` do mapper (o mesmo que a borda usa para montar
     * o payload), nunca um segundo: só assim o que a tela aceita é exatamente o
     * que viaja. Ele já devolve `undefined` para vazio e para <= 0 — e `R$ 0,00`
     * é literalmente o valor da captura do work item.
     */
    if (parseValorBrl(form.valor) === undefined) {
      setFormError('Informe o valor da garantia.');
      return;
    }

    /*
     * ⚠️ **Fiador pela METADE não é descartado em silêncio.**
     *
     * O payload só monta o fiador com os DOIS campos preenchidos (nome E
     * documento) — sem esta guarda o que faltasse ia para o chão sem uma
     * palavra: a garantia salvava sem fiador, a linha mostrava "—" e a
     * reabertura vinha em branco, com o usuário certo de que havia digitado.
     *
     * Era só do BANCO (02/09/2026) e passou a valer para todo fiador quando o
     * card ganhou o repetidor — a fiança com lastro tem o mesmo par, e a mesma
     * forma de perdê-lo.
     *
     * ⚠️ NÃO é "fiador é obrigatório": `fiadores` é opcional no DTO, e a falta é
     * reportada pelo gate de aptidão (com a frase que nomeia o que falta), não
     * aqui — o card salva parcialmente de propósito. O que a guarda impede é
     * salvar **meio fiador**.
     */
    if (needsFiadores) {
      const incompleto = form.fiadores.findIndex((f) => {
        const nome = f.nome.trim();
        const documento = f.documento.trim();
        return (nome === "") !== (documento === "");
      });
      if (incompleto !== -1) {
        const f = form.fiadores[incompleto];
        const rotulo = needsBanco ? "do banco" : `do fiador ${incompleto + 1}`;
        // "CNPJ" no banco, "documento" numa pessoa que pode ser física ou
        // jurídica — o mesmo vocabulário dos rótulos do repetidor.
        const documentoLabel = needsBanco ? "o CNPJ" : "o documento";
        setFormError(
          f.nome.trim() === ""
            ? `Informe o nome ${rotulo} — só ${documentoLabel} não é gravado.`
            : `Informe ${documentoLabel} ${rotulo} — só o nome não é gravado.`,
        );
        return;
      }

      /*
       * E-mail, profissão e endereço completo são obrigatórios para o fiador
       * pessoa física e, quando casado, para o cônjuge (o `complemento` é o
       * único opcional). Só nos blocos já identificados (nome + documento), pela
       * mesma razão da guarda acima: bloco em branco é a linha de digitação.
       */
      for (const [i, f] of form.fiadores.entries()) {
        if (!f.nome.trim() || !f.documento.trim()) continue;
        if (needsBanco || fiadorEhPessoaJuridica(f.documento)) continue;
        const quem = form.fiadores.length > 1 ? ` ${i + 1}` : "";
        if (!f.email.trim() || !f.profissao.trim() || !enderecoCompleto(f.endereco)) {
          setFormError(
            `Informe e-mail, profissão e endereço completo do fiador${quem}.`,
          );
          return;
        }
        if (
          exigeConjuge(f.estadoCivil) &&
          (!f.conjugeEmail.trim() ||
            !f.conjugeProfissao.trim() ||
            !enderecoCompleto(f.conjugeEndereco))
        ) {
          setFormError(
            `Informe e-mail, profissão e endereço completo do cônjuge do fiador${quem}.`,
          );
          return;
        }
      }
    }

    /*
     * GER-03: "Sim" sem o detalhe não carrega a informação que a pergunta existe
     * para carregar. O backend recusa com 400; validar aqui é o que dá a mensagem
     * ao lado do campo em vez de um toast genérico.
     */
    if (form.compartilhada && !form.detalhesCompartilhamento.trim()) {
      setFormError(
        'Informe os números das oportunidades e/ou detalhes do compartilhamento.',
      );
      return;
    }
    /*
     * A utilização NÃO é cobrada (26/08/2026, pedido do produto: "adicione a
     * opção NENHUM"). Isto revisa o ADO 67858, que a tornou obrigatória a
     * partir do `*` que a tela "Criar Garantia da Cotação" põe no campo — mas
     * `*` de page layout não bloqueia DML por REST, e o dado do org diz o
     * contrário: `Utilizacao__c` é `nillable` e está nulo em 1.060.679
     * registros contra 19.678 preenchidos.
     */

    // Build the input, respecting the tipo's field rules (CA-3).
    // Non-applicable fields are set to null/empty so mapInputToBackend omits them.
    const input: GarantiaIndicacaoInput = {
      tipo: form.tipo,
      origem: form.origem,
      utilizacao: form.utilizacao,
      imovel: needsImovel ? form.imovel.trim() : '',
      /*
       * Cidade e UF (02/09/2026) — o ticket sempre as coletou, o card não. Só
       * viajam com valor: o mapper as omite quando vazias, e "não informado" é
       * `null` no banco, nunca `""`.
       */
      imovelCidade: needsImovel ? form.imovelCidade.trim() : undefined,
      imovelUf: needsImovel ? form.imovelUf.trim() : undefined,
      matriculas: needsImovel ? form.matriculas.map((m) => m.numero) : [],
      // HIP-02 — a QUANTIDADE é a contagem de blocos; não há campo numérico.
      quantidadeLaudos: needsImovel ? form.laudos.length : null,
      categoria: needsImovel ? form.categoria : null,
      // `null` fora dos tipos que perguntam ⇒ o mapper omite o campo e o DTO não
      // o vê — sem isto o `@IsEmptyWhen` responderia 400 numa garantia real cujo
      // estado civil sobrou de uma fiança escolhida antes.
      /*
       * O estado civil de NÍVEL DE INDICAÇÃO sai do payload (02/09/2026): ele
       * agora viaja por fiador (`fiadores[].estadoCivil`), como no ticket. A
       * coluna `guarantee_nominations.marital_status` e o campo do DTO
       * permanecem, aceitos por compatibilidade — linha antiga continua legível.
       */
      estadoCivil: null,
      /*
       * FB-01/FB-02 — só na bancária, e só com os dois campos preenchidos: o
       * `FiadorDto` exige nome E documento, então mandar meio fiador é um 400
       * sobre um formulário que o card salva parcialmente de propósito.
       */
      /*
       * Todos os fiadores, com o mesmo mapeamento do ticket. `undefined` quando
       * o tipo não os pede (o DTO recusa `fiadores` fora das fianças) ou quando
       * nenhum foi preenchido — o repetidor mantém uma linha em branco.
       *
       * Pessoa JURÍDICA (o banco) não leva estado civil nem cônjuge: o DTO os
       * recusa ali, e mandá-los vazios reprovaria o `@IsEnum`.
       */
      fiadores: needsFiadores ? fiadoresPreenchidos() : undefined,
      valor: formatValor(form.valor),
      compartilhada: form.compartilhada,
      // Só com a resposta "Sim" — o backend recusa (400) o inverso, e o CHECK do
      // banco proíbe o estado.
      detalhesCompartilhamento: form.compartilhada
        ? form.detalhesCompartilhamento.trim()
        : '',
      observacoes: form.observacoes.trim(),
    };

    setSaving(true);
    setFormError('');

    /** A linha já persistida nesta submissão — ver o `catch`. */
    let persistida: GarantiaIndicacaoItem | null = null;
    /** Insere ou substitui a linha na lista, conforme o modo do modal. */
    const aplicarNaLista = (item: GarantiaIndicacaoItem): void => {
      setItems((prev) =>
        prev.some((g) => g.id === item.id)
          ? prev.map((g) => (g.id === item.id ? item : g))
          : [...prev, item],
      );
    };

    try {
      // 1. Persist the core fields (create or update).
      let saved = editingId
        ? await update(opportunityId, editingId, input)
        : await create(opportunityId, input);
      /*
       * A partir daqui a garantia EXISTE. Guardado fora do `try` para o `catch`
       * saber distinguir "não salvou" de "salvou e o anexo falhou" — a diferença
       * entre pedir para tentar de novo e duplicar a garantia.
       */
      persistida = saved;

      /*
       * 2. Sobe o que foi escolhido, agora que a garantia (e as matrículas dela)
       *    existem — a ordem é o ponto: a certidão pertence à MATRÍCULA, e a
       *    matrícula só ganha posição no banco a partir da resposta acima.
       *
       * `matriculaOrdem` é `i + 1` porque é exatamente assim que o backend
       * numera (`resolverMatriculas` atribui a ordem pela posição no array que
       * este mesmo submit acabou de enviar). Sequencial, não `Promise.all`: são
       * escritas no mesmo vínculo.
       */
      if (needsImovel) {
        for (const [i, bloco] of form.matriculas.entries()) {
          if (!bloco.certidaoFile) continue;
          await anexarComplementar(
            opportunityId,
            saved.id,
            TIPO_DOCUMENTO_CERTIDAO,
            bloco.certidaoFile,
            i + 1,
          );
        }
        /*
         * O laudo NÃO leva `matriculaOrdem`: ele avalia o bem inteiro, não um
         * registro. `single: false` no catálogo, então cada arquivo é um laudo a
         * mais — a correspondência bloco ↔ documento é posicional (ver
         * `LaudoBloco`).
         */
        for (const bloco of form.laudos) {
          if (!bloco.file) continue;
          await anexarComplementar(
            opportunityId,
            saved.id,
            TIPO_DOCUMENTO_LAUDO,
            bloco.file,
            undefined,
            undefined,
            /*
             * Bloco que JÁ tinha laudo ⇒ o arquivo novo toma o lugar dele; bloco
             * vazio (o "+ Adicionar laudo") ⇒ soma. Sem o id, os dois casos eram
             * "soma", e trocar o arquivo do "Laudo 1" fazia o formulário passar a
             * mostrar dois blocos (03/09/2026).
             */
            bloco.documentoId ?? undefined,
          );
        }
      }
      /*
       * FB-03 — a minuta do contrato, pela rota TIPADA. Sem `matriculaOrdem`:
       * aquele argumento é da certidão de inteiro teor (HIP-03), e a bancária
       * não tem bem.
       */
      if (needsBanco && form.minutaFiancaFile) {
        await anexarComplementar(
          opportunityId,
          saved.id,
          TIPO_DOCUMENTO_MINUTA_FIANCA,
          form.minutaFiancaFile,
        );
      }
      /*
       * A certidão de casamento, UMA POR FIADOR (migration `…139`).
       *
       * `fiadorOrdem` é `i + 1` porque é assim que o backend numera: o
       * `substituirFiadores` atribui a posição pela ordem do array que este mesmo
       * submit acabou de enviar. Mesma disciplina da certidão de inteiro teor,
       * um nível acima.
       *
       * ⚠️ Pela rota TIPADA, não pelo slot: o slot é escopado à GARANTIA, e era
       * exatamente ele que fazia dois fiadores casados disputarem um único anexo
       * — o segundo upload voltava 409, e a CCOB recebia a certidão de um sem
       * saber de quem era.
       *
       * ⚠️ Só quem CONTA como fiador no payload é numerado: o filtro é o mesmo
       * `fiadoresPreenchidos()` que montou o array enviado, senão um bloco em
       * branco no meio deslocaria as posições de todos os seguintes.
       */
      if (needsFiadores) {
        const enviados = (fiadoresPreenchidos() ?? []).length;
        let ordem = 0;
        for (const f of form.fiadores) {
          if (f.nome.trim() === "" || f.documento.trim() === "") continue;
          ordem += 1;
          if (ordem > enviados) break;
          if (!f.certidaoFile) continue;
          await anexarComplementar(
            opportunityId,
            saved.id,
            TIPO_DOCUMENTO_CASAMENTO,
            f.certidaoFile,
            undefined,
            ordem,
          );
        }
      }

      /*
       * GER-01 — os complementares, pela rota TIPADA (não a de slot): a área é
       * `single: false`, então cada arquivo é um documento a mais, não uma
       * substituição. Sequencial e não `Promise.all` para o backend não receber N
       * escritas concorrentes no mesmo vínculo.
       *
       * Sem `needsImovel`: a área vale em TODOS os tipos.
       */
      for (const arquivo of form.complementares) {
        await anexarComplementar(
          opportunityId,
          saved.id,
          TIPO_DOCUMENTO_COMPLEMENTAR,
          arquivo,
        );
      }
      /*
       * Relê a linha depois dos complementares: `anexarDocumentoGarantia` não
       * devolve o item, e sem isto a lista mostraria a garantia sem os documentos
       * que acabaram de subir — até o próximo carregamento da tela.
       */
      /*
       * A rota tipada não devolve o item, então a linha é relida quando ALGO
       * subiu por ela — complementares, certidões ou laudos. Sem isto a lista
       * mostraria a garantia sem os documentos que acabaram de subir (e, pior,
       * as matrículas sem o "✓ Anexado") até o próximo carregamento da tela.
       */
      const subiuPelaRotaTipada =
        form.complementares.length > 0 ||
        // A MINUTA faltava aqui: uma bancária subia o anexo e a linha ficava sem
        // ele até o próximo carregamento da tela.
        (needsBanco && form.minutaFiancaFile !== null) ||
        (needsImovel &&
          (form.matriculas.some((m) => m.certidaoFile) ||
            form.laudos.some((l) => l.file)));
      if (subiuPelaRotaTipada) {
        const atualizadas = await load(opportunityId);
        saved = atualizadas.find((g) => g.id === saved.id) ?? saved;
      }

      // 3. Reflect the final item in the list.
      aplicarNaLista(saved);
      closeModal();
      // Relê a trilha deste card e avisa o pai, para os painéis vizinhos
      // revalidarem sem recarregar a página (CA-1 VBR-536 + ADO 67997).
      notifyMutated();
    } catch (err) {
      /*
       * ⚠️ **A garantia pode já estar SALVA** (reportado em 02/09/2026): o
       * `create` é o primeiro passo, e o que falha depois dele são os ANEXOS —
       * foi o caso do PNG recusado pela parametrização da minuta. O usuário via
       * "Falha ao salvar a garantia", fechava o modal, recarregava a página e a
       * garantia estava lá.
       *
       * Três coisas mudam quando a garantia existe:
       *
       *  1. **ela entra na lista** — sem isso o card mente por omissão até o
       *     próximo carregamento;
       *  2. **o modal vira modo EDIÇÃO** (`setEditingId`) — sem isso o "Adicionar
       *     garantia" chamaria `create` de novo e criaria uma SEGUNDA garantia,
       *     que é pior que o erro original (mesma armadilha do vínculo de obra);
       *  3. **a mensagem é a do backend**, que nomeia o conserto ("aceitos: PDF,
       *     Word"). A frase genérica descartava justamente a informação útil.
       *
       * `notifyMutated` também roda: a garantia nova pode ter mudado o veredito
       * da trilha ao lado, ainda que o anexo tenha falhado.
       */
      const mensagem =
        err instanceof Error && err.message.trim() !== ''
          ? err.message
          : 'Falha ao salvar a garantia. Tente novamente.';

      if (persistida) {
        aplicarNaLista(persistida);
        setEditingId(persistida.id);
        notifyMutated();
        setFormError(
          `A garantia foi salva, mas houve falha ao anexar os documentos: ${mensagem} ` +
            'Corrija o arquivo e salve de novo — a garantia não será duplicada.',
        );
      } else {
        // Nada foi persistido: o modal continua com os dados digitados.
        setFormError(mensagem);
      }
    } finally {
      setSaving(false);
    }
    /*
     * `notifyMutated` (não `onMutated`) porque a mutação precisa reler a trilha
     * DESTE card antes de avisar o pai — ADO 67997. `anexarComplementar`/`load`
     * entram por GER-01: a área de documentos complementares sobe N arquivos e
     * relê a linha depois deles.
     */
  }, [
    canWrite,
    form,
    needsImovel,
    needsEstadoCivil,
    needsBanco,
    needsFiadores,
    editingId,
    opportunityId,
    create,
    update,
    uploadDoc,
    anexarComplementar,
    load,
    closeModal,
    notifyMutated,
  ]);

  const handleRemove = useCallback(
    async (item: GarantiaIndicacaoItem) => {
      if (!canWrite || busyId) return;
      setBusyId(item.id);
      try {
        await remove(opportunityId, item.id);
        setItems((prev) => prev.filter((g) => g.id !== item.id));
        // Relê a trilha deste card e avisa o pai (CA-1 VBR-536 + ADO 67997).
        notifyMutated();
      } finally {
        setBusyId(null);
      }
    },
    [canWrite, busyId, opportunityId, remove, notifyMutated],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  /**
   * Uma garantia PERSISTIDA na forma que `GarantiasLista` mostra.
   *
   * A composição da linha (meta e dossiê) mora em
   * `components/garantia/linha-garantia-persistida.tsx` desde o ADO 68110: o
   * ticket de pendência passou a listar as MESMAS garantias, e escrevê-la duas
   * vezes seria a quarta divergência-por-cópia desta família. O que é deste host
   * são as AÇÕES — o `Editar` reabre o modal daqui, e o `Remover` chama o
   * backend sob `useConfirm`.
   *
   * ⚠️ **No modo SELEÇÃO (`linkDaGarantia`) a linha é a MESMA**, com `href` — não
   * mais uma `LinhaSelecao` própria. Aquele segundo renderizador é a razão pela
   * qual a tela dedicada `/garantia` divergia das outras duas: o banco da fiança
   * bancária, a cidade/UF, os laudos e o dossiê inteiro não apareciam lá. O
   * negócio pediu a linha de seleção COM esses dados (04/09/2026).
   *
   * As AÇÕES não convivem com a porta: naquela tela ninguém edita (a CCOB é
   * somente leitura por `GarantiaIndicar` e por `indicacoesEditaveis`), e um
   * `Editar` dentro de um `<a>` seria controle aninhado em navegação.
   */
  const linhaDaGarantia = (g: GarantiaIndicacaoItem): GarantiaLinhaVM =>
    linhaGarantiaPersistida(
      g,
      canWrite && linkDaGarantia === undefined
        ? {
            onEditar: () => openEdit(g),
            onRemover: () =>
              confirm.ask({
                title: 'Remover garantia?',
                description: `A garantia "${g.tipo}" será removida desta oportunidade.`,
                confirmLabel: 'Remover',
                tone: 'danger',
                onConfirm: () => handleRemove(g),
              }),
            removendo: busyId === g.id,
          }
        : undefined,
    );

  /** A mesma linha, com o cabeçalho virando porta para a página da garantia. */
  const linhaComPorta = (g: GarantiaIndicacaoItem): GarantiaLinhaVM => ({
    ...linhaDaGarantia(g),
    ...(linkDaGarantia ? { href: linkDaGarantia(g) } : {}),
  });

  if (status === 'loading') {
    return (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">Carregando garantias…</span>
        <div className="h-9 animate-pulse rounded-[var(--radius-xs)] bg-(--neutral-100)" />
        <div className="h-16 animate-pulse rounded-[var(--radius-xs)] bg-(--neutral-100)" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <p
        role="alert"
        className="text-(length:--t-caption) text-(--color-danger)"
      >
        Não foi possível carregar as garantias.
      </p>
    );
  }

  return (
    <div data-testid="garantias-indicadas">
      {/*
       * VBR-500 — head pill in the prototype's vocabulary (`garantias.html:51`
       * `Garantias · análise prévia`; `:104-107` `Garantias · aprovadas`).
       *
       * It is PLURAL and it sits above the list, not on each row, because the
       * guarantee subprocess is 1:1 with the opportunity (ADR-0023) while this
       * card is 1:N (`garantia_indicacoes`, ADR-0023 Addendum). The prototype
       * models the same thing: its approved variant flips the head pill AND every
       * row pill in one pass, i.e. the state describes the SET.
       *
       * The sentence next to it says so out loud — a pill per row would read as
       * that row's verdict, which no record carries (CA-6). The per-row pill
       * stays what the prototype's `01b renderGar` has: origin only (CA-2).
       */}
      {estadoConjunto !== null && !linkDaGarantia && (
        <div
          className="mb-2.5 flex flex-wrap items-center gap-2"
          data-testid="garantias-estado"
        >
          <StatusPill variant={estadoConjunto.variant} size="sm">
            {estadoConjunto.label}
          </StatusPill>
          <span className="text-[13px] text-(--color-text-muted)">
            Estado do conjunto — a análise prévia é uma só para a oportunidade.
          </span>
        </div>
      )}

      {/*
       * ADO 67997 — "é preciso indicar a não obrigatoriedade".
       *
       * O card oferecia "+ Adicionar garantia" sobre a caixa vazia e mais nada:
       * nenhuma palavra dizendo que a concessão desta oportunidade não exige
       * garantia. E nenhuma outra superfície dizia — a aba "Garantia" fica
       * DESABILITADA quando o subprocesso não se aplica, e a tela dedicada
       * `/garantia`, a única que renderiza a frase, só é alcançável por URL.
       *
       * Forma: a nota discreta do `DevolucaoAoLtNote`, que existe para o mesmo
       * briefing ("não pode ter um destaque muito grande") — barra fina à
       * esquerda, `--t-caption`, texto muted. A barra é NEUTRA
       * (`--color-border-strong`), nunca o `--yellow-700` de "Exceção/Atenção"
       * nem `--color-danger`: nada falhou e nada está pendente. É a mesma linha
       * que a VBR-500 traçou ao reservar a pill `d` para falha real e dar `n`
       * ao encerramento.
       *
       * Suprimido na tela dedicada `/garantia` (modo `linkDaGarantia`): lá o bloco de
       * `naoSeAplicaMotivo` já diz isso, acima deste card, e repetir daria duas
       * frases para o mesmo fato na mesma tela. É provadamente sem perda —
       * aviso não-nulo implica não haver linha de subprocesso, logo aquela tela
       * está em `isWaiting` e sempre renderiza o bloco.
       */}
      {avisoNaoObrigatoria !== null && !linkDaGarantia && (
        <p
          data-testid="garantias-aviso-nao-obrigatoria"
          className="mb-2.5 border-l-2 border-(--color-border-strong) pl-2.5 text-(length:--t-caption) text-(--color-text-muted)"
        >
          {avisoNaoObrigatoria}
        </p>
      )}

      {items.length === 0 ? (
        <GarantiasVazio />
      ) : (
        /*
         * UMA lista nos três hosts, inclusive no modo seleção — ver
         * `linhaDaGarantia`. O ramo separado que existia aqui montava uma linha
         * mais pobre, e era a divergência que o cliente relatou em 04/09/2026.
         */
        <GarantiasLista
          linhas={items.map(linkDaGarantia ? linhaComPorta : linhaDaGarantia)}
        />
      )}

      {canWrite && <AdicionarGarantiaBotao onClick={openAdd} />}

      {/*
       * ADO 67920 — o botão "Enviar para análise prévia" foi REMOVIDO
       * (13/09/2026, pedido do negócio).
       *
       * > *"Esse botão não faz sentido. O que está descrito faz. Podes tirar o
       * > botão? Pq o que importa é a pendência. Que já está sendo criada. Esse
       * > bug era de antes de fecharmos garantia."*
       *
       * O bug original (26/08/2026) era outro: o sistema sinalizava falta de
       * documento e **não abria pendência** — o LT anexava, enviava para
       * análise, e a pendência nascia depois, obrigando a anexar de novo. Essa
       * metade está entregue e aceita (o ticket foi fechado em 10/09/2026 com o
       * retest confirmando a pendência). O botão era a outra metade do
       * refinamento, escrita ANTES de o subprocesso de garantia fechar — e o que
       * o fechamento trouxe foi justamente o acionamento por pendência, que
       * torna o gesto manual redundante.
       *
       * ⚠️ **O que saiu é a AFORDÂNCIA, não o caminho.**
       * `POST .../garantia:enviar-analise-previa`, `avaliarEnvioPreviaGate` e o
       * campo `envioPreviaGate` da trilha continuam publicados e intactos —
       * mesma disciplina do `contrato:gerar`. Religar é voltar a renderizar o
       * botão aqui, a partir do histórico deste arquivo.
       *
       * ⚠️ **Nenhuma promoção se perde.** `GarantiaSubprocessoService.reconciliar`
       * é o ponto único que promove para `EM_ANALISE_PREVIA`, e ele continua
       * sendo chamado pelos três caminhos de sempre: o GATE 1
       * (`entered_analysis`), cada anexo de documento pelo card, e
       * `POST .../garantia:reconciliar` (o "Resolver pendência" do ticket). O
       * `CcobDistribuicaoCatchUpWorker` segue abrindo e fechando a cobrança da
       * CCOB a cada 60 s.
       */}

      {confirm.dialog}

      {/* Add / edit modal — faithful to 01b §Adicionar garantia */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editingId ? 'Editar garantia' : 'Adicionar garantia'}
            className="max-h-[90vh] w-full max-w-[880px] overflow-y-auto rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1.5 flex items-center text-(length:--t-h4) font-bold text-(--neutral-900)">
              {editingId ? 'Editar garantia' : 'Adicionar garantia'}
              {/* GER-04 — o "Documento de Suporte" da CCOB, ao lado do título:
                  é aqui que a dúvida sobre QUAL documento anexar aparece, e o
                  modal deixa o formulário de pé atrás dele. */}
              <DocumentoSuporteCcob opportunityId={opportunityId} />
            </h3>

            {/* Um dos dois campos obrigatórios do modal (o outro é o Valor —
                ADO 68002): `handleSave` recusa sem ele ("Selecione o tipo de
                garantia."), e o `tipo` do DTO de upsert é OBR nos quatro tipos
                de garantia. O `required` no Select é o que leva a
                obrigatoriedade à tecnologia assistiva — o asterisco é
                `aria-hidden` de propósito (ver `RequiredMark`). */}
            <label htmlFor="gar-tipo" className={`mb-1 block ${LABEL_FONT}`}>
              Tipo de garantia
              <RequiredMark />
            </label>
            <Select
              id="gar-tipo"
              value={form.tipo}
              onChange={(v) => handleTipoChange(v as GarantiaTipoOption | '')}
              options={GARANTIA_TIPO_OPTIONS.map((t) => ({
                value: t,
                label: t,
              }))}
              placeholder="Selecione..."
              variant="bottom-border"
              required
            />

            {/* O rito do Comitê de Crédito na fiança SEM LASTRO.

                Pedido do negócio (03/09/2026): *"devemos mostrar um disclaimer
                ABAIXO do tipo de garantia"* — por isso ele fica aqui, colado no
                seletor, e não três campos abaixo como a caixa antiga, que vinha
                depois de "Utilização".

                Só `FIANCA_SEM_LASTRO`. A caixa anterior ("Garantia não real")
                acendia para as três fianças e afirmava que TODA fiança muda o
                foro da prévia — falso: `exigePrevia` é `false` só neste tipo.

                Mesmo tratamento visual e mesma constante do FL-01 logo abaixo;
                a frase nunca é escrita inline (guard em
                `matriculas-laudos-compartilhados.test.ts`). */}
            {tipoCode === TIPO_GARANTIA.FIANCA_SEM_LASTRO && (
              <AvisoGarantia testId="aviso-fianca-sem-lastro" className="mt-2">
                {AVISO_FIANCA_SEM_LASTRO}
              </AvisoGarantia>
            )}

            <label
              htmlFor="gar-origem"
              className={`mt-3.5 mb-1 block ${LABEL_FONT}`}
            >
              Garantia existente × nova
            </label>
            <Select
              id="gar-origem"
              value={form.origem}
              onChange={(v) =>
                setForm((f) => ({ ...f, origem: v as GarantiaOrigem }))
              }
              options={GARANTIA_ORIGEM_OPTIONS.map((o) => ({
                value: o,
                label: o,
              }))}
              variant="bottom-border"
            />

            {/* Utilização — `Garantia_Da_Cotacao__c.Utilizacao__c`.
                Opções do catálogo, nunca `<option>` chumbado: o org publica
                `Fornecimento` e `Concessão Financeira` (`Parcelamento` está
                inativo, então o catálogo o conhece mas não o oferece).

                "Nenhum" é o VAZIO, e não um valor novo: a picklist é
                `restricted` com esses dois ativos, então mandar a string
                "Nenhum" seria recusado pelo org
                (`INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST`). O campo é
                `nillable` lá e está nulo em 1.060.679 registros — ausência é o
                estado normal, o que é o que justifica oferecê-la. */}
            <label
              htmlFor="gar-utilizacao"
              className={`mt-3.5 mb-1 block ${LABEL_FONT}`}
            >
              Utilização
            </label>
            <PicklistSelect
              id="gar-utilizacao"
              data-testid="gar-utilizacao"
              field={PicklistField.GarantiaUtilizacao}
              value={form.utilizacao}
              onChange={(v) => setForm((f) => ({ ...f, utilizacao: v }))}
              placeholder="Selecione..."
              emptyOptionLabel="Nenhum"
            />

            {/*
              Aqui vivia a caixa amarela "Garantia não real", que acendia para as
              TRÊS fianças. Ela saiu em 02/09/2026 a pedido de um usuário e VOLTOU
              em 03/09/2026 — o pedido de remoção tinha sido um mal-entendido —,
              mas voltou logo abaixo do seletor de tipo (onde o negócio a pediu) e
              só na FIANÇA SEM LASTRO. Ver `AVISO_FIANCA_SEM_LASTRO`.

              As duas sentenças por modalidade que viviam dentro dela NÃO voltaram:
              "o garantidor é o banco…" era sobre a bancária, hoje fora do escopo,
              e "sem lastro … também não passa pela análise prévia" CONTRADIZ o
              pedido novo. Nenhuma era veredito de que a tela dependia — quem
              governa os campos é `needsImovel`/`needsBanco` e quem governa o gate
              é `garantiaApta`, no backend.

              `needsFiador` não voltou junto: o aviso novo depende só de
              `tipoCode` (quem decide o bloco do banco é `needsBanco`, e quem
              decide o estado civil é `exigeEstadoCivil`).
            */}

            {/* FL-01 — quem são os fiadores numa fiança COM lastro.

                BLOCO PRÓPRIO (ADO · 01/09/2026). A frase era colada no fim da
                caixa "Garantia não real" acima, virando a terceira sentença de
                um aviso sobre o rito do Comitê de Crédito — estava no DOM e o
                usuário relatou que "não está exibindo", que é o retrato honesto
                de texto soterrado. O teste anterior media presença dentro
                daquela caixa, então o CI não tinha como acusar.

                Mesmo `data-testid` e mesmo tratamento visual do ticket de
                pendência, onde a frase sempre foi um bloco próprio: as duas
                superfícies fazem a mesma exigência, e duas formas de fazê-la
                divergem justamente aqui.

                Some nas outras duas fianças: na bancária o garantidor é o banco,
                e na sem lastro não há imóvel a que a frase se refira. */}
            {tipoCode === TIPO_GARANTIA.FIANCA_COM_LASTRO && (
              <AvisoGarantia testId="aviso-fianca-com-lastro" className="mt-2">
                {AVISO_FIANCA_COM_LASTRO}
              </AvisoGarantia>
            )}

            {/* Os campos "Nome do banco" e "CNPJ do banco" viviam aqui e saíram
                em 02/09/2026: o banco É o fiador (FB-01/FB-02), e o repetidor de
                fiadores acima já os coleta com os rótulos certos por `ehBanco`.
                Dois pares para o mesmo fato era a duplicação que fazia a tela e
                o payload discordarem sobre qual é o banco da garantia.

                A MINUTA fica — ela é documento, não identificação do banco. */}
            {needsBanco && (
              <div className="mt-3.5">
                <DocSlotBanco
                  testId="gar-doc-minuta-fianca"
                  rotulo="Minuta do Contrato de Fiança Bancária"
                  obrigatorio
                  accept={ACEITOS_DOCUMENTO_GARANTIA}
                  nome={form.minutaFiancaFile?.name ?? form.minutaFiancaName}
                  onPick={(file) =>
                    setForm((f) => ({ ...f, minutaFiancaFile: file }))
                  }
                />
              </div>
            )}

            {/* Grupo "Imóvel / bem" — só quando exigeImovel(tipo) (CA-1).
                FIANCA_BANCARIA e FIANCA_SEM_LASTRO escondem tudo, então os campos
                nunca viajam no payload (e o DTO os recusa com 400). */}
            {needsImovel && (
              <div className="mt-3.5 grid grid-cols-2 gap-x-5 gap-y-3.5 max-sm:grid-cols-1">
                <div>
                  <label
                    htmlFor="gar-imovel"
                    className={`mb-1 block ${LABEL_FONT}`}
                  >
                    Imóvel / bem
                  </label>
                  <input
                    id="gar-imovel"
                    value={form.imovel}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, imovel: e.target.value }))
                    }
                    placeholder="Ex.: Av. Paulista, 1000 · São Paulo/SP"
                    className={IN_CLASS}
                  />
                </div>
                {/* Categoria — parte do grupo "Imóvel / bem" (exigeImovel):
                    GARANTIA_REAL e FIANCA_COM_LASTRO. Escondida em
                    FIANCA_BANCARIA (sem categoria na UI — VBR-476 tabela 6c).

                    ORDEM DA GRADE (pedido do produto, 02/09/2026):

                        [ Imóvel / bem   |  Categoria    ]
                        [ Cidade         |  Estado (UF)  ]

                    Categoria ao LADO do imóvel porque as duas são o que o bem é;
                    Cidade e UF na linha DE BAIXO porque juntas são onde ele está,
                    e separá-las quebraria o par. Os dois repetidores
                    (matrícula/laudo) são de largura inteira e vêm depois — antes
                    a Categoria caía sob as matrículas, com um bloco de altura
                    variável no meio do caminho.

                    ⚠️ No formulário do TICKET a ordem NÃO é esta, de propósito:
                    lá o campo é "Endereço do imóvel" e a Categoria não abre a
                    grade. Os dois formulários pedem os mesmos campos, não o mesmo
                    arranjo. */}
                <div>
                  <label
                    htmlFor="gar-categoria"
                    className={`mb-1 block ${LABEL_FONT}`}
                  >
                    Categoria
                  </label>
                  <Select
                    id="gar-categoria"
                    value={form.categoria}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        categoria: v as GarantiaCategoria,
                      }))
                    }
                    options={GARANTIA_CATEGORIA_OPTIONS.map((c) => ({
                      value: c,
                      label: c,
                    }))}
                    variant="bottom-border"
                  />
                </div>

                {/* Cidade e UF do imóvel (02/09/2026) — o ticket sempre as
                    pediu; o card não, e a garantia nascia sem a localização do
                    bem que a CCOB precisa para a análise prévia.

                    Dentro do grupo `needsImovel`, como os demais campos do bem:
                    numa fiança bancária não há imóvel a localizar. */}
                <div>
                  <label
                    htmlFor="gar-imovel-cidade"
                    className={`mb-1 block ${LABEL_FONT}`}
                  >
                    Cidade
                  </label>
                  <input
                    id="gar-imovel-cidade"
                    value={form.imovelCidade}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, imovelCidade: e.target.value }))
                    }
                    placeholder="Ex.: São Paulo"
                    className={IN_CLASS}
                  />
                </div>

                <div>
                  <label
                    htmlFor="gar-imovel-uf"
                    className={`mb-1 block ${LABEL_FONT}`}
                  >
                    Estado (UF)
                  </label>
                  <input
                    id="gar-imovel-uf"
                    value={form.imovelUf}
                    /* Duas letras maiúsculas — o mesmo tratamento do ticket, para
                       o par não divergir na borda. */
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        imovelUf: e.target.value.toUpperCase().slice(0, 2),
                      }))
                    }
                    maxLength={2}
                    placeholder="SP"
                    className={IN_CLASS}
                  />
                </div>

                {/* HIP-01/HIP-03 — as matrículas, um BLOCO FECHADO por registro
                    (número + a certidão de inteiro teor DAQUELA matrícula).
                    O número multiplica com a quantidade; endereço e categoria
                    não. Componente compartilhado com o formulário do ticket. */}
                <div className="col-span-2 max-sm:col-span-1">
                  <MatriculasBlocos
                    blocos={form.matriculas}
                    onChange={(matriculas) =>
                      setForm((f) => ({ ...f, matriculas }))
                    }
                    disabled={saving}
                    // O MESMO estilo de campo do "Imóvel / bem" logo acima —
                    // sem isto o número da matrícula saía com um terceiro
                    // estilo, de nenhuma das duas telas (ADO · 02/09/2026).
                    inputClassName={IN_CLASS}
                  />
                </div>

                {/* HIP-02 — os laudos, um BLOCO por laudo (01/09/2026).
                    O campo numérico "Quantidade de laudos" saiu: ele declarava 3
                    e o formulário tinha onde anexar 1. A quantidade agora é a
                    contagem de blocos. */}
                <div className="col-span-2 max-sm:col-span-1">
                  <LaudosBlocos
                    blocos={form.laudos}
                    onChange={(laudos) => setForm((f) => ({ ...f, laudos }))}
                    disabled={saving}
                  />
                </div>
              </div>
            )}

            {/* Os FIADORES (02/09/2026) — o MESMO repetidor do ticket de
                pendência (`FiadoresRepetidor`), com nome, documento, estado
                civil e cônjuge por fiador.

                ⚠️ Substituiu o par `bancoNome`/`bancoDocumento` e o "Estado
                civil" de NÍVEL DE INDICAÇÃO. O card não coletava fiador nos
                outros dois tipos de fiança, e `motivosDeInaptidao` exige
                `temFiador` em TODO `FIANCA_*`: a fiança com lastro e a sem
                lastro **nunca ficavam aptas** cadastradas aqui.

                O estado civil ficou POR FIADOR, como no ticket — uma fiança pode
                ter dois fiadores com estados civis diferentes, e um campo por
                indicação não representa isso. */}
            {needsFiadores && (
              <div className="mt-3.5">
                <span className={`mb-1 block ${LABEL_FONT}`}>
                  {needsBanco ? "Banco" : "Fiadores"}
                  <RequiredMark />
                </span>
                <FiadoresRepetidor
                  fiadores={form.fiadores}
                  onChange={(fiadores) => setForm((f) => ({ ...f, fiadores }))}
                  disabled={saving}
                  ehBanco={needsBanco}
                  // O MESMO estilo de campo dos demais inputs DESTE card.
                  inputClassName={IN_CLASS}
                />
              </div>
            )}

            {/* Valor — `Valor_Avaliado__c`, rotulado "Valor" no org e preenchido
                em 1.080.325 de 1.080.357 registros, ou seja em TODO tipo. Saiu
                do grupo "Imóvel / bem" em ADO 67858: numa fiança bancária o
                valor é o da carta do banco, e escondê-lo mandava o campo nulo
                justamente para os tipos que a distribuição precisa somar.

                ADO 68002 — OBRIGATÓRIO em todo tipo. Não há `required` no input
                porque o formulário não submete por `<form>`; quem cobra é o
                `handleSave`, e o DTO recusa com 400 no servidor.

                O campo é DIGITÁVEL em toda utilização, inclusive na "Concessão
                Financeira" (decisão do negócio, 02/09/2026 — reverte o ADO
                68003): não há trava nem preenchimento automático a partir das
                concessões financeiras da proposta do posto. */}
            <label htmlFor="gar-valor" className={`mt-6 mb-2 block ${LABEL_FONT}`}>
              Valor
              <RequiredMark />
            </label>
            {/* Money mask (pt-BR, cents) — same pattern as every other money
                field in the app (text + numeric keypad + maskMoneyInput),
                never a raw free-text field. Always BRL (`valorAvaliadoBRL`). */}
            <input
              id="gar-valor"
              type="text"
              inputMode="numeric"
              value={form.valor}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  valor: maskMoneyInput(e.target.value),
                }))
              }
              placeholder="R$ 0,00"
              data-testid="gar-valor"
              className={IN_CLASS}
            />

            {/* GER-03 — a pergunta obrigatória, em TODOS os tipos de garantia.
                Pré-marcada em "Não": o padrão vive aqui, onde a pessoa o vê e
                pode contradizê-lo, nunca no DTO (que exige a resposta e recusaria
                um payload que a omitisse). */}
            <fieldset className="mt-6">
              <legend className={`mb-2 ${LABEL_FONT}`}>
                {PERGUNTA_COMPARTILHAMENTO}
              </legend>
              <div className="flex gap-6">
                {[
                  { valor: false, rotulo: 'Não' },
                  { valor: true, rotulo: 'Sim' },
                ].map((opcao) => (
                  <label
                    key={opcao.rotulo}
                    className="flex items-center gap-1.5 text-(length:--t-caption)"
                  >
                    <input
                      type="radio"
                      name="gar-compartilhada"
                      checked={form.compartilhada === opcao.valor}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          compartilhada: opcao.valor,
                          // Limpa o detalhe ao voltar para "Não": ele não é aceito
                          // com essa resposta (o backend recusa com 400 e o CHECK
                          // do banco proíbe o estado).
                          detalhesCompartilhamento: opcao.valor
                            ? f.detalhesCompartilhamento
                            : '',
                        }))
                      }
                    />
                    {opcao.rotulo}
                  </label>
                ))}
              </div>

              {/* O campo livre só com "Sim" — é o que GER-03 pede, e é a
                  informação que a resposta existe para carregar. */}
              {form.compartilhada && (
                <div className="mt-2.5">
                  <label
                    htmlFor="gar-compart-detalhes"
                    className={`mb-1 block ${LABEL_FONT}`}
                  >
                    Quais oportunidades / detalhes
                  </label>
                  <textarea
                    id="gar-compart-detalhes"
                    rows={2}
                    value={form.detalhesCompartilhamento}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        detalhesCompartilhamento: e.target.value,
                      }))
                    }
                    placeholder="Ex.: OPP-2026-000010 e OPP-2026-000031"
                    className={IN_CLASS}
                  />
                </div>
              )}
            </fieldset>

            {/*
              Os dois slots FIXOS de documento (certidão de inteiro teor e laudo)
              viviam aqui e saíram em 01/09/2026: cada um deles é N por garantia,
              e agora sobe dentro do bloco da matrícula (HIP-03) e do bloco do
              laudo (HIP-02), acima. Um slot fixo aceita UM — com três matrículas,
              o gate cobrava três certidões e o formulário oferecia um anexo.
            */}

            {/* GER-01 — a área de "Documentos complementares", SEMPRE disponível,
                em todos os tipos de garantia (sem `needsImovel`).

                Área e não slot: o tipo é `single: false` no catálogo, então cada
                arquivo é um documento a mais — nunca uma substituição.

                ⚠️ Os JÁ ANEXADOS são listados aqui desde 02/09/2026 (reportado:
                *"quando abriu uma garantia com documento complementar, eles não
                apareceram no dialog de editar"*). Antes só as escolhas pendentes
                apareciam, com a justificativa de que os anexados "aparecem na
                lista de documentos da LINHA" — e isso é verdade, mas não ajuda
                quem está com o modal aberto: quem reabre para acrescentar um
                documento não tem como saber o que já subiu, e reanexa o mesmo
                arquivo (o tipo é `single: false`, então ele DUPLICA em vez de
                substituir). Os dois grupos ficam separados e rotulados: anexado
                × a subir. */}
            <div className="mt-6">
              <span className={`mb-2 block ${LABEL_FONT}`}>
                Documentos complementares
              </span>
              {/*
                O nome do documento É o gatilho (ADO · 01/09/2026). O texto
                mandava procurar "o '?' no título" — instrução de navegação onde
                cabia a própria ação, e que envelhece junto do lugar do ícone. O
                modal é o MESMO do "?" (um componente, dois gatilhos).
              */}
              <p
                data-testid="gar-complementares-ajuda"
                className="mb-3 text-(length:--t-small) text-(--color-text-muted)"
              >
                Opcional, e válido para qualquer tipo de garantia. As exigências
                por banco e por bem estão no{" "}
                <DocumentoSuporteCcob
                  opportunityId={opportunityId}
                  variant="link"
                />
                .
              </p>

              {/*
                Os já anexados — somente leitura, com link de download. Não têm
                remoção: o card não oferece remover documento de garantia em
                lugar nenhum, e um "✕" aqui prometeria uma ação que não existe.
              */}
              {complementaresAnexados.length > 0 && (
                <ul
                  data-testid="gar-complementares-anexados"
                  className="mb-2 list-none space-y-1.5 p-0"
                >
                  {complementaresAnexados.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-25) px-3 py-2 text-(length:--t-caption)"
                    >
                      <a
                        href={urlDeMidiaSegura(doc.url) ?? undefined}
                        download={nomeDeArquivoSeguro(doc.fileName) ?? true}
                        className="min-w-0 truncate font-bold text-(--secondary-600) hover:underline"
                      >
                        {doc.fileName ?? doc.type}
                      </a>
                      <span className="shrink-0 text-(--color-text-muted)">
                        Anexado
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {form.complementares.length > 0 && (
                <ul className="mb-2 list-none space-y-1.5 p-0">
                  {form.complementares.map((arquivo, i) => (
                    <li
                      key={`${arquivo.name}-${i}`}
                      className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2 text-(length:--t-caption)"
                    >
                      <span className="min-w-0 truncate">{arquivo.name}</span>
                      {/* Remoção da ESCOLHA, não do documento: o arquivo ainda não
                          subiu. Sem isto, escolher o arquivo errado obrigaria a
                          cancelar o modal inteiro e refazer o formulário. */}
                      <button
                        type="button"
                        aria-label={`Remover ${arquivo.name}`}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            complementares: f.complementares.filter(
                              (_, j) => j !== i,
                            ),
                          }))
                        }
                        className="shrink-0 px-1 text-(--color-text-muted) hover:text-(--color-danger)"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <label
                className={`${SECONDARY_OUTLINE_BTN} inline-flex cursor-pointer`}
              >
                + Adicionar documento
                <input
                  type="file"
                  /* `multiple`: é uma área, e escolher três arquivos de uma vez é o
                     gesto natural.

                     O `accept` FALTAVA aqui — o campo oferecia qualquer arquivo e
                     o backend recusava o que não estivesse na parametrização
                     (`pdf,png,jpeg,word,excel` neste tipo). É a mesma classe do
                     desencontro da minuta, só na direção oposta: oferecer mais do
                     que o catálogo aceita. Este é o único slot de garantia com
                     planilha, daí a constante própria. */
                  accept={ACEITOS_DOCUMENTO_COMPLEMENTAR}
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    const escolhidos = Array.from(e.target.files ?? []);
                    if (escolhidos.length === 0) return;
                    setForm((f) => ({
                      ...f,
                      complementares: [...f.complementares, ...escolhidos],
                    }));
                    // Limpa o input para o MESMO arquivo poder ser escolhido de
                    // novo depois de removido da lista.
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            <label
              htmlFor="gar-obs"
              className={`mt-6 mb-2 block ${LABEL_FONT}`}
            >
              Observações
            </label>
            <textarea
              id="gar-obs"
              rows={3}
              value={form.observacoes}
              onChange={(e) =>
                setForm((f) => ({ ...f, observacoes: e.target.value }))
              }
              placeholder="Ex.: outras oportunidades que utilizarão a mesma garantia..."
              className={`${IN_CLASS} min-h-[60px] resize-y`}
            />

            {formError && (
              <p className="mt-3 text-[13px] font-bold text-(--color-danger)">
                {formError}
              </p>
            )}

            <div className="mt-8 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={closeModal}
                className={SECONDARY_OUTLINE_BTN}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--secondary-500) px-4 py-2 text-[13px] font-bold text-white transition hover:bg-(--secondary-hover) disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Salvando…"
                  : editingId
                    ? "Salvar alterações"
                    : "Adicionar garantia"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
