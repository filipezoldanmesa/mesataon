'use client';

import { useEffect, useRef, useState } from 'react';

import { PicklistSelect } from '@/components/picklists/picklist-select';
import { Select } from '@/components/ui/select';
import { PicklistField } from '@/lib/picklists/picklists.types';
import { ACCEPT_POSTO_PHOTO } from '@/lib/proposals/posto-photos.types';
// Aliased for the same reason as in the screens: the franchise-flavoured
// `TipoProposta` (ZBRM/ZLUB) also circulates here.
import {
  TipoProposta as QuoteTipoProposta,
} from '@/lib/picklists/salesforce-values';
import {
  FGrid,
  FieldLabel,
  FileDrop,
  Modal,
  controlClass,
} from '@/components/franquia/franquia-ui';
import {
  BandeiraFranquia,
  FORMATO_LOJA_LABEL,
  MODELO_NEGOCIO_LABEL,
  MODELO_ROYALTY_LABEL,
  SITUACAO_LOJA_LABEL,
} from '@/lib/franquia/types';
import {
  EXCECAO_TIPO_LABEL,
  EXCECAO_TIPOS_OFERECIDOS,
  ExcecaoTipo,
  TIPO_IMPLANTACAO_OPCOES,
  excecaoTemValor,
  excecaoTiposParaBandeira,
  finalidadesFranquiaParaBandeira,
  formatoLojaPadraoDaBandeira,
  formatosLojaParaBandeira,
  modeloRoyaltyImpostoPelaBandeira,
  modeloRoyaltyPadraoDoFormato,
  modelosRoyaltyParaFormato,
  type DadosFranquiaRascunho,
  type ExcecaoRascunho,
  type ModeloRascunho,
  type SimNao,
} from '@/lib/franquia/nova-proposta-franquia';
import { formatDateBR, maskMoneyInput } from '@/lib/franquia/format';
import {
  getRoyaltyValidacoes as defaultGetValidacoes,
  type RoyaltyPolicyValidacoes,
} from '@/lib/franquia/parametros.data';

/**
 * As quatro modais do protótipo `03-proposta-franquia.html` — `#dadModal`,
 * `#modModal`, `#excModal` e `#cofModal`.
 *
 * ## Por que elas vivem fora das telas
 *
 * O protótipo tem UM modelo de preenchimento: cada card mostra uma grade
 * somente-leitura e um botão `.addrow` ("+ Cadastrar…") que abre o modal
 * correspondente. A tela de CRIAÇÃO nasceu assim; a tela da PROPOSTA
 * (FRQ-11..14, 02/08/2026) nasceu com formulários inline dentro dos cards — e
 * as duas nunca foram realinhadas. O usuário cadastrava a franquia num modelo
 * e reabria a proposta em outro.
 *
 * Com um componente só e dois call sites, as duas telas não têm como
 * discordar sobre campo, ordem, rótulo ou regra de habilitação.
 *
 * ## O que elas NÃO sabem
 *
 * Persistência. Cada modal recebe um valor e devolve outro por `onSave` — a
 * criação joga o resultado no rascunho local (`aplicarRascunhoFranquia` grava
 * tudo no fim), a proposta chama o endpoint do bloco na hora. Ensinar uma
 * modal a gravar amarraria as duas telas ao fluxo de escrita de uma delas.
 *
 * O vocabulário é o do rascunho (`DadosFranquiaRascunho`, `ModeloRascunho`,
 * `ExcecaoRascunho`) porque ele já existia e é o formato de FORMULÁRIO — tudo
 * string, tudo opcional. A tela da proposta converte nos dois sentidos na
 * borda, que é onde a conversão pertence.
 */

// ---------------------------------------------------------------------------
// "Envio da COF" modal
// ---------------------------------------------------------------------------

/**
 * Prototype `#cofModal`.
 *
 * Um campo, e ele é **obrigatório assim que o modal abre** (04/09/2026). A COF é
 * devida em toda loja NOVA — e o card só existe para loja NOVA —, então em
 * branco deixou de ser resposta: quem não quer responder agora fecha o modal.
 *
 * ⚠️ Até aqui o campo era um OVERRIDE e o vazio significava "manda para o
 * primeiro contato com e-mail do CRM" (PRD F5). O fallback continua existindo no
 * backend — para linha anterior a esta regra e para o catch-up —, mas a tela não
 * o oferece nem o anuncia: com o GATE 1 exigindo o destinatário, um texto
 * dizendo que o vazio tem destino contradiria o botão ao lado.
 */
export function CofModal({
  email,
  salvando = false,
  error,
  onCancel,
  onSave,
}: {
  email: string;
  /** Trava "Salvar" enquanto a gravação está em voo (tela da proposta). */
  salvando?: boolean;
  /** Mensagem de erro a exibir dentro do modal após falha no save. */
  error?: string | null;
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [valor, setValor] = useState(email);

  const limpo = valor.trim();
  const vazio = limpo === '';
  // Same shape `@IsEmail()` accepts on the wire — enough to catch a typo here
  // instead of after "Salvar"; the API remains the authority.
  const invalido = !vazio && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo);

  return (
    <Modal
      title="Envio da COF"
      onCancel={onCancel}
      onSubmit={() => onSave(limpo)}
      submitDisabled={vazio || invalido || salvando}
      submitLabel={salvando ? 'Salvando…' : 'Salvar'}
      error={error}
      errorTestId="cof-erro"
      testId="modal-cof"
    >
      <div>
        <FieldLabel htmlFor="cm-email" size="caption">
          E-mail para envio da COF
        </FieldLabel>
        <input
          id="cm-email"
          data-testid="cm-email"
          type="email"
          placeholder="email@cliente.com"
          className={controlClass()}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        {/*
         * Três estados, nunca dois: erro de formato, dica (campo vazio) e nada
         * (respondido). A dica existe porque "Salvar" nasce travado — botão
         * desabilitado sem motivo é o controle morto que o contrato de copy do
         * repo proíbe —, e sai quando o campo é preenchido, senão pediria o que
         * já foi dado.
         *
         * A caixa lavanda (`Alert tone="info"`) que vivia no rodapé deste modal
         * saiu junto com as duas do card (VBR-514 follow-up), e as frases dela
         * não foram realocadas:
         *
         *  - "o disparo é automático quando a proposta é enviada para análise"
         *    repete o que o card já afirma ("Canal: E-mail (automatizado)",
         *    "Status: Pendente de disparo");
         *  - "se o e-mail for alterado, dispara novo envio" era FALSA — o
         *    disparo é idempotente em `statusCof === Enviada` e nada reseta
         *    aquela coluna, então trocar o endereço depois do envio não manda
         *    nada. Indesejada E errada.
         */}
        {invalido ? (
          <p
            className="mt-1 text-[12px] text-(--color-danger)"
            data-testid="cm-email-erro"
          >
            Informe um e-mail válido.
          </p>
        ) : vazio ? (
          <p
            className="mt-1 text-(length:--t-caption) text-(--color-text-muted)"
            data-testid="cm-email-hint"
          >
            Informe o e-mail do franqueado que receberá a COF.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// "Dados da franquia" modal
// ---------------------------------------------------------------------------

export function DadosModal({
  dados,
  bandeira,
  incluirFinalidade,
  incluirFapPotencialFotos = true,
  incluirPossuiExcecao = false,
  salvando = false,
  error,
  onCancel,
  onSave,
}: {
  dados: DadosFranquiaRascunho;
  bandeira: BandeiraFranquia;
  /**
   * Pergunta a finalidade? Só a tela de CRIAÇÃO, onde ela viaja no
   * `POST .../franquia`.
   *
   * ⚠️ **Obrigatória de propósito, sem default.** Um default `true` faria uma
   * tela sem caminho de escrita exibir o campo e perder a resposta no reload —
   * `PATCH .../franquia/:proposalId/dados` não aceita `finalidade` (ela vive em
   * `Proposal`, não em `Franquia`, e é gravada na criação). Um default `false`
   * faria a tela de criação parar de perguntar se alguém esquecesse a prop, e o
   * gate recusaria pedindo um campo que não está na tela — o beco sem saída.
   * Sem default, esquecer é erro de compilação nos dois sentidos.
   */
  incluirFinalidade: boolean;
  /**
   * FAP, fotos e potencial ficam DENTRO deste modal no protótipo e na tela de
   * criação. Na tela da proposta eles têm card próprio, com três caminhos de
   * escrita independentes e o "Solicitar ajuste" do analista incidindo só neles
   * (FRQ-14) — lá o modal os omite, senão a mesma resposta teria dois donos.
   */
  incluirFapPotencialFotos?: boolean;
  /**
   * "Possui exceção no cálculo de royalties" — pergunta só da tela da proposta,
   * que é quem tem o `PATCH .../dados` e quem mostra a resposta na grade.
   */
  incluirPossuiExcecao?: boolean;
  /** Trava "Salvar" enquanto a gravação está em voo (tela da proposta). */
  salvando?: boolean;
  /** Mensagem de erro a exibir dentro do modal após falha no save. */
  error?: string | null;
  onCancel: () => void;
  onSave: (value: DadosFranquiaRascunho) => void;
}) {
  const [form, setForm] = useState<DadosFranquiaRascunho>(dados);

  const set = <K extends keyof DadosFranquiaRascunho>(
    key: K,
    value: DadosFranquiaRascunho[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  /*
   * Os campos do `#dadModal` do protótipo, mais a FINALIDADE — que é o primeiro,
   * porque é a resposta de cadastro que os demais qualificam.
   *
   * ⚠️ **A finalidade é ESCOLHIDA aqui, sempre** (produto, 26/08/2026). Até hoje
   * ela era herdada da oportunidade e este campo só aparecia quando a herança
   * falhava — o que tinha dois efeitos ruins: no caminho derivável o usuário
   * NÃO CONSEGUIA escolher, e no caminho não-derivável o campo surgia sem que
   * nada na tela explicasse por que só ali.
   *
   * A herança inteira saiu do card (ver o comentário no efeito do posto em
   * `nova-proposta-franquia-screen.tsx`): ela se apoiava no `Contratação` do
   * cabeçalho do protótipo — que não é finalidade, é `TipoNegociacao` legado e
   * inexistente no Salesforce — e numa correlação medida em oportunidades de
   * franquia PRÓPRIAS do org, que nesta plataforma não é o caso.
   *
   * A JANELA DE ANÁLISE continua herdada da proposta de posto, e o vínculo ao
   * posto continua derivado no card — essas duas o protótipo afirma como fato e
   * o modal não pergunta.
   *
   * "Salvar" is never disabled: every answer here is optional at creation, and
   * the prototype's button is always live.
   */
  return (
    <Modal
      title="Dados da franquia"
      onCancel={onCancel}
      onSubmit={() => onSave(form)}
      submitDisabled={salvando}
      submitLabel={salvando ? 'Salvando…' : 'Salvar'}
      error={error}
      errorTestId="dados-erro"
      testId="modal-dados"
    >
      {incluirFinalidade && (
      <div className="mb-3.5">
        <FieldLabel htmlFor="dm-finalidade" size="caption">
          Finalidade
        </FieldLabel>
        {/*
         * `allow` estreita às duas da bandeira: a família `Finalidade_BR_Mania`
         * mais ampla não é selecionável numa Quote, e `valueSettings` não
         * bloqueiam escrita por REST — somos o único ponto de enforcement. É a
         * mesma lista que `finalidadesParaBandeira` aplica no backend.
         */}
        <PicklistSelect
          id="dm-finalidade"
          data-testid="dm-finalidade"
          field={PicklistField.QuoteFinalidade}
          controllingValue={QuoteTipoProposta.Pcr}
          controllingLabel="Tipo de proposta"
          allow={finalidadesFranquiaParaBandeira(bandeira)}
          placeholder="Selecione a finalidade…"
          value={form.finalidade}
          onChange={(v) =>
            set('finalidade', v as DadosFranquiaRascunho['finalidade'])
          }
        />
      </div>
      )}
      <FGrid cols={2}>
        <div>
          <FieldLabel htmlFor="dm-sit" size="caption">
            Situação atual da loja
          </FieldLabel>
          {/*
           * The prototype's select opens already on "Nova" because a static page
           * has no placeholder option. Here it starts unanswered on purpose:
           * `NOVA` is what arms the COF flow (RN-F5-01), a 14-day legal
           * obligation that must follow a choice, not a default nobody made.
           */}
          <Select
            id="dm-sit"
            data-testid="dm-sit"
            value={form.situacaoLoja}
            onChange={(v) =>
              set('situacaoLoja', v as DadosFranquiaRascunho['situacaoLoja'])
            }
            options={Object.entries(SITUACAO_LOJA_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
            placeholder="Selecione…"
          />
        </div>
        <div>
          <FieldLabel htmlFor="dm-impl" size="caption">
            Tipo de implantação
          </FieldLabel>
          {/*
           * Valor persistido fora do catálogo continua NA LISTA, nunca degrada
           * para o placeholder: `tipo_implantacao` é coluna `text` e a tela da
           * proposta abre linhas antigas. Sem isto, reabrir o modal mostraria
           * "Selecione…" e o "Salvar" apagaria a resposta que já estava lá —
           * o `isKnown` × `isSelectable` do catálogo de picklists.
           */}
          <Select
            id="dm-impl"
            data-testid="dm-impl"
            value={form.tipoImplantacao}
            onChange={(v) => set('tipoImplantacao', v)}
            options={[
              ...(TIPO_IMPLANTACAO_OPCOES as readonly string[]),
              ...(form.tipoImplantacao !== '' &&
              !(TIPO_IMPLANTACAO_OPCOES as readonly string[]).includes(
                form.tipoImplantacao,
              )
                ? [form.tipoImplantacao]
                : []),
            ].map((opcao) => ({ value: opcao, label: opcao }))}
            placeholder="Selecione…"
          />
        </div>
      </FGrid>

      <div className="mt-3.5">
        <FGrid cols={2}>
          <div>
            <FieldLabel htmlFor="dm-ini" size="caption">
              Início da operação prevista
            </FieldLabel>
            <input
              id="dm-ini"
              data-testid="dm-ini"
              type="date"
              className={controlClass()}
              value={form.inicioOperacaoPrevista}
              onChange={(e) => set('inicioOperacaoPrevista', e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="dm-fat" size="caption">
              Faturamento proposto (R$) - Piso Mínimo Contrato
            </FieldLabel>
            <input
              id="dm-fat"
              data-testid="dm-fat"
              type="text"
              inputMode="numeric"
              placeholder="R$ 0,00"
              className={controlClass()}
              value={form.faturamentoProposto}
              onChange={(e) =>
                set('faturamentoProposto', maskMoneyInput(e.target.value))
              }
            />
          </div>
        </FGrid>
      </div>

      <div className="mt-3.5">
        <FGrid cols={2}>
          <div>
            <FieldLabel htmlFor="dm-fap" size="caption">
              Faturamento de acordo com a FAP?
            </FieldLabel>
            <Select
              id="dm-fap"
              data-testid="dm-fap"
              value={form.faturamentoDeAcordoComFap}
              onChange={(v) => set('faturamentoDeAcordoComFap', v as SimNao)}
              options={[
                { value: 'sim', label: 'Sim' },
                { value: 'nao', label: 'Não' },
              ]}
              placeholder="Selecione…"
            />
          </div>
          {/*
           * O protótipo põe o potencial ao lado do "de acordo com a FAP?". Na
           * tela da proposta ele mora no card da FAP, então a segunda coluna
           * passa a ser a pergunta que só aquela tela faz — e o par nunca fica
           * com uma célula vazia.
           */}
          {incluirFapPotencialFotos && (
            <div>
              <FieldLabel htmlFor="dm-pot" size="caption">
                Potencial de franquia (R$) - FAP
              </FieldLabel>
              <input
                id="dm-pot"
                data-testid="dm-pot"
                type="text"
                inputMode="numeric"
                placeholder="R$ 0,00"
                className={controlClass()}
                value={form.potencial}
                onChange={(e) => set('potencial', maskMoneyInput(e.target.value))}
              />
            </div>
          )}
          {incluirPossuiExcecao && (
            <div>
              <FieldLabel htmlFor="dm-exc" size="caption">
                Possui exceção no cálculo de royalties
              </FieldLabel>
              <Select
                id="dm-exc"
                data-testid="dm-exc"
                value={form.possuiExcecaoRoyalties}
                onChange={(v) => set('possuiExcecaoRoyalties', v as SimNao)}
                options={[
                  { value: 'sim', label: 'Sim' },
                  { value: 'nao', label: 'Não' },
                ]}
                placeholder="Selecione…"
              />
            </div>
          )}
        </FGrid>
      </div>

      {incluirFapPotencialFotos && (
        <FapEFotosFields
          fapFile={form.fapFile}
          fotos={form.fotos}
          onFap={(file) => set('fapFile', file)}
          onFotos={(files) => set('fotos', [...form.fotos, ...files])}
        />
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// FAP + fotos do ponto — os dois `.updrop`/`.phdrop` do protótipo
// ---------------------------------------------------------------------------

/**
 * As duas zonas de anexo, iguais nos dois modais que as usam: o
 * {@link DadosModal} da tela de criação e o {@link FapPotencialModal} da tela
 * da proposta.
 *
 * Um componente só porque o rótulo, o `accept` e o eco do que foi escolhido são
 * o mesmo contrato de UI — duas cópias divergiriam no `accept`, que é o que
 * separa a FAP (só PDF) das fotos (PDF, PNG ou JPEG) para quem está anexando.
 */
export function FapEFotosFields({
  fapFile,
  fotos,
  onFap,
  onFotos,
}: {
  fapFile: File | null;
  fotos: readonly File[];
  onFap: (file: File | null) => void;
  onFotos: (files: File[]) => void;
}) {
  return (
    <>
      <div className="mt-3.5">
        <FieldLabel htmlFor="dm-fap-file" size="caption">
          FAP (Ficha de Avaliação de Ponto)
        </FieldLabel>
        <FileDrop
          id="dm-fap-file"
          accept="application/pdf"
          label="Anexar FAP (PDF)"
          onFiles={(files) => onFap(files[0] ?? null)}
        />
        {fapFile !== null && (
          <p className="mt-2 text-[14px] font-bold text-(--secondary-700)">
            ✓ {fapFile.name}
          </p>
        )}
      </div>

      <div className="mt-3.5">
        <FieldLabel htmlFor="dm-fotos" size="caption">
          Fotos do ponto
        </FieldLabel>
        <FileDrop
          id="dm-fotos"
          accept={ACCEPT_POSTO_PHOTO}
          multiple
          label="Arraste as fotos aqui ou clique para selecionar"
          sublabel="Fachada, ponto e entorno · PDF, PNG ou JPEG"
          onFiles={onFotos}
        />
        {fotos.length > 0 && (
          <p className="mt-2 text-[14px] font-bold text-(--secondary-700)">
            {fotos.length} foto(s) anexada(s)
          </p>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// "FAP e potencial do ponto" modal (só a tela da proposta)
// ---------------------------------------------------------------------------

/**
 * Na tela de CRIAÇÃO estes três campos vivem dentro do {@link DadosModal},
 * como no protótipo. Na tela da PROPOSTA eles têm card próprio (FRQ-14: três
 * caminhos de escrita independentes, e o analista sinaliza só eles), então
 * precisam do próprio modal — mas dos MESMOS campos, e é por isso que a parte
 * de anexos é o {@link FapEFotosFields} compartilhado.
 */
export function FapPotencialModal({
  potencial,
  salvando = false,
  error,
  onCancel,
  onSave,
}: {
  /** pt-BR masked money — `''` quando não respondido. */
  potencial: string;
  salvando?: boolean;
  /** Mensagem de erro a exibir dentro do modal após falha no save. */
  error?: string | null;
  onCancel: () => void;
  onSave: (value: {
    potencial: string;
    fapFile: File | null;
    fotos: File[];
  }) => void;
}) {
  const [valor, setValor] = useState(potencial);
  const [fapFile, setFapFile] = useState<File | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);

  return (
    <Modal
      title="FAP e potencial do ponto"
      onCancel={onCancel}
      onSubmit={() => onSave({ potencial: valor, fapFile, fotos })}
      submitDisabled={salvando}
      submitLabel={salvando ? 'Salvando…' : 'Salvar'}
      error={error}
      errorTestId="fap-erro"
      testId="modal-fap"
    >
      <div>
        <FieldLabel htmlFor="fm-potencial" size="caption">
          Potencial de franquia (R$) - FAP
        </FieldLabel>
        <input
          id="fm-potencial"
          data-testid="fm-potencial"
          type="text"
          inputMode="numeric"
          placeholder="R$ 0,00"
          className={controlClass()}
          value={valor}
          onChange={(e) => setValor(maskMoneyInput(e.target.value))}
        />
        {/* O limite que decide o parecer é parametrizado (J10) e vive no
            backend — nenhum número é antecipado aqui (RN-F4-02). */}
        <p className="mt-1 text-(length:--t-small) text-(--color-text-muted)">
          É ele que decide se o parecer antecipado do time de franquia é exigido.
        </p>
      </div>

      {/* Anexar é ACRESCENTAR: o que já está gravado continua no card, e é lá
          que se remove. Um modal que também removesse duplicaria a ação. */}
      <FapEFotosFields
        fapFile={fapFile}
        fotos={fotos}
        onFap={setFapFile}
        onFotos={(files) => setFotos((prev) => [...prev, ...files])}
      />
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// "Modelo de loja e royalties" modal
// ---------------------------------------------------------------------------

export function ModeloModal({
  bandeira,
  modelo,
  getValidacoes,
  salvando = false,
  error,
  onCancel,
  onSave,
}: {
  bandeira: BandeiraFranquia;
  modelo: ModeloRascunho;
  /** Reads the fee parametrization for this bandeira × formato (67575 / 67594). */
  getValidacoes: typeof defaultGetValidacoes;
  /** Trava "Salvar" enquanto a gravação está em voo (tela da proposta). */
  salvando?: boolean;
  /** Mensagem de erro a exibir dentro do modal após falha no save. */
  error?: string | null;
  onCancel: () => void;
  onSave: (value: ModeloRascunho) => void;
}) {
  /*
   * Seeded exactly as the prototype's `#modModal` opens: `#mm-parc` on `1` and
   * `#mm-modelo` on its first option (that select carries no placeholder).
   *
   * The royalty-model default is a product decision, taken after the trade-off
   * was raised: it is what the franchise business charges by default, and the
   * prototype states it. It follows the band AND the store format instead of
   * always seeding "Por categoria", which the API refuses for ZLUB (22/09/2026)
   * and for `PONTO`/`SUPER_COMPACTA` (28/08/2026) — see
   * `modelosRoyaltyParaFormato`.
   *
   * The seeding happens on the modal's OWN form, never on the draft — so the
   * card keeps its empty state until the user presses "Salvar", and nothing is
   * persisted for a modal that was only opened.
   */
  const [form, setForm] = useState<ModeloRascunho>(() => {
    /*
     * ADO 67592 — Lubrax+ tem um formato só (`PADRAO`), então o campo nasce
     * selecionado. Com mais de um, segue no placeholder: a regra geral do repo
     * é que valor de picklist não nasce escolhido, e ela existe para o caso em
     * que a escolha é ambígua — com opção única não há ambiguidade a proteger.
     */
    const formatoLoja =
      modelo.formatoLoja === ''
        ? formatoLojaPadraoDaBandeira(bandeira)
        : modelo.formatoLoja;

    return {
      ...modelo,
      parcelas: modelo.parcelas === '' ? '1' : modelo.parcelas,
      formatoLoja,
      /*
       * Um modelo JÁ GRAVADO é preservado mesmo quando o formato de hoje não o
       * oferece mais (ver o select abaixo): reescrevê-lo na abertura trocaria a
       * política de royalty de uma proposta negociada sem ninguém pedir.
       */
      /*
       * ⚠️ Exceção: o modelo IMPOSTO pela bandeira (Lubrax+ → Percentual fixo,
       * 22/09/2026) vence o gravado. Não há o que preservar — o negócio tirou a
       * escolha, e manter o `VALOR_FIXO` antigo num select travado deixaria o
       * "Salvar" sem saída.
       */
      modeloRoyalty:
        modeloRoyaltyImpostoPelaBandeira(bandeira) ??
        (modelo.modeloRoyalty === ''
          ? modeloRoyaltyPadraoDoFormato(bandeira, formatoLoja)
          : modelo.modeloRoyalty),
    };
  });

  const modeloImposto = modeloRoyaltyImpostoPelaBandeira(bandeira);

  const set = <K extends keyof ModeloRascunho>(
    key: K,
    value: ModeloRascunho[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  /*
   * Trocar o formato pode invalidar a política escolhida (`PONTO` e
   * `SUPER_COMPACTA` aceitam só `PERCENTUAL_UNICO`), então o modelo de royalty
   * cai para o default do formato novo.
   *
   * Sem isso o `<select>` renderizaria a primeira opção enquanto `form` ainda
   * guardaria a política antiga — tela e estado discordando, e o "Salvar"
   * mandando ao backend o que a tela não mostra, para levar 400. Um formato que
   * segue aceitando a política atual não mexe em nada.
   */
  const trocarFormato = (formatoLoja: ModeloRascunho['formatoLoja']) =>
    setForm((prev) => {
      const aceitos = modelosRoyaltyParaFormato(bandeira, formatoLoja);
      return {
        ...prev,
        formatoLoja,
        modeloRoyalty:
          prev.modeloRoyalty !== '' && aceitos.includes(prev.modeloRoyalty)
            ? prev.modeloRoyalty
            : modeloRoyaltyPadraoDoFormato(bandeira, formatoLoja),
      };
    });

  const modelosDisponiveis = modelosRoyaltyParaFormato(
    bandeira,
    form.formatoLoja,
  );
  /*
   * `isKnown` × `isSelectable`: uma proposta gravada antes desta regra pode
   * carregar `PONTO` + `Por categoria`. O valor continua na lista, senão o
   * select nativo exibiria a primeira opção — o que LÊ como resposta, e o
   * "Salvar" trocaria a política em silêncio. Quem recusa é o backend, com uma
   * frase que nomeia as políticas aceitas; a nota abaixo antecipa isso.
   */
  const modeloForaDaOferta =
    form.modeloRoyalty !== '' && !modelosDisponiveis.includes(form.modeloRoyalty)
      ? form.modeloRoyalty
      : null;

  /*
   * The franchise fee and the instalment ceiling are parametrized per bandeira ×
   * formato de loja (Bugs 67575 / 67594): BR Mania `PADRAO` R$ 55.000 / 10x,
   * `PONTO` and `SUPER_COMPACTA` R$ 20.000 / 5x, Lubrax+ R$ 24.000 / 6x. Both
   * are read from the backend — the fee, so the field opens pre-filled instead
   * of empty (`R$ 0,00` on screen); the ceiling, so the hint here says the same
   * number the save will enforce.
   */
  const [parametros, setParametros] = useState<RoyaltyPolicyValidacoes | null>(null);

  /*
   * Latest fee and its provenance, read by the effect below WITHOUT entering its
   * dependency list. Depending on the field would re-ask the backend on every
   * keystroke; depending on the flag would fire a second request right after the
   * effect set it, for the same bandeira and formato.
   *
   * The flag lives in the draft (not only here) because it is what the replay
   * reads to decide whether to send the fee at all.
   */
  const taxaAtual = useRef({
    valor: form.taxaFranquia,
    doParametro: form.taxaFranquiaDoParametro,
  });
  taxaAtual.current = {
    valor: form.taxaFranquia,
    doParametro: form.taxaFranquiaDoParametro,
  };

  useEffect(() => {
    let cancelled = false;
    void getValidacoes(bandeira, form.formatoLoja === '' ? null : form.formatoLoja)
      .then((resposta) => {
        if (cancelled) return;
        setParametros(resposta);

        const taxaDefault = resposta?.taxaFranquiaDefaultBrl ?? null;
        if (taxaDefault === null) return;

        /*
         * Replace only a fee this component pre-filled, or an empty field. A
         * typed value is the negotiated one; overwriting it on a formato change
         * would silently replace a commercial commitment.
         */
        const { valor, doParametro } = taxaAtual.current;
        if (valor !== '' && !doParametro) return;

        const mascarada = maskMoneyInput(
          String(Math.round(Number(taxaDefault) * 100)),
        );
        if (valor === mascarada && doParametro) return;

        setForm((prev) => ({
          ...prev,
          taxaFranquia: mascarada,
          taxaFranquiaDoParametro: true,
        }));
      })
      .catch(() => {
        // The injected reader may reject even though the real client swallows —
        // the hint is a courtesy and the backend still enforces the rule on save.
        if (!cancelled) setParametros(null);
      });
    return () => {
      cancelled = true;
    };
  }, [getValidacoes, bandeira, form.formatoLoja]);

  /*
   * The prototype's `#modModal` rows, in its order: formato × modelo de royalty,
   * the conditional "Valor fixo (R$)", taxa × parcelas, maturação.
   *
   * "Modelo de negócio" is the one field it does not have, and it leads in a row
   * of its own so every prototype pairing below stays intact. It is here because
   * the backend lists it in `pendenciasEnvio` ("Modelo de negócio não
   * informado") — a proposal created without it cannot be sent to analysis, and
   * the creation screen would be handing the user a dead end. It is NOT required
   * to save: since 13/08/2026 it no longer resolves the Anexo A band.
   */
  return (
    <Modal
      title="Modelo de loja e royalties"
      onCancel={onCancel}
      onSubmit={() => onSave(form)}
      submitDisabled={salvando}
      submitLabel={salvando ? 'Salvando…' : 'Salvar'}
      error={error}
      errorTestId="modelo-erro"
      testId="modal-modelo"
    >
      <FGrid cols={2}>
        <div>
          <FieldLabel htmlFor="mm-negocio" size="caption">
            Modelo de negócio
          </FieldLabel>
          <Select
            id="mm-negocio"
            data-testid="mm-negocio"
            value={form.modeloNegocio}
            onChange={(v) =>
              set('modeloNegocio', v as ModeloRascunho['modeloNegocio'])
            }
            options={Object.entries(MODELO_NEGOCIO_LABEL).map(
              ([value, label]) => ({ value, label }),
            )}
            placeholder="Selecione…"
          />
        </div>
      </FGrid>

      <div className="mt-3.5">
      <FGrid cols={2}>
          <div>
            <FieldLabel htmlFor="mm-formato" size="caption">
              Formato de loja
            </FieldLabel>
            {/* ADO 67592 — só os formatos que a bandeira aceita. O backend
                recusa os demais com 400, e o formato é a chave da taxa e da
                faixa do Anexo A: oferecer um que não se aplica levaria o
                usuário a um cadastro que falha no fim do fluxo. */}
            <Select
              id="mm-formato"
              data-testid="mm-formato"
              value={form.formatoLoja}
              onChange={(v) => trocarFormato(v as ModeloRascunho['formatoLoja'])}
              options={[
                ...formatosLojaParaBandeira(bandeira),
                /* isKnown × isSelectable: um formato JÁ GRAVADO fora da lista
                   da bandeira continua na oferta, senão o select cairia no
                   placeholder e leria como "nunca respondido" — e o Salvar
                   apagaria a resposta. Acontece na tela da proposta, que abre
                   linhas antigas; na criação a lista nasce vazia. */
                ...(form.formatoLoja !== '' &&
                !formatosLojaParaBandeira(bandeira).includes(form.formatoLoja)
                  ? [form.formatoLoja]
                  : []),
              ].map((value) => ({
                value,
                label: FORMATO_LOJA_LABEL[value],
              }))}
              placeholder="Selecione…"
            />
          </div>
          <div>
            <FieldLabel htmlFor="mm-royalty" size="caption">
              Modelo de royalty
            </FieldLabel>
            {/*
             * No placeholder: the prototype's `#mm-modelo` offers only the models
             * themselves and opens on the first one (see the seeding above).
             * Lubrax+ has exactly one (`PERCENTUAL_FIXO`, 22/09/2026, and the
             * select is locked), e `PONTO`/`SUPER_COMPACTA` também —
             * `PERCENTUAL_UNICO` (28/08/2026).
             */}
            <Select
              id="mm-royalty"
              data-testid="mm-royalty"
              value={form.modeloRoyalty}
              /* Lubrax+: "sem possibilidade de alteração" (22/09/2026). */
              disabled={modeloImposto !== null}
              onChange={(v) =>
                set('modeloRoyalty', v as ModeloRascunho['modeloRoyalty'])
              }
              options={[
                ...modelosDisponiveis,
                ...(modeloForaDaOferta === null ? [] : [modeloForaDaOferta]),
              ].map((value) => ({
                value,
                label: MODELO_ROYALTY_LABEL[value],
              }))}
            />
            {/*
             * A oferta estreitou depois desta proposta ter sido gravada. Sem a
             * frase, o usuário só descobre no 400 do "Salvar" — e a nota diz o
             * conserto, que é escolher uma das políticas aceitas.
             *
             * Atenção, não falha: nada quebrou, e o valor gravado continua
             * valendo enquanto ninguém regravar o modelo.
             */}
            {/*
             * O percentual e o mínimo NÃO são repetidos aqui: são do backend
             * (`royalty-percentual-fixo.ts`), e uma cópia na tela divergiria no
             * dia em que a política mudar. O card mostra os dois depois de salvar.
             */}
            {modeloImposto !== null && (
              <p
                className="mt-1 text-[12px] text-(--color-text-muted)"
                data-testid="mm-royalty-imposto"
              >
                Definido pela política da bandeira: o percentual sobre o
                faturamento e o mínimo mensal seguem o modelo de negócio.
              </p>
            )}
            {modeloForaDaOferta !== null && (
              <p
                className="mt-1 text-[12px] text-(--yellow-700)"
                data-testid="mm-royalty-fora-da-oferta"
              >
                {MODELO_ROYALTY_LABEL[modeloForaDaOferta]} não se aplica ao
                formato{' '}
                {form.formatoLoja === ''
                  ? 'selecionado'
                  : FORMATO_LOJA_LABEL[form.formatoLoja]}
                . Escolha{' '}
                {modelosDisponiveis
                  .map((m) => MODELO_ROYALTY_LABEL[m])
                  .join(', ')}{' '}
                para salvar.
              </p>
            )}
          </div>
      </FGrid>
      </div>

      {/*
       * ⚠️ **O "Valor fixo (R$)" saiu deste modal (ADO 67867).**
       *
       * Ele era o `#mm-valwrap` do protótipo e o único LIMITE que o modal
       * oferecia; os seis patamares passaram a ser parametrização por bandeira,
       * mantida em Parametrização de Franquias → Estrutura de Royalties, pelo BP
       * Financeiro, SNEG, TI Administrador ou Gestor de Franquias.
       *
       * O `valorFixoBrl` da faixa do Anexo A continua sendo aplicado por
       * `setModeloLoja` — o que deixou de existir é o campo aberto na proposta.
       * Não reintroduzir aqui: era ele que, para Lubrax+ (cujo único modelo era
       * `VALOR_FIXO` até 22/09/2026), aparecia em toda criação.
       */}

      {/*
       * Taxa, parcelas and maturação are NOT the franchise team's: PRD F2 lists
       * them under "modelo e parâmetros" with `Edit. = Sim`, and only the limits
       * (royalty mínimo, fundo de mkt mínimo, piso/teto) and the exceções carry
       * `Sim (time franquia)`. They were hidden because the backend happens to
       * put taxa on the same `PUT .../royalty` endpoint as the limits — an
       * implementation detail that had turned into a rule on screen, leaving the
       * LT with 3 of the prototype's 6 fields.
       *
       * The draft still posts them, so a 403 is reported by name instead of the
       * answers being silently dropped.
       */}
      <>
          <div className="mt-3.5">
            <FGrid cols={2}>
              <div>
                <FieldLabel htmlFor="mm-taxa" size="caption">
                  Taxa de franquia (R$)
                </FieldLabel>
                <input
                  id="mm-taxa"
                  data-testid="mm-taxa"
                  type="text"
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                  className={controlClass()}
                  value={form.taxaFranquia}
                  onChange={(e) =>
                    // Typing makes the fee the user's answer, so it stops being
                    // the parametrized default and the replay sends it.
                    setForm((prev) => ({
                      ...prev,
                      taxaFranquia: maskMoneyInput(e.target.value),
                      taxaFranquiaDoParametro: false,
                    }))
                  }
                />
              </div>
              <div>
                <FieldLabel htmlFor="mm-parc" size="caption">
                  Nº de parcelas da taxa
                </FieldLabel>
                <input
                  id="mm-parc"
                  data-testid="mm-parc"
                  type="number"
                  min={1}
                  max={parametros?.maxParcelasTaxa ?? undefined}
                  className={controlClass()}
                  value={form.parcelas}
                  onChange={(e) => set('parcelas', e.target.value)}
                />
                {/*
                 * The limit belongs to the backend and is enforced on save — no
                 * local "máximo 10" is invented here (RN-F2-04). It is shown so
                 * the user is not refused after the fact; `TETO_GLOBAL` says the
                 * number is the band's loosest ceiling, because this combination
                 * has no row of its own.
                 */}
                {parametros?.maxParcelasTaxa != null && (
                  <p
                    className="mt-1 text-[12px] text-(--color-text-muted)"
                    data-testid="mm-parc-limite"
                  >
                    {parametros.origemLimite === 'TETO_GLOBAL'
                      ? `Máximo geral: ${parametros.maxParcelasTaxa} — esta combinação de bandeira e formato de loja ainda não tem parametrização própria`
                      : `Máximo pela política: ${parametros.maxParcelasTaxa}`}
                  </p>
                )}
                {/*
                 * Fonte fora do ar ⇒ a lacuna é NOMEADA, nunca uma dica ausente:
                 * sem isto o campo fica idêntico ao de uma política sem teto, e
                 * o usuário só descobre o limite quando o save é recusado.
                 * Inventar um número aqui é a outra metade proibida da RN-F2-04.
                 */}
                {parametros === null && (
                  <p
                    className="mt-1 text-[12px] text-(--color-text-muted)"
                    data-testid="mm-parc-limite-indisponivel"
                  >
                    Limite de parcelas indisponível — a parametrização não pôde
                    ser consultada.
                  </p>
                )}
              </div>
            </FGrid>
          </div>

          {/*
           * ADO 68495 — "Isenção de Taxa de Franquia?".
           *
           * Fica ao lado da taxa porque é atributo dela, como no org (seção
           * "Taxa da Franquia" do `Franquias_Da_Cotacao__c`). Nasce no
           * placeholder: é picklist de duas respostas com consequência
           * financeira, e um default seria indistinguível de uma escolha.
           */}
          <div className="mt-3.5">
            <FGrid cols={2}>
              <div>
                <FieldLabel htmlFor="mm-isencao" size="caption">
                  Isenção de taxa de franquia
                </FieldLabel>
                <Select
                  id="mm-isencao"
                  data-testid="mm-isencao"
                  value={form.isencaoTaxa}
                  onChange={(v) => set('isencaoTaxa', v as SimNao)}
                  options={[
                    { value: 'sim', label: 'Sim' },
                    { value: 'nao', label: 'Não' },
                  ]}
                  placeholder="Selecione…"
                />
                <p
                  className="mt-1 text-[12px] text-(--color-text-muted)"
                  data-testid="mm-isencao-dica"
                >
                  É a marcação que o SAP/SD usa para cobrar a taxa do
                  franqueado — sem ela a oportunidade não é enviada à análise.
                </p>
              </div>
            </FGrid>
          </div>

          <div className="mt-3.5">
            <FGrid cols={2}>
              <div>
                <FieldLabel htmlFor="mm-matur" size="caption">
                  Loja maturada
                </FieldLabel>
                <Select
                  id="mm-matur"
                  data-testid="mm-matur"
                  value={form.maturada}
                  onChange={(v) => set('maturada', v as SimNao)}
                  options={[
                    { value: 'sim', label: 'Maturada' },
                    { value: 'nao', label: 'Não Maturada' },
                  ]}
                  placeholder="Selecione…"
                />
              </div>
              <div>
                <FieldLabel htmlFor="mm-periodo" size="caption">
                  Período de maturação
                </FieldLabel>
                {/*
                 * Free text with the prototype's own hint: PRD F2 types this
                 * field as "Número / Data" and leaves the unit open, so a
                 * `type="number"` box would silently drop "12 meses". The digits
                 * are extracted on save (`Number.parseInt`), and a value with no
                 * digits is simply not sent.
                 */}
                <input
                  id="mm-periodo"
                  data-testid="mm-periodo"
                  type="text"
                  placeholder="ex.: 12 meses"
                  className={controlClass()}
                  value={form.periodoMaturacaoMeses}
                  onChange={(e) => set('periodoMaturacaoMeses', e.target.value)}
                />
              </div>
            </FGrid>
          </div>
        </>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// "Exceções Programadas" modal
// ---------------------------------------------------------------------------

export function ExcecaoModal({
  bandeira,
  excecao,
  salvando = false,
  error,
  onCancel,
  onSave,
}: {
  /**
   * `null` ⇒ o read model ainda não resolveu a bandeira. Aí são oferecidos
   * todos os tipos OFERECÍVEIS e o backend segue como autoridade: esconder
   * opção por leitura incompleta é pior que deixar a API recusar. O que não é
   * oferecível em bandeira nenhuma (`CESSAO`) fica fora nos dois caminhos,
   * porque isso não é regra de bandeira.
   */
  bandeira: BandeiraFranquia | null;
  /** `null` ⇒ adding a new one. */
  excecao: ExcecaoRascunho | null;
  /** Trava "Adicionar" enquanto o POST está em voo (tela da proposta). */
  salvando?: boolean;
  /** Mensagem de erro a exibir dentro do modal após falha no save. */
  error?: string | null;
  onCancel: () => void;
  onSave: (value: ExcecaoRascunho) => void;
}) {
  const tipos =
    bandeira === null
      ? EXCECAO_TIPOS_OFERECIDOS
      : excecaoTiposParaBandeira(bandeira);
  const [form, setForm] = useState<ExcecaoRascunho>(
    excecao ?? {
      tipo: tipos[0],
      motivo: '',
      todoContrato: false,
      inicio: '',
      fim: '',
      valor: '',
    },
  );

  const set = <K extends keyof ExcecaoRascunho>(
    key: K,
    value: ExcecaoRascunho[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal
      title={excecao === null ? 'Adicionar exceção' : 'Editar exceção'}
      submitLabel={excecao === null ? 'Adicionar' : 'Salvar'}
      onCancel={onCancel}
      onSubmit={() => onSave({ ...form, motivo: form.motivo.trim() })}
      /* The reason is mandatory on the API (SOX) — refusing here shows the rule
         where the user can act on it instead of after the POST. */
      submitDisabled={form.motivo.trim() === '' || salvando}
      error={error}
      errorTestId="excecao-erro"
      testId="modal-excecao"
    >
      <div>
        <FieldLabel htmlFor="ex-tipo" size="caption">
          Tipo de exceção
        </FieldLabel>
        <Select
          id="ex-tipo"
          data-testid="ex-tipo"
          value={form.tipo}
          onChange={(v) => set('tipo', v as ExcecaoTipo)}
          options={tipos.map((tipo) => ({
            value: tipo,
            label: EXCECAO_TIPO_LABEL[tipo],
          }))}
        />
      </div>

      {/* Prototype `excFields()`: Motivo · Por todo o contrato? → [valor] →
          Início · Término, all inside one `.fgrid c2`. */}
      <div className="mt-3.5">
        <FGrid cols={2}>
          <div>
            <FieldLabel htmlFor="ex-motivo" size="caption" required>
              Motivo
            </FieldLabel>
            <input
              id="ex-motivo"
              data-testid="ex-motivo"
              type="text"
              placeholder="Descreva o motivo"
              className={controlClass()}
              value={form.motivo}
              onChange={(e) => set('motivo', e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ex-todo-contrato" size="caption">
              Por todo o contrato?
            </FieldLabel>
            {/*
             * "Sim" is an OPEN-ENDED vigência — the backend models it as a null
             * end date, not as a flag, so choosing it clears and locks "Término".
             */}
            <Select
              id="ex-todo-contrato"
              data-testid="ex-todo-contrato"
              value={form.todoContrato ? 'sim' : 'nao'}
              onChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  todoContrato: v === 'sim',
                  fim: v === 'sim' ? '' : prev.fim,
                }))
              }
              options={[
                { value: 'nao', label: 'Não' },
                { value: 'sim', label: 'Sim' },
              ]}
            />
          </div>
          {excecaoTemValor(form.tipo) && (
            <div>
              <FieldLabel htmlFor="ex-valor" size="caption">
                Teto máximo (R$)
              </FieldLabel>
              <input
                id="ex-valor"
                data-testid="ex-valor"
                type="text"
                inputMode="numeric"
                placeholder="R$ 0,00"
                className={controlClass()}
                value={form.valor}
                onChange={(e) => set('valor', maskMoneyInput(e.target.value))}
              />
            </div>
          )}
          <div>
            <FieldLabel htmlFor="ex-inicio" size="caption">
              Início
            </FieldLabel>
            <input
              id="ex-inicio"
              data-testid="ex-inicio"
              type="date"
              className={controlClass()}
              value={form.inicio}
              onChange={(e) => set('inicio', e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ex-fim" size="caption">
              Término
            </FieldLabel>
            <input
              id="ex-fim"
              data-testid="ex-fim"
              type="date"
              className={controlClass()}
              disabled={form.todoContrato}
              value={form.fim}
              onChange={(e) => set('fim', e.target.value)}
            />
          </div>
        </FGrid>
      </div>
    </Modal>
  );
}

/** Prototype `excResumo()` — one line summarising a scheduled exception. */
export function resumoExcecao(excecao: ExcecaoRascunho): string {
  const partes: string[] = [];
  if (excecaoTemValor(excecao.tipo) && excecao.valor !== '') {
    partes.push(`R$ ${excecao.valor}`);
  }
  if (excecao.motivo !== '') partes.push(excecao.motivo);
  if (excecao.todoContrato) {
    partes.push('por todo o contrato');
  } else if (excecao.inicio !== '' || excecao.fim !== '') {
    partes.push(
      `${formatDateBR(excecao.inicio) ?? 'Retroativa'} → ${formatDateBR(excecao.fim) ?? '—'}`,
    );
  }
  return partes.length === 0 ? '—' : partes.join(' · ');
}

// ---------------------------------------------------------------------------
// "Parecer antecipado" modal (só a tela da proposta)
// ---------------------------------------------------------------------------

/**
 * O protótipo não tem este bloco — ele nasce da RN-F4-02/RN-F6-02 —, então não
 * há modelo dele a copiar. O que se copia é o MODELO DE PREENCHIMENTO da tela:
 * a grade mostra o parecer como dado e o registro acontece num modal, como
 * todos os outros cards desta tela passaram a fazer.
 *
 * ## Uma decisão, não três botões
 *
 * Os três verbos (aprovar · aprovar com ressalvas · rejeitar) viravam três
 * botões de submit lado a lado. Aqui são um `Select` de **Decisão** com um
 * "Registrar parecer" — o mesmo par (picklist + Salvar) que os outros modais
 * usam, e o que torna a decisão explícita antes do clique final.
 *
 * A justificativa é obrigatória para ressalvas e rejeição (RN-F6-03) e é
 * **recusada na porta**, não depois do POST — mesma escolha do modal de
 * exceção. A frase do backend continua sendo a autoridade se algo mais faltar.
 */
export function ParecerModal({
  salvando = false,
  error,
  onCancel,
  onSave,
  podeRejeitar = true,
}: {
  salvando?: boolean;
  /**
   * `false` tira "Rejeitar" da decisão — o Consultor de Expansão aprova, mas não
   * rejeita (Graziella, 28/09/2026 · ADO 68191; Matriz RBAC v2.1 "Rejeitar /
   * devolver" = "—" para ele). Espelha `FRANQUIA_PARECER_REJEITAR_ROLES`.
   */
  podeRejeitar?: boolean;
  /** Mensagem de erro a exibir dentro do modal após falha no save. */
  error?: string | null;
  onCancel: () => void;
  onSave: (value: { acao: ParecerDecisao; texto: string | null }) => void;
}) {
  const [acao, setAcao] = useState<ParecerDecisao>('aprovar');
  const [texto, setTexto] = useState('');

  const limpo = texto.trim();
  const exigeTexto = acao !== 'aprovar';
  const invalido = exigeTexto && limpo === '';

  return (
    <Modal
      title="Parecer antecipado do time de franquias"
      submitLabel={salvando ? 'Registrando…' : 'Registrar parecer'}
      onCancel={onCancel}
      onSubmit={() => onSave({ acao, texto: limpo === '' ? null : limpo })}
      submitDisabled={invalido || salvando}
      error={error}
      errorTestId="parecer-erro"
      testId="modal-parecer"
    >
      <div>
        <FieldLabel htmlFor="pm-acao" size="caption">
          Decisão
        </FieldLabel>
        <Select
          id="pm-acao"
          data-testid="pm-acao"
          value={acao}
          onChange={(v) => setAcao(v as ParecerDecisao)}
          options={[
            { value: 'aprovar', label: 'Aprovar' },
            { value: 'aprovar-com-ressalvas', label: 'Aprovar com ressalvas' },
            ...(podeRejeitar ? [{ value: 'rejeitar', label: 'Rejeitar' }] : []),
          ]}
        />
      </div>

      <div className="mt-3.5">
        <FieldLabel htmlFor="pm-texto" size="caption" required={exigeTexto}>
          Justificativa {exigeTexto ? '' : '(opcional para aprovação)'}
        </FieldLabel>
        <textarea
          id="pm-texto"
          data-testid="pm-texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ex.: potencial validado em visita; ressalva sobre o mix de categorias…"
          className="min-h-[90px] w-full resize-y rounded-[var(--radius-xs)] border border-(--color-border-strong) px-3 py-2.5 text-(length:--t-caption)"
        />
      </div>
    </Modal>
  );
}

/** Os três verbos de DECISÃO — `recall` é do LT e não passa por este modal. */
export type ParecerDecisao = 'aprovar' | 'aprovar-com-ressalvas' | 'rejeitar';

