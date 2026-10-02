/**
 * Os repetidores de **matrícula** e de **laudo** da garantia (HIP-01/02/03).
 *
 * ## O conceito, e por que os dois são o mesmo
 *
 * Pedido do negócio em 01/09/2026: *"usar o mesmo conceito de '+ Adicionar
 * matrícula' também para laudos"*, e cada linha tem de ser **um bloco fechado**
 * — a matrícula é (número + anexo), e aquele anexo é a certidão de inteiro teor
 * DAQUELA matrícula; o laudo é o mesmo bloco sem o número.
 *
 * Antes disto os dois viviam separados e mentiam sobre o modelo:
 *
 * - a **certidão** era UM slot fixo por garantia, embora HIP-03 e o banco
 *   (`opportunity_document_links.guarantee_registry_id`, migration `…128`) já a
 *   modelassem por matrícula. Com três matrículas, o formulário oferecia um
 *   anexo e o gate cobrava três — sem nenhum lugar onde anexar os outros dois;
 * - o **laudo** era um campo NUMÉRICO ("quantidade de laudos") mais um slot
 *   fixo. Declarar 3 e poder anexar 1 é a mesma armadilha na outra ponta.
 *
 * ## Um componente, dois formulários
 *
 * O card da 01b (`garantias-indicadas-card`) e o ticket de pendência
 * (`pendencia-ticket`) pedem os MESMOS campos, e já divergiram uma vez por
 * cópia — é a razão pela qual as modais de franquia foram extraídas
 * (`proposta-franquia-modais`). `matriculas-laudos-compartilhados.test.ts` falha
 * o build se um dos dois redeclarar o bloco localmente.
 *
 * ## O que estes componentes NÃO fazem
 *
 * Não sobem arquivo. Eles coletam a escolha (`File`), e quem sobe é o formulário
 * — em ambos os casos **depois** de a garantia existir, porque é ela que dá ao
 * documento uma garantia a que pertencer (spec 28/08/2026 §4.3). Nos dois
 * formulários o upload usa a rota TIPADA com `matriculaOrdem`, que é o que
 * escopa o `single` a `(garantia, matrícula)`.
 */
'use client';

import { SECONDARY_OUTLINE_BTN } from '@/components/button';
import {
  ACEITOS_DOCUMENTO_GARANTIA,
  MAX_LAUDOS,
  MAX_MATRICULAS,
} from '@/lib/garantia/constants';

/**
 * Estilo de reserva do input de número da matrícula.
 *
 * ⚠️ **É reserva, não o padrão.** Os dois formulários que montam este componente
 * têm estilos de campo DIFERENTES — o card da 01b usa fundo `--neutral-40` com
 * borda inferior grossa (protótipo `.in`), o ticket usa caixa com borda inteira
 * e anel de foco — e este componente não tem como saber em qual está. Cada um
 * passa o seu por `inputClassName`.
 *
 * Sem isso o campo "Matrícula 1" saía com um estilo TERCEIRO, que não era o de
 * nenhuma das duas telas: reportado em 02/09/2026 comparando-o ao campo
 * "Imóvel / bem" logo acima, no mesmo formulário.
 */
const IN_CLASS_FALLBACK =
  'w-full border-0 border-b border-(--color-border) bg-transparent px-0 py-2 text-(length:--t-body) outline-none focus:border-(--secondary-500)';

const LABEL_FONT = 'text-(length:--t-caption) font-bold text-(--color-text-muted)';

/** Botão-fantasma verde do protótipo (`.btn-ghost`), usado no "Anexar". */
const ANEXAR_BTN =
  'inline-flex items-center gap-1 rounded-[var(--radius-xs)] border border-(--secondary-600) px-2.5 py-1 text-(length:--t-caption) font-bold text-(--secondary-600)';

/**
 * Tipos aceitos nos dois anexos — reexporta a regra UNIFORME do catálogo
 * (PDF/PNG/JPEG/Word, migration `…138`).
 *
 * Reexport e não uma segunda string: a certidão e o laudo seguem a mesma regra
 * que todo documento de garantia, e uma cópia aqui divergiria no dia em que a
 * regra mudar — que é exatamente o que produziu o erro da minuta em 02/09/2026.
 */
export const ACEITOS = ACEITOS_DOCUMENTO_GARANTIA;

/**
 * Uma matrícula no formulário (HIP-01/HIP-03).
 *
 * `certidaoAnexada` é o veredito do BACKEND (`matriculas[].certidaoAnexada`),
 * nunca derivado aqui: a regra inclui a certidão sem vínculo contando para a
 * matrícula única (garantias documentadas antes de HIP-03), e uma segunda
 * implementação divergiria exatamente ali.
 *
 * `certidaoFile` é a escolha desta sessão, ainda não enviada. Os dois podem
 * coexistir — trocar o arquivo de uma matrícula que já tem certidão é
 * substituição, e é o `single` escopado que a torna possível.
 */
export interface MatriculaBloco {
  numero: string;
  certidaoFile: File | null;
  certidaoAnexada: boolean;
}

/**
 * Um laudo no formulário (HIP-02).
 *
 * Não tem número nem identidade própria: o bloco É o anexo. A QUANTIDADE de
 * blocos é o que viaja como `quantidadeLaudos`, e `anexado` diz se o laudo
 * daquela posição já chegou.
 *
 * ⚠️ A correspondência bloco ↔ documento é **posicional**: o backend guarda uma
 * contagem (`appraisal_report_count`) e N documentos `single: false` sem ordem,
 * então o bloco *k* representa o *k*-ésimo laudo anexado (a lista vem ordenada
 * por `linked_at`). O laudo continua sem identidade no DOMÍNIO — não ganhou
 * tabela filha, como a matrícula ganhou —, mas o bloco carrega o `documentoId`
 * daquele k-ésimo, porque é ele que a substituição precisa nomear.
 */
export interface LaudoBloco {
  file: File | null;
  anexado: boolean;
  /**
   * O documento que ocupa esta posição, quando há um.
   *
   * É o que faz "escolher outro arquivo no Laudo 1" SUBSTITUIR em vez de somar:
   * o tipo é `single: false` (HIP-02 — são N por garantia), então não existe slot
   * único para o backend resolver sozinho, e sem este id o upload anexava um
   * SEGUNDO laudo — o defeito relatado em 03/09/2026.
   *
   * `null` no bloco vazio (o "+ Adicionar laudo"), que é justamente o caso em
   * que somar é o comportamento certo — e também no laudo LEGADO, que não tem
   * documento do repositório a desvincular (ver {@link blocosDeLaudos}).
   */
  documentoId: string | null;
}

export const MATRICULA_BLOCO_VAZIO: MatriculaBloco = {
  numero: '',
  certidaoFile: null,
  certidaoAnexada: false,
};

export const LAUDO_BLOCO_VAZIO: LaudoBloco = { file: null, anexado: false, documentoId: null };

/**
 * A linha de anexo do protótipo (`.doc`): rótulo à esquerda, botão à direita.
 *
 * `✓ Anexado` cobre os dois casos — arquivo escolhido agora e documento que já
 * estava lá —, e o `<input>` continua clicável em ambos, porque trocar o arquivo
 * é substituição em lugar (o `single` escopado é o que a permite).
 */
/**
 * Uma linha de anexo: rótulo à esquerda, "Anexar"/"✓ Anexado" à direita.
 *
 * Exportada porque o repetidor de FIADORES a monta também (migration `…139` — a
 * certidão de casamento é uma por fiador). Uma segunda implementação divergiria
 * no detalhe que menos se nota e mais custa: o `e.target.value = ''`, sem o qual
 * reescolher o MESMO arquivo depois de um erro de upload não dispara `change`.
 */
export function LinhaAnexo({
  rotulo,
  arquivo,
  anexado,
  onPick,
  disabled,
  testId,
}: {
  rotulo: string;
  arquivo: File | null;
  anexado: boolean;
  onPick: (file: File) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const nome = arquivo?.name ?? null;
  const jaTem = nome !== null || anexado;

  return (
    <div
      data-testid={testId}
      className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2.5 text-(length:--t-caption)"
    >
      <span className="min-w-0">
        {rotulo}
        {nome && <span className="ml-1 truncate text-(--color-text-muted)">· {nome}</span>}
      </span>
      <label
        className={`${ANEXAR_BTN} shrink-0 ${
          disabled ? 'pointer-events-none opacity-40' : 'cursor-pointer'
        }`}
      >
        {jaTem ? '✓ Anexado' : 'Anexar'}
        <input
          type="file"
          accept={ACEITOS}
          className="sr-only"
          disabled={disabled}
          aria-label={rotulo}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onPick(file);
            // Permite reescolher o MESMO arquivo depois de um erro de upload:
            // sem isto o `change` não dispara na segunda vez.
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}

/** Cabeçalho de um bloco: "Matrícula 2" à esquerda, remoção à direita. */
function CabecalhoBloco({
  titulo,
  onRemove,
  removeLabel,
  disabled,
}: {
  titulo: string;
  onRemove?: () => void;
  removeLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className={LABEL_FONT}>{titulo}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          disabled={disabled}
          className="shrink-0 px-1 text-(length:--t-caption) text-(--color-text-muted) hover:text-(--color-danger) disabled:opacity-40"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * Moldura do bloco fechado — é ela que faz "número + anexo" ler como uma coisa.
 *
 * Fundo BRANCO (`--color-surface`), a pedido do produto em 01/09/2026: o
 * `--neutral-25` original dava ao bloco o mesmo cinza dos inputs do formulário,
 * e o conjunto lia como uma faixa acinzentada em vez de um cartão. Quem delimita
 * o bloco é a BORDA, não o preenchimento — mesmo tratamento dos cartões de
 * `garantia-detalhes-screen` e do modal do Documento de Suporte.
 */
const BLOCO_CLASS =
  'rounded-[var(--radius-sm)] border border-(--color-border) bg-(--color-surface) p-3';

/**
 * HIP-01/HIP-03 — as matrículas, uma por bloco, cada uma com a SUA certidão.
 *
 * Nunca renderiza zero blocos: `[]` recebido é tratado como um bloco vazio, o
 * mesmo motivo pelo qual a remoção desaparece com um só — um repetidor sem linha
 * não tem onde digitar, e o campo é obrigatório no tipo que o exibe.
 */
export function MatriculasBlocos({
  blocos,
  onChange,
  disabled,
  idPrefix = 'gar',
  inputClassName,
}: {
  blocos: MatriculaBloco[];
  onChange: (next: MatriculaBloco[]) => void;
  disabled?: boolean;
  /** Prefixo dos `id`/`data-testid` — os dois formulários coexistem na mesma app. */
  idPrefix?: string;
  /**
   * O estilo de campo DA TELA que monta o componente — o mesmo que os demais
   * inputs dela usam. Ver {@link IN_CLASS_FALLBACK}.
   */
  inputClassName?: string;
}) {
  const lista = blocos.length > 0 ? blocos : [MATRICULA_BLOCO_VAZIO];

  function atualizar(i: number, patch: Partial<MatriculaBloco>) {
    onChange(lista.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  }

  return (
    <div data-testid={`${idPrefix}-matriculas`}>
      <span className={`mb-1 block ${LABEL_FONT}`}>Matrículas</span>

      <div className="space-y-2.5">
        {lista.map((bloco, i) => (
          <div key={i} className={BLOCO_CLASS} data-testid={`${idPrefix}-matricula-${i + 1}`}>
            <CabecalhoBloco
              titulo={`Matrícula ${i + 1}`}
              removeLabel={`Remover matrícula ${i + 1}`}
              disabled={disabled}
              onRemove={
                lista.length > 1
                  ? () => onChange(lista.filter((_, j) => j !== i))
                  : undefined
              }
            />

            <input
              id={`${idPrefix}-matricula-numero-${i + 1}`}
              aria-label={`Número da matrícula ${i + 1}`}
              value={bloco.numero}
              disabled={disabled}
              onChange={(e) => atualizar(i, { numero: e.target.value })}
              placeholder="Ex.: 45.678"
              className={inputClassName ?? IN_CLASS_FALLBACK}
            />

            <div className="mt-2.5">
              <LinhaAnexo
                testId={`${idPrefix}-matricula-certidao-${i + 1}`}
                rotulo={`Certidão de inteiro teor · matrícula ${i + 1}`}
                arquivo={bloco.certidaoFile}
                anexado={bloco.certidaoAnexada}
                disabled={disabled}
                onPick={(file) => atualizar(i, { certidaoFile: file })}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange([...lista, { ...MATRICULA_BLOCO_VAZIO }])}
        disabled={disabled || lista.length >= MAX_MATRICULAS}
        className={`${SECONDARY_OUTLINE_BTN} mt-2`}
      >
        + Adicionar matrícula
      </button>
      <p className="mt-1 text-(length:--t-caption) text-(--color-text-muted)">
        Uma certidão de inteiro teor por matrícula.
      </p>
    </div>
  );
}

/**
 * HIP-02 — os laudos de avaliação, um por bloco.
 *
 * A quantidade de blocos É o `quantidadeLaudos` que o formulário envia; não há
 * campo numérico. Um bloco por padrão, como a matrícula.
 */
export function LaudosBlocos({
  blocos,
  onChange,
  disabled,
  idPrefix = 'gar',
}: {
  blocos: LaudoBloco[];
  onChange: (next: LaudoBloco[]) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const lista = blocos.length > 0 ? blocos : [LAUDO_BLOCO_VAZIO];

  return (
    <div data-testid={`${idPrefix}-laudos`}>
      <span className={`mb-1 block ${LABEL_FONT}`}>Laudos de avaliação</span>

      <div className="space-y-2.5">
        {lista.map((bloco, i) => (
          <div key={i} className={BLOCO_CLASS} data-testid={`${idPrefix}-laudo-${i + 1}`}>
            <CabecalhoBloco
              titulo={`Laudo ${i + 1}`}
              removeLabel={`Remover laudo ${i + 1}`}
              disabled={disabled}
              onRemove={
                lista.length > 1
                  ? () => onChange(lista.filter((_, j) => j !== i))
                  : undefined
              }
            />

            <LinhaAnexo
              testId={`${idPrefix}-laudo-anexo-${i + 1}`}
              rotulo={`Laudo de avaliação ${i + 1}`}
              arquivo={bloco.file}
              anexado={bloco.anexado}
              disabled={disabled}
              onPick={(file) =>
                onChange(lista.map((b, j) => (j === i ? { ...b, file } : b)))
              }
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange([...lista, { ...LAUDO_BLOCO_VAZIO }])}
        disabled={disabled || lista.length >= MAX_LAUDOS}
        className={`${SECONDARY_OUTLINE_BTN} mt-2`}
      >
        + Adicionar laudo
      </button>
    </div>
  );
}

/**
 * As matrículas do formulário, a partir do que o backend devolveu.
 *
 * `[]` (nenhuma, ou tipo sem bem) vira UM bloco vazio: é o estado inicial do
 * formulário, não "zero matrículas".
 */
export function blocosDeMatriculas(
  matriculas: ReadonlyArray<{ numero: string; certidaoAnexada: boolean }>,
): MatriculaBloco[] {
  if (matriculas.length === 0) return [{ ...MATRICULA_BLOCO_VAZIO }];
  return matriculas.map((m) => ({
    numero: m.numero,
    certidaoFile: null,
    certidaoAnexada: m.certidaoAnexada,
  }));
}

/**
 * Os laudos do formulário, a partir da quantidade declarada e de quantos
 * chegaram.
 *
 * `quantidade` ausente ⇒ um bloco (o `QUANTIDADE_LAUDOS_PADRAO` do backend, que
 * é o comportamento anterior a HIP-02). Os primeiros blocos vêm marcados e
 * carregam o id do laudo daquela posição — a correspondência é posicional, ver
 * {@link LaudoBloco}.
 *
 * ⚠️ Recebe **um item por laudo anexado**, não uma contagem: `laudosAnexados` do
 * backend É o `length` desta lista (`docs.filter(type === laudo).length`), então
 * derivar o "anexado" dela mantém UMA fonte — com os dois, um bloco poderia vir
 * marcado e sem id, e a substituição somaria um laudo em silêncio.
 *
 * O item é o id do documento, ou **`null` no laudo LEGADO** (o que vive na coluna
 * `laudo_file_name` da própria indicação): ele existe, então o bloco vem
 * marcado, mas não há documento do repositório a desvincular. Trocar o arquivo
 * dele anexa um laudo novo, e o merge do backend deixa de listar a coluna —
 * `documentosDaIndicacao` suprime o legado quando o tipo já está presente.
 *
 * ⚠️ Pode haver MAIS ids que `quantidade` (alguém declarou 2, anexou 3 e depois
 * reduziu a declaração): aí os blocos extras aparecem, senão o formulário
 * esconderia documento que existe.
 */
export function blocosDeLaudos(
  quantidade: number | null,
  laudosAnexados: ReadonlyArray<string | null>,
): LaudoBloco[] {
  const anexados = laudosAnexados.length;
  const total = Math.max(quantidade ?? 1, anexados, 1);
  return Array.from({ length: Math.min(total, MAX_LAUDOS) }, (_, i) => ({
    file: null,
    anexado: i < anexados,
    documentoId: laudosAnexados[i] ?? null,
  }));
}
