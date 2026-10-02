'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useConfirm } from '@/components/confirm-dialog';
import { StatusPill } from '@/components/status-pill';
import { failureReason } from '@/lib/api-errors';
import { Select } from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import { useSendbarReserve } from '@/hooks/use-sendbar-reserve';
import { SendbarPendencias } from '@/components/franquia/sendbar-pendencias';
import { Permission } from '@/lib/auth-permissions';
import { Finalidade } from '@/lib/picklists/salesforce-values';
import {
  AddRowButton,
  Alert,
  BTN_GHOST,
  BTN_PRIMARY,
  Block,
  DField,
  DGrid,
  EmptyState,
  IndicadoresFranquiaPanel,
  LockChip,
  SectionUnavailable,
  SubBox,
  SubHeading,
} from '@/components/franquia/franquia-ui';
import {
  CofModal,
  DadosModal,
  ExcecaoModal,
  ModeloModal,
  resumoExcecao,
} from '@/components/franquia/proposta-franquia-modais';
import {
  BANDEIRA_FRANQUIA_LABEL,
  BandeiraFranquia,
  FORMATO_LOJA_LABEL,
  GRUPO_CONTAS_LABEL,
  MODELO_NEGOCIO_LABEL,
  MODELO_ROYALTY_LABEL,
  ModeloRoyalty,
  SITUACAO_LOJA_LABEL,
} from '@/lib/franquia/types';
import { TabelaAnexoA } from '@/components/franquia/tabela-anexo-a';
import type { RoyaltyFaixa } from '@/lib/franquia/proposta-franquia-mapping';
import {
  EXCECAO_TIPO_LABEL,
  RASCUNHO_DADOS_VAZIO,
  RASCUNHO_MODELO_VAZIO,
  aplicarRascunhoFranquia,
  aplicarRespostasDoModalDeDados,
  type BlocoRascunho,
  dadosObrigatoriosCompletos,
  dadosPreenchidos,
  derivarJanelaAnalise,
  excecaoTemValor,
  exibeTabelaDeRoyalties,
  modeloLojaCompleto,
  modeloPreenchido,
  rotuloAnexoPendente,
  selecionarFaixasDoCatalogo,
  simNaoLabel,
  type EstadoSalvamento,
  type FaixaCatalogo,
  type AplicarRascunhoDeps,
  type DadosFranquiaRascunho,
  type ExcecaoRascunho,
  type ModeloRascunho,
  type RascunhoFranquia,
} from '@/lib/franquia/nova-proposta-franquia';
import {
  formatBrlString,
  formatDateBR,
  parseMoneyInput,
} from '@/lib/franquia/format';
import { listCatalogoRoyalties as defaultListCatalogoRoyalties } from '@/lib/franquia-admin/franquia-admin.api';
import {
  getRoyaltyValidacoes as defaultGetValidacoes,
} from '@/lib/franquia/parametros.data';
import { updateDadosFranquia } from '@/lib/franquia/dados.data';
import {
  createExcecao,
  updateExcecao,
  deleteExcecao as defaultDeleteExcecao,
  setMaturacao,
  setModeloLoja,
  setRoyaltyEstrutura,
} from '@/lib/franquia/parametros.data';
import {
  deleteFap as defaultDeleteFap,
  fapStreamUrl,
  getPropostaFranquia as defaultGetPropostaFranquia,
  setPotencial,
  uploadFap as defaultUploadFap,
  type FapDocumentoUploaded,
} from '@/lib/franquia/proposta-franquia.data';
import {
  deletePostoPhoto as defaultDeletePostoPhoto,
  uploadPostoPhoto as defaultUploadPostoPhoto,
} from '@/lib/proposals/posto-photos.data';
import type { PostoPhoto } from '@/lib/proposals/posto-photos.types';
import { createFranquiaProposal as defaultCreateFranquiaProposal } from '@/lib/proposals/franquia-proposal.api';
import {
  FranquiaPostoProposalNotFoundError,
  FranquiaServiceUnavailableError,
  TIPO_PROPOSTA_LABEL,
  TipoProposta,
  isTipoProposta,
} from '@/lib/proposals/franquia-proposal.types';
import {
  getOpportunityDetail as defaultGetOpportunityDetail,
  getOpportunityProposals as defaultGetOpportunityProposals,
} from '@/lib/opportunities/opportunity-detail.data';
import type {
  OpportunityDetail,
  OpportunityProposal,
} from '@/lib/opportunities/types';
import { responsavelDaOportunidade } from '@/lib/opportunities/responsavel';
import { getTeam as defaultGetTeam } from '@/lib/opportunities/team.data';
import type { OpportunityTeam } from '@/lib/opportunities/team.types';
import { getProposalDateConstraints as defaultGetDateConstraints } from '@/lib/proposals/proposal-creation.api';
import type { ProposalDateConstraints } from '@/lib/proposals/proposal-creation.types';
import { getProposal as defaultGetProposal } from '@/lib/proposals/proposal.data';
import { analysisWindowError } from '@/lib/proposals/proposal-date-validation';
import { urlDeMidiaSegura } from '@/lib/arquivo/url-de-midia';

/**
 * `03-proposta-franquia.html` — **Nova proposta de franquia** (FRQ-F1).
 *
 * The prototype's creation screen is not a flat form: it is the same five-card
 * layout the proposal screen uses, with each card starting on an empty state and
 * a "+ Cadastrar…" modal filling it in. This component reproduces that shell —
 * head card with pills and meta row, two columns with a sticky indicator panel,
 * fixed sendbar.
 *
 * ## O que cada "Salvar" faz
 *
 * Não há CTA de criação (UAT de 25/08/2026 — "não deve existir o botão
 * Concluir"). O "Salvar" de cada modal grava o bloco NA HORA: `salvarBlocos`
 * chama `POST .../franquia` na primeira vez (o único passo que pode abortar o
 * fluxo) e depois `aplicarRascunhoFranquia` reproduz os blocos daquele cartão
 * contra os endpoints deles. Um bloco que falha é NOMEADO na sendbar em vez de
 * descartado em silêncio: a proposta já existe naquele ponto, e os mesmos campos
 * seguem editáveis na tela dela.
 *
 * ⚠️ **O rascunho do `onSave` viaja por PARÂMETRO até o gate e até o payload de
 * criação** (ADO 67887). O estado só muda no render seguinte, então qualquer
 * decisão tomada sobre `dados` ali é sobre a resposta ANTERIOR — foi assim que o
 * primeiro "Salvar" virou no-op mudo sempre que a finalidade era respondida
 * dentro do próprio modal.
 *
 * ## Where it deliberately departs from the prototype
 *
 * - **"Royalties e consolidação econômica" and the ARP panel show no numbers.**
 *   The prototype computes them in the page with a hardcoded band table and a
 *   `setTimeout` that fabricates "96% a.a.". Those are backend verdicts
 *   (`royaltiesCalculados`, `indicadoresEconomicos`); computing them here would
 *   be a mock indistinguishable from real data on screen. The cards keep their
 *   place and say when the figures arrive.
 *   ⚠️ **`Royalties (a.a.)` do painel saiu dessa lista em 26/08/2026 (ADO
 *   67868)** — ele não é calculado aqui, é LIDO do `royaltiesCalculados` da
 *   proposta que o autosave acabou de criar. A divergência que permanece é o
 *   BLOCO de consolidação, removido para as duas telas em 14/08.
 * - **No "Editar como time de franquia" / "executivo de franquia" checkboxes.**
 *   Demo artefacts of a page with no session — editability is a permission
 *   (ADR-0018, same reasoning that removed "Ver como SNEG →").
 * - **The COF card carries no e-mail form.** There is no write endpoint for it;
 *   a form without a destination accepts the edit and loses it on reload.
 * - **The three answers the creation API needs beyond the prototype's eight —
 *   proposta de posto, finalidade e janela de análise — são HERDADAS**, não
 *   perguntadas. O protótipo as afirma como fato porque uma página estática não
 *   tinha nada a criar; aqui elas vêm da proposta de posto e da oportunidade.
 *   A grade de identidade continua sendo de fatos: nenhuma das três vira
 *   controle ali. A única que precisa de saída é a finalidade — `Vinculação` e
 *   família não têm contrapartida de bandeira no org —, e aí a pergunta aparece
 *   no MODAL, ao lado das outras perguntas da tela.
 */
export function NovaPropostaFranquiaScreen({
  opportunityId,
  bandeira,
  createFranquiaProposal = defaultCreateFranquiaProposal,
  getOpportunity = defaultGetOpportunityDetail,
  getTeam = defaultGetTeam,
  getProposals = defaultGetOpportunityProposals,
  getDateConstraints = defaultGetDateConstraints,
  getProposal = defaultGetProposal,
  listCatalogoRoyalties = defaultListCatalogoRoyalties,
  getValidacoes = defaultGetValidacoes,
  getPropostaFranquia = defaultGetPropostaFranquia,
  aplicarRascunho = aplicarRascunhoFranquia,
  deleteExcecao = defaultDeleteExcecao,
  deleteFap = defaultDeleteFap,
  deletePostoPhoto = defaultDeletePostoPhoto,
  uploadFap = defaultUploadFap,
  uploadPostoPhoto = defaultUploadPostoPhoto,
}: {
  opportunityId: string;
  bandeira: BandeiraFranquia;
  /** Injectable for tests; defaults to the real BFF clients. */
  createFranquiaProposal?: typeof defaultCreateFranquiaProposal;
  getOpportunity?: typeof defaultGetOpportunityDetail;
  /** Alimenta o "Responsável" da linha meta (LT principal da oportunidade). */
  getTeam?: typeof defaultGetTeam;
  getProposals?: typeof defaultGetOpportunityProposals;
  getDateConstraints?: typeof defaultGetDateConstraints;
  getProposal?: typeof defaultGetProposal;
  listCatalogoRoyalties?: typeof defaultListCatalogoRoyalties;
  getValidacoes?: typeof defaultGetValidacoes;
  getPropostaFranquia?: typeof defaultGetPropostaFranquia;
  aplicarRascunho?: typeof aplicarRascunhoFranquia;
  deleteExcecao?: typeof defaultDeleteExcecao;
  /** ADO 68184 — remoção da FAP e das fotos já gravadas, aqui na criação. */
  deleteFap?: typeof defaultDeleteFap;
  deletePostoPhoto?: typeof defaultDeletePostoPhoto;
  /**
   * Injetáveis pelo mesmo motivo dos demais: `enviarAnexos` os chama fora do
   * `aplicarRascunho` (é dele que sai o id do documento, que alimenta o link e o
   * Remover), então sem a prop nenhum teste alcança o estado "FAP gravada".
   */
  uploadFap?: typeof defaultUploadFap;
  uploadPostoPhoto?: typeof defaultUploadPostoPhoto;
}) {
  /*
   * Sem `useRouter`: com o autosave a tela não navega mais sozinha. Antes o
   * "Concluir" fazia `router.replace` para a oportunidade — agora a proposta é
   * criada no primeiro bloco salvo e a pessoa segue preenchendo ali mesmo; ir
   * embora é escolha dela, pelo "Abrir proposta" da sendbar.
   */
  const { can, canWrite } = usePermissions();
  const confirm = useConfirm();

  /*
   * A exceção programada é do LT desde o ADO 67802. Não existe mais um
   * `podeEstrutura` ao lado: os LIMITES do royalty saíram desta tela no ADO
   * 67867 e são parametrização por bandeira, na aba de Governança.
   *
   * Sem termo de fase aqui: nesta tela a proposta está sendo criada, então ela
   * é EM_PREENCHIMENTO por construção. Quem conhece a fase é o veredito
   * `excecoesProgramadas` do read model, na tela da proposta já salva.
   */
  const podeExcecao = canWrite && can(Permission.FranquiaExcecaoManage);

  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  const [team, setTeam] = useState<OpportunityTeam | null>(null);
  const [pcrProposals, setPcrProposals] = useState<OpportunityProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  /** A leitura das propostas FALHOU — distinto de "não há nenhuma". */
  const [propostasErro, setPropostasErro] = useState(false);
  const [constraints, setConstraints] = useState<ProposalDateConstraints | null>(
    null,
  );
  /**
   * Whether the finalidade/analysis window could be inherited from the linked
   * posto proposal. `falhou` is not fatal — the card offers the finalidade in
   * its own slot instead of leaving the screen unable to create anything.
   */
  const [herancaPosto, setHerancaPosto] = useState<
    'ocioso' | 'carregando' | 'herdada' | 'falhou'
  >('ocioso');

  /**
   * Anexo A bands for the registered model. `indisponivel` covers the catalog's
   * own 503 — "catálogo não configurado" is NOT an empty table (CLAUDE.md:
   * ausência de política nunca é lida como sem cobrança).
   */
  const [faixas, setFaixas] = useState<FaixaCatalogo[]>([]);
  const [faixasStatus, setFaixasStatus] = useState<
    'ocioso' | 'carregando' | 'ok' | 'indisponivel'
  >('ocioso');

  /**
   * "Royalties (a.a.)" do painel lateral — LIDO do backend, nunca calculado
   * aqui (ADO 67868).
   *
   * O painel não recebia valor nenhum, então a linha era `—` **permanente**:
   * era o que o print do ticket mostrava, com o faturamento já respondido ao
   * lado. A tela é a de criação, mas com o autosave a proposta passa a existir
   * no primeiro bloco salvo — e desse ponto em diante o `royaltiesCalculados`
   * do read model é a resposta, resolvido pelo `FranquiaF3Service` sobre a
   * faixa do Anexo A.
   *
   * ⚠️ **Não replicar a aritmética do protótipo.** O `calc()` de
   * `03-proposta-franquia.html` tem a tabela de faixas chumbada na página e
   * percentuais fixos por modelo; aqui a faixa é meia-aberta, e há precedência
   * de exceção (ISENCAO → BASE_REAL → TETO → CESSAO) e share de tabaco. Uma
   * segunda implementação divergiria exatamente na proposta com exceção — e o
   * número errado é indistinguível do certo na tela.
   *
   * `null` antes de a proposta existir é a resposta correta: nada foi gravado,
   * então não há royalty a exibir. `indisponivel` é o 503 do catálogo.
   */
  const [royaltyAnualBrl, setRoyaltyAnualBrl] = useState<string | null>(null);
  const [royaltyIndisponivel, setRoyaltyIndisponivel] = useState(false);

  /**
   * O que ainda falta na proposta que o autosave criou — **veredito do backend**
   * (`vereditos.pendenciasEnvio`), nunca derivado do rascunho.
   *
   * ⚠️ Três valores, não dois: `null` é "não sei" (nada criado ainda, ou a
   * leitura falhou) e `[]` é "nada falta". Colapsá-los faria a barra anunciar
   * proposta completa quando o GET caiu.
   *
   * A lista existe nesta tela desde 01/09/2026, a pedido do produto: quem
   * cadastrava os dados da franquia via só "salva automaticamente" e descobria as
   * pendências ao voltar pela oportunidade — a informação chegava um passo depois
   * de ser útil.
   */
  const [pendencias, setPendencias] = useState<readonly string[] | null>(null);
  /**
   * A frase da barra, composta pelo BACKEND (`sendbar.mensagem`) — "Proposta em
   * preenchimento — pendências a resolver." ou "Proposta pronta para envio à
   * análise.", a mesma da tela da proposta salva.
   *
   * ⚠️ Só a MENSAGEM é adotada. O CTA daquele payload é "Concluir", e esta tela
   * não pode ter um: a UAT de 25/08/2026 foi explícita ("não deve existir o botão
   * Concluir"), e aqui a navegação é "Ir para a oportunidade". Ler o veredito de
   * texto e ignorar o de ação é deliberado, não descuido.
   */
  const [sendbarMensagem, setSendbarMensagem] = useState<string | null>(null);

  /*
   * Reserva medida para a barra `fixed` — compartilhada com a tela da proposta
   * salva. Aqui era `pb-[88px]` chumbado, que a lista de pendências estoura.
   */
  const { sendbarRef, sendbarReserva } = useSendbarReserve();

  const [dados, setDados] = useState<DadosFranquiaRascunho>(RASCUNHO_DADOS_VAZIO);
  const [modelo, setModelo] = useState<ModeloRascunho>(RASCUNHO_MODELO_VAZIO);
  const [excecoes, setExcecoes] = useState<ExcecaoRascunho[]>([]);
  /** Prototype `#cofModal` — `''` significa que o modal nunca foi respondido. */
  const [cofEmail, setCofEmail] = useState('');

  const [modalAberto, setModalAberto] = useState<
    'dados' | 'modelo' | 'excecao' | 'cof' | null
  >(null);
  const [excecaoEmEdicao, setExcecaoEmEdicao] = useState<number | null>(null);
  /**
   * Autosave (UAT de 25/08/2026 — "ao preencher os campos, a proposta deve ser
   * salva automaticamente. Não deve existir o botão Concluir").
   *
   * `ocioso` é o estado ANTES de qualquer resposta — não "salvo": dizer "salvo"
   * numa tela em que nada foi preenchido afirmaria uma escrita que não houve.
   */
  const [salvamento, setSalvamento] = useState<EstadoSalvamento>('ocioso');
  /** Blocos que a última tentativa não conseguiu gravar, nomeados. */
  const [falhasSalvamento, setFalhasSalvamento] = useState<string[]>([]);
  const [erroEnvio, setErroEnvio] = useState('');

  /**
   * A proposta, depois de criada. `null` enquanto nada foi preenchido.
   *
   * ⚠️ **Criação PREGUIÇOSA, no primeiro bloco salvo — nunca na entrada da
   * rota.** Criar ao abrir a tela deixaria uma proposta órfã para cada pessoa
   * que só quis olhar, e a listagem da oportunidade passaria a exibi-las.
   */
  const [proposalId, setProposalId] = useState<string | null>(null);
  /**
   * Guarda contra criação concorrente. Dois cartões salvos em sequência rápida
   * disparariam dois POSTs e criariam DUAS propostas — o `useState` acima não
   * protege, porque o valor novo só chega no próximo render. A promise em voo é
   * compartilhada, do mesmo jeito que o cache de token do `DocuSignClient`.
   */
  const criacaoEmVooRef = useRef<Promise<string> | null>(null);

  /**
   * Id no servidor de cada exceção do rascunho, na mesma ordem. `null` = ainda
   * não persistida.
   *
   * Existe porque `createExcecao` é **POST**: sem saber quais já foram gravadas,
   * cada save reenviaria a lista inteira e o usuário veria a mesma exceção
   * várias vezes. Não há endpoint de UPDATE, então editar uma já persistida é
   * remover e recriar — que é exatamente o que a API oferece.
   */
  const [excecaoIds, setExcecaoIds] = useState<(string | null)[]>([]);

  /**
   * Os anexos JÁ GRAVADOS, com o que basta para abri-los.
   *
   * UAT de 25/08/2026: "devemos conseguir acessar os arquivos anexados em dados
   * da franquia". Antes, o anexo era um `File` em memória exibido como texto
   * (`✓ nome.pdf`) e só subia no "Concluir" — não havia o que abrir, porque o
   * documento ainda não existia no backend. Com o autosave ele passa a existir, e
   * o que falta é o link.
   *
   * ⚠️ A URL é a rota de STREAM da BFF, nunca a assinada do document store: o
   * backend assina para o próprio storage (em dev o host é o DNS do Docker), e a
   * assinada é credencial daquele objeto.
   */
  const [fapDocumento, setFapDocumento] = useState<FapDocumentoUploaded | null>(null);
  const [fotosEnviadas, setFotosEnviadas] = useState<PostoPhoto[]>([]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!opportunityId) return;

    getOpportunity(opportunityId)
      .then((opp) => {
        if (mountedRef.current) setOpportunity(opp);
      })
      .catch(() => {
        /* head degrades to the fallbacks */
      });

    /*
     * Equipe — alimenta o "Responsável" da linha meta, que era `value={null}`
     * chumbado. A proposta ainda não existe, mas a OPORTUNIDADE existe, e é
     * dela que a linha meta fala (cliente, código, tipo) — o responsável é o
     * LT principal, a mesma fonte das telas de proposta já salva.
     */
    getTeam(opportunityId)
      .then((t) => {
        if (mountedRef.current) setTeam(t);
      })
      .catch(() => {
        /* head degrades to the fallbacks */
      });

    getProposals(opportunityId)
      .then((proposals) => {
        if (!mountedRef.current) return;
        // Only a PCR proposal can be the parent of a franchise one (RN-F1-03).
        const pcr = proposals.filter(
          (p) => !isTipoProposta(p.tipoProposta) || p.tipoProposta === TipoProposta.PCR,
        );
        setPcrProposals(pcr);
        /*
         * Auto-link to the first candidate, not only when there is exactly one.
         *
         * The prototype has no posto selector — it states the link as a fact
         * ("Vinculada ao posto OPP-0428"), so demanding a choice here blocked
         * "Concluir" on a question the design never asks. `postoProposalId` is
         * still REQUIRED by `POST .../franquia` (RN-F1-03: a franchise always
         * hangs off a posto), so it is derived rather than dropped.
         *
         * With more than one candidate the card keeps the Select visible, so the
         * default is correctable — never silently locked in.
         */
        if (pcr.length > 0) {
          setDados((prev) =>
            prev.postoProposalId === ''
              ? { ...prev, postoProposalId: pcr[0].id }
              : prev,
          );
        }
      })
      .catch(() => {
        /*
         * Falha de LEITURA é registrada, nunca colapsada em "não tem proposta".
         *
         * Sem isto `pcrProposals` fica `[]` nos dois casos, e a tela afirmava
         * "esta oportunidade não tem proposta de posto (PCR)" quando na verdade
         * não deu para perguntar — erro lido como estado vazio, e o conserto
         * que a frase sugere (criar a proposta de posto) é o errado.
         */
        if (mountedRef.current) setPropostasErro(true);
      })
      .finally(() => {
        if (mountedRef.current) setProposalsLoading(false);
      });

    /*
     * The analysis-window limits are a function of the API's clock and are never
     * computed here: a client-side copy would silently disagree with the backend
     * on the 1st of every month. A silent source simply omits the `min`.
     */
    getDateConstraints()
      .then((value) => {
        if (mountedRef.current) setConstraints(value);
      })
      .catch(() => {
        /* no hint, no block */
      });
  }, [opportunityId, getOpportunity, getTeam, getProposals, getDateConstraints]);

  /*
   * A JANELA DE ANÁLISE é herdada da proposta de posto. A FINALIDADE não.
   *
   * ⚠️ **A finalidade da franquia é ESCOLHIDA nos dados cadastrais** (produto,
   * 26/08/2026), e essa é a regra que substitui a herança que existia aqui até
   * hoje. A herança foi construída sobre duas leituras que não se sustentaram:
   *
   *  - O protótipo afirma `Finalidade: Contratação` no cabeçalho
   *    (`03-proposta-franquia.html:135`), e isso parecia dizer "é fato herdado,
   *    não pergunta". Mas `Contratação` **não é finalidade**: é um valor de
   *    `TipoNegociacao` (`opportunity.catalog.ts`, `active: false, legacy: true`)
   *    que não existe no value set do Salesforce. O protótipo pôs um tipo de
   *    negociação num campo rotulado "Finalidade", então ele nunca respondeu
   *    qual finalidade gravar.
   *  - O org mostra a cotação de franquia copiando
   *    `Opportunity.Finalidade_Cotacao__c` em 370 de 372 pares não-nulos — mas lá
   *    a franquia tem oportunidade PRÓPRIA (RecordType `DCVIM_PCR_BR_Mania`), já
   *    band-qualified. Aqui ela pendura na oportunidade do POSTO, cuja finalidade
   *    é a do posto; e `Vinculação` e família (~47 % das cotações de posto) não
   *    têm contrapartida de bandeira. Ou seja: a correlação medida era entre
   *    coisas que nesta plataforma não são a mesma.
   *
   * Nada é pré-preenchido: a finalidade nasce vazia e o modal a pergunta sempre.
   * Herdar do posto gravaria uma escolha comercial que ninguém fez — e, no
   * caminho derivável, impedia o usuário de escolher outra.
   */
  useEffect(() => {
    const postoId = dados.postoProposalId;
    if (postoId === '') return;

    let cancelled = false;
    setHerancaPosto('carregando');

    getProposal(postoId)
      .then((posto) => {
        if (cancelled) return;
        const janela = derivarJanelaAnalise(posto, constraints);
        setDados((prev) =>
          prev.postoProposalId === postoId ? { ...prev, ...janela } : prev,
        );
        setHerancaPosto('herdada');
      })
      .catch(() => {
        if (cancelled) return;
        const janela = derivarJanelaAnalise(null, constraints);
        setDados((prev) =>
          prev.postoProposalId === postoId ? { ...prev, ...janela } : prev,
        );
        setHerancaPosto('falhou');
      });

    return () => {
      cancelled = true;
    };
  }, [dados.postoProposalId, constraints, getProposal]);

  /*
   * The band the backend will apply, read from the SAME key it uses
   * (`política × modelo de negócio × formato de loja`). Only fetched once a
   * complete model exists — before that there is no key to look up, and the
   * sub-block is not rendered anyway.
   */
  const chaveModelo = modeloLojaCompleto(modelo)
    ? `${modelo.modeloRoyalty}|${modelo.formatoLoja}`
    : '';

  useEffect(() => {
    if (chaveModelo === '') {
      setFaixasStatus('ocioso');
      setFaixas([]);
      return;
    }

    let cancelled = false;
    setFaixasStatus('carregando');

    listCatalogoRoyalties()
      .then((lista) => {
        if (cancelled) return;
        setFaixas(selecionarFaixasDoCatalogo(lista.items, modelo));
        setFaixasStatus('ok');
      })
      .catch(() => {
        if (cancelled) return;
        setFaixas([]);
        setFaixasStatus('indisponivel');
      });

    return () => {
      cancelled = true;
    };
    // `chaveModelo` is the identity of the lookup; `modelo` only supplies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveModelo, listCatalogoRoyalties]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const bandeiraLabel = BANDEIRA_FRANQUIA_LABEL[bandeira];
  const tipoLabel =
    TIPO_PROPOSTA_LABEL[
      bandeira === BandeiraFranquia.LubraxMais ? TipoProposta.ZLUB : TipoProposta.ZBRM
    ];

  const postoSelecionado =
    pcrProposals.find((p) => p.id === dados.postoProposalId) ?? null;

  const janelaInvalida = analysisWindowError(
    dados.dataInicioAnalise,
    dados.dataFimAnalise,
    constraints,
  );

  /**
   * O que ainda falta para a proposta poder ser CRIADA — `''` quando nada falta.
   *
   * ⚠️ **Recebe o rascunho por PARÂMETRO, e é isso que conserta o ADO 67887.**
   * As três respostas de criação (`postoProposalId`, `finalidade` e a janela de
   * análise) são herdadas, menos a finalidade, que o modal pergunta quando não
   * há contrapartida de bandeira (`Vinculação` e família — caminho normal, não
   * borda). O `onSave` do modal chama `setDados(value)` e o autosave no MESMO
   * tick, então avaliar isto sobre o `dados` do estado lia a versão ANTERIOR,
   * ainda sem finalidade: o gate reprovava, `salvarBlocos` voltava em silêncio,
   * e o card renderizava preenchido sem que nada tivesse sido gravado. Medido
   * ponta a ponta no stage em 26/08/2026 (`OPP-2026-000040`): 1º "Concluir" com
   * ZERO requisições; 2º "Concluir", mesmos dados, `POST 201` + `PATCH 200`.
   *
   * A frase nomeia o que falta e, quando o usuário pode agir, onde — nunca um
   * texto fixo apontando para um modal que não carrega a resposta.
   */
  const motivoDeBloqueio = useCallback(
    (d: DadosFranquiaRascunho): string => {
      if (proposalsLoading || herancaPosto === 'carregando') {
        return 'carregando os dados da oportunidade…';
      }
      if (propostasErro) {
        return 'não foi possível ler as propostas desta oportunidade; recarregue a página.';
      }
      // Only reachable with ZERO candidates: with any, the link is derived above.
      if (d.postoProposalId === '') {
        return 'esta oportunidade não tem proposta de posto (PCR) para vincular a franquia.';
      }
      if (d.finalidade === '') {
        return 'selecione a finalidade em “Dados da franquia”.';
      }
      if (d.dataInicioAnalise === '' || d.dataFimAnalise === '') {
        return 'a janela de análise não pôde ser herdada da proposta de posto.';
      }
      /*
       * Invariante, hoje inalcançável: os três ramos acima cobrem as quatro
       * respostas que `dadosObrigatoriosCompletos` exige. Ele fica como a
       * autoridade única sobre o que o `POST .../franquia` precisa — um campo
       * novo no DTO que entre lá e não ganhe frase aqui seria liberado com
       * motivo vazio, e o autosave voltaria a falhar em silêncio.
       */
      if (!dadosObrigatoriosCompletos(d)) {
        return 'faltam respostas obrigatórias em “Dados da franquia”.';
      }
      return analysisWindowError(
        d.dataInicioAnalise,
        d.dataFimAnalise,
        constraints,
      );
    },
    [proposalsLoading, herancaPosto, propostasErro, constraints],
  );

  /**
   * A tela não consegue criar NADA — não é um campo faltando, é a premissa.
   *
   * `null` = dá para preencher. Os dois valores são bloqueios que nenhuma
   * resposta nesta tela resolve: a franquia sempre pendura numa PCR (RN-F1-03),
   * então sem proposta de posto o `POST .../franquia` recusa qualquer
   * combinação; e uma leitura que falhou não autoriza afirmar nem uma coisa nem
   * outra.
   *
   * Existe porque a frase sozinha não bastou. O motivo já aparecia no subtítulo
   * do cabeçalho e na sendbar, e a pessoa preencheu os quatro cartões e só
   * descobriu no "Salvar" — porque a tela CONTINUAVA oferecendo os quatro
   * "+ Cadastrar", que é o controle morto que o contrato da sendbar proíbe
   * (relato do produto em 26/08/2026, com o print da recusa).
   *
   * ⚠️ `proposalsLoading` vem primeiro: lista em voo também é `length === 0`, e
   * bloquear ali afirmaria ausência antes de a resposta existir.
   */
  const bloqueioEstrutural: 'sem-posto' | 'erro-leitura' | null = proposalsLoading
    ? null
    : propostasErro
      ? 'erro-leitura'
      : pcrProposals.length === 0
        ? 'sem-posto'
        : null;

  /**
   * Abrir um modal de preenchimento só faz sentido se houver como salvar.
   *
   * Gateia os "+ Cadastrar…" — não os controles de linha já rascunhada:
   * esconder o Remover de uma exceção existente seria beco sem saída, o inverso
   * do defeito que isto conserta.
   */
  const podePreencher = canWrite && bloqueioEstrutural === null;

  /**
   * O card "Dados da franquia" tem o que mostrar? (ADO 68184)
   *
   * ⚠️ NÃO é `dadosPreenchidos(dados)`: aquele predicado olha o RASCUNHO, e o
   * rascunho de anexo é limpo depois do upload (`dados.fapFile` volta a `null`).
   * Medido em staging: com a FAP já gravada e nenhum campo de texto respondido,
   * o card voltava a *"Nenhum dado da franquia cadastrado ainda."* — e a FAP
   * anexada não aparecia em superfície nenhuma, sem link e sem remover.
   *
   * `dadosPreenchidos` continua governando o que é ENVIADO (o PATCH e o gate do
   * replay); aqui a pergunta é outra — o que já EXISTE, no rascunho ou gravado.
   */
  const temDadosParaExibir =
    dadosPreenchidos(dados) || fapDocumento !== null || fotosEnviadas.length > 0;

  /** O que a sendbar relata — o rascunho do estado, que é o que está na tela. */
  const motivoBloqueio = motivoDeBloqueio(dados);
  /**
   * A proposta pode ser CRIADA agora, pelo que está NA TELA?
   *
   * Só a sendbar lê este valor. Quem grava avalia o mesmo predicado sobre o
   * rascunho que recebeu (`motivoDeBloqueio(rascunho.dados)`), senão volta ao
   * defeito do stale closure descrito acima.
   */
  const podeCriar = canWrite && motivoBloqueio === '';

  /**
   * Para onde a sendbar leva depois de a proposta existir: a OPORTUNIDADE.
   *
   * Era a própria proposta (`/propostas/:id/franquia`), e da tela de criação
   * isso lê como um botão que volta para onde a pessoa já está — os dois
   * caminhos montam o MESMO conjunto de cartões e modais (é a decisão de
   * 26/08/2026 de ter um único modelo de preenchimento nas duas telas), então
   * "Abrir proposta" trocava de rota sem trocar de tela.
   *
   * A oportunidade é o passo seguinte de verdade: é lá que a proposta aparece
   * na lista, é eleita e segue para a análise. Relatado pelo produto em
   * 26/08/2026 ("está aparecendo um botão pra voltar pra mesma proposta, e não
   * pra ir pra oportunidade").
   *
   * A proposta não fica inalcançável: ela é um clique na lista da oportunidade.
   * Dois CTAs na barra fixa seriam ruído, e o que a barra deve oferecer é o
   * caminho adiante.
   */
  const oportunidadeUrl = `/oportunidades/${encodeURIComponent(opportunityId)}`;

  // ── Autosave ─────────────────────────────────────────────────────────────

  /**
   * Devolve o id da proposta, criando-a na primeira vez.
   *
   * Idempotente por construção: a promise em voo é compartilhada, então dois
   * cartões salvos em sequência rápida esperam a MESMA criação em vez de
   * dispararem dois POSTs. `createFranquiaProposal` não tem barreira do lado do
   * servidor — duas chamadas criariam duas propostas.
   *
   * ⚠️ **As quatro respostas de criação vêm do rascunho RECEBIDO, nunca do
   * estado** (ADO 67887). Lidas do estado, elas eram as do render anterior — a
   * finalidade respondida no próprio modal ainda estava vazia, e o POST sairia
   * sem ela. Mesma disciplina que `salvarBlocos` já aplicava ao replay.
   */
  const ensureProposalId = useCallback(
    async (d: DadosFranquiaRascunho): Promise<string> => {
      if (proposalId !== null) return proposalId;
      if (criacaoEmVooRef.current !== null) return criacaoEmVooRef.current;

      const promessa = createFranquiaProposal(opportunityId, {
        tipoProposta:
          bandeira === BandeiraFranquia.LubraxMais
            ? TipoProposta.ZLUB
            : TipoProposta.ZBRM,
        finalidade: d.finalidade as Finalidade,
        postoProposalId: d.postoProposalId,
        dataInicioAnalise: d.dataInicioAnalise,
        dataFimAnalise: d.dataFimAnalise,
      })
        .then((created) => {
          if (mountedRef.current) setProposalId(created.proposalId);
          return created.proposalId;
        })
        .catch((err: unknown) => {
          // Libera a barreira: um erro de rede não pode deixar a tela incapaz de
          // criar pelo resto da sessão.
          criacaoEmVooRef.current = null;
          throw err;
        });

      criacaoEmVooRef.current = promessa;
      return promessa;
    },
    [proposalId, createFranquiaProposal, opportunityId, bandeira],
  );

  /**
   * Relê o read model da proposta já criada — royalty (ADO 67868) **e as
   * pendências** (ADO — 01/09/2026).
   *
   * Roda depois de **cada** gravação, e não uma vez ao criar: faturamento,
   * formato de loja, modelo de royalty e exceção programada são todos insumos do
   * cálculo, e cada um vive num cartão diferente desta tela — e cada bloco salvo
   * também RESOLVE uma pendência, então a lista precisa ser relida pelo mesmo
   * motivo.
   *
   * ⚠️ **Uma leitura, dois consumidores.** As pendências já vinham neste payload
   * e eram descartadas: `vereditos.pendenciasEnvio` é o veredito do backend
   * (`obrigatoriedadesFranquiaPendentes`, escopo "envio"), o MESMO que a tela da
   * proposta salva renderiza. Derivá-las aqui a partir do rascunho seria a
   * segunda implementação que divergiria do gate que de fato recusa — a
   * divergência tela × gate que o predicado único existe para impedir.
   *
   * Falha do royalty é `indisponivel`, nunca um travessão: "não deu para ler" e
   * "ainda não calculado" pedem consertos diferentes, e colapsá-los faria os
   * dois lerem igual — mesma divisão que o painel da tela da proposta já faz.
   *
   * Falha das pendências é **`null`**, que significa "não sei", e aí a barra
   * volta a falar só do autosave. Lista vazia ali afirmaria "nada falta", a única
   * mentira que este campo consegue contar; e manter a anterior a afirmaria ainda
   * válida depois de uma gravação que mudou o estado.
   */
  const recarregarReadModel = useCallback(
    async (id: string) => {
      try {
        const model = await getPropostaFranquia(opportunityId, id);
        if (!mountedRef.current) return;
        const secao = model.royaltiesCalculados;
        setRoyaltyIndisponivel(secao.status === 'unavailable');
        setRoyaltyAnualBrl(
          secao.status === 'ok'
            ? formatBrlString(secao.data?.royaltyAnualBrl)
            : null,
        );
        /*
         * Opcional em profundidade: o payload é do backend, e um recorte parcial
         * — ou um stub de teste que só carrega `royaltiesCalculados` — não pode
         * derrubar a tela. Ausente ⇒ `null` ⇒ a barra não afirma nada.
         */
        setPendencias(model.vereditos?.pendenciasEnvio ?? null);
        setSendbarMensagem(model.sendbar?.mensagem ?? null);
      } catch {
        if (!mountedRef.current) return;
        setRoyaltyIndisponivel(true);
        setRoyaltyAnualBrl(null);
        setPendencias(null);
        setSendbarMensagem(null);
      }
    },
    [getPropostaFranquia, opportunityId],
  );

  /**
   * Grava um recorte do rascunho, criando a proposta se ainda não existir.
   *
   * O recorte é o que torna o autosave possível: `anexos` e `excecoes` são POST,
   * e reenviar o rascunho inteiro a cada save duplicaria arquivo e exceção. Ver
   * {@link BlocoRascunho}.
   *
   * O rascunho vem por PARÂMETRO, não do estado: `onSave` do modal chama isto no
   * mesmo tick do `setDados`, e o estado só muda no próximo render — ler dali
   * gravaria a versão anterior.
   */
  const salvarBlocos = useCallback(
    async (
      rascunho: RascunhoFranquia,
      blocos: readonly BlocoRascunho[],
      /**
       * Passo extra que precisa do id da proposta — hoje só os anexos, que ficam
       * fora do replay porque o retorno deles é o que alimenta o link de
       * abertura. As falhas que ele devolve entram na mesma lista nomeada.
       */
      depois?: (proposalId: string) => Promise<string[]>,
    ) => {
      /*
       * O gate é avaliado sobre o rascunho RECEBIDO, pela mesma razão que o
       * replay é (ADO 67887) — sobre o estado ele lia o render anterior.
       *
       * E a recusa é RELATADA, nunca um `return` mudo: o modal já fechou e o
       * card já renderiza preenchido, então sair sem palavra deixa a tela
       * afirmando uma gravação que não houve. Foi assim que o LT preencheu a
       * franquia, voltou para a oportunidade e não encontrou proposta nenhuma.
       */
      const bloqueio = motivoDeBloqueio(rascunho.dados);
      if (!canWrite || bloqueio !== '') {
        setSalvamento('falhou');
        setFalhasSalvamento([]);
        setErroEnvio(
          canWrite
            ? `Não foi possível salvar: ${bloqueio}`
            : 'Seu perfil não permite criar propostas nesta oportunidade.',
        );
        return;
      }

      setSalvamento('salvando');
      setErroEnvio('');

      let id: string;
      try {
        id = await ensureProposalId(rascunho.dados);
      } catch (err) {
        if (!mountedRef.current) return;
        setSalvamento('falhou');
        setErroEnvio(
          err instanceof FranquiaServiceUnavailableError ||
            err instanceof FranquiaPostoProposalNotFoundError ||
            err instanceof Error
            ? err.message
            : 'Erro ao criar a proposta de franquia.',
        );
        return;
      }

      let falhas: string[] = [];
      try {
        const resultado = await aplicarRascunho(
          opportunityId,
          id,
          rascunho,
          DEPS,
          { blocos },
        );
        falhas = resultado.falhas;
      } catch {
        falhas = ['Dados complementares'];
      }

      if (depois) {
        try {
          falhas = [...falhas, ...(await depois(id))];
        } catch {
          falhas = [...falhas, 'Anexos'];
        }
      }

      if (!mountedRef.current) return;
      setFalhasSalvamento(falhas);
      // Falha é NOMEADA, nunca engolida: "salvo" com um bloco descartado é o
      // modo de falha que este ramo existe para impedir.
      setSalvamento(falhas.length > 0 ? 'falhou' : 'salvo');

      /*
       * Relê o royalty ainda que algum bloco tenha falhado: o que falhou pode
       * ser o anexo, e o número já mudou. Não é aguardado dentro do caminho de
       * gravação — o painel é leitura, e prender o "salvo" numa releitura faria
       * a barra de autosave depender de um GET a mais.
       */
      void recarregarReadModel(id);
    },
    [
      canWrite,
      motivoDeBloqueio,
      ensureProposalId,
      aplicarRascunho,
      opportunityId,
      recarregarReadModel,
    ],
  );

  /** Rascunho completo com um bloco trocado — o que o `onSave` acabou de mudar. */
  const rascunhoAtual = useCallback(
    (patch: Partial<RascunhoFranquia> = {}): RascunhoFranquia => ({
      dados,
      modelo,
      excecoes,
      cofEmail,
      ...patch,
    }),
    [dados, modelo, excecoes, cofEmail],
  );

  /**
   * Persiste UMA exceção — a que acabou de ser adicionada ou editada.
   *
   * Editar uma já gravada é `PATCH .../excecoes/:id` (ADO 67802). Antes era
   * **remover e recriar**, porque a API não tinha update; aquilo trocava o `id`
   * da exceção, gerava duas linhas de auditoria para um fato só e perdia o
   * valor anterior — que é o que a trilha SOX de uma alteração precisa guardar.
   *
   * O corpo é montado pelas MESMAS três regras do replay
   * (`aplicarRascunhoFranquia`) e da tela da proposta salva: "por todo o
   * contrato" é vigência aberta (data fim nula), o valor só viaja quando o tipo
   * o carrega, e o motivo vai com trim. Aqui as três estavam ausentes — o
   * `todoContrato` era ignorado (gravava a data que o usuário disse não valer)
   * e o valor ia mesmo numa isenção.
   */
  const salvarExcecao = useCallback(
    async (excecao: ExcecaoRascunho, indice: number, idAnterior: string | null) => {
      /*
       * Recusa relatada, nunca `return` mudo — mesma razão de `salvarBlocos`
       * (ADO 67887): o modal já fechou e a linha já aparece na lista, então sair
       * sem palavra deixaria a exceção na tela e fora do servidor.
       *
       * Aqui o rascunho não entra por parâmetro porque o modal de exceção não
       * toca `dados`: as quatro respostas de criação já estão comitadas quando
       * ele abre.
       */
      const bloqueio = motivoDeBloqueio(dados);
      if (!canWrite || !podeExcecao || bloqueio !== '') {
        setSalvamento('falhou');
        setFalhasSalvamento([]);
        setErroEnvio(
          !canWrite || !podeExcecao
            ? 'Seu perfil não permite cadastrar exceções programadas.'
            : `Não foi possível salvar a exceção: ${bloqueio}`,
        );
        return;
      }

      setSalvamento('salvando');
      setErroEnvio('');

      const payload = {
        tipoExcecao: excecao.tipo,
        vigenciaInicio: excecao.inicio === '' ? null : excecao.inicio,
        vigenciaFim:
          excecao.todoContrato || excecao.fim === '' ? null : excecao.fim,
        valorOverrideBrl: excecaoTemValor(excecao.tipo)
          ? parseMoneyInput(excecao.valor)
          : null,
        motivo: excecao.motivo.trim(),
      };

      try {
        const id = await ensureProposalId(dados);
        const salva =
          idAnterior !== null
            ? await updateExcecao(opportunityId, id, idAnterior, payload)
            : await createExcecao(opportunityId, id, payload);
        if (!mountedRef.current) return;
        setExcecaoIds((prev) => {
          const proximo = [...prev];
          proximo[indice] = salva.id;
          return proximo;
        });
        setFalhasSalvamento([]);
        setSalvamento('salvo');
        // ISENCAO/BASE_REAL/TETO mudam o royalty (ADO 67868) — o painel tem de
        // acompanhar, senão exibe o valor de antes da exceção.
        void recarregarReadModel(id);
      } catch {
        if (!mountedRef.current) return;
        setFalhasSalvamento([`Exceção · ${EXCECAO_TIPO_LABEL[excecao.tipo]}`]);
        setSalvamento('falhou');
      }
    },
    [
      canWrite,
      podeExcecao,
      motivoDeBloqueio,
      dados,
      ensureProposalId,
      updateExcecao,
      opportunityId,
      recarregarReadModel,
    ],
  );

  /**
   * Sobe os anexos e GUARDA o que o backend devolveu.
   *
   * Fora do `aplicarRascunhoFranquia` de propósito: aquele replay descarta o
   * retorno de cada passo (`passo()` só coleta falhas), e é justamente o retorno
   * — o id do documento — que permite oferecer o link de abertura que a UAT
   * pediu. Aqui o `anexos` do replay fica de fora e o upload é próprio.
   *
   * Depois de gravado, o arquivo SAI do rascunho: `uploadFap` e
   * `uploadPostoPhoto` são POST, e mantê-lo faria o próximo save do mesmo cartão
   * anexar o mesmo arquivo outra vez. A limpeza só ocorre se o rascunho ainda for
   * o mesmo objeto enviado — entre o upload e este ponto o usuário pode ter
   * reaberto o modal e trocado o arquivo, e limpar ali descartaria uma escolha
   * que nunca chegou ao servidor.
   */
  const enviarAnexos = useCallback(
    async (id: string, enviado: DadosFranquiaRascunho) => {
      const falhas: string[] = [];

      /*
       * ADO 68184 — a falha do anexo NOMEIA o motivo, não só o bloco.
       *
       * Este é o caminho que produziu o print do ticket: a sendbar dizia
       * `não foi possível salvar: FAP.` e o `catch` vazio descartava a frase do
       * backend, que era a única que dizia o conserto. `failureReason` é o mesmo
       * filtro do resto do app — exceção de runtime degrada para o nome do bloco.
       */
      const falhar = (nome: string, err: unknown): void => {
        if (falhas.some((f) => f === nome || f.startsWith(`${nome} (`))) return;
        const motivo = failureReason(err, '');
        falhas.push(motivo === '' ? nome : `${nome} (${motivo})`);
      };

      if (enviado.fapFile !== null) {
        try {
          const documento = await uploadFap(opportunityId, id, enviado.fapFile);
          if (mountedRef.current) setFapDocumento(documento);
        } catch (err) {
          falhar('FAP', err);
        }
      }

      for (const foto of enviado.fotos) {
        try {
          const salva = await uploadPostoPhoto(id, foto);
          if (mountedRef.current) setFotosEnviadas((prev) => [...prev, salva]);
        } catch (err) {
          falhar('Fotos do ponto', err);
        }
      }

      if (!mountedRef.current) return falhas;
      setDados((atual) =>
        atual.fapFile === enviado.fapFile && atual.fotos === enviado.fotos
          ? { ...atual, fapFile: null, fotos: [] }
          : atual,
      );
      return falhas;
    },
    [opportunityId],
  );

  /** Remove uma exceção do rascunho e, se já gravada, do servidor. */
  const removerExcecao = useCallback(
    async (indice: number) => {
      const idServidor = excecaoIds[indice] ?? null;

      if (idServidor === null || proposalId === null) {
        // Rascunho local — ainda não gravado no servidor; remove da UI direto.
        setExcecoes((prev) => prev.filter((_, i) => i !== indice));
        setExcecaoIds((prev) => prev.filter((_, i) => i !== indice));
        return;
      }

      setSalvamento('salvando');
      try {
        await deleteExcecao(opportunityId, proposalId, idServidor);
        // Atualiza a UI só depois do servidor confirmar: evita estado inconsistente
        // caso a chamada falhe (exceção sumia da tela mas continuava no servidor).
        setExcecoes((prev) => prev.filter((_, i) => i !== indice));
        setExcecaoIds((prev) => prev.filter((_, i) => i !== indice));
        if (mountedRef.current) setSalvamento('salvo');
        void recarregarReadModel(proposalId);
      } catch {
        if (!mountedRef.current) return;
        setFalhasSalvamento(['Remoção da exceção']);
        setSalvamento('falhou');
      }
    },
    [excecaoIds, proposalId, deleteExcecao, opportunityId, recarregarReadModel],
  );

  /*
   * ADO 68184 — remover a FAP e as fotos JÁ GRAVADAS, aqui na criação.
   *
   * A tela da proposta já oferecia isso; esta não oferecia nada, e o LT que
   * anexasse o arquivo errado ficava sem saída (a substituição pelo backend
   * também não existia). Com as duas coisas, trocar passou a ser um gesto só —
   * mas remover continua sendo necessário para quem quer ficar SEM o arquivo.
   *
   * Confirmação, como na tela da proposta: o arquivo já está no armazenamento e
   * a exclusão o apaga (doutrina do repo — `useConfirm` para o que apaga dado).
   */
  /*
   * ADO 68184 (07/09) — descartar a escolha que nunca chegou ao servidor.
   *
   * `enviarAnexos` só roda DEPOIS de a proposta existir, então quando a criação
   * é recusada (finalidade em branco, por exemplo) o arquivo fica no rascunho e
   * a grade o anunciava como `salvando…` para sempre — sem Remover, porque o
   * Remover de cima exige `fapDocumento`/`proposalId`, que não existem. Este é
   * o único caminho de saída.
   *
   * Não limpa `falhasSalvamento` nem mexe em `salvamento`: o motivo que a
   * sendbar mostra continua sendo o da última tentativa, e descartar um anexo
   * não conserta a finalidade que falta.
   */
  const descartarFapDoRascunho = useCallback(() => {
    setDados((prev) => ({ ...prev, fapFile: null }));
  }, []);

  /** Ver {@link descartarFapDoRascunho}. */
  const descartarFotosDoRascunho = useCallback(() => {
    setDados((prev) => ({ ...prev, fotos: [] }));
  }, []);

  const removerFap = useCallback(() => {
    if (proposalId === null || fapDocumento === null) return;
    const doc = fapDocumento;
    confirm.ask({
      title: 'Remover a FAP?',
      description: `"${doc.fileName}" é excluída do armazenamento de documentos e a proposta volta a ficar sem FAP para o envio à análise.`,
      confirmLabel: 'Remover',
      tone: 'danger',
      onConfirm: async () => {
        setSalvamento('salvando');
        try {
          await deleteFap(opportunityId, proposalId, doc.id);
          if (!mountedRef.current) return;
          setFapDocumento(null);
          setFalhasSalvamento([]);
          setSalvamento('salvo');
          void recarregarReadModel(proposalId);
        } catch (err) {
          if (mountedRef.current) {
            setFalhasSalvamento(['Remoção da FAP']);
            setSalvamento('falhou');
          }
          // Repropagado para o diálogo continuar aberto na falha.
          throw err;
        }
      },
    });
  }, [
    proposalId,
    fapDocumento,
    confirm,
    deleteFap,
    opportunityId,
    recarregarReadModel,
  ]);

  const removerFoto = useCallback(
    (foto: PostoPhoto) => {
      if (proposalId === null) return;
      confirm.ask({
        title: 'Remover a foto?',
        description: `"${foto.fileName}" é excluída do armazenamento de documentos e sai da composição da proposta de franquia.`,
        confirmLabel: 'Remover',
        tone: 'danger',
        onConfirm: async () => {
          setSalvamento('salvando');
          try {
            await deletePostoPhoto(proposalId, foto.id);
            if (!mountedRef.current) return;
            setFotosEnviadas((prev) => prev.filter((f) => f.id !== foto.id));
            setFalhasSalvamento([]);
            setSalvamento('salvo');
            void recarregarReadModel(proposalId);
          } catch (err) {
            if (mountedRef.current) {
              setFalhasSalvamento(['Remoção da foto']);
              setSalvamento('falhou');
            }
            throw err;
          }
        },
      });
    },
    [proposalId, confirm, deletePostoPhoto, recarregarReadModel],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  const opportunityCode = opportunity?.code ?? opportunityId.toUpperCase();

  /**
   * O título da sendbar.
   *
   * Enquanto nada foi gravado — ou enquanto a última gravação está em voo ou
   * falhou — é o rótulo desta tela. Com a proposta salva e o veredito lido, é a
   * frase do BACKEND, a mesma da tela da proposta: é ela que diz se há pendência,
   * e compor uma segunda aqui faria as duas telas discordarem sobre o mesmo
   * estado.
   */
  const tituloSendbar =
    salvamento === 'salvo' && sendbarMensagem !== null
      ? sendbarMensagem
      : 'Proposta de franquia';

  return (
    /*
     * Reserva MEDIDA, não `pb-[88px]`: a barra cresce com a lista de pendências
     * e com a mensagem de falha (que nomeia blocos e reflui). O valor chumbado
     * cobria só o caso de uma linha, e o sintoma de estourá-lo é o último cartão
     * atrás da barra. Mesmo mecanismo da tela da proposta salva.
     */
    <div style={{ paddingBottom: sendbarReserva }}>
      {/* ── Head card (.head) ──────────────────────────────────────────── */}
      <header className="mt-2 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-[22px] py-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <StatusPill variant="neutral" data-testid="head-bandeira">
            {bandeiraLabel.toUpperCase()}
          </StatusPill>
          <StatusPill variant="warning">Em preenchimento</StatusPill>
          <StatusPill variant="success">Nova proposta</StatusPill>
        </div>

        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-(length:--t-h2) font-bold">
              Nova proposta de franquia — {bandeiraLabel}
            </h1>
            <p
              className="mt-0.5 text-(length:--t-caption) text-(--color-text-muted)"
              data-testid="head-sub"
            >
              {postoSelecionado === null ? (
                /*
                 * O vínculo NÃO está no modal — ele é derivado, e só vira
                 * controle na grade de identidade logo abaixo, quando há mais de
                 * uma PCR candidata. A frase antiga mandava para "Dados da
                 * franquia", onde o campo nunca esteve; e com ZERO candidatas
                 * ela mandava selecionar algo que não existe em lugar nenhum.
                 *
                 * ⚠️ `proposalsLoading` vem ANTES da contagem: lista ainda em
                 * voo também é `length === 0`, e afirmar "não tem proposta de
                 * posto" ali é ler ausência de resposta como resposta — o mesmo
                 * defeito que o motivo de bloqueio já evita.
                 */
                proposalsLoading ? (
                  <>Carregando as propostas da oportunidade…</>
                ) : pcrProposals.length === 0 ? (
                  <>
                    Esta oportunidade não tem proposta de posto (PCR) para
                    vincular a franquia.
                  </>
                ) : (
                  <>
                    Selecione a proposta de posto em{' '}
                    <b className="text-(--neutral-900)">Vínculo ao posto</b>.
                  </>
                )
              ) : (
                <>
                  Vinculada ao posto{' '}
                  <b className="text-(--neutral-900)">{postoSelecionado.code}</b>
                  {opportunity?.clientName ? ` · ${opportunity.clientName}` : ''}
                  {dados.finalidade === '' ? '' : ` · ${dados.finalidade}`}
                </>
              )}
            </p>
          </div>
          <Link
            href={`/oportunidades/${encodeURIComponent(opportunityId)}`}
            className={BTN_GHOST}
          >
            ← Oportunidade
          </Link>
        </div>

        {/*
          O bloqueio que nenhuma resposta desta tela resolve, dito ANTES do
          preenchimento e com a saída nomeada.

          Fica no cabeçalho, e não na sendbar, porque a sendbar relata o
          salvamento — quem chega aqui e vê os cartões precisa saber, antes de
          preencher, que nada será salvo. `tone="bad"` e não `hold`: não é uma
          ressalva, é a premissa da tela faltando.
        */}
        {bloqueioEstrutural !== null && (
          <div className="mt-4" data-testid="franquia-bloqueio-estrutural">
            <Alert tone="bad">
              {bloqueioEstrutural === 'erro-leitura' ? (
                <>
                  Não foi possível ler as propostas desta oportunidade, então não
                  dá para saber a qual posto vincular a franquia.{' '}
                  <b>Recarregue a página</b> — se persistir, é falha de leitura,
                  não falta de cadastro.
                </>
              ) : (
                <>
                  Esta oportunidade não tem <b>proposta de posto (PCR)</b>, e uma
                  franquia sempre pendura numa (RN-F1-03) — então nada aqui pode
                  ser salvo ainda. Crie a proposta de posto na oportunidade e
                  volte.
                </>
              )}
            </Alert>
          </div>
        )}

        <dl className="mt-4 flex flex-wrap gap-9 border-t border-(--color-border) pt-4">
          {/*
           * LT principal da OPORTUNIDADE — a mesma fonte das telas de proposta
           * já salva. Era `null` chumbado, com a justificativa de que o
           * executivo de franquia só é resolvido pelo roteamento J10 na criação
           * (RN-F6-01): verdade sobre o EV, mas a linha meta fala da
           * oportunidade (cliente, código, tipo), e o EV tem rótulo próprio
           * ("Executivo de franquia") no card de dados da proposta salva.
           */}
          <MetaItem
            label="Responsável"
            value={responsavelDaOportunidade(team?.members)}
          />
          <MetaItem label="Cliente" value={opportunity?.clientName ?? null} />
          <MetaItem
            label="Oportunidade"
            value={
              opportunity
                ? [opportunity.code, opportunity.type].filter(Boolean).join(' · ')
                : opportunityCode
            }
          />
          <MetaItem label="Tipo de proposta" value={`${tipoLabel} · ${bandeira}`} />
        </dl>
      </header>

      {/* ── Two-column layout (.layout) ────────────────────────────────── */}
      <div className="mt-[18px] grid grid-cols-1 items-start gap-6 min-[921px]:grid-cols-[1fr_340px]">
        {/*
         * `min-w-0` não é cosmético: sem ele o item de grid fica com
         * `min-width: auto` (= min-content) e a tabela do Anexo A — sete colunas
         * de cabeçalho longo — ALARGA a primeira coluna além de `1fr`, jogando o
         * `aside` de 340px para fora do enquadramento e pondo scroll horizontal
         * no body (ADO · 26/08/2026). O `overflow-x-auto` da tabela só rola
         * dentro de um container que possa encolher.
         */}
        <div className="min-w-0">
          {/* 1 · Dados da franquia ───────────────────────────────────── */}
          <Block title="Dados da franquia" collapsible>
            <div className="mb-4">
              <DGrid>
                <DField label="Tipo de franquia" value={bandeiraLabel} testId="dados-tipo" />
                {/*
                 * As duas linhas do protótipo, restauradas — e cada uma com o
                 * valor que de fato é dela.
                 *
                 * VBR-506 tinha fundido as duas: "Grupo de contas" passou a
                 * carregar `ZBRM`/`ZLUB` cru e a linha "Código da franquia"
                 * sumiu, deixando o card com 4 dos 5 campos do protótipo. A
                 * premissa ("BandeiraFranquia IS the material code") está certa
                 * mas é incompleta — a bandeira é as DUAS coisas:
                 *
                 *  - **Grupo de contas** — medido no org em 25/08/2026:
                 *    `Account.Grupo_De_Contas__c` é picklist e `ZBRM`/`ZLUB`
                 *    estão no value set ativo (4.701 e 3.659 contas), com os
                 *    rótulos `ZBRM - BR MANIA` / `ZLUB - LUBRAX+`. Mostramos o
                 *    RÓTULO do org, não o código cru: valor de máquina em tela
                 *    é o defeito que este repo persegue.
                 *  - **Código da franquia** — é o código ZBRM/ZLUB que a
                 *    pendência `CODIGO_FRANQUIA_ZBRM_ZLUB` (FRQ-19) cobra e
                 *    reconcilia contra `Franquia.codigoMaterialSap`. Esse é o
                 *    vocabulário do próprio domínio.
                 *
                 * O protótipo escreve "Franquia" no grupo de contas; é rótulo
                 * genérico de página estática, e o org não publica esse valor.
                 */}
                <DField
                  label="Grupo de contas"
                  value={GRUPO_CONTAS_LABEL[bandeira]}
                  testId="dados-grupo-contas"
                />
                <DField
                  label="Código da franquia"
                  value={bandeira}
                  testId="dados-codigo-franquia"
                />
                {/*
                 * The prototype states the link as a fact ("OPP-0428 · Posto
                 * Vibra Centro-SP") because a static page had one. A control
                 * appears ONLY when the opportunity offers more than one PCR
                 * proposal — with a single candidate there is nothing to decide,
                 * and RN-F1-03 makes it the parent either way.
                 */}
                <DField
                  label="Vínculo ao posto"
                  value={
                    proposalsLoading ? (
                      <span
                        className="font-normal text-(--color-text-muted)"
                        data-testid="dados-vinculo-posto-carregando"
                      >
                        Carregando…
                      </span>
                    ) : pcrProposals.length > 1 ? (
                      <Select
                        id="dados-vinculo-posto-select"
                        data-testid="dados-vinculo-posto-select"
                        value={dados.postoProposalId}
                        onChange={(v) =>
                          setDados((prev) => ({ ...prev, postoProposalId: v }))
                        }
                        options={pcrProposals.map((p) => ({
                          value: p.id,
                          label: `${p.code} · ${p.title}`,
                        }))}
                        placeholder="Selecione a proposta de posto…"
                      />
                    ) : postoSelecionado === null ? null : (
                      `${postoSelecionado.code} · ${postoSelecionado.title}`
                    )
                  }
                  testId="dados-vinculo-posto"
                />
                {/*
                 * FATO, nunca controle — a grade de identidade do protótipo
                 * afirma a finalidade ("… · Contratação") e não a pergunta.
                 *
                 * A finalidade é HERDADA da oportunidade, band-qualified.
                 * Medido no org em 25/08/2026: das 665 cotações de franquia,
                 * 370 dos 372 pares não-nulos (99,5 %) copiam
                 * `Opportunity.Finalidade_Cotacao__c` verbatim — e o value set
                 * da Opportunity publica os valores band-qualified
                 * (`BR Mania - Implantação`, `Lubrax + - Renovação`, …).
                 *
                 * O picklist vivia AQUI, e por isso aceitava um valor que
                 * contradiz o herdado: reproduzido na `OPP-2026-000031`, cujo
                 * posto e cuja oportunidade são `Implantação`, exibindo
                 * `Lubrax + - Renovação`. A pergunta desceu para o modal, que é
                 * onde esta tela pergunta as coisas — e só aparece lá quando
                 * não houve o que herdar (`Vinculação` e família, ~47 % das
                 * cotações de posto do org, então caminho normal e não borda).
                 */}
                <DField
                  label="Finalidade"
                  value={dados.finalidade === '' ? null : dados.finalidade}
                  testId="dados-finalidade"
                />
                {/*
                 * VBR-506: "Janela de análise" is no longer displayed here
                 * (4-field layout). The state (dataInicioAnalise /
                 * dataFimAnalise), the derivarJanelaAnalise() logic, and the
                 * gate in dadosObrigatoriosCompletos() are preserved — removing
                 * the field from the view MUST NOT remove the validation, or
                 * the org will refuse proposals submitted outside the window
                 * weeks later at alçada time.
                 */}
              </DGrid>
            </div>

            {temDadosParaExibir ? (
              <DGrid>
                <DField
                  label="Situação da loja"
                  value={
                    dados.situacaoLoja === ''
                      ? null
                      : SITUACAO_LOJA_LABEL[dados.situacaoLoja]
                  }
                  testId="resumo-situacao"
                />
                <DField label="Tipo de implantação" value={dados.tipoImplantacao} />
                <DField
                  label="Início da operação"
                  value={formatDateBR(dados.inicioOperacaoPrevista)}
                />
                <DField
                  label="Faturamento proposto"
                  value={
                    dados.faturamentoProposto === ''
                      ? null
                      : `R$ ${dados.faturamentoProposto}`
                  }
                />
                <DField
                  label="De acordo com a FAP?"
                  value={simNaoLabel(dados.faturamentoDeAcordoComFap)}
                />
                <DField
                  label="Potencial de franquia"
                  value={dados.potencial === '' ? null : `R$ ${dados.potencial}`}
                />
                {/*
                  UAT de 25/08/2026 — "devemos conseguir acessar os arquivos
                  anexados em dados da franquia".

                  Três estados distintos, e eles não colapsam: já GRAVADO abre
                  (link de stream da BFF); ESCOLHIDO e ainda não gravado mostra o
                  nome e diz que está a caminho — oferecer um link ali levaria a
                  um documento que não existe; nenhum dos dois é `—`.
                */}
                <DField
                  label="FAP"
                  value={
                    fapDocumento !== null && proposalId !== null ? (
                      <span className="flex flex-wrap items-center gap-3">
                        <a
                          href={fapStreamUrl(opportunityId, proposalId, fapDocumento.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-(--secondary-700) underline"
                          data-testid="fap-link"
                        >
                          {fapDocumento.fileName}
                        </a>
                        {/* ADO 68184 — a troca é substituição (o backend
                            substitui no upload); o Remover existe para quem
                            quer ficar SEM o arquivo. */}
                        {podePreencher && (
                          <button
                            type="button"
                            onClick={removerFap}
                            className="text-[12px] font-bold text-(--color-danger) underline"
                            data-testid="fap-remover"
                          >
                            Remover
                          </button>
                        )}
                      </span>
                    ) : dados.fapFile !== null ? (
                      <span className="flex flex-wrap items-center gap-3">
                        <span className="font-normal text-(--color-text-muted)">
                          {dados.fapFile.name} · {rotuloAnexoPendente(salvamento)}
                        </span>
                        {/* ADO 68184 (07/09) — o arquivo está só no navegador,
                            então "descartar" é limpar a escolha, não apagar
                            nada no servidor: por isso NÃO passa por
                            `useConfirm`, cuja regra é ação que apaga dado, move
                            máquina de estado ou notifica alguém. Aparece só na
                            falha — durante `salvando…` o botão competiria com
                            um upload em voo. */}
                        {salvamento === 'falhou' && (
                          <button
                            type="button"
                            onClick={descartarFapDoRascunho}
                            className="text-[12px] font-bold text-(--color-danger) underline"
                            data-testid="fap-descartar"
                          >
                            Descartar
                          </button>
                        )}
                      </span>
                    ) : null
                  }
                />
                <DField
                  label="Fotos do ponto"
                  value={
                    fotosEnviadas.length > 0 ? (
                      <span className="flex flex-wrap gap-x-3 gap-y-1">
                        {fotosEnviadas.map((foto) => (
                          <span key={foto.id} className="inline-flex items-center gap-1">
                            <a
                              href={urlDeMidiaSegura(foto.url) ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-(--secondary-700) underline"
                              data-testid="foto-link"
                            >
                              {foto.fileName}
                            </a>
                            {podePreencher && (
                              <button
                                type="button"
                                onClick={() => removerFoto(foto)}
                                aria-label={`Remover ${foto.fileName}`}
                                className="px-1 text-[14px] font-bold text-(--color-danger)"
                                data-testid="foto-remover"
                              >
                                ✕
                              </button>
                            )}
                          </span>
                        ))}
                        {dados.fotos.length > 0 && (
                          <span className="font-normal text-(--color-text-muted)">
                            +{dados.fotos.length} {rotuloAnexoPendente(salvamento)}
                          </span>
                        )}
                      </span>
                    ) : dados.fotos.length === 0 ? null : (
                      <span className="flex flex-wrap items-center gap-3">
                        <span className="font-normal text-(--color-text-muted)">
                          {dados.fotos.length} anexada(s) ·{' '}
                          {rotuloAnexoPendente(salvamento)}
                        </span>
                        {salvamento === 'falhou' && (
                          <button
                            type="button"
                            onClick={descartarFotosDoRascunho}
                            className="text-[12px] font-bold text-(--color-danger) underline"
                            data-testid="fotos-descartar"
                          >
                            Descartar
                          </button>
                        )}
                      </span>
                    )
                  }
                />
              </DGrid>
            ) : (
              <EmptyState testId="dados-vazio">
                Nenhum dado da franquia cadastrado ainda.
              </EmptyState>
            )}

            {janelaInvalida !== '' && (
              <Alert tone="bad" testId="janela-erro">
                {janelaInvalida}
              </Alert>
            )}

            {podePreencher && (
              <AddRowButton
                onClick={() => setModalAberto('dados')}
                testId="abrir-dados"
              >
                {/* ADO 68184 (07/09) — o rótulo segue a GRADE, não o rascunho.
                    `dadosPreenchidos` olha só o que está em memória, e o
                    autosave limpa o rascunho de anexo depois de gravar: com a
                    finalidade, a FAP e a foto visíveis logo acima, o botão
                    voltava a dizer "+ Cadastrar", que lê como se nada tivesse
                    sido cadastrado. `temDadosParaExibir` é o MESMO predicado
                    que decide renderizar a grade — um só, para os dois não
                    discordarem. */}
                {temDadosParaExibir
                  ? 'Editar dados da franquia'
                  : '+ Cadastrar dados da franquia'}
              </AddRowButton>
            )}
          </Block>

          {/*
           * 2 · Modelo de loja e royalties
           *
           * No `LockChip` on the card: the prototype has none, and everything
           * this card collects — formato, modelo de royalty, taxa, parcelas,
           * maturação — is `Edit. = Sim` in PRD F2, i.e. the LT's. Only the
           * "Estrutura de royalties · limites" sub-block is the franchise team's,
           * and it carries its own chip. A chip on the header contradicted the
           * enabled "+ Cadastrar modelo e royalties" right below it.
           */}
          <Block title="Modelo de loja e royalties" collapsible>
            {/*
             * Nothing above the summary/empty state: the prototype's card body is
             * the resumo `.dgrid` (hidden until saved), the `.empty-state` and the
             * `.addrow` button — in that order and nothing else.
             */}
            {modeloPreenchido(modelo) ? (
              <DGrid>
                <DField
                  label="Modelo de negócio"
                  value={
                    modelo.modeloNegocio === ''
                      ? null
                      : MODELO_NEGOCIO_LABEL[modelo.modeloNegocio]
                  }
                  testId="resumo-modelo-negocio"
                />
                <DField
                  label="Formato de loja"
                  value={
                    modelo.formatoLoja === ''
                      ? null
                      : FORMATO_LOJA_LABEL[modelo.formatoLoja]
                  }
                />
                <DField
                  label="Modelo de royalty"
                  value={
                    modelo.modeloRoyalty === ''
                      ? null
                      : MODELO_ROYALTY_LABEL[modelo.modeloRoyalty]
                  }
                  testId="resumo-modelo-royalty"
                />
                <DField
                  label="Taxa de franquia"
                  value={
                    modelo.taxaFranquia === '' ? null : `R$ ${modelo.taxaFranquia}`
                  }
                />
                <DField label="Nº de parcelas" value={modelo.parcelas} />
                {/* ADO 68495 — a resposta é ecoada como todas as irmãs; não
                    respondida fica em travessão, nunca "Não". */}
                <DField
                  label="Isenção de taxa de franquia"
                  value={
                    modelo.isencaoTaxa === ''
                      ? null
                      : modelo.isencaoTaxa === 'sim'
                        ? 'Sim'
                        : 'Não'
                  }
                  testId="resumo-isencao-taxa"
                />
                <DField
                  label="Loja maturada"
                  value={
                    modelo.maturada === ''
                      ? null
                      : modelo.maturada === 'sim'
                        ? 'Maturada'
                        : 'Não maturada'
                  }
                />
                {/* Free text ("12 meses") — echoed as typed, never re-suffixed. */}
                <DField
                  label="Período de maturação"
                  value={modelo.periodoMaturacaoMeses}
                />
              </DGrid>
            ) : (
              <EmptyState testId="modelo-vazio">
                Nenhum modelo cadastrado ainda.
              </EmptyState>
            )}

            {podePreencher && (
              <AddRowButton
                onClick={() => setModalAberto('modelo')}
                testId="abrir-modelo"
              >
                {modeloPreenchido(modelo)
                  ? 'Editar modelo e royalties'
                  : '+ Cadastrar modelo e royalties'}
              </AddRowButton>
            )}

            {/*
             * Prototype `#modDetail` — `display:none` until `renderMod()` runs,
             * i.e. only after a model is registered. Never visible upfront.
             */}
            {modeloPreenchido(modelo) && (
              <>
                <div
                  className="mt-3.5 rounded-[var(--radius-xs)] border border-(--secondary-200) bg-(--secondary-100) px-3 py-2.25 text-(length:--t-caption) text-(--secondary-700)"
                  data-testid="tab-aplic"
                >
                  {modelo.modeloRoyalty === ModeloRoyalty.PercentualFixo
                    ? /* Lubrax+ (22/09/2026) — sem Anexo A; os números são do
                         backend e aparecem na proposta depois de salva. */
                      'Royalty em percentual fixo sobre o faturamento, com mínimo mensal — definidos pelo modelo de negócio e aplicados ao salvar a proposta.'
                    : modelo.formatoLoja === ''
                      ? 'Selecione o formato de loja para aplicar a tabela do Anexo A (J10).'
                      : `Tabela de royalty aplicada automaticamente: ${FORMATO_LOJA_LABEL[modelo.formatoLoja]} (Anexo A · J10).`}
                </div>

                {exibeTabelaDeRoyalties(modelo) && (
                  <>
                    <SubHeading>Tabela de royalties</SubHeading>
                    <SubBox>
                      <TabelaAnexoADoRascunho status={faixasStatus} faixas={faixas} />
                    </SubBox>
                  </>
                )}

                {/*
                 * ADO 67867 — o CADASTRO dos limites saiu daqui.
                 *
                 * Este sub-bloco tinha o `.editbar` do protótipo (`#tfEdit` +
                 * `toggleTF()`) e cinco campos abertos. Foi ali que um Consultor
                 * de Expansão gravou `1111` em "Royalty mínimo (%)" e `200` em
                 * "Fundo de marketing mínimo (%)" na UAT.
                 *
                 * Os seis patamares são PARAMETRIZAÇÃO por bandeira, mantida em
                 * Parametrização de Franquias → Estrutura de Royalties, pelos quatro
                 * perfis que o ticket nomeia. O dicionário do PRD de Franquias já
                 * marcava **Origem/Master = Política** nesses campos, e a
                 * RN-F2-04 / RN-F11-01 pedem a política na seção administrativa.
                 *
                 * ⚠️ O bloco **continua visível**, em modo leitura: a HU-04b.1
                 * exige que o LT veja esses campos travados, e esconder o
                 * sub-bloco deixaria a proposta sem dizer qual política a governa.
                 * Aqui, na tela de CRIAÇÃO, ainda não há linha gravada — então o
                 * que ele mostra é para onde ir, não valores.
                 */}
                <SubHeading extra={<LockChip>Parametrização · J10</LockChip>}>
                  Estrutura de royalties · limites
                </SubHeading>
                <SubBox>
                  <p
                    className="text-[14px] text-(--color-text-muted)"
                    data-testid="limites-parametrizados-nota"
                  >
                    Os patamares (royalty mínimo, fundo de marketing mínimo, valor
                    fixo, piso, teto e valor mínimo mensal) são parametrizados por
                    bandeira em <b>Governança → Parametrização de Franquias →
                    Estrutura de Royalties</b> e aplicados automaticamente à proposta. Eles
                    aparecem na proposta depois de salva.
                  </p>
                </SubBox>
              </>
            )}
          </Block>

          {/*
           * "Royalties e consolidação econômica" (prototype block 3,
           * `03-proposta-franquia.html:173-191`) was REMOVED by the 14/08
           * decision — deliberate divergence from the prototype, on the grounds
           * that it restates what "Modelo de loja e royalties" already asks and
           * what the side panel already reports (`Royalties (a.a.)`).
           *
           * ⚠️ The BACKEND stays. `royaltiesCalculados` (`franquia-f3.service`)
           * still computes floor/ceiling and the exception overrides, still
           * travels in the read model, and still feeds the parecer and the
           * opportunity's consolidated economics. Removing the block is a render
           * decision; deleting the calculation would remove business rule.
           */}

          {/*
           * 3 · Exceções Programadas — franchise team only (Bug ADO 67802).
           *
           * This card used to be open to every profile that can write, by a
           * product decision of 13/08/2026 that lived only in this comment,
           * then locked to the franchise team (RN-F2-06 / HU-04b.1), and is now
           * open to the LT again — this time by an explicit business decision
           * on the ticket itself, not by a comment.
           *
           * ⚠️ **ADO 67802, 26/08/2026 — o LT faz CRUD na exceção programada.**
           * Enquanto o card era do time de franquia, o LT via o bloco travado
           * com o LockChip e sem formulário, exatamente o que o ticket relatou
           * ("a funcionalidade de criação da Exceção Programada não é
           * disponibilizada para o usuário"). Isso diverge do texto da RN-F2-06
           * e da HU-04b.1 do `PRD_Franquias_EspecFuncional_v1.0` — divergência
           * deliberada, registrada em `franquia/domain/excecao-programada.ts`
           * no backend. O protótipo concorda: em `03-proposta-franquia.html` o
           * bloco nunca teve recorte por perfil, enquanto os blocos de royalty
           * ao lado têm os interruptores "Editar como time de franquia".
           *
           * O gate é `podeExcecao`. Não existe mais um `podeEstrutura` ao
           * lado: os LIMITES do royalty saíram desta tela no ADO 67867 e são
           * parametrização por bandeira, na aba de Governança.
           *
           * O card fica VISÍVEL e somente leitura quando o perfil não escreve —
           * a mesma forma que a tela da proposta salva renderiza
           * (`ExcecoesSection`: lista + LockChip, sem formulário). Escondê-lo
           * deixaria o usuário sem saber que o bloco existe e de quem ele é.
           */}
          <Block
            title="Exceções Programadas"
            collapsible
            headerExtra={
              !podeExcecao ? <LockChip>Time de franquia</LockChip> : undefined
            }
          >
            {excecoes.length === 0 ? (
              <EmptyState testId="excecoes-vazia">
                Nenhuma exceção adicionada.
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-2.5" data-testid="excecoes-lista">
                {excecoes.map((excecao, index) => (
                  <li
                    key={`${excecao.tipo}-${index}`}
                    className="flex items-start justify-between gap-3.5 rounded-[var(--radius-xs)] border border-(--color-border) px-3.5 py-3"
                  >
                    <div>
                      <div className="text-(length:--t-caption) font-bold">
                        {EXCECAO_TIPO_LABEL[excecao.tipo]}
                      </div>
                      <div className="mt-1 text-[14px] text-(--color-text-muted)">
                        {resumoExcecao(excecao)}
                      </div>
                    </div>
                    {/* Prototype `.ei-acts` — an exception the user can add is
                        an exception they can edit and remove, so the actions
                        ride the same gate as the add button (RN-F2-06). */}
                    {podeExcecao && (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setExcecaoEmEdicao(index);
                            setModalAberto('excecao');
                          }}
                          className="rounded-[var(--radius-xxs)] border border-(--secondary-600) bg-white px-3 py-1.25 text-[12px] font-bold text-(--secondary-600)"
                          data-testid={`excecao-editar-${index}`}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          aria-label={`Remover ${EXCECAO_TIPO_LABEL[excecao.tipo]}`}
                          /*
                           * Também remove no servidor quando a exceção já foi
                           * gravada pelo autosave — tirar só do rascunho a
                           * deixaria viva na proposta, e a tela diria o oposto
                           * do que o backend guarda.
                           */
                          onClick={() => void removerExcecao(index)}
                          className="px-1.5 py-1.25 text-[14px] font-bold text-(--color-danger)"
                          data-testid={`excecao-remover-${index}`}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* No disabled CTA: a button that can never open the modal is dead
                control (repo doctrine). The LockChip on the header names the
                owner instead. */}
            {podeExcecao && bloqueioEstrutural === null && (
              <AddRowButton
                onClick={() => {
                  setExcecaoEmEdicao(null);
                  setModalAberto('excecao');
                }}
                testId="abrir-excecao"
              >
                + Adicionar exceção
              </AddRowButton>
            )}
          </Block>

          {/* 4 · COF ─────────────────────────────────────────────────── */}
          <Block title="COF · Circular de Oferta de Franquia" collapsible>
            {/*
             * Prototype `#cofEmpty` → `#cofData`: the card starts on the empty
             * state with the `.addrow`, and only shows the dispatch data once a
             * recipient is registered.
             *
             * `''` significa "o modal nunca foi respondido" — daí o ramo vazio
             * dizer que o envio não está configurado. Desde 04/09/2026 o modal
             * recusa salvar em branco, então aqui só há duas situações: nunca
             * aberto, ou respondido.
             */}
            {cofEmail.trim() === '' ? (
              <EmptyState testId="cof-vazio">
                Envio da COF não configurado.
              </EmptyState>
            ) : (
              <>
                <DGrid>
                  <DField
                    label="Documento"
                    value="Circular de Oferta de Franquia (modelo)"
                  />
                  <DField label="Canal" value="E-mail (automatizado)" />
                  <DField
                    label="Destinatário"
                    value={cofEmail}
                    testId="cof-destinatario"
                  />
                  <DField
                    label="Prazo legal"
                    value="14 dias antes do envio à assinatura"
                  />
                  {/* No dispatch date yet: the consumer stamps it when the
                      proposal is sent to analysis (GATE 1 — VBR-513). */}
                  <DField label="Data de envio" value={null} />
                  <DField
                    label="Status / tracking"
                    value={
                      <StatusPill variant="warning" data-testid="cof-status">
                        Pendente de disparo
                      </StatusPill>
                    }
                  />
                </DGrid>
              </>
            )}

            {/*
             * VBR-514 / 14/08 — deliberate divergence from the prototype, which
             * has BOTH the info alert (`#cofTrack`, `:211`) and the relabelled
             * "Editar envio da COF" (`renderCof`, `:351`):
             *
             *  - the two lavender `Alert tone="info"` are gone. One of them
             *    described the GATE 2 trigger, so it was wrong text as well as
             *    unwanted; the other restated a rule (RN-F5-01) that the
             *    backend already enforces by not creating the record at all;
             *  - the edit affordance is gone. The control now only ever offers
             *    registration: once a recipient exists the read-only grid above
             *    already names it, and the value is an override the LT is not
             *    asked to revisit here.
             *
             * The prototype's "Simular disparo (demo)" / "Simular devolução
             * (erro)" buttons are not ported either: they fabricate a dispatch
             * that never happened. The real tracking is the consumer's, and it
             * shows on the proposal screen.
             */}
            {podePreencher && cofEmail.trim() === '' && (
              <AddRowButton
                onClick={() => setModalAberto('cof')}
                testId="abrir-cof"
              >
                + Cadastrar envio da COF
              </AddRowButton>
            )}
          </Block>
        </div>

        {/* ── Indicator panel (aside.panel) ─────────────────────────────── */}
        {/* Na criação o royalty ainda não foi calculado — nada foi persistido,
            então a linha nasce em travessão. Na tela da proposta o MESMO painel
            recebe o valor de `royaltiesCalculados`. */}
        <IndicadoresFranquiaPanel
          bandeiraLabel={bandeiraLabel}
          royaltyAnualBrl={royaltyAnualBrl}
          indisponivel={royaltyIndisponivel}
        />
      </div>

      {/* ── Sendbar ──────────────────────────────────────────────────────── */}
      <div
        ref={sendbarRef}
        data-testid="franquia-sendbar"
        className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-6 border-t border-(--color-border) bg-(--color-surface) py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]"
        style={{
          paddingLeft: 'max(24px, calc((100% - var(--grid-max)) / 2 + 24px))',
          paddingRight: 'max(24px, calc((100% - var(--grid-max)) / 2 + 24px))',
        }}
      >
        <div className="min-w-0 text-(length:--t-caption)" data-testid="sendbar-mensagem">
          {/*
            UAT de 25/08/2026: "não deve existir o botão Concluir". A barra passa
            a RELATAR o autosave em vez de pedir uma confirmação — e "salvo" só
            aparece depois de uma gravação de verdade: dizer isso numa tela em
            que nada foi preenchido afirmaria uma escrita que não houve.

            ADO — 01/09/2026: com a proposta criada, o TÍTULO passa a ser o do
            backend ("Proposta em preenchimento — pendências a resolver."), e o
            autosave desce para o detalhe. As duas informações são necessárias e
            respondem a perguntas diferentes: o que ainda falta, e que nada do que
            foi digitado se perde ao sair pela oportunidade.

            ⚠️ A ordem dos ramos é o contrato: `salvando` e `falhou` VENCEM o
            veredito do backend. Eles falam desta gravação, agora, e uma frase de
            completude sobre um bloco que acabou de falhar seria a mentira que o
            ramo de falha existe para impedir — o veredito lido é anterior à
            gravação que falhou.
          */}
          <b>{tituloSendbar}</b>{' '}
          {salvamento === 'salvando' ? (
            <span className="text-(--color-text-muted)">· salvando…</span>
          ) : salvamento === 'falhou' ? (
            <span className="text-(--yellow-700)">
              {falhasSalvamento.length > 0
                ? `· não foi possível salvar: ${falhasSalvamento.join(', ')}.`
                : '· não foi possível salvar.'}
            </span>
          ) : salvamento === 'salvo' ? (
            <span className="text-(--secondary-600)">
              · salva automaticamente; os demais blocos podem ser completados a
              qualquer momento.
            </span>
          ) : (
            <span className="text-(--color-text-muted)">
              {podeCriar
                ? '· preencha um bloco para criar a proposta; o salvamento é automático.'
                : `· ${motivoBloqueio}`}
            </span>
          )}
          {/*
            As pendências da proposta recém-criada — MESMO componente e mesmos
            testids da tela da proposta salva.

            Nasce ABERTA aqui, diferente de lá: nesta tela a lista é a resposta ao
            bloco que a pessoa acabou de salvar (a notícia do momento), e a barra
            não tem outro conteúdo disputando espaço. Na tela da proposta chega-se
            para ler tudo, e lá a lista aberta era uma parede de 197px medidos.
            A reserva abaixo é MEDIDA (`useSendbarReserve`), então abrir nunca
            cobre o último cartão.

            Suprimida SÓ no ramo de falha: ali a lista lida é a de antes da
            escrita, e exibi-la ao lado de "não foi possível salvar" afirmaria um
            estado que ninguém confirmou. Durante `salvando` ela FICA — some e
            volta a cada save faria a barra (e o conteúdo acima dela, cuja reserva
            acompanha) pular a cada clique, e o detalhe já diz "salvando…", então
            a lista de um instante atrás não engana ninguém.
          */}
          {pendencias !== null && salvamento !== 'falhou' && (
            <SendbarPendencias pendencias={pendencias} abertaPorPadrao />
          )}
          {erroEnvio !== '' && (
            <p
              role="alert"
              className="mt-1 text-[14px] text-(--color-danger)"
              data-testid="sendbar-erro"
            >
              {erroEnvio}
            </p>
          )}
        </div>

        {/*
          Sem CTA de criação — a criação é o autosave. O que sobra é NAVEGAÇÃO,
          e só depois de a proposta existir: um botão permanentemente
          desabilitado é controle morto (contrato da sendbar em CLAUDE.md).

          O destino é a OPORTUNIDADE, não a proposta — ver `oportunidadeUrl`.
        */}
        {proposalId !== null && (
          <Link
            href={oportunidadeUrl}
            className={`${BTN_PRIMARY} shrink-0 px-8`}
            data-testid="franquia-ir-para-oportunidade"
          >
            Ir para a oportunidade
          </Link>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {modalAberto === 'dados' && (
        <DadosModal
          dados={dados}
          bandeira={bandeira}
          /*
            É AQUI que a finalidade é escolhida (produto, 26/08/2026): ela viaja
            no `POST .../franquia`, que a exige. Esta é a única tela com esse
            caminho de escrita.
          */
          incluirFinalidade
          onCancel={() => setModalAberto(null)}
          onSave={(resposta) => {
            /*
             * ⚠️ O modal NÃO devolve o vínculo ao posto nem a janela de análise
             * — ele nunca os renderiza, só os carrega de volta do snapshot que
             * fez no `useState(dados)` do mount. A janela chega numa segunda
             * leitura, então salvar um snapshot anterior a ela apagava a
             * herança para sempre (o efeito não roda de novo). Ver
             * `aplicarRespostasDoModalDeDados`.
             *
             * O rascunho mesclado é calculado UMA vez e usado nos dois lugares:
             * `setDados` só vale no próximo render, então o replay tem de
             * receber o mesmo objeto por parâmetro — é o ADO 67887, que o gate
             * reprovaria em silêncio se aqui fosse `value`.
             */
            const value = aplicarRespostasDoModalDeDados(dados, resposta);
            setDados(value);
            setModalAberto(null);
            /*
             * `anexos` fica FORA do replay: a FAP e as fotos são enviadas por
             * `enviarAnexos`, que guarda o retorno do backend — é o id do
             * documento que permite oferecer o link de abertura (UAT 25/08).
             */
            void salvarBlocos(
              rascunhoAtual({ dados: value }),
              ['dados', 'potencial'],
              (id) => enviarAnexos(id, value),
            );
          }}
        />
      )}

      {modalAberto === 'modelo' && (
        <ModeloModal
          bandeira={bandeira}
          modelo={modelo}
          getValidacoes={getValidacoes}
          onCancel={() => setModalAberto(null)}
          onSave={(value) => {
            setModelo(value);
            setModalAberto(null);
            // Estrutura e maturação saem deste mesmo modal, então salvam junto.
            void salvarBlocos(rascunhoAtual({ modelo: value }), [
              'modelo',
              'estrutura',
              'maturacao',
            ]);
          }}
        />
      )}

      {/* Second gate, on the render itself: the card hides both entry points,
          but a modal that writes to the draft must not rely on nobody being
          able to reach `setModalAberto('excecao')` (RN-F2-06). */}
      {modalAberto === 'excecao' && podeExcecao && (
        <ExcecaoModal
          bandeira={bandeira}
          excecao={excecaoEmEdicao === null ? null : excecoes[excecaoEmEdicao]}
          onCancel={() => {
            setExcecaoEmEdicao(null);
            setModalAberto(null);
          }}
          onSave={(value) => {
            const indice = excecaoEmEdicao ?? excecoes.length;
            const idAnterior = excecaoEmEdicao === null ? null : (excecaoIds[indice] ?? null);
            setExcecoes((prev) =>
              excecaoEmEdicao === null
                ? [...prev, value]
                : prev.map((item, i) => (i === excecaoEmEdicao ? value : item)),
            );
            if (excecaoEmEdicao === null) setExcecaoIds((prev) => [...prev, null]);
            setExcecaoEmEdicao(null);
            setModalAberto(null);
            // Uma exceção por vez, e nunca o bloco inteiro: `createExcecao` é
            // POST, então reenviar a lista duplicaria as que já existem.
            void salvarExcecao(value, indice, idAnterior);
          }}
        />
      )}

      {modalAberto === 'cof' && (
        <CofModal
          email={cofEmail}
          onCancel={() => setModalAberto(null)}
          onSave={(value) => {
            setCofEmail(value);
            setModalAberto(null);
            // O destinatário da COF viaja no PATCH de `dados` — é aquele
            // endpoint que arma o fluxo; a linha da COF ainda não existe.
            void salvarBlocos(rascunhoAtual({ cofEmail: value }), ['dados']);
          }}
        />
      )}

      {confirm.dialog}
    </div>
  );
}


/**
 * Real BFF clients passed to {@link aplicarRascunhoFranquia}.
 *
 * ⚠️ `uploadFap`/`uploadPostoPhoto` aqui são os DEFAULTS do módulo, não as props
 * do componente — e isso é inócuo: o bloco `anexos` fica FORA do replay (o
 * upload é próprio, em `enviarAnexos`), então estas duas entradas nunca são
 * exercitadas por esta tela. Ficam para satisfazer o tipo `AplicarRascunhoDeps`,
 * compartilhado com a tela da proposta.
 */
const DEPS: AplicarRascunhoDeps = {
  updateDadosFranquia,
  setPotencial,
  uploadFap: defaultUploadFap,
  uploadPostoPhoto: defaultUploadPostoPhoto,
  setModeloLoja,
  setRoyaltyEstrutura,
  setMaturacao,
  createExcecao,
};

// ---------------------------------------------------------------------------
// Prototype primitives that only this screen needs
// ---------------------------------------------------------------------------



function MetaItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[14px] uppercase tracking-[0.3px] text-(--color-text-muted)">
        {label}
      </dt>
      <dd className="mt-0.5 text-(length:--t-caption) font-bold">{value ?? '—'}</dd>
    </div>
  );
}

/**
 * Prototype `.roytab` — a tabela do Anexo A da chave do modelo cadastrado.
 *
 * O protótipo pinta quatro linhas fixas de Categoria · Subcategoria · Artigo.
 * Essas colunas não existem no domínio: o catálogo é chaveado por
 * `política × formato de loja` e as colunas que ele carrega são as da tarifa que
 * o negócio publicou. Então é a tarifa que aparece, pelo MESMO componente da
 * tela da proposta (ADO 67572) — duas cópias divergiriam, e aqui a divergência
 * seria invisível: as duas telas renderizam percentual e ninguém compara.
 */
function TabelaAnexoADoRascunho({
  status,
  faixas,
}: {
  status: 'ocioso' | 'carregando' | 'ok' | 'indisponivel';
  faixas: FaixaCatalogo[];
}) {
  if (status === 'carregando') {
    return (
      <p className="text-[14px] text-(--color-text-muted)" data-testid="roytab-carregando">
        Carregando a tabela do Anexo A…
      </p>
    );
  }

  /*
   * A missing catalog is NOT an empty table: "ausência de política" would read
   * as "sem cobrança". The source is named instead.
   */
  if (status === 'indisponivel') {
    return (
      <SectionUnavailable
        testId="roytab-indisponivel"
        message="Catálogo de royalties (Anexo A · J10) indisponível — os percentuais não puderam ser lidos."
      />
    );
  }

  if (faixas.length === 0) {
    return (
      <p className="text-[14px] text-(--color-text-muted)" data-testid="roytab-sem-faixa">
        Nenhuma faixa do Anexo A corresponde a esta combinação — a estrutura de
        royalties precisa ser informada pelo time de franquia na proposta.
      </p>
    );
  }

  return (
    <>
      {/*
       * NENHUMA linha é marcada aqui, e é isso que torna correto renderizar
       * todas. A faixa aplicável é escolhida pelo faturamento, numa proposta
       * que ainda não existe — então a escolha é do backend
       * (`selectRoyaltyBand`), no `PUT .../modelo-loja`.
       *
       * Até 26/08/2026 esta função trocava a tabela por uma FRASE quando havia
       * mais de uma faixa, para não mostrar `faixas[0]` como se fosse a
       * aplicada. O receio era certo e continua endereçado: mostrar todas sem
       * marcar nenhuma não compromete com nada. Reimplementar a seleção aqui
       * poria uma segunda cópia de um limite de faixa no código — o que o
       * módulo de domínio existe para impedir (ADR-0025 §D3).
       */}
      <TabelaAnexoA
        faixas={faixas.map(paraLinhaDaTabela)}
        seqAplicada={null}
        testId="roytab"
      />
      {faixas.length > 1 && (
        <p
          className="mt-2 text-[12px] text-(--color-text-muted)"
          data-testid="roytab-multiplas-faixas"
        >
          O Anexo A tem {faixas.length} faixas para esta combinação — a aplicável
          depende do faturamento proposto e é resolvida quando a proposta é criada.
        </p>
      )}
    </>
  );
}

/**
 * `FaixaCatalogo` (forma do catálogo J10) → `RoyaltyFaixa` (forma do read model
 * da proposta), que é o que o componente compartilhado consome.
 *
 * Os dois lados carregam os mesmos nove valores com dois nomes — `…Faturamento`
 * de um lado, `…Brl` do outro. A conversão fica nesta borda, e não dentro do
 * componente, para o componente não ter de conhecer as duas formas.
 */
function paraLinhaDaTabela(faixa: FaixaCatalogo): RoyaltyFaixa {
  return {
    inicioFaixaBrl: faixa.inicioFaixaFaturamento,
    fimFaixaBrl: faixa.fimFaixaFaturamento,
    registroSequencial: faixa.registroSequencial,
    percRoyalty: faixa.percRoyalty,
    percRoyaltyTabaco: faixa.percRoyaltyTabaco,
    percFundoDeMkt: faixa.percFundoDeMkt,
    percFundoDeMktTabaco: faixa.percFundoDeMktTabaco,
    valorFixoRoyaltyBrl: faixa.valorFixoRoyalty,
    valorFixoFundoMktBrl: faixa.valorFixoFundoMkt,
  };
}




