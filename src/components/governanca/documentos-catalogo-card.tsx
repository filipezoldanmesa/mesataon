'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  LINK_ACTION,
  LINK_ACTION_DANGER,
  PRIMARY_ACTION_BTN,
  SECONDARY_OUTLINE_BTN,
} from '@/components/button';
import { useConfirm } from '@/components/confirm-dialog';
import { IN_FIELD } from '@/components/ui/field-classes';
import { Select } from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import { stageLabel } from '@/lib/documents/documents-mapping';
import {
  criarDocumentoParametrizacao as defaultCriar,
  editarDocumentoParametrizacao as defaultEditar,
  getCatalogoDocumentos as defaultGetCatalogo,
  getDocumentosPorModalidade as defaultGetModalidade,
  removerDocumentoParametrizacao as defaultRemover,
} from '@/lib/governanca/documentos-catalogo.data';
import type {
  DocumentoParametrizacao,
  DocumentosPorModalidade,
  EdicaoDocumentoParametrizacao,
  NovoDocumentoParametrizacao,
} from '@/lib/governanca/documentos-catalogo.types';

type Props = {
  getCatalogo?: () => Promise<DocumentoParametrizacao[]>;
  getModalidade?: () => Promise<DocumentosPorModalidade[]>;
  criarDocumento?: (
    payload: NovoDocumentoParametrizacao,
  ) => Promise<DocumentoParametrizacao>;
  editarDocumento?: (
    category: string,
    type: string,
    payload: EdicaoDocumentoParametrizacao,
  ) => Promise<DocumentoParametrizacao>;
  /** Injetável nos testes; por padrão fala com a BFF (22/09/2026). */
  removerDocumento?: (category: string, type: string) => Promise<void>;
};

/** As etapas-limite, no vocabulário da tela. `null` = não exigido por etapa. */
const ETAPAS: { value: string; label: string }[] = [
  { value: '', label: 'Não obrigatório em etapa nenhuma' },
  { value: 'CALCULO_DA_ALCADA', label: 'Cálculo da alçada' },
  { value: 'ENVIO_PARA_ANALISE_SNEG', label: 'Envio para análise da SNEG' },
  { value: 'ANALISE_SNEG', label: 'Análise da SNEG' },
  { value: 'EMISSAO_DE_CONTRATO', label: 'Emissão de contrato' },
  { value: 'ANALISE_PREVIA_GARANTIA', label: 'Análise prévia (garantia)' },
  {
    value: 'CONFECCAO_DA_MINUTA_DE_GARANTIA',
    label: 'Confecção da minuta de garantia',
  },
];

/** Os tokens de `AcceptedFileType` no backend — não invente formato aqui. */
const FORMATOS = ['pdf', 'png', 'jpeg', 'excel', 'word'] as const;

type Formulario = {
  modo: 'criar' | 'editar';
  category: string;
  type: string;
  stageLimit: string;
  required: boolean;
  single: boolean;
  selectable: boolean;
  acceptedTypes: string[];
};

/**
 * Governança → **Documentos** (`15-governanca.html`, aba F1).
 *
 * Dois cards, os dois do protótipo:
 *
 * 1. **Catálogo de documentos e etapa-limite** — `document_parametrizations`,
 *    a tabela que o `ChecklistEngine` lê para montar o checklist de toda
 *    oportunidade.
 * 2. **Documentos por modalidade de garantia** — projeção de
 *    `documentosObrigatoriosDoTipo`, o MESMO predicado que o gate da análise
 *    prévia aplica.
 *
 * ## ⚠️ Passou a EDITAR em 21/09/2026 — e a flag saiu, não foi ligada
 *
 * > *"Documentos deve ficar disponível apenas para TI Administrador e deve ser
 * > possível adicionar/editar os documentos."*
 *
 * A edição existia no backend desde a HU-21 atrás de
 * `DOCUMENTS_PARAMETRIZATION_ENABLED` — default `false`, ausente do compose e
 * das task definitions —, ou seja **404 em todo ambiente**, e por isso esta aba
 * era somente leitura (oferecer "Editar" teria sido controle morto). A flag foi
 * REMOVIDA com este pedido: flag com um único estado desejado é código morto, e
 * essa vivia fora deste repositório (`apvar-devops-iac`).
 *
 * ## ⚠️ "Remover" EXISTE desde 22/09/2026 — e é condicionado
 *
 * > *"Também deve ser possível excluir um documento que não tenha nenhum anexo
 * > em nenhuma proposta."*
 *
 * Isto revisa a recusa de 21/09, cujo motivo era *"apagar a linha responderia
 * 'este tipo nunca existiu' a arquivos que existem"*. O pedido não contradiz o
 * motivo — ele o transforma em pré-condição, e **sem nenhum anexo não há arquivo
 * a quem mentir**.
 *
 * ⚠️ **`selectable: false` NÃO foi substituído** (VBR-645). É o instrumento para
 * o tipo que já foi usado: o que foi anexado nele continua legível, listável e
 * baixável, e a operação é reversível. A remoção é para o tipo que nunca foi
 * usado — cadastro errado, duplicado, teste — e é irreversível.
 *
 * ⚠️ **Quem decide é o BACKEND** (`removable` no payload), e a tela renderiza.
 * Linha em uso não ganha o link: seria uma ação que sempre falha. Mas o FATO não
 * some — no lugar do link vai a contagem de anexos, que é o que explica a
 * indisponibilidade e aponta o caminho certo.
 *
 * ## ⚠️ O formulário é um DIÁLOGO, não um card abaixo da tabela (22/09/2026)
 *
 * > *"ao apertar o botão de adicionar documento ou editar o formulário deveria
 * > abrir em um dialog"*
 *
 * Ele nasceu como uma `<section>` irmã: ao editar a 17ª linha, o formulário
 * abria **fora da área visível** e o clique não parecia ter efeito. O modal é
 * também o modelo de preenchimento do resto da plataforma (grade somente-leitura
 * + modal que a edita).
 *
 * ## ⚠️ O que se salva aqui vale para quem JÁ ESTÁ EM CURSO
 *
 * O `ChecklistEngine` lê esta tabela a cada requisição — não existe "vale da
 * próxima oportunidade em diante". Criar um tipo obrigatório com etapa-limite
 * passa a cobrá-lo de todas as oportunidades abertas no mesmo instante, e é por
 * isso que a linha nasce opcional e a tela avisa.
 *
 * ## ⚠️ O gate da aba é MAIS ESTRITO que o da API, de propósito
 *
 * `GET /v1/documents/parametrization` **não tem `@Roles`**, e não pode ganhar
 * um: ele alimenta o select "Tipo do documento" do repositório do cliente, e
 * gatear a leitura quebraria o LT. A aba é restrita a
 * `Permission.DocumentParametrizationView` (`[TI Administrador]` desde
 * 21/09/2026). **Consequência aceita:** nenhum perfil de negócio vê esta aba.
 *
 * ⚠️ E o card **se defende sozinho** (`usePermissions`): a ROTA que hospeda a
 * Governança é mais larga (`GovernancaAccess` = três perfis), então confiar no
 * gate da aba faria uma aba mal cabeada oferecer "Editar" a quem a API responde
 * 403. Quem não mantém o catálogo **vê a tabela inteira** — esconder o CTA nunca
 * pode esconder o fato.
 *
 * ## Três colunas do protótipo não são renderizadas — e a lacuna diz qual
 *
 * `Bloqueante`, `Qtd. máx.` e `Validade` não existem no schema. Aqui a lacuna
 * nomeada é o tratamento CERTO (diferente do card de verba, que era lacuna
 * inteira): o card informa 5 colunas reais de ~17 linhas, e as 3 ausentes são
 * campos faltando DENTRO de um card que informa.
 */
export function DocumentosCatalogoCard({
  getCatalogo = defaultGetCatalogo,
  getModalidade = defaultGetModalidade,
  criarDocumento = defaultCriar,
  editarDocumento = defaultEditar,
  removerDocumento = defaultRemover,
}: Props) {
  const { can } = usePermissions();
  const podeEditar = can(Permission.DocumentParametrizationView);
  /*
   * Remoção apaga dado e é IRREVERSÍVEL — o critério do repo para exigir
   * confirmação ("a ação escreve E apaga dado"). O texto nomeia o alvo e a
   * consequência, e diz o que o usuário provavelmente queria em vez disso.
   */
  const confirmar = useConfirm();

  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [catalogo, setCatalogo] = useState<DocumentoParametrizacao[]>([]);
  const [modalidade, setModalidade] = useState<DocumentosPorModalidade[]>([]);
  const [form, setForm] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  /*
   * ⚠️ Estado de erro PRÓPRIO, separado do `erroForm`: a remoção acontece a
   * partir da TABELA, e o modal pode nem estar aberto. Reusar o do formulário
   * esconderia a frase do 409 — que é a única coisa que explica a recusa.
   */
  const [erroRemocao, setErroRemocao] = useState<string | null>(null);

  const reload = useCallback(() => {
    setStatus('loading');
    /*
     * ⚠️ `allSettled`, não `all`: a modalidade é um card SECUNDÁRIO derivado de
     * outro módulo. Uma falha nela não pode levar o catálogo — que é o conteúdo
     * principal da aba — junto.
     */
    void Promise.allSettled([getCatalogo(), getModalidade()]).then(
      ([cat, mod]) => {
        if (cat.status === 'rejected') {
          setStatus('error');
          return;
        }
        setCatalogo(cat.value);
        setModalidade(mod.status === 'fulfilled' ? mod.value : []);
        setStatus('loaded');
      },
    );
  }, [getCatalogo, getModalidade]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (status === 'loading') {
    return (
      <p
        data-testid="documentos-catalogo-carregando"
        className="py-4 text-(length:--t-caption) text-(--color-text-muted)"
      >
        Carregando o catálogo de documentos…
      </p>
    );
  }

  if (status === 'error') {
    return (
      <div data-testid="documentos-catalogo-erro" className="py-4">
        <p className="text-(length:--t-caption) text-(--color-danger)">
          Não foi possível carregar o catálogo de documentos.
        </p>
        <button
          type="button"
          onClick={reload}
          className="mt-2 text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="documentos-catalogo">
      <Card
        /*
         * ⚠️ **Era "Dono: SNEG", e mudou em 21/09/2026 — é EXCEÇÃO, não licença
         * para mexer em badge.** O badge nomeia quem MANTÉM a tabela, e o que o
         * sustentava era o `@Roles(SNEG)` da escrita; o negócio transferiu a
         * autoridade ("apenas TI Administrador... adicionar/editar"), então
         * manter "SNEG" passaria a ser o que inventa um dono.
         *
         * ⚠️ Segue valendo que a **RN-F2-03 do PRD atribui o CONTEÚDO do
         * catálogo à SNEG**: quem decide o que entra é ela, quem opera a tabela é
         * o TI Administrador. A divergência está registrada em
         * `DOCUMENT_PARAMETRIZATION_WRITE_ROLES`.
         */
        dono="TI Administrador"
        titulo="Catálogo de documentos e etapa-limite"
        badge={`${catalogo.length} tipos`}
        testId="card-catalogo"
        lacunas={LACUNAS_CATALOGO}
      >
        <p
          data-testid="catalogo-aviso-vigencia"
          className="mb-2.5 text-(length:--t-small) text-(--color-text-muted)"
        >
          É esta tabela que o checklist de toda oportunidade lê. O que for salvo
          aqui passa a valer na hora, inclusive para as oportunidades{' '}
          <strong>em curso</strong> — tornar um documento obrigatório o cobra de
          todas elas imediatamente.
        </p>

        {podeEditar && (
          <div className="mb-3">
            <button
              type="button"
              className={PRIMARY_ACTION_BTN}
              onClick={() => {
                setErroForm(null);
                setErroRemocao(null);
                setForm({
                  modo: 'criar',
                  category: '',
                  type: '',
                  /*
                   * ⚠️ Nasce inofensivo: o motor lê a tabela ao vivo, então um
                   * tipo que nascesse obrigatório cobraria o documento de toda
                   * oportunidade aberta no instante do "Criar".
                   */
                  stageLimit: '',
                  required: false,
                  single: false,
                  selectable: true,
                  acceptedTypes: [],
                });
              }}
            >
              + Adicionar documento
            </button>
          </div>
        )}
        {catalogo.length === 0 ? (
          <p
            data-testid="catalogo-vazio"
            className="py-2 text-(length:--t-caption) text-(--color-text-muted)"
          >
            Nenhum tipo de documento parametrizado.
          </p>
        ) : (
          <Tabela
            head={[
              'Categoria',
              'Tipo de documento',
              'Etapa-limite',
              'Obrigatoriedade',
              'Formatos',
              'Único por oportunidade',
              /*
               * ⚠️ Coluna NOVA (21/09/2026): sem ela, um tipo fora de circulação
               * fica indistinguível de um em uso na única tela que o edita.
               */
              'Disponível',
              ...(podeEditar ? [''] : []),
            ]}
            rows={catalogo.map((d) => [
              d.category,
              d.type,
              stageLabel(d.stageLimit),
              d.required ? 'Obrigatório' : 'Opcional',
              d.acceptedTypes.join(', '),
              d.single ? 'Sim' : 'Não',
              d.selectable ? 'Sim' : 'Fora de circulação',
              ...(podeEditar
                ? [
                    <div key="acoes" className="flex items-center gap-3">
                      <button
                        type="button"
                        className={LINK_ACTION}
                        onClick={() => {
                          setErroForm(null);
                          setErroRemocao(null);
                          setForm({
                            modo: 'editar',
                            category: d.category,
                            type: d.type,
                            stageLimit: d.stageLimit ?? '',
                            required: d.required,
                            single: d.single,
                            selectable: d.selectable,
                            acceptedTypes: [...d.acceptedTypes],
                          });
                        }}
                      >
                        Editar
                      </button>
                      {/*
                        ⚠️ O veredito é do BACKEND (`removable`), e a tela
                        renderiza. Oferecer "Remover" numa linha em uso daria uma
                        ação que sempre falha com 409 — mesmo critério que
                        esconde "Excluir" no item de recurso gerado por obra.

                        ⚠️ Mas esconder o CTA não pode esconder o FATO: no lugar
                        do link entra a contagem, que é o que explica a
                        indisponibilidade e aponta o caminho certo
                        ("Disponível para novos anexos", no modal de edição).
                      */}
                      {d.removable ? (
                        <button
                          type="button"
                          data-testid={`remover-${d.category}-${d.type}`}
                          className={LINK_ACTION_DANGER}
                          onClick={() =>
                            confirmar.ask({
                              title: `Excluir "${d.type}"?`,
                              description:
                                `O tipo "${d.type}" da categoria "${d.category}" sai do ` +
                                'catálogo e deixa de ser cobrado no checklist de todas as ' +
                                'oportunidades em curso. Nenhum documento foi anexado nele, ' +
                                'então nada é apagado além da parametrização. Não é possível desfazer.',
                              confirmLabel: 'Excluir',
                              tone: 'danger',
                              onConfirm: async () => {
                                setErroRemocao(null);
                                try {
                                  await removerDocumento(d.category, d.type);
                                  /*
                                   * Recarrega a LISTA, como o salvar: a tela tem
                                   * de refletir o que o motor de exigência está
                                   * lendo agora, e o `removable` das outras
                                   * linhas veio da mesma leitura.
                                   */
                                  reload();
                                } catch (e) {
                                  setErroRemocao(
                                    e instanceof Error && e.message
                                      ? e.message
                                      : 'Não foi possível excluir o tipo de documento.',
                                  );
                                }
                              },
                            })
                          }
                        >
                          Remover
                        </button>
                      ) : (
                        <span
                          data-testid={`em-uso-${d.category}-${d.type}`}
                          className="whitespace-nowrap text-(length:--t-small) text-(--color-text-muted)"
                          title={
                            'Não é possível excluir: já há documentos anexados com esse tipo. ' +
                            'Para tirá-lo de circulação, desmarque "Disponível para novos anexos".'
                          }
                        >
                          {d.attachmentCount}{' '}
                          {d.attachmentCount === 1 ? 'anexo' : 'anexos'}
                        </span>
                      )}
                    </div>,
                  ]
                : []),
            ])}
          />
        )}

        {/*
          A frase do backend, verbatim — ela nomeia a contagem e aponta o
          `selectable`. Fica sob a TABELA porque é de lá que a ação parte; o
          modal pode nem estar aberto.
        */}
        {erroRemocao && (
          <p
            role="alert"
            data-testid="documento-remocao-erro"
            className="mt-3 rounded-[var(--radius-xs)] bg-(--red-100) px-3 py-2 text-(length:--t-caption) text-(--color-danger)"
          >
            {erroRemocao}
          </p>
        )}
      </Card>

      {confirmar.dialog}

      {form && (
        <DocumentoForm
          form={form}
          salvando={salvando}
          erro={erroForm}
          onChange={setForm}
          onCancelar={() => {
            setForm(null);
            setErroForm(null);
          }}
          onSalvar={async () => {
            setSalvando(true);
            setErroForm(null);
            try {
              if (form.modo === 'criar') {
                await criarDocumento({
                  category: form.category.trim(),
                  type: form.type.trim(),
                  stageLimit: form.stageLimit === '' ? null : form.stageLimit,
                  required: form.required,
                  single: form.single,
                  selectable: form.selectable,
                  acceptedTypes: form.acceptedTypes,
                });
              } else {
                /*
                 * ⚠️ `category`/`type` NÃO vão no corpo: eles são a chave da
                 * linha e não são editáveis. Renomear um par é outra operação,
                 * não modelada — os documentos anexados apontam para o antigo.
                 */
                await editarDocumento(form.category, form.type, {
                  stageLimit: form.stageLimit === '' ? null : form.stageLimit,
                  required: form.required,
                  single: form.single,
                  selectable: form.selectable,
                  acceptedTypes: form.acceptedTypes,
                });
              }
              setForm(null);
              /*
               * ⚠️ Recarrega a LISTA: a resposta traz uma linha, e costurá-la no
               * estado local faria a tela divergir do que o motor de exigência
               * está lendo — que é o ponto inteiro desta tabela.
               */
              reload();
            } catch (e) {
              setErroForm(
                e instanceof Error && e.message
                  ? e.message
                  : 'Não foi possível salvar o tipo de documento.',
              );
            } finally {
              setSalvando(false);
            }
          }}
        />
      )}

      {/*
       * Card secundário: só renderiza com dado. Falha dele não derruba a aba
       * (`allSettled`), e um card vazio aqui seria ruído — o conteúdo principal
       * é o catálogo acima.
       */}
      {modalidade.length > 0 && (
        <Card
          dono="CCOB"
          titulo="Documentos por modalidade de garantia"
          badge="Derivado da regra da garantia"
          testId="card-modalidade"
        >
          <p className="mb-2.5 text-(length:--t-small) text-(--color-text-muted)">
            O que cada modalidade exige para a garantia ficar apta — o mesmo
            predicado que o gate da análise prévia aplica.
          </p>
          <Tabela
            head={['Modalidade', 'Documentos exigidos']}
            rows={modalidade.map((m) => [
              m.tipoLabel,
              /*
               * ⚠️ Lista vazia é RESPOSTA: fiança sem lastro não exige documento
               * do bem. Um travessão mudo leria como "não carregou".
               */
              m.documentos.length > 0
                ? m.documentos.join(' · ')
                : 'Nenhum documento de bem exigido',
            ])}
          />
        </Card>
      )}
    </div>
  );
}

/**
 * As colunas do protótipo que o schema não tem.
 *
 * ⚠️ Cada uma com o motivo REAL, não "não modelado":
 * - `Bloqueante` não existe como campo — quem bloqueia é o GATE que lê a
 *   etapa-limite (`GATE1_DOCUMENT_STAGES`), não uma coluna do catálogo.
 * - `Qtd. máx.` não existe como número; o que existe é `single` (boolean), que
 *   já é exibido como "Único por oportunidade".
 * - `Validade` existe **por documento** (`expires_at`, informada no upload —
 *   ADO 67993), não como política do tipo.
 */
/**
 * As três colunas que o protótipo desenha e que não existem na parametrização.
 *
 * ⚠️ **O texto é para o NEGÓCIO, não para o dev** (08/09/2026 — *"deixe de uma
 * forma clara pro cliente / negócios, não pro dev"*). Sem `schema`, sem `gate`,
 * sem número de ADO: cada frase diz o que vale no lugar e onde o usuário
 * encontra aquilo. O raciocínio técnico fica aqui, no comentário.
 *
 * Onde cada uma de fato mora:
 * - **Bloqueante** — não é campo; quem bloqueia é o gate da etapa, e a
 *   etapa-limite exibida na tabela é o que ele lê.
 * - **Qtd. máx.** — o schema tem `single_per_opportunity` (booleano), que a
 *   tabela já exibe como "Único por oportunidade"; não há contagem máxima.
 * - **Validade** — `opportunity_repository_documents.expires_at`, informada no
 *   upload (ADO 67993), por documento e não por tipo.
 */
const LACUNAS_CATALOGO: readonly { campo: string; motivo: string }[] = [
  {
    campo: 'Bloqueante',
    motivo:
      'Não existe um marcador separado de "bloqueia". Quem bloqueia é a ' +
      'etapa-limite da tabela: até ela, todo documento obrigatório precisa ' +
      'estar anexado para a oportunidade seguir.',
  },
  {
    campo: 'Qtd. máx.',
    motivo:
      'Não há quantidade máxima. O que se define é se o tipo aceita um único ' +
      'documento por oportunidade ou vários — é a coluna "Único por ' +
      'oportunidade".',
  },
  {
    campo: 'Validade',
    motivo:
      'A validade não é do tipo de documento, e sim de cada arquivo: quem ' +
      'anexa informa a data de vencimento no momento do upload.',
  },
];

// ---------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------

function Card({
  dono,
  titulo,
  badge,
  lacunas,
  testId,
  children,
}: {
  dono: string;
  titulo: string;
  badge: string;
  lacunas?: readonly { campo: string; motivo: string }[];
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      aria-label={titulo}
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px] shadow-[var(--shadow-card)]"
    >
      <header className="mb-3.5 flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-(--color-border) bg-(--neutral-40) px-[9px] py-[3px] text-(length:--t-small) font-bold text-(--color-text-muted)">
            Dono: {dono}
          </span>
          <span className="inline-flex items-center rounded-full border border-(--secondary-200) bg-(--secondary-100) px-[9px] py-[3px] text-(length:--t-small) font-bold text-(--secondary-700)">
            {badge}
          </span>
        </div>
        <h2 className="text-(length:--t-h4) font-bold">{titulo}</h2>
      </header>

      {children}

      {lacunas && lacunas.length > 0 && (
        <ul
          data-testid={`${testId}-lacunas`}
          className="mt-3 flex flex-col gap-1.5 rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2"
        >
          {lacunas.map((l) => (
            <li key={l.campo} className="text-(length:--t-small) text-(--yellow-700)">
              <strong>{l.campo}:</strong> {l.motivo}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * O formulário de criar/editar um tipo de documento (21/09/2026), em **diálogo**
 * desde 22/09/2026.
 *
 * Um só componente para os dois modos: os campos são os mesmos, e o que muda é
 * se o par `(categoria, tipo)` está travado. Dois formulários divergiriam
 * exatamente no campo que alguém acrescentasse depois em um só deles.
 *
 * ## Por que diálogo, e não a `<section>` irmã que ele era
 *
 * Pedido do negócio (22/09/2026): *"ao apertar o botão de adicionar documento ou
 * editar o formulário deveria abrir em um dialog"*. O formulário nascia ABAIXO
 * da tabela — com ~17 linhas no catálogo, editar a última abria a edição fora da
 * área visível e o clique não parecia ter efeito. É também o modelo de
 * preenchimento do resto da plataforma: grade somente-leitura + modal que a
 * edita.
 *
 * As convenções do modal aqui são as do irmão `analysis-window-modal`, para os
 * diálogos da plataforma se comportarem igual: fundo `role="presentation"` que
 * fecha no clique fora, `role="dialog"` + `aria-modal` + `aria-labelledby`, e
 * **Escape fecha**.
 *
 * ⚠️ **Falha ao salvar MANTÉM o diálogo aberto**, com o que foi preenchido: a
 * frase do backend (o 409 do par duplicado, por exemplo) é o que nomeia o
 * conserto, e fechar aqui apagaria o formulário junto com a explicação.
 */
function DocumentoForm({
  form,
  salvando,
  erro,
  onChange,
  onCancelar,
  onSalvar,
}: {
  form: Formulario;
  salvando: boolean;
  erro: string | null;
  onChange: (f: Formulario) => void;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
  const criando = form.modo === 'criar';
  /*
   * ⚠️ Espaço em branco NÃO é nome: `"   "` viraria uma linha de catálogo
   * invisível, impossível de achar e de tirar de circulação. E lista de formatos
   * vazia recusaria TODO arquivo daquele tipo — o backend recusa os dois com
   * 400, e o botão desabilitado evita a viagem.
   */
  const valido =
    form.category.trim() !== '' &&
    form.type.trim() !== '' &&
    form.acceptedTypes.length > 0;

  /*
   * Escape fecha, como nos outros diálogos da plataforma. O listener é do
   * DOCUMENTO (e não do contêiner) porque o foco pode estar em qualquer campo —
   * ou em nenhum, logo depois da abertura.
   */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancelar();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancelar]);

  return (
    <div
      role="presentation"
      data-testid="documento-form-overlay"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-auto bg-black/40 px-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancelar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="documento-form-title"
        data-testid="documento-form"
        className="relative m-auto w-full max-w-[640px] rounded-[var(--radius-md)] bg-(--color-surface) px-7 py-[26px] shadow-[0_8px_30px_rgba(0,0,0,.2)]"
      >
      <h3
        id="documento-form-title"
        className="mb-3 text-(length:--t-h4) font-bold"
      >
        {criando ? 'Novo tipo de documento' : `Editar · ${form.type}`}
      </h3>

      {erro && (
        <p
          role="alert"
          data-testid="documento-form-erro"
          className="mb-3 rounded-[var(--radius-xs)] bg-(--red-100) px-3 py-2 text-(length:--t-caption) text-(--color-danger)"
        >
          {erro}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="doc-category"
            className="mb-1 block text-(length:--t-small) font-bold text-(--color-text-muted)"
          >
            Categoria
          </label>
          <input
            id="doc-category"
            className={IN_FIELD}
            value={form.category}
            /* ⚠️ A chave não é editável — ver o docblock do card. */
            disabled={!criando}
            onChange={(e) => onChange({ ...form, category: e.target.value })}
          />
        </div>

        <div>
          <label
            htmlFor="doc-type"
            className="mb-1 block text-(length:--t-small) font-bold text-(--color-text-muted)"
          >
            Tipo do documento
          </label>
          <input
            id="doc-type"
            className={IN_FIELD}
            value={form.type}
            disabled={!criando}
            onChange={(e) => onChange({ ...form, type: e.target.value })}
          />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="doc-stage"
            className="mb-1 block text-(length:--t-small) font-bold text-(--color-text-muted)"
          >
            Etapa-limite
          </label>
          <Select
            id="doc-stage"
            value={form.stageLimit}
            onChange={(v) => onChange({ ...form, stageLimit: v })}
            options={ETAPAS}
          />
        </div>
      </div>

      <fieldset className="mt-3">
        <legend className="mb-1 text-(length:--t-small) font-bold text-(--color-text-muted)">
          Formatos aceitos
        </legend>
        <div className="flex flex-wrap gap-3">
          {FORMATOS.map((f) => (
            <label
              key={f}
              className="flex items-center gap-1.5 text-(length:--t-caption)"
            >
              <input
                type="checkbox"
                checked={form.acceptedTypes.includes(f)}
                onChange={(e) =>
                  onChange({
                    ...form,
                    acceptedTypes: e.target.checked
                      ? [...form.acceptedTypes, f]
                      : form.acceptedTypes.filter((x) => x !== f),
                  })
                }
              />
              {f}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-3 flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-(length:--t-caption)">
          <input
            type="checkbox"
            checked={form.required}
            onChange={(e) => onChange({ ...form, required: e.target.checked })}
          />
          Obrigatório até a etapa-limite
        </label>
        <label className="flex items-center gap-2 text-(length:--t-caption)">
          <input
            type="checkbox"
            checked={form.single}
            onChange={(e) => onChange({ ...form, single: e.target.checked })}
          />
          Único por oportunidade
        </label>
        {/*
          * ⚠️ Este é o "remover" desta tela (VBR-645): desmarcar tira o tipo de
          * circulação sem apagar a linha, e o que já foi anexado nele continua
          * legível, listável e baixável.
          */}
        <label className="flex items-center gap-2 text-(length:--t-caption)">
          <input
            type="checkbox"
            checked={form.selectable}
            onChange={(e) => onChange({ ...form, selectable: e.target.checked })}
          />
          Disponível para novos anexos
        </label>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={SECONDARY_OUTLINE_BTN} onClick={onCancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className={PRIMARY_ACTION_BTN}
          disabled={!valido || salvando}
          onClick={onSalvar}
        >
          {salvando ? 'Salvando…' : criando ? 'Criar' : 'Salvar'}
        </button>
      </div>
      </div>
    </div>
  );
}

function Tabela({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-(length:--t-caption)">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="whitespace-nowrap border-b border-(--color-border) px-2.5 py-2 text-left text-(length:--t-small) font-bold uppercase tracking-[.3px] text-(--color-text-muted)"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const ultima = i === rows.length - 1;
            return (
              <tr key={`${String(row[0])}-${String(row[1])}-${i}`}>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-2.5 py-[9px] align-top ${
                      ultima ? '' : 'border-b border-(--color-border)'
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
