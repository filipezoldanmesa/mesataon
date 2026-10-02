"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useConfirm } from "@/components/confirm-dialog";
import {
  CardCollapseToggle,
  useCardCollapse,
} from "@/components/proposals/card-collapse";
import { useProposalViewMode } from "@/components/proposals/proposal-view-mode";
import { FieldLabel } from "@/components/ui/field-label";
import { Select } from "@/components/ui/select";
import { usePermissions } from "@/hooks/use-permissions";
import { failureReason, isExpiredSessionError } from "@/lib/api-errors";
import { redirectToLogin } from "@/lib/auth";
import { Permission } from "@/lib/auth-permissions";
import { formatCurrencyBRL } from "@/lib/clients/format";
import {
  formatDateBR,
  maskMoneyInput,
  parseMoneyInput,
} from "@/lib/franquia/format";
import {
  getObra as defaultGetObra,
  getObrasDisponiveis as defaultListObras,
  obraOptionLabel,
  type Obra,
  type ObraReadModel,
} from "@/lib/obras/obras.data";
import type { AdicionarObraInvestimentosPayload } from "@/lib/obras/obra-da-proposta.api";
import {
  adicionarObraInvestimentos as defaultAdicionarObraInvestimentos,
  removerObraInvestimentos as defaultRemoverObraInvestimentos,
} from "@/lib/obras/obras.data";
import {
  createInvestment as defaultCreate,
  deleteInvestment as defaultDelete,
  getInvestments as defaultList,
  updateInvestment as defaultUpdate,
} from "@/lib/proposals/investments.data";
import { PicklistSelect } from "@/components/picklists/picklist-select";
import { PicklistField } from "@/lib/picklists/picklists.types";
import {
  tipoSemContrapartidaNoCrm,
  TIPOS_INVESTIMENTO,
  TIPOS_INVESTIMENTO_SELECIONAVEIS,
  familiaDoTipo,
  type CreateInvestmentInput,
  type Investment,
  type InvestmentsListResult,
  type TipoInvestimento,
  type UpdateInvestmentInput,
} from "@/lib/proposals/investments.types";

/**
 * ⚠️ **Os `disabled:` não são enfeite — sem eles o campo travado é
 * INDISTINGUÍVEL do editável (Bug 68395).**
 *
 * Os três campos que a obra define (§6) já vinham `disabled` no DOM, mas esta
 * constante não tinha nenhuma regra de estado desabilitado: fundo branco, texto
 * `--color-text`, cursor normal. Na tela, o investimento gerado por obra
 * mostrava "Valor unitário" com a mesma cara de um campo editável — o usuário
 * clicava, nada acontecia, e a leitura natural é *"o campo está liberado"*.
 * (O modal de recurso financeiro sempre teve os tokens; a divergência era só
 * daqui.)
 *
 * Tokens `--disabled-bg` / `--disabled-text` do `globals.css`, os mesmos que o
 * `Select` e o `FIELD_INPUT_CLASS` do recurso financeiro usam — a trava tem de
 * ter UMA aparência no produto inteiro.
 */
const FIELD_CLASS =
  "w-full rounded-[var(--radius-xxs)] border border-(--color-border) bg-white px-3 py-2 text-(length:--t-body) text-(--color-text) outline-none focus:border-(--secondary-500) disabled:cursor-not-allowed disabled:bg-(--disabled-bg) disabled:border-(--neutral-200) disabled:text-(--disabled-text)";

type LoadStatus = "loading" | "loaded" | "error";

type Props = {
  proposalId: string;
  /**
   * Oportunidade dona da proposta — necessária para a obra do Converge, cuja
   * API é chaveada por oportunidade (ADR-0048).
   *
   * Opcional de propósito: ausente, o seletor de obra renderiza desabilitado e
   * nomeia a razão, em vez de sumir sem explicação. Mesmo contrato do
   * `FinancialResourcesBlock`.
   */
  opportunityId?: string;
  listInvestments?: (proposalId: string) => Promise<InvestmentsListResult>;
  createInvestment?: (
    proposalId: string,
    input: CreateInvestmentInput,
  ) => Promise<Investment>;
  updateInvestment?: (
    proposalId: string,
    investmentId: string,
    input: UpdateInvestmentInput,
  ) => Promise<Investment>;
  deleteInvestment?: (
    proposalId: string,
    investmentId: string,
  ) => Promise<void>;
  /** Lets the page invalidate anything that reads the investment set. */
  onInvestmentsChanged?: () => void;
  listObrasDisponiveis?: (opportunityId: string) => Promise<Obra[]>;
  getObraSelecionada?: (opportunityId: string) => Promise<ObraReadModel>;
  /**
   * A seção de RECURSOS FINANCEIROS já tem a obra desta proposta (SH-02/SH-03)
   * — o rótulo do botão troca nas duas seções.
   */
  temObraNaOutraSecao?: boolean;
  /** Avisa o painel (e a faixa da oportunidade) que a obra mudou. */
  onObraChanged?: () => void;
  /**
   * Reporta ao painel se ESTA seção tem a obra — é assim que o SH-03 troca o
   * rótulo do botão na OUTRA. O painel é quem cruza as duas: nenhuma das
   * seções lê a lista da vizinha.
   */
  onObraPresenteChange?: (temObra: boolean) => void;
  /**
   * Contador que o painel incrementa quando a OUTRA seção mexeu na obra.
   *
   * ⚠️ **O vínculo é da PROPOSTA** (`proposal_estimate_links`,
   * `UNIQUE (proposal_id)`), então "Remover obra" nos recursos financeiros
   * apaga o vínculo e os itens gerados por ele AQUI. Sem este sinal esta seção
   * seguia exibindo o botão "Remover obra" de uma obra que não existe mais — e
   * o segundo clique abria o diálogo dizendo "Esta proposta não tem obra
   * vinculada", sem nada na tela para consertar a não ser um F5.
   *
   * É o par de {@link temObraNaOutraSecao}: aquele diz o que a vizinha TEM,
   * este avisa que ela MUDOU.
   */
  obraExternaSignal?: number;
  adicionarObra?: (
    proposalId: string,
    payload: AdicionarObraInvestimentosPayload,
  ) => Promise<Investment[]>;
  removerObra?: (proposalId: string) => Promise<void>;
};

/** The modal's editable shape — strings, because that is what inputs hold. */
type FormState = {
  descricao: string;
  dataInvestimento: string;
  tipo: TipoInvestimento;
  vidaUtilFiscalMeses: string;
  detalhamentoItem: string;
  valorUnitario: string;
  valorAquisicao: string;
  negociacaoOriginal: boolean;
  // ── Campos por CATEGORIA (ADO 68506) ──────────────────────────────────────
  // Strings mesmo nos numéricos: o campo precisa conseguir voltar a "não
  // informado", e `0` é um número que o usuário pode ter digitado.
  quantidade: string;
  custoInstalacao: string;
  valorResidualContabil: string;
  vidaUtilContabilMeses: string;
  equipamento: string;
  elementoImagem: string;
  codigo: string;
  equipamentoUsado: boolean;
  valorVenda: string;
  venderParaCliente: boolean;
  dataVendaEquipamento: string;
};

const EMPTY_FORM: FormState = {
  descricao: "",
  dataInvestimento: "",
  tipo: "Benfeitorias",
  vidaUtilFiscalMeses: "",
  detalhamentoItem: "",
  valorUnitario: "",
  valorAquisicao: "",
  negociacaoOriginal: false,
  quantidade: "",
  custoInstalacao: "",
  valorResidualContabil: "",
  vidaUtilContabilMeses: "",
  equipamento: "",
  elementoImagem: "",
  codigo: "",
  equipamentoUsado: false,
  valorVenda: "",
  venderParaCliente: false,
  dataVendaEquipamento: "",
};

/**
 * Campos que a família do tipo NÃO admite — zerados ao trocar de tipo.
 *
 * ⚠️ Zerar é obrigatório, não cosmético: o DTO recusa com **400** um campo que
 * a família não admite. Sem isto, quem preenchesse um equipamento e trocasse
 * para Benfeitorias veria a recusa de um campo que já nem está mais na tela.
 *
 * Os campos COMUNS são preservados na troca — redigitar a descrição e o valor
 * por ter errado o tipo é a irritação que esta função existe para evitar.
 */
function limparCamposForaDaFamilia(form: FormState, tipo: TipoInvestimento): FormState {
  const familia = familiaDoTipo(tipo);
  const equipamento = familia === "Equipamento";
  const imagem = familia === "ElementoImagem";
  const equipOuImagem = equipamento || imagem;

  return {
    ...form,
    tipo,
    quantidade: equipamento ? form.quantidade : "",
    custoInstalacao: equipOuImagem ? form.custoInstalacao : "",
    valorResidualContabil: equipOuImagem ? form.valorResidualContabil : "",
    vidaUtilContabilMeses: equipOuImagem ? form.vidaUtilContabilMeses : "",
    valorVenda: equipOuImagem ? form.valorVenda : "",
    equipamento: equipamento ? form.equipamento : "",
    elementoImagem: imagem ? form.elementoImagem : "",
    codigo: equipamento ? form.codigo : "",
    equipamentoUsado: equipamento ? form.equipamentoUsado : false,
    venderParaCliente: equipamento ? form.venderParaCliente : false,
    dataVendaEquipamento: equipamento ? form.dataVendaEquipamento : "",
  };
}

/**
 * Os campos por categoria, na forma que a API espera (ADO 68506).
 *
 * ⚠️ **Só os campos que a família ADMITE viajam.** O DTO recusa com 400 um
 * campo de outra família, e o formulário já os limpa na troca de tipo — este
 * recorte é a segunda rede, para o caso de um retrato antigo trazer valor num
 * campo que a nova família não usa.
 *
 * ⚠️ Vazio vira `undefined` (criação) ou `null` (edição), **nunca `0`**: o
 * usuário precisa conseguir deixar um campo em branco, e zero é um número que
 * ele pode ter digitado.
 */
function camposPorCategoria(
  form: FormState,
  paraEdicao: boolean,
): Record<string, unknown> {
  const familia = familiaDoTipo(form.tipo);
  if (familia === "Investimento") return {};

  const equipamento = familia === "Equipamento";
  const vazio = paraEdicao ? null : undefined;

  const numero = (texto: string): number | null | undefined => {
    const limpo = texto.trim();
    if (limpo === "") return vazio;
    const n = Number(limpo);
    return Number.isFinite(n) ? n : vazio;
  };
  const moeda = (texto: string): number | null | undefined =>
    texto.trim() === "" ? vazio : (parseMoneyInput(texto) ?? vazio);
  const texto = (valor: string): string | null | undefined =>
    valor.trim() === "" ? vazio : valor.trim();

  return {
    custoInstalacao: moeda(form.custoInstalacao),
    valorResidualContabil: moeda(form.valorResidualContabil),
    vidaUtilContabilMeses: numero(form.vidaUtilContabilMeses),
    valorVenda: moeda(form.valorVenda),
    ...(equipamento
      ? {
          quantidade: numero(form.quantidade),
          equipamento: texto(form.equipamento),
          codigo: texto(form.codigo),
          equipamentoUsado: form.equipamentoUsado,
          venderParaCliente: form.venderParaCliente,
          // A data só viaja com a venda marcada — o backend recusa a
          // combinação incoerente nos dois sentidos.
          dataVendaEquipamento: form.venderParaCliente
            ? texto(form.dataVendaEquipamento)
            : vazio,
        }
      : { elementoImagem: texto(form.elementoImagem) }),
  };
}

function toForm(investment: Investment): FormState {
  return {
    descricao: investment.descricao ?? "",
    dataInvestimento: investment.dataInvestimento,
    tipo: investment.tipo,
    vidaUtilFiscalMeses: String(investment.vidaUtilFiscalMeses),
    detalhamentoItem: investment.detalhamentoItem,
    valorUnitario: maskMoneyInput(
      String(Math.round(investment.valorUnitario * 100)),
    ),
    // `null` stays EMPTY, not "0,00": the field must round-trip "not informed".
    valorAquisicao:
      investment.valorAquisicao === null
        ? ""
        : maskMoneyInput(String(Math.round(investment.valorAquisicao * 100))),
    negociacaoOriginal: investment.negociacaoOriginal,
    // ── Campos por CATEGORIA (ADO 68506) ────────────────────────────────────
    // `null` vira "" e NÃO "0": o campo tem de conseguir voltar a "não
    // informado" na edição.
    quantidade: investment.quantidade === null ? "" : String(investment.quantidade),
    custoInstalacao: moedaParaCampo(investment.custoInstalacao),
    valorResidualContabil: moedaParaCampo(investment.valorResidualContabil),
    vidaUtilContabilMeses:
      investment.vidaUtilContabilMeses === null
        ? ""
        : String(investment.vidaUtilContabilMeses),
    equipamento: investment.equipamento ?? "",
    elementoImagem: investment.elementoImagem ?? "",
    codigo: investment.codigo ?? "",
    equipamentoUsado: investment.equipamentoUsado === true,
    valorVenda: moedaParaCampo(investment.valorVenda),
    venderParaCliente: investment.venderParaCliente === true,
    dataVendaEquipamento: investment.dataVendaEquipamento ?? "",
  };
}

/**
 * Quantidade para exibição — inteiro sem casas, fracionário com as que tiver.
 *
 * `3` e não `3,0000`: a quantidade é inteira em 100% do histórico do org, e
 * quatro zeros em toda linha seriam ruído. O fracionário existe porque a Vibra
 * o liberou (19/09/2026), e quando aparecer precisa aparecer inteiro.
 */
function formatQuantidade(quantidade: number): string {
  return Number.isInteger(quantidade)
    ? String(quantidade)
    : quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

/** Moeda do backend para o campo mascarado; `null` vira vazio, nunca "0,00". */
function moedaParaCampo(valor: number | null): string {
  return valor === null ? "" : maskMoneyInput(String(Math.round(valor * 100)));
}

/**
 * Valor sentinela do seletor de obra para "Sem obra vinculada" — a terceira
 * opção do protótipo de 21/08/2026 (`#im-obra`).
 *
 * Existe porque o placeholder é `disabled` e portanto não é re-selecionável:
 * sem esta opção, uma linha já associada não teria como voltar a não ser
 * custeada pela obra. Não é um id de obra, e o submit nunca a manda ao
 * Converge.
 */
const SEM_OBRA = "__sem_obra__";

/**
 * Card "Investimentos" das telas `03-proposta-nova` / `03-proposta-ciclo1`.
 *
 * ⚠️ **O `Tipo` são as sete opções do protótipo, não uma picklist do
 * Salesforce.** Por isso não usa `PicklistSelect`/`usePicklist`: não existe
 * picklist de catálogo para este campo, e buscar `Tipo__c` traria os dez
 * valores do org — três dos nossos sete não existem lá. A tradução acontece na
 * escrita da cotação (issue A3), no backend.
 *
 * ⚠️ **O total vem do backend**, não é somado aqui: a issue A4 manda o mesmo
 * número (`Valor_Final__c`) ao ARP, e duas implementações do mesmo valor é a
 * falha que este repo já pagou várias vezes.
 */
export function InvestmentsBlock({
  proposalId,
  opportunityId,
  listInvestments = defaultList,
  createInvestment = defaultCreate,
  updateInvestment = defaultUpdate,
  deleteInvestment = defaultDelete,
  onInvestmentsChanged,
  listObrasDisponiveis = defaultListObras,
  getObraSelecionada = defaultGetObra,
  temObraNaOutraSecao = false,
  onObraChanged,
  onObraPresenteChange,
  obraExternaSignal = 0,
  adicionarObra = defaultAdicionarObraInvestimentos,
  removerObra = defaultRemoverObraInvestimentos,
}: Props) {
  const { can } = usePermissions();
  // Espelha o `@Roles(LT, GerenteVarejo, ADMIN)` das rotas de escrita do bloco.
  const canWriteRole = can(Permission.ProposalManage);
  /*
   * Camada de análise (03-proposta-analise): a edição fecha para TODO perfil
   * enquanto a proposta está em análise — papel sozinho não basta, e é o mesmo
   * critério dos blocos irmãos. Sem isto, todos os outros cards da tela fechavam
   * e só o de Investimentos seguia editável.
   */
  const { readOnly } = useProposalViewMode();
  const canWrite = canWriteRole && !readOnly;
  /*
   * Bug 68395 — a exceção do §6: a SNEG (e o ADMIN) edita detalhamento do item,
   * valor unitário e valor de aquisição do investimento gerado pela obra; os
   * demais perfis de escrita seguem com eles desabilitados. Espelha
   * `CAMPOS_TRAVADOS_POR_OBRA_BYPASS_ROLES`, que é quem de fato recusa o `PUT`
   * com 400 — veredito é do backend, a tela renderiza.
   */
  const podeEditarCamposDaObra = can(Permission.ObraCamposTravadosEditar);
  const confirm = useConfirm();
  const collapse = useCardCollapse();

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [items, setItems] = useState<Investment[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  /** `modoObra` distingue o diálogo "Adicionar obra" (INV-02) do de investimento. */
  const [modal, setModal] = useState<{
    editing: Investment | null;
    modoObra?: boolean;
  } | null>(null);
  const [removendoObra, setRemovendoObra] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /*
   * Obra do Converge (ADR-0048) — mesma máquina de quatro estados do bloco de
   * recursos financeiros, e pelas mesmas razões: `[]` NUNCA representa falha
   * (vazio é a afirmação "este cliente não tem obra"), e a listagem é CARGA
   * TARDIA, só quando o modal abre — é leitura ao vivo contra um terceiro, e
   * buscá-la a cada render do card gastaria a chamada em quem nunca vai abrir o
   * modal.
   */
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [obraVinculada, setObraVinculada] = useState<Obra | null>(null);
  const [obrasLoading, setObrasLoading] = useState(false);
  const [obrasError, setObrasError] = useState<string | null>(null);
  const obrasCarregadasRef = useRef(false);
  /**
   * A obra escolhida NESTE modal.
   *
   * Vive no componente pai porque é o `submit` daqui que a vincula — e a escolha
   * só é aplicada NO SUBMIT, nunca no `onChange`: o vínculo é da oportunidade
   * inteira, então uma troca abandonada pelo Cancelar ficaria valendo para todos
   * os investimentos e recursos.
   */
  const [obraEscolhida, setObraEscolhida] = useState<string>("");
  /**
   * `true` quando o usuário tocou o seletor de obra nesta abertura do modal.
   *
   * No submit do modo edição, quando `false`, o PATCH usa o valor original do
   * investimento (`modal.editing.custeadoPelaObra`) em vez do valor derivado do
   * seletor: se `getObraSelecionada` retornou null (lookup falhou ou ainda não
   * carregou), `obraEscolhida` fica `''` por default e derivaria `false`,
   * apagando silenciosamente um flag `true` persistido.
   */
  const [obraAlterada, setObraAlterada] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /*
   * O VÍNCULO vem na montagem, não na abertura do modal: o cartão de cada
   * investimento mostra `Obra (Converge)` (protótipo `ciclo1.js:437`) e é
   * renderizado na LISTA, sem modal nenhum. É leitura local (o retrato no nosso
   * banco) e portanto barata; a listagem de disponíveis é que fala com o
   * Converge.
   *
   * Falha aqui é silenciosa de propósito: sem o vínculo o cartão omite o campo,
   * que é o mesmo que a linha não ser custeada pela obra. Barulho aqui não daria
   * ao usuário nenhuma ação.
   */
  useEffect(() => {
    if (!opportunityId) return;
    void getObraSelecionada(opportunityId)
      .then((rm: ObraReadModel) => {
        if (mountedRef.current) setObraVinculada(rm.selecionada);
      })
      .catch(() => undefined);
  }, [opportunityId, getObraSelecionada]);

  useEffect(() => {
    /*
     * ⚠️ Só no diálogo de OBRA. Desde o INV-04 o modal direto não tem o campo, e
     * `.../obra/disponiveis` é leitura AO VIVO contra um terceiro: chamá-lo ao
     * abrir um modal que não usa a resposta é custo puro.
     */
    if (!modal?.modoObra || !opportunityId || obrasCarregadasRef.current)
      return;
    obrasCarregadasRef.current = true;
    setObrasLoading(true);
    setObrasError(null);

    void listObrasDisponiveis(opportunityId)
      .then((lista: Obra[]) => {
        if (!mountedRef.current) return;
        setObras(lista);
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        // A frase do backend é a acionável (422 nomeia o CNPJ que falta na
        // oportunidade; 503 diz que cabe nova tentativa).
        setObrasError(
          err instanceof Error && err.message
            ? err.message
            : "Não foi possível carregar as obras do cliente.",
        );
        // Permite nova tentativa numa reabertura do modal.
        obrasCarregadasRef.current = false;
      })
      .finally(() => {
        if (mountedRef.current) setObrasLoading(false);
      });
  }, [modal, opportunityId, listObrasDisponiveis]);

  const fetchList = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await listInvestments(proposalId);
      setItems(result.items);
      setTotal(result.totalInvestimentos);
      setStatus("loaded");
    } catch (err) {
      if (isExpiredSessionError(err)) {
        redirectToLogin();
        return;
      }
      // NEVER `setItems([])` here: an empty list is a business statement, and a
      // failure is not. The card must show its error state.
      setStatus("error");
    }
  }, [listInvestments, proposalId]);

  /*
   * A OUTRA seção mexeu na obra ⇒ releia a lista E o vínculo.
   *
   * A lista porque os itens gerados pela obra somem junto com ela; o vínculo
   * porque é dele que sai o rótulo `Obra (Converge)` do cartão e a decisão de
   * mostrar "Remover obra". Reler só um dos dois deixaria a metade velha na
   * tela — que é o defeito, com outra cara.
   *
   * ⚠️ **Guardado por ref para NÃO rodar na montagem.** O valor inicial já foi
   * carregado pelos efeitos acima; sem a guarda, todo mount dispararia um
   * segundo par de requisições.
   */
  const obraExternaAplicadaRef = useRef(obraExternaSignal);
  useEffect(() => {
    if (obraExternaSignal === obraExternaAplicadaRef.current) return;
    obraExternaAplicadaRef.current = obraExternaSignal;

    void fetchList();

    if (!opportunityId) return;
    // Falha silenciosa, como no efeito de montagem: sem o vínculo o cartão
    // omite o campo, e barulho aqui não daria ao usuário nenhuma ação.
    void getObraSelecionada(opportunityId)
      .then((rm: ObraReadModel) => {
        if (mountedRef.current) setObraVinculada(rm.selecionada);
      })
      .catch(() => undefined);
  }, [obraExternaSignal, fetchList, opportunityId, getObraSelecionada]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  /**
   * Esta PROPOSTA tem obra — SH-03. Derivado dos itens (o vínculo chega em cada
   * linha), e não de um estado próprio, que divergiria no primeiro reload.
   */
  const temObraNestaSecao = items.some((item) => item.obra);
  const temObra = temObraNestaSecao || temObraNaOutraSecao;

  /*
   * Reporta ao painel, que é quem cruza as duas seções (SH-03). Em efeito, e
   * não no handler de salvar: a lista também muda por reload e por remoção, e
   * um aviso preso ao handler perderia esses caminhos.
   */
  useEffect(() => {
    onObraPresenteChange?.(temObraNestaSecao);
  }, [temObraNestaSecao, onObraPresenteChange]);

  const openCreate = useCallback(() => {
    setForm(EMPTY_FORM);
    // Criação abre no placeholder: associar a obra exige escolha explícita.
    setObraEscolhida("");
    setSaveError(null);
    setModal({ editing: null });
  }, []);

  /** Abre o diálogo "Adicionar obra" (INV-02). */
  const openObra = useCallback(() => {
    setForm(EMPTY_FORM);
    setObraEscolhida("");
    setSaveError(null);
    setModal({ editing: null, modoObra: true });
  }, []);

  const openEdit = useCallback(
    (investment: Investment) => {
      // Preloading is a plain state set — there is no auto-fill to re-trigger, so
      // the prototype's `_invProg` guard has no counterpart to need here. That
      // guard existed because `openInvModal` dispatched change events that re-ran
      // `invObraFill`, blanking the row being edited.
      setForm(toForm(investment));
      /*
       * ⚠️ Condicionado a `custeadoPelaObra`, e essa condição é a defesa inteira.
       * O vínculo é da OPORTUNIDADE; o flag é do INVESTIMENTO. Sem a condição,
       * abrir para editar uma linha que não é custeada pela obra — para corrigir o
       * valor, digamos — pré-selecionaria a obra e o save a associaria em
       * SILÊNCIO.
       */
      setObraEscolhida(
        investment.custeadoPelaObra ? (obraVinculada?.estimateId ?? "") : "",
      );
      // Reset: o usuário ainda não alterou o seletor nesta abertura.
      setObraAlterada(false);
      /*
       * A pré-seleção acima NÃO preenche nada — o valor gravado é o que vale, e
       * sobrescrevê-lo na abertura mudaria dado sem gesto nenhum do usuário. Logo
       * não há procedência a anunciar: os números da linha são dela.
       */
      setSaveError(null);
      setModal({ editing: investment });
    },
    [obraVinculada],
  );

  const closeModal = useCallback(() => {
    setModal(null);
    setSaveError(null);
  }, []);

  /**
   * Escolher a obra apenas REGISTRA a escolha — não preenche mais campo nenhum.
   *
   * ⚠️ O preenchimento automático (`investmentPrefillFromObra`: valor unitário
   * ← total da obra, descrição ← `EstimateType`) foi REMOVIDO em 09/09/2026
   * junto com a função. O valor unitário saiu do diálogo (INV-02: a PARCELA o
   * define, um item por linha) e a descrição é campo do usuário no INV-02 —
   * manter meio prefill, com a nota de procedência de um campo só, seria uma
   * peça móvel a mais para pouco.
   */
  const handleObraChange = useCallback((v: string) => {
    setObraEscolhida(v);
    setObraAlterada(true);
  }, []);

  const submit = useCallback(async () => {
    if (!modal || !canWrite) return;

    /*
     * Descrição é obrigatória nos TRÊS caminhos (criar, editar, adicionar
     * obra), e a recusa acontece aqui para o usuário não gastar um round-trip
     * até o 400 do backend. A regra continua sendo do backend — este guard é
     * conveniência, não a fonte.
     */
    if (form.descricao.trim() === "") {
      setSaveError("Informe a descrição do investimento.");
      return;
    }

    /*
     * O diálogo de obra tem caminho PRÓPRIO: o backend gera N investimentos a
     * partir das parcelas, numa transação com o vínculo. Não há "um
     * investimento" a mandar, e não há a segunda chamada (nem o estado
     * intermediário que ela criava).
     */
    if (modal.modoObra) {
      if (obraEscolhida === "" || obraEscolhida === SEM_OBRA) {
        setSaveError("Informe a obra (Converge).");
        return;
      }
      setSaving(true);
      setSaveError(null);
      try {
        await adicionarObra(proposalId, {
          estimateId: obraEscolhida,
          dataInvestimentoInicial: form.dataInvestimento,
          tipo: form.tipo,
          vidaUtilFiscalMeses: Number(form.vidaUtilFiscalMeses),
          descricao: form.descricao.trim(),
          negociacaoOriginal: form.negociacaoOriginal,
        });
        closeModal();
        await fetchList();
        onInvestmentsChanged?.();
        onObraChanged?.();
      } catch (err) {
        if (isExpiredSessionError(err)) {
          redirectToLogin();
          return;
        }
        // O diálogo FICA ABERTO com a frase do backend: o que falta é um dado
        // do formulário, e fechá-lo faria o usuário redigitar tudo.
        setSaveError(failureReason(err, "Falha ao adicionar a obra."));
      } finally {
        setSaving(false);
      }
      return;
    }

    const valorUnitario = parseMoneyInput(form.valorUnitario);
    const valorAquisicao = parseMoneyInput(form.valorAquisicao);
    const vidaUtil = Number(form.vidaUtilFiscalMeses);
    // Derivado do seletor, nunca um campo próprio: duas fontes para o mesmo fato
    // divergiriam exatamente na edição que troca a obra.

    setSaving(true);
    setSaveError(null);
    try {
      if (modal.editing) {
        await updateInvestment(proposalId, modal.editing.id, {
          // Sempre um texto: `null` limpava o campo e devolvia a linha ao
          // estado que o ARP recusa (o backend passou a rejeitar esse `null`).
          descricao: form.descricao.trim(),
          dataInvestimento: form.dataInvestimento,
          tipo: form.tipo,
          vidaUtilFiscalMeses: vidaUtil,
          detalhamentoItem: form.detalhamentoItem,
          ...(valorUnitario === null ? {} : { valorUnitario }),
          valorAquisicao,
          negociacaoOriginal: form.negociacaoOriginal,
          /*
           * PRESERVA o flag legado da linha: o seletor saiu do modal (INV-04),
           * então a edição não tem como mudá-lo, e mandar `false` apagaria a
           * intenção registrada quando o campo ainda existia aqui.
           */
          custeadoPelaObra: modal.editing.custeadoPelaObra,
          ...camposPorCategoria(form, true),
        });
      } else {
        const createdInvestment = await createInvestment(proposalId, {
          descricao: form.descricao.trim(),
          dataInvestimento: form.dataInvestimento,
          tipo: form.tipo,
          vidaUtilFiscalMeses: vidaUtil,
          detalhamentoItem: form.detalhamentoItem,
          valorUnitario: valorUnitario ?? 0,
          ...(valorAquisicao === null ? {} : { valorAquisicao }),
          negociacaoOriginal: form.negociacaoOriginal,
          /*
           * INV-04 — a criação direta NÃO associa obra. A coluna
           * `funded_by_estimate` virou legada; a associação agora é o
           * `proposal_estimate_link_id` que "Adicionar obra" grava.
           */
          custeadoPelaObra: false,
          ...camposPorCategoria(form, false),
        });
        // Switch to edit mode before selecionarObra: if that call throws and
        // the user retries, the modal is already in "editing" state so the
        // update path runs — preventing a duplicate investment.
        setModal({ editing: createdInvestment });
      }

      /*
       * ⚠️ Aqui havia a SEGUNDA chamada — salvar o investimento e depois
       * vincular a obra —, removida em 09/09/2026 (INV-04 / ADR-0051).
       *
       * Ela existia porque a API da obra era chaveada por OPORTUNIDADE e a do
       * investimento por proposta, o que impedia atomicidade e criava o estado
       * "salvo, mas sem obra". Com o vínculo por proposta, o fluxo "Adicionar
       * obra" faz as duas escritas numa transação só — e a criação DIRETA não
       * associa obra nenhuma.
       */

      closeModal();
      await fetchList();
      onInvestmentsChanged?.();
    } catch (err) {
      if (isExpiredSessionError(err)) {
        redirectToLogin();
        return;
      }
      /*
       * `failureReason` no lugar do `instanceof` único: `InvestmentSaveError`
       * continua contemplado, e o `HttpError` — que carrega a frase do backend e
       * era o único descartado — deixa de cair na frase genérica.
       */
      // The modal STAYS OPEN with the sentence: it is the whole payload.
      setSaveError(
        failureReason(err, "Falha ao salvar o investimento. Tente novamente."),
      );
    } finally {
      setSaving(false);
    }
  }, [
    canWrite,
    closeModal,
    createInvestment,
    fetchList,
    form,
    modal,
    obraAlterada,
    obraEscolhida,
    obras,
    onInvestmentsChanged,
    opportunityId,
    proposalId,
    updateInvestment,
    adicionarObra,
    onObraChanged,
  ]);

  const handleRemoverObra = useCallback(async () => {
    setRemovendoObra(true);
    try {
      await removerObra(proposalId);
      await fetchList();
      onInvestmentsChanged?.();
      onObraChanged?.();
    } finally {
      setRemovendoObra(false);
    }
  }, [proposalId, removerObra, fetchList, onInvestmentsChanged, onObraChanged]);

  const handleDelete = useCallback(
    async (investmentId: string) => {
      if (!canWrite) return;
      setDeletingId(investmentId);
      try {
        await deleteInvestment(proposalId, investmentId);
        await fetchList();
        onInvestmentsChanged?.();
      } catch (err) {
        if (isExpiredSessionError(err)) {
          redirectToLogin();
          return;
        }
        setStatus("error");
      } finally {
        setDeletingId(null);
      }
    },
    [canWrite, deleteInvestment, fetchList, onInvestmentsChanged, proposalId],
  );

  const totalLabel = useMemo(
    // `—` only when there is nothing to total; `R$ 0,00` is a real answer.
    () =>
      total === null || items.length === 0 ? "—" : formatCurrencyBRL(total),
    [items.length, total],
  );

  return (
    <section
      {...collapse.sectionProps}
      className="mb-4 rounded-[var(--radius-sm)] border border-(--color-border) bg-white p-4"
    >
      <h3
        {...collapse.headProps}
        className="mb-3 flex items-center gap-2 text-(length:--t-h3) font-bold text-(--color-text)"
      >
        Investimentos
        <CardCollapseToggle {...collapse.toggleProps} />
      </h3>

      {status === "loading" && (
        <div
          role="status"
          aria-label="Carregando investimentos…"
          data-testid="loading-state"
          className="flex items-center gap-2 py-4 text-(length:--t-caption) text-(--color-text-muted)"
        >
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--secondary-500) border-t-transparent"
          />
          Carregando…
        </div>
      )}

      {status === "error" && (
        <div
          role="alert"
          data-testid="load-error-state"
          className="rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
        >
          Falha ao carregar os investimentos. Verifique sua conexão e tente
          novamente.
          <button
            type="button"
            onClick={() => void fetchList()}
            className="ml-2 font-bold underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {status === "loaded" && (
        <div data-testid="filled-state">
          {items.length === 0 ? (
            <div
              data-testid="empty-state"
              className="mb-3 rounded-[var(--radius-xs)] border border-dashed border-(--color-border-strong) p-5 text-center text-(length:--t-caption) text-(--color-text-muted)"
            >
              Nenhum investimento adicionado ainda.
            </div>
          ) : (
            <div data-testid="investment-list">
              {items.map((investment) => (
                <InvestmentCard
                  key={investment.id}
                  investment={investment}
                  obraVinculada={obraVinculada}
                  showActions={canWrite}
                  isDeleting={deletingId === investment.id}
                  onEdit={() => openEdit(investment)}
                  onDelete={() =>
                    confirm.ask({
                      title: "Excluir investimento?",
                      description: `O investimento "${
                        investment.descricao ?? investment.tipo
                      }" sai da proposta e o total é recalculado.`,
                      confirmLabel: "Excluir",
                      tone: "danger",
                      onConfirm: () => handleDelete(investment.id),
                    })
                  }
                />
              ))}
            </div>
          )}

          {canWrite && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openCreate}
                className="rounded-[var(--radius-xxs)] border border-(--secondary-600) bg-(--neutral-40) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-600) transition hover:bg-(--neutral-100)"
              >
                + Adicionar investimento
              </button>
              {/*
                INV-01 — "+ Adicionar obra"; SH-03 — havendo obra em QUALQUER
                das duas seções, ele vira "Remover obra" nas duas.
              */}
              {temObra ? (
                <button
                  type="button"
                  disabled={removendoObra}
                  onClick={() =>
                    confirm.ask({
                      title: "Remover obra?",
                      description:
                        "A obra sai da proposta e TODOS os itens gerados por ela são " +
                        "removidos junto. Depois disso é possível adicionar outra obra.",
                      confirmLabel: "Remover",
                      tone: "danger",
                      onConfirm: () => handleRemoverObra(),
                    })
                  }
                  className="rounded-[var(--radius-xxs)] border border-(--red-700) bg-white px-4 py-2 text-(length:--t-caption) font-bold text-(--red-700) transition hover:bg-(--neutral-100) disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {removendoObra ? "Removendo…" : "Remover obra"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openObra}
                  className="rounded-[var(--radius-xxs)] border border-(--secondary-600) bg-(--neutral-40) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-600) transition hover:bg-(--neutral-100)"
                >
                  + Adicionar obra
                </button>
              )}
            </div>
          )}

          {/*
            ⚠️ **Mantido, contra o protótipo de 21/08/2026**, que removeu esta
            linha do bloco.

            A fonte se contradiz: o mesmo `ciclo1.js` de 21/08 continua
            calculando e escrevendo `inv-total` no `renderInv()` — só o HTML
            deixou de ter o elemento. E esta é a única linha da tela que mostra o
            total DOS INVESTIMENTOS sozinho — ele é insumo do ARP (issue A4).

            ⚠️ **A razão original desta linha CADUCOU em 09/09/2026, e a
            conclusão continua a mesma.** Ela dizia que "nada substitui o número:
            o `Investimento Vibra` do card 'Cálculos automáticos' sai dos
            RECURSOS FINANCEIROS, não dos investimentos". Aquele rótulo não
            existe mais: as quatro linhas que o substituíram somam os
            investimentos aos "Recursos Antecipados" (ver
            `financial-resource-totals.ts`). Mas lá eles chegam FUNDIDOS com os
            recursos — nenhuma daquelas linhas responde "quanto é só de
            investimento", que é o que esta responde.

            Quando uma fonte discorda de si mesma, vale a leitura que não perde
            informação. Se a remoção for deliberada, é decisão de produto e sai
            daqui numa linha.
          */}
          <div className="mt-3.5 flex flex-wrap gap-6 text-(length:--t-caption)">
            <div>
              <span className="text-(--color-text-muted)">
                Total de investimentos:
              </span>{" "}
              <b data-testid="inv-total">{totalLabel}</b>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <InvestmentModal
          editing={modal.editing !== null}
          form={form}
          onChange={setForm}
          onCancel={closeModal}
          variant={modal.modoObra ? "obra" : "investimento"}
          camposDaObraTravados={
            !!modal.editing?.obra && !podeEditarCamposDaObra
          }
          onSubmit={() => void submit()}
          saving={saving}
          error={saveError}
          obras={obras}
          obraEscolhida={obraEscolhida}
          onObraChange={handleObraChange}
          obrasLoading={obrasLoading}
          obrasError={obrasError}
          obrasHabilitadas={!!opportunityId}
        />
      )}

      {confirm.dialog}
    </section>
  );
}

// ---------------------------------------------------------------------------

function InvestmentCard({
  investment,
  obraVinculada,
  showActions,
  isDeleting,
  onEdit,
  onDelete,
}: {
  investment: Investment;
  /**
   * A obra vinculada à oportunidade (ADR-0048), quando há. O campo
   * `Obra (Converge)` só aparece na CONJUNÇÃO com `investment.custeadoPelaObra`:
   * o flag é intenção desta linha, e sem obra ele não afirma nada.
   */
  obraVinculada: Obra | null;
  showActions: boolean;
  isDeleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      data-testid="investment-card"
      className="mb-3 rounded-[var(--radius-xs)] border border-(--color-border) p-3"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        {/*
          One text node, as the prototype composes it
          (`esc(x.tipo) + (x.desc ? ' · ' + esc(x.desc) : '')`). Splitting it
          across spans breaks any text query over the title — and screen
          readers announce it as two fragments.
        */}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="text-(length:--t-body) font-bold text-(--color-text)">
              {investment.descricao
                ? `${investment.tipo} · ${investment.descricao}`
                : investment.tipo}
            </div>
            {/*
              SH-05 — selo do item GERADO por obra. Lê `investment.obra`, não o
              `custeadoPelaObra` legado: o vínculo por linha é o que decide as
              travas do §6, e um selo que discordasse delas seria pior que
              nenhum.
            */}
            {investment.obra && (
              <span
                data-testid="selo-obra"
                className="shrink-0 rounded-[var(--radius-xxs)] bg-(--neutral-100) px-2 py-0.5 text-(length:--t-caption-sm) font-bold text-(--neutral-800)"
              >
                Obra
              </span>
            )}
          </div>
          {/*
            Marca a linha JÁ SALVA, não só o momento da escolha: o aviso do modal
            desaparece ao fechar, e quem abrir a proposta depois precisa ver que
            aquela linha bloqueia a alçada.
          */}
          {tipoSemContrapartidaNoCrm(investment.tipo) && (
            <div
              data-testid="tipo-sem-contrapartida-badge"
              className="mt-1 text-(length:--t-caption) text-(--yellow-700)"
            >
              ⚠ Este tipo ainda não tem correspondência no Salesforce — bloqueia
              o acionamento da alçada.
            </div>
          )}
        </div>
        {showActions && (
          <div className="flex shrink-0 items-center gap-2">
            {/*
              Mesmas classes do `Editar` do cartão de recurso financeiro
              (protótipo `.lnk-edit` — botão OUTLINE, 5px/12px): os dois cartões
              vivem na mesma tela, e o mesmo gesto com dois pesos visuais
              diferentes lê como dois gestos diferentes.
            */}
            <button
              type="button"
              onClick={onEdit}
              className="rounded-[var(--radius-xxs)] border border-(--secondary-600) bg-white px-3 py-[5px] text-(length:--t-caption) leading-[normal] font-bold text-(--secondary-600)"
            >
              Editar
            </button>
            {/*
              §6 — item gerado por obra NÃO é removido individualmente: some com
              a obra inteira ("Remover obra"). Escondido porque a API recusa com
              409; deixá-lo visível ofereceria uma ação que sempre falha.
            */}
            {!investment.obra && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                /* Tamanho EXPLÍCITO: ele vinha do container, que passou a
                   `items-center gap-2` para acomodar o `Editar` outline. Sem
                   isto o `Excluir` herdaria o corpo do cartão e cresceria. */
                className="text-(length:--t-caption) font-bold text-(--red-700) underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                Excluir
              </button>
            )}
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-(length:--t-caption) min-[761px]:grid-cols-3">
        <Field label="Detalhamento" value={investment.detalhamentoItem} />
        <Field
          /*
            O rótulo acompanha a COLUNA do org, como no formulário: nas famílias
            de equipamento/imagem a data vai para `Data_De_Instalacao__c`, e lá
            ela se chama "Data de Instalação". Um rótulo só deixaria o card
            dizendo uma coisa e o Salesforce mostrando outra.
          */
          label={
            familiaDoTipo(investment.tipo) === "Investimento"
              ? "Data do investimento"
              : "Data de instalação"
          }
          value={formatDateBR(investment.dataInvestimento) ?? "—"}
        />
        {/*
          Condicional na CONJUNÇÃO (flag do investimento **e** obra vinculada à
          oportunidade), pela mesma razão do protótipo (`x.obra ? … : ''`):
          rótulo sem valor leria como dado que o sistema falhou em carregar, e o
          flag sozinho não nomeia obra nenhuma.
        */}
        {/*
          O item GERADO por obra traz a própria origem (`investment.obra`), que
          não depende de a oportunidade ter vínculo. A conjunção antiga
          (`custeadoPelaObra` + `obraVinculada`) segue valendo para a LINHA
          LEGADA, gravada quando o seletor vivia neste modal.
        */}
        {(investment.obra ||
          (investment.custeadoPelaObra && obraVinculada)) && (
          <Field
            label="Obra (Converge)"
            value={
              investment.obra
                ? `${investment.obra.estimateId} · ${investment.obra.tipo}`
                : obraVinculada
                  ? `${obraVinculada.estimateId} · ${obraVinculada.tipo}`
                  : ""
            }
          />
        )}
        <Field
          label="Vida útil fiscal"
          value={`${investment.vidaUtilFiscalMeses} ${
            investment.vidaUtilFiscalMeses === 1 ? "mês" : "meses"
          }`}
        />
        {/*
          ⚠️ A quantidade vem ANTES do valor unitário, e é exibida sempre que
          existe. Desde o ADO 68506 o "valor unitário" é unitário de verdade:
          sem a quantidade ao lado, um equipamento de 3 × R$ 50.000 leria como
          R$ 50.000 — um número que não é o do investimento nem o da alçada.
        */}
        {investment.quantidade != null && (
          <Field
            label="Quantidade"
            testId="quantidade"
            value={formatQuantidade(investment.quantidade)}
          />
        )}
        <Field
          label="Valor unitário"
          value={formatCurrencyBRL(investment.valorUnitario)}
        />
        {/*
          O total da LINHA. Só aparece quando difere do unitário, senão
          repetiria o campo de cima em toda linha sem quantidade.
        */}
        {investment.valorFinal !== investment.valorUnitario && (
          <Field
            label="Valor total do item"
            testId="valor-final"
            value={formatCurrencyBRL(investment.valorFinal)}
          />
        )}
        <Field
          label="Valor de aquisição"
          testId="valor-aquisicao"
          /* `null` = não informado; `0` é um número digitado. A tela mostra a diferença. */
          value={
            investment.valorAquisicao === null
              ? "—"
              : formatCurrencyBRL(investment.valorAquisicao)
          }
        />
        <Field
          label="Negociação original"
          value={investment.negociacaoOriginal ? "Sim" : "Não"}
        />

        {/*
          Campos por CATEGORIA (ADO 68506).

          ⚠️ Cada um só aparece quando NÃO é nulo — e `null` aqui significa "a
          família deste investimento não tem o campo". Renderizar "—" para todos
          encheria o card de linhas que não se aplicam; renderizar "0" ou "Não"
          afirmaria uma resposta que ninguém deu.

          ⚠️ `!= null`, que cobre `undefined` também: um retrato antigo ou um
          objeto parcial traz o campo AUSENTE, e `!== null` renderizaria a linha
          com valor vazio — rótulo sem valor lê como dado que falhou ao
          carregar.
        */}
        {investment.equipamento != null && (
          <Field label="Equipamento" value={investment.equipamento} />
        )}
        {investment.elementoImagem != null && (
          <Field label="Elemento de imagem" value={investment.elementoImagem} />
        )}
        {investment.custoInstalacao != null && (
          <Field
            label="Custo de instalação"
            testId="custo-instalacao"
            value={formatCurrencyBRL(investment.custoInstalacao)}
          />
        )}
        {investment.vidaUtilContabilMeses != null && (
          <Field
            label="Vida útil contábil"
            value={`${investment.vidaUtilContabilMeses} ${
              investment.vidaUtilContabilMeses === 1 ? "mês" : "meses"
            }`}
          />
        )}
        {investment.valorResidualContabil != null && (
          <Field
            label="Valor residual contábil"
            value={formatCurrencyBRL(investment.valorResidualContabil)}
          />
        )}
        {investment.valorVenda != null && (
          <Field
            label="Valor de venda"
            value={formatCurrencyBRL(investment.valorVenda)}
          />
        )}
        {investment.codigo != null && (
          <Field label="Código" value={investment.codigo} />
        )}
        {investment.equipamentoUsado != null && (
          <Field
            label="Equipamento usado"
            value={investment.equipamentoUsado ? "Sim" : "Não"}
          />
        )}
        {investment.venderParaCliente != null && (
          <Field
            label="Vender para o cliente"
            value={investment.venderParaCliente ? "Sim" : "Não"}
          />
        )}
        {investment.dataVendaEquipamento != null && (
          <Field
            label="Data da venda"
            value={formatDateBR(investment.dataVendaEquipamento) ?? "—"}
          />
        )}
      </dl>
    </div>
  );
}

function Field({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div>
      <dt className="text-(--color-text-muted)">{label}</dt>
      <dd data-testid={testId} className="font-bold text-(--color-text)">
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Modal de investimento — **ordem e conteúdo do protótipo de 21/08/2026**.
 *
 * O `ciclo1.js` do repositório já estava naquela versão; só o HTML tinha ficado
 * para trás, e por isso a tela divergia (UAT de 25/08/2026: "Investimentos não
 * está com o layout atual do protótipo"). O que mudou em relação ao anterior:
 *
 *   1. Título `Adicionar investimento`, não `Criar investimento`.
 *   2. Primeira linha passou a ser `Tipo` + `Data do investimento`.
 *   3. `Cotação` **saiu** — era um campo desabilitado exibindo a própria
 *      proposta, que o cabeçalho da tela já nomeia.
 *   4. `Obra (Converge)` entrou, logo abaixo de `Descrição`.
 *   5. `Vida útil fiscal` desceu para a linha de `Valor unitário`.
 *   6. `Negociação original` virou uma caixa alinhada ao lado de `Valor de
 *      aquisição`, em vez de uma linha solta no fim.
 */
function InvestmentModal({
  variant = "investimento",
  camposDaObraTravados = false,
  editing,
  form,
  onChange,
  onCancel,
  onSubmit,
  saving,
  error,
  obras,
  obraEscolhida,
  onObraChange,
  obrasLoading,
  obrasError,
  obrasHabilitadas,
}: {
  /**
   * `'obra'` é o diálogo "Adicionar obra" (INV-02): mantém tipo, data (→
   * "inicial"), descrição, vida útil e "Negociação original", **remove**
   * detalhamento e os dois valores (a parcela os define) e torna a obra
   * obrigatória.
   *
   * ⚠️ Variante, e não componente irmão — mesma razão do bloco de recursos
   * financeiros: um segundo componente duplicaria os campos e os dois
   * divergiriam na primeira regra nova.
   */
  variant?: "investimento" | "obra";
  /**
   * Item gerado por obra em EDIÇÃO: detalhamento e os dois valores ficam em
   * leitura (§6). Data e o resto seguem editáveis.
   */
  camposDaObraTravados?: boolean;
  editing: boolean;
  form: FormState;
  onChange: (form: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
  saving: boolean;
  error: string | null;
  /** `null` = ainda não carregadas. `[]` = o cliente não tem obra — não é erro. */
  obras: Obra[] | null;
  /* `obraVinculada` saiu daqui em 10/09/2026 junto com o aviso de troca. */
  obraEscolhida: string;
  onObraChange: (value: string) => void;
  obrasLoading: boolean;
  obrasError: string | null;
  /** `false` quando não há oportunidade — não há a quem perguntar. */
  obrasHabilitadas: boolean;
}) {
  const ehObra = variant === "obra";

  /*
   * O cliente não tem obra no Converge — FATO DE NEGÓCIO, não falha: a lista
   * veio, e veio vazia. Falha de leitura tem estado próprio (`obrasError`), e
   * `obras === null` é "ainda não carregou" — sem essa guarda o aviso piscaria
   * antes da resposta chegar. Mesma condição do bloco de recurso financeiro.
   */
  const semObraNoConverge =
    ehObra &&
    !obrasLoading &&
    !obrasError &&
    obras !== null &&
    obras.length === 0;

  /*
   * Aguarda a resposta do Converge antes de decidir o que mostrar — ver a nota
   * gêmea em `financial-resources-block.tsx`. Sem isto o formulário abria
   * completo e sumia quando a lista chegava vazia, possivelmente com o usuário
   * já preenchendo.
   */
  const aguardandoObras =
    ehObra &&
    obrasHabilitadas &&
    !obrasError &&
    (obras === null || obrasLoading);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={
          ehObra
            ? "Adicionar obra"
            : editing
              ? "Editar investimento"
              : "Adicionar investimento"
        }
        className="max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-[var(--radius-sm)] bg-white p-5"
      >
        <h4 className="mb-4 text-(length:--t-h3) font-bold text-(--color-text)">
          {ehObra
            ? "Adicionar obra"
            : editing
              ? "Editar investimento"
              : "Adicionar investimento"}
        </h4>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
          >
            {error}
          </div>
        )}

        {/*
          Sem obra no Converge, o diálogo mostra SÓ o aviso: nenhum campo aqui
          é preenchível sem uma obra a escolher, e um formulário inteiro atrás
          de um seletor vazio convida a preencher o que não vai salvar.
        */}
        {aguardandoObras ? (
          <div
            role="status"
            aria-label="Carregando obras do cliente…"
            data-testid="obra-carregando"
            className="flex items-center gap-2 py-8 text-(length:--t-caption) text-(--color-text-muted)"
          >
            <span
              aria-hidden="true"
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--secondary-500) border-t-transparent"
            />
            Carregando obras do cliente…
          </div>
        ) : semObraNoConverge ? (
          <div
            role="status"
            data-testid="obra-sem-obra-aviso"
            className="mb-3 rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2.5 text-(length:--t-small) text-(--yellow-700)"
          >
            Este cliente não tem obra no Converge
          </div>
        ) : (
          <>
            {/* 1. Tipo + Data — a primeira linha do protótipo de 21/08/2026. */}
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="im-tipo" required>
                  Tipo
                </FieldLabel>
                {/*
              Opções do vocabulário DESTA plataforma. NÃO é `PicklistSelect`:
              não existe picklist de catálogo para este campo, e `Tipo__c` do org
              tem outros dez valores.

              ⚠️ O protótipo de 21/08/2026 estreitou a lista para três
              (`Benfeitorias | Obras | Outros`). Não seguimos aquele recorte: a
              decisão de 24/08/2026 é POSTERIOR, foi medida contra o org, e
              oferece seis — e adotar as três renomearia `Obra civil` para
              `Obras` sem DE→PARA, órfãos os valores já gravados. O que a UAT
              pediu foi o LAYOUT.
            */}
                <select
                  id="im-tipo"
                  className={FIELD_CLASS}
                  value={form.tipo}
                  onChange={(e) =>
                    /*
                     * Trocar de tipo LIMPA o que a nova família não admite —
                     * o DTO recusa esses campos com 400, e sem limpar o
                     * usuário veria a recusa de um campo que nem está mais na
                     * tela. Os campos comuns são preservados.
                     */
                    onChange(
                      limparCamposForaDaFamilia(
                        form,
                        e.target.value as TipoInvestimento,
                      ),
                    )
                  }
                >
                  {/*
                Só os tipos que a escrita da cotação atravessa hoje (decisão de
                24/08/2026). Um valor JÁ GRAVADO fora dessa lista continua sendo
                oferecido, senão abrir a linha para editar o degradaria para o
                placeholder e o usuário perderia a resposta sem perceber.
              */}
                  {TIPOS_INVESTIMENTO.filter(
                    (tipo) =>
                      TIPOS_INVESTIMENTO_SELECIONAVEIS.includes(tipo) ||
                      tipo === form.tipo,
                  ).map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
                {/*
              A tela não pode aceitar em silêncio o que um passo posterior
              recusa: `Tipo__c` é restricted no org, e este tipo não existe lá.
              O save continua permitido — é dado de negócio legítimo —, mas o
              usuário fica sabendo antes, e não dias depois na alçada.
            */}
                {tipoSemContrapartidaNoCrm(form.tipo) && (
                  <p
                    data-testid="tipo-sem-contrapartida"
                    className="mt-1.5 text-(length:--t-caption) text-(--yellow-700)"
                  >
                    ⚠ Este tipo ainda não tem correspondência no Salesforce. O
                    investimento pode ser salvo, mas o acionamento da alçada vai
                    recusar até a Vibra definir o mapeamento.
                  </p>
                )}
              </div>
              <div>
                <FieldLabel htmlFor="im-data" required>
                  {/* INV-02: no diálogo de obra a data é a BASE da contagem do
                  prazo de cada parcela, não a data de um investimento só. */}
                  {ehObra
                    ? "Data do investimento inicial"
                    : /*
                       * Nas famílias de equipamento/imagem o org chama esta
                       * data de "Data de Instalação" — e é para
                       * `Data_De_Instalacao__c` que ela vai. Um rótulo só
                       * deixaria a tela dizendo uma coisa e o Salesforce
                       * mostrando outra.
                       */
                      familiaDoTipo(form.tipo) === "Investimento"
                      ? "Data do investimento"
                      : "Data de instalação"}
                </FieldLabel>
                <input
                  id="im-data"
                  type="date"
                  className={FIELD_CLASS}
                  value={form.dataInvestimento}
                  onChange={(e) => set("dataInvestimento", e.target.value)}
                />
              </div>
            </div>

            {/* 2. Descrição — largura inteira. */}
            <div className="mb-3">
              {/*
                Obrigatória desde 15/09/2026, por decisão da Vibra: o ARP recusa
                a simulação INTEIRA quando a descrição vai vazia, e recusa sem
                dizer qual campo. O protótipo não marcava este asterisco.
              */}
              <FieldLabel htmlFor="im-desc" required>
                Descrição
              </FieldLabel>
              <input
                id="im-desc"
                className={FIELD_CLASS}
                placeholder="Descrição do investimento"
                value={form.descricao}
                onChange={(e) => set("descricao", e.target.value)}
              />
            </div>

            {/*
          3. Obra (Converge) — ADR-0048, protótipo de 21/08/2026.

          Quatro estados distintos, e nenhum deles é uma lista vazia silenciosa:

            1. sem oportunidade → desabilitado, nomeia a razão. Não há a quem
               perguntar; nenhuma chamada ao Converge acontece.
            2. carregando       → desabilitado, "Carregando obras…".
            3. erro             → o seletor NÃO renderiza lista vazia (que
               afirmaria "o cliente não tem obra"); a frase do backend aparece
               abaixo, porque é ela que diz o que fazer.
            4. carregado        → o seletor real, ou a frase de negócio quando o
               cliente realmente não tem obra.

          ⚠️ Escolher a obra preenche **valor unitário** e **descrição** (Vibra,
          26/08/2026) — e só. O `invObraFill()` do protótipo mexia em sete campos,
          mas cinco deles vinham do `INV_OBRAS`, um mock estático: o
          `GetEstimates` real não publica data de investimento, vida útil fiscal,
          detalhamento, valor de aquisição nem um tipo com de/para confirmado.
          Preencher a partir do que não existe fabricaria números indistinguíveis
          de reais — o defeito do default `CIF` e do CPV fictício. O raciocínio
          campo a campo está em `investmentPrefillFromObra`.
        */}
            {/*
          INV-04 — o campo `Obra (Converge)` SAIU da adição direta: investimento
          criado diretamente não se associa a uma obra. Ele existe apenas no
          diálogo "Adicionar obra", onde é obrigatório.
        */}
            {ehObra && (
              <div className="mb-3">
                <FieldLabel htmlFor="im-obra" required={ehObra}>
                  Obra (Converge)
                </FieldLabel>
                <Select
                  id="im-obra"
                  value={obraEscolhida}
                  onChange={onObraChange}
                  options={[
                    ...(obras ?? []).map((obra) => ({
                      value: obra.estimateId,
                      label: obraOptionLabel(obra),
                    })),
                    // A terceira opção do protótipo. É também o único caminho para
                    // DESASSOCIAR: o placeholder é `disabled` e não volta a ser
                    // selecionável.
                    { value: SEM_OBRA, label: "Sem obra vinculada" },
                  ]}
                  placeholder={
                    !obrasHabilitadas
                      ? "Obra indisponível nesta tela — abra a proposta pela oportunidade"
                      : obrasLoading
                        ? "Carregando obras…"
                        : obrasError
                          ? "Não foi possível carregar as obras"
                          : obras && obras.length === 0
                            ? "Este cliente não tem obra no Converge"
                            : "Selecione a obra…"
                  }
                  disabled={!obrasHabilitadas || obrasLoading || !obras}
                  data-testid="im-obra-field"
                />
                {obrasError && (
                  <p className="mt-1 text-(length:--t-caption) text-(--yellow-700)">
                    {obrasError}
                  </p>
                )}
                {/*
                  ⚠️ Aqui havia o aviso "A oportunidade admite uma obra só: ao
                  salvar, esta escolha substitui a obra X em todos os recursos",
                  REMOVIDO em 10/09/2026 (ADR-0051).
                  
                  Ele afirmava duas coisas que deixaram de valer: o limite é por
                  PROPOSTA, não por oportunidade, e nada é substituído em
                  silêncio — adicionar obra numa proposta que já tem uma é
                  recusado com 422 nomeando o conserto ("Remova a obra atual
                  antes de adicionar outra").
                  
                  Ele também aparecia indevidamente: `obraVinculada` é lido na
                  montagem do bloco e não é limpo ao remover a obra, então
                  bastava adicionar, remover e reabrir o diálogo sem recarregar
                  a página para ler um aviso sobre uma obra que não existe mais.
                */}
              </div>
            )}

            {/* 4. Detalhamento do item — largura inteira. */}
            {/* INV-02/INV-03: fora do diálogo de obra — vem da `Description` da parcela. */}
            {!ehObra && (
              <div className="mb-3">
                <FieldLabel htmlFor="im-det" required>
                  Detalhamento do item
                </FieldLabel>
                <textarea
                  id="im-det"
                  disabled={camposDaObraTravados}
                  className={FIELD_CLASS}
                  placeholder="Descreva o item do investimento"
                  value={form.detalhamentoItem}
                  onChange={(e) => set("detalhamentoItem", e.target.value)}
                />
              </div>
            )}

            {/* 5. Vida útil fiscal + Valor unitário. */}
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="im-vida" required>
                  Vida útil fiscal (meses)
                </FieldLabel>
                <input
                  id="im-vida"
                  type="number"
                  min={0}
                  className={FIELD_CLASS}
                  placeholder="ex.: 60"
                  value={form.vidaUtilFiscalMeses}
                  onChange={(e) => set("vidaUtilFiscalMeses", e.target.value)}
                />
              </div>
              {/* INV-02/INV-03: fora do diálogo de obra — é o valor da própria parcela. */}
              {!ehObra && (
                <div>
                  <FieldLabel htmlFor="im-vunit" required>
                    Valor unitário
                  </FieldLabel>
                  <input
                    id="im-vunit"
                    disabled={camposDaObraTravados}
                    inputMode="numeric"
                    className={FIELD_CLASS}
                    placeholder="R$ 0,00"
                    value={form.valorUnitario}
                    onChange={(e) =>
                      set("valorUnitario", maskMoneyInput(e.target.value))
                    }
                  />
                </div>
              )}
            </div>


            {/*
              7. Campos por CATEGORIA (ADO 68506).

              ⚠️ O que aparece aqui é decidido pela FAMÍLIA do tipo, e a regra
              é espelho do backend (`investment-field-rules.ts`). O veredito
              continua sendo dele: campo que a família não admite é recusado
              com 400. Esta tela só não o desenha — e limpa o valor ao trocar
              de tipo, senão o usuário veria a recusa de um campo invisível.

              Não aparece para Benfeitorias / Obra civil / Outros: o layout do
              org para essa família já batia campo a campo com o que a tela
              tinha antes desta entrega.
            */}
            {!ehObra && familiaDoTipo(form.tipo) !== "Investimento" && (
              <>
                <div className="mb-3 grid grid-cols-2 gap-3">
                  {familiaDoTipo(form.tipo) === "Equipamento" && (
                    <div>
                      <FieldLabel htmlFor="im-equip" required>
                        Equipamento
                      </FieldLabel>
                      <PicklistSelect
                        id="im-equip"
                        field={PicklistField.InvestimentoEquipamento}
                        className={FIELD_CLASS}
                        value={form.equipamento}
                        onChange={(value) => set("equipamento", value)}
                      />
                    </div>
                  )}
                  {familiaDoTipo(form.tipo) === "ElementoImagem" && (
                    <div>
                      <FieldLabel htmlFor="im-elem" required>
                        Elemento de imagem
                      </FieldLabel>
                      <PicklistSelect
                        id="im-elem"
                        field={PicklistField.InvestimentoElementoImagem}
                        className={FIELD_CLASS}
                        value={form.elementoImagem}
                        onChange={(value) => set("elementoImagem", value)}
                      />
                    </div>
                  )}

                  {/*
                    Quantidade SÓ em equipamento — medido em 19/09/2026 nas
                    linhas propostas do org: quantidade > 1 em 28,4% dos
                    equipamentos, 0 de 1.284 elementos de imagem e 7 de 1.697
                    investimentos. Oferecê-la onde é invariavelmente 1
                    convidaria a mexer num número que muda a TIR sem nenhum
                    correspondente no org.

                    ⚠️ Com este campo, "Valor unitário" passa a ser de fato
                    UNITÁRIO: antes o usuário digitava o total ali.
                  */}
                  {familiaDoTipo(form.tipo) === "Equipamento" && (
                    <div>
                      <FieldLabel htmlFor="im-qtd" required>
                        Quantidade
                      </FieldLabel>
                      <input
                        id="im-qtd"
                        type="number"
                        min={0}
                        step="any"
                        className={FIELD_CLASS}
                        placeholder="ex.: 1"
                        value={form.quantidade}
                        onChange={(e) => set("quantidade", e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="mb-3 grid grid-cols-2 gap-3">
                  {/*
                    Obrigatório nas duas famílias — e por causa do CÁLCULO, não
                    da regra do org: é a estrutura `custoInstalacoes` do ARP
                    inteira. Sem ele o custo de instalação não chega ao cálculo
                    nas nossas cotações.
                  */}
                  <div>
                    <FieldLabel htmlFor="im-custoinst" required>
                      Custo de instalação
                    </FieldLabel>
                    <input
                      id="im-custoinst"
                      inputMode="numeric"
                      className={FIELD_CLASS}
                      placeholder="R$ 0,00"
                      value={form.custoInstalacao}
                      onChange={(e) =>
                        set("custoInstalacao", maskMoneyInput(e.target.value))
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="im-vidacont">
                      Vida útil contábil (meses)
                    </FieldLabel>
                    <input
                      id="im-vidacont"
                      type="number"
                      min={0}
                      className={FIELD_CLASS}
                      placeholder="ex.: 120"
                      value={form.vidaUtilContabilMeses}
                      onChange={(e) =>
                        set("vidaUtilContabilMeses", e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel htmlFor="im-vresid">
                      Valor residual contábil
                    </FieldLabel>
                    <input
                      id="im-vresid"
                      inputMode="numeric"
                      className={FIELD_CLASS}
                      placeholder="R$ 0,00"
                      value={form.valorResidualContabil}
                      onChange={(e) =>
                        set(
                          "valorResidualContabil",
                          maskMoneyInput(e.target.value),
                        )
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="im-vvenda">Valor de venda</FieldLabel>
                    <input
                      id="im-vvenda"
                      inputMode="numeric"
                      className={FIELD_CLASS}
                      placeholder="R$ 0,00"
                      value={form.valorVenda}
                      onChange={(e) =>
                        set("valorVenda", maskMoneyInput(e.target.value))
                      }
                    />
                  </div>
                </div>

                {familiaDoTipo(form.tipo) === "Equipamento" && (
                  <>
                    <div className="mb-3 grid grid-cols-2 gap-3">
                      <div>
                        <FieldLabel htmlFor="im-codigo">Código</FieldLabel>
                        <input
                          id="im-codigo"
                          className={FIELD_CLASS}
                          /* Identificador do ativo no org/SAP — a plataforma
                             nunca o cunha; o usuário transcreve quando o tem. */
                          placeholder="Código do ativo, se já houver"
                          value={form.codigo}
                          onChange={(e) => set("codigo", e.target.value)}
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-xs)] border border-(--color-border-strong) px-3 text-(length:--t-caption)">
                          <input
                            type="checkbox"
                            className="h-[18px] w-[18px] accent-(--secondary-600)"
                            checked={form.equipamentoUsado}
                            onChange={(e) =>
                              set("equipamentoUsado", e.target.checked)
                            }
                          />
                          Equipamento usado
                        </label>
                      </div>
                    </div>

                    <div className="mb-3 grid grid-cols-2 gap-3">
                      <div className="flex items-end">
                        {/*
                          ⚠️ Este checkbox NÃO é o campo que o ARP lê: ele lê
                          `Venda_Equipamento__c`, que o org mantém vazio em
                          todas as linhas. Aqui coletamos o `Vender_Cliente__c`
                          do layout, e a plataforma deliberadamente não escreve
                          o outro — é o que produz paridade com o cálculo deles.
                        */}
                        <label className="flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-xs)] border border-(--color-border-strong) px-3 text-(length:--t-caption)">
                          <input
                            type="checkbox"
                            className="h-[18px] w-[18px] accent-(--secondary-600)"
                            checked={form.venderParaCliente}
                            onChange={(e) =>
                              set("venderParaCliente", e.target.checked)
                            }
                          />
                          Vender para o cliente
                        </label>
                      </div>
                      {/* A data só faz sentido com a venda marcada — e o
                          backend recusa a combinação incoerente nos DOIS
                          sentidos. */}
                      {form.venderParaCliente && (
                        <div>
                          <FieldLabel htmlFor="im-dvenda" required>
                            Data da venda
                          </FieldLabel>
                          <input
                            id="im-dvenda"
                            type="date"
                            className={FIELD_CLASS}
                            value={form.dataVendaEquipamento}
                            onChange={(e) =>
                              set("dataVendaEquipamento", e.target.value)
                            }
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {/* 6. Valor de aquisição + Negociação original, a caixa do protótipo. */}
            <div className="mb-3 grid grid-cols-2 gap-3">
              {/* INV-02/INV-03: fora do diálogo de obra — é o valor da própria parcela. */}
              {!ehObra && (
                <div>
                  <FieldLabel htmlFor="im-vaq">Valor de aquisição</FieldLabel>
                  <input
                    id="im-vaq"
                    disabled={camposDaObraTravados}
                    inputMode="numeric"
                    className={FIELD_CLASS}
                    /* Vazio, não "R$ 0,00": o campo tem de conseguir voltar a "não informado". */
                    placeholder="R$ 0,00"
                    value={form.valorAquisicao}
                    onChange={(e) =>
                      set("valorAquisicao", maskMoneyInput(e.target.value))
                    }
                  />
                </div>
              )}
              <div className="flex items-end">
                <label className="flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-xs)] border border-(--color-border-strong) px-3 text-(length:--t-caption)">
                  <input
                    type="checkbox"
                    className="h-[18px] w-[18px] accent-(--secondary-600)"
                    checked={form.negociacaoOriginal}
                    onChange={(e) =>
                      set("negociacaoOriginal", e.target.checked)
                    }
                  />
                  Negociação original
                </label>
              </div>
            </div>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[var(--radius-xxs)] px-4 py-2 text-(length:--t-caption) font-bold text-(--color-text-muted)"
          >
            Cancelar
          </button>
          {/* Sem obra a escolher — ou antes de saber se há — não há o que
              salvar. */}
          {!semObraNoConverge && !aguardandoObras && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={saving}
              className="rounded-[var(--radius-xxs)] bg-(--secondary-600) px-4 py-2 text-(length:--t-caption) font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {editing ? "Salvar" : "Adicionar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
