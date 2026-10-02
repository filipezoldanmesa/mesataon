'use client';

import { useCallback, useEffect, useState } from 'react';

import { getPoliticaComercial as defaultGet } from '@/lib/governanca/politica-comercial.data';
import type {
  Lacuna,
  PoliticaComercial,
} from '@/lib/governanca/politica-comercial.types';

type Props = { getPolitica?: () => Promise<PoliticaComercial> };

/**
 * Governança → **Política comercial** (`15-governanca.html`, aba F3).
 *
 * ## Os cinco cards do protótipo, e a fonte de cada um
 *
 * | Card | Forma no protótipo | Fonte |
 * |---|---|---|
 * | Política comercial e padrões de BP | `kv2` — 4 pares | identidade dos documentos + `sneg_bp_standards` |
 * | Parâmetros de referência para aderência | tabela | `sneg_bp_standards` + Salesforce |
 * | Limiares econômicos por tipo de proposta | tabela | Salesforce, PIVOTADO |
 * | ~~Verba / orçamento de BP~~ | tabela | **OCULTO** — ver `SHOW_VERBA_BP_CARD` |
 * | Premissas da política desmarcáveis | tabela | Salesforce |
 *
 * ## ⚠️ Nenhum número desta tela é chumbado (reescrita de 08/09/2026)
 *
 * A primeira versão transcreveu as tabelas do PDF num catálogo TypeScript. O
 * negócio recusou — *"está hardcoded?? Não temos que ter nada hardcoded"* — e a
 * recusa estava certa por uma razão pior que a duplicação: a tolerância `±10%`
 * que ela anunciava **não é aplicada em lugar nenhum**, porque
 * `PadraoAnaliseService` acusa desvio a qualquer excesso sobre a referência. O
 * card contradizia o motor que decide aderência.
 *
 * ## ⚠️ Nada aqui decide nada
 *
 * Aderência é decidida por `PadraoAnaliseService`/`economic-filter` a partir de
 * `bp_padroes`; alçada é decidida pelo org. Esta aba é leitura. E ela é
 * **somente leitura por desenho**: não há Editar nem "Publicar nova versão" —
 * o update do protótipo de 08/09/2026 REMOVEU aquele botão justamente destes
 * cards, confirmando a decisão que já estava no repo (as tabelas são vivas, sem
 * versão nem vigência; um `v.3` na tela seria número fabricado).
 *
 * ## As lacunas são RENDERIZADAS, com a fonte nomeada
 *
 * Decisão de produto de 08/09/2026. O campo que a política pede e que nenhuma
 * fonte entrega aparece com a frase do backend — que nomeia a fonte (o
 * orçamento é mastered no **SAP**, e a integração está DESLIGADA no org), nunca
 * "não modelado". Molde do `SectionSourceGap` da 360º.
 *
 * ⚠️ **A tabela de faixas absolutas de TIR da política NÃO é exibida**, e é
 * deliberado: a §3.8 do `PL-1BR-00003` é malformada na fonte
 * (`30% < TIR < 23%` é intervalo impossível). Quem publica limiar de TIR é o
 * org, no card de limiares — transcrever um palpite poria ali um número que
 * ninguém escreveu.
 */
export function PoliticaComercialCard({ getPolitica = defaultGet }: Props) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [data, setData] = useState<PoliticaComercial | null>(null);

  const reload = useCallback(() => {
    setStatus('loading');
    getPolitica()
      .then((d) => {
        setData(d);
        setStatus('loaded');
      })
      .catch(() => setStatus('error'));
  }, [getPolitica]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (status === 'loading') {
    return (
      <p
        data-testid="politica-comercial-carregando"
        className="py-4 text-(length:--t-caption) text-(--color-text-muted)"
      >
        Carregando a política comercial…
      </p>
    );
  }

  if (status === 'error' || !data) {
    return (
      <div data-testid="politica-comercial-erro" className="py-4">
        <p className="text-(length:--t-caption) text-(--color-danger)">
          Não foi possível carregar a política comercial.
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

  const politica = data.documentos.find((d) => d.categoria === 'Política');
  const padrao = data.documentos.find((d) => d.categoria !== 'Política');

  return (
    <div className="flex flex-col gap-4" data-testid="politica-comercial">
      {/*
       * 1 — Política comercial e padrões de BP.
       *
       * ⚠️ `kv2` (pares rótulo/valor), NÃO tabela: é a forma do protótipo, e a
       * primeira versão desta tela usou tabela — o negócio apontou
       * ("está diferente do protótipo").
       */}
      <Card
        dono="BP Financeiro"
        titulo="Política comercial e padrões de BP"
        badge="Referência"
        testId="politica-card-documentos"
        lacunas={data.lacunasDocumentos}
      >
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Par
            rotulo="Política comercial"
            valor={politica ? `${politica.codigo} — ${politica.titulo}` : null}
          />
          <Par
            rotulo="Padrão comercial"
            valor={padrao ? `${padrao.codigo} — ${padrao.titulo}` : null}
          />
          {/*
           * O `% de antecipado (padrão)` do protótipo, LIDO de
           * `sneg_bp_standards` — a mesma coluna que a análise compara.
           */}
          <Par
            rotulo="% de antecipado (padrão)"
            valor={data.mixAntecipadoPadrao}
          />
          {/*
           * `Vigência / reajuste` do protótipo: sem fonte, e por isso travessão
           * + lacuna nomeada abaixo. Escrever "Anual · IPCA" aqui seria
           * reintroduzir o valor chumbado.
           */}
          <Par rotulo="Vigência / reajuste" valor={null} />
        </div>
      </Card>

      {/*
       * 2 — Parâmetros de referência para aderência (análise).
       *
       * ⚠️ O badge NOMEIA o documento de referência, como no protótipo
       * (`Referência · Política Comercial DCVIM 2026`) — mas **derivado do
       * payload**, nunca literal: `politica.codigo` vem de
       * `DOCUMENTOS_POLITICA`, a mesma fonte que o card acima exibe.
       *
       * ⚠️ **É o ÚNICO badge do protótipo que dá para seguir.** Os outros nove
       * são `Vigente <data> · v.N` — a versão e a vigência que estas tabelas não
       * têm (elas são vivas; foi por isso que o update de 08/09/2026 removeu o
       * "Publicar nova versão"), e um `v.4` na tela seria número fabricado.
       *
       * ⚠️ O código (`PL-1BR-00003`) e não o nome coloquial do PDF
       * ("Política Comercial DCVIM 2026"): aquele nome não está em fonte
       * nenhuma, e o código é o identificador que o negócio usa — o título
       * completo fica no card acima, onde há espaço.
       */}
      <Card
        dono="SNEG + BP Financeiro"
        titulo="Parâmetros de referência para aderência (análise)"
        badge={
          politica ? `Referência · ${politica.codigo}` : 'Referência'
        }
        testId="politica-card-referencia"
      >
        <p className="mb-2.5 text-(length:--t-small) text-(--color-text-muted)">
          Referências que a análise SNEG usa para classificar a proposta como
          aderente ou exceção. Cada linha diz de onde o valor vem — os padrões
          de BP são parametrizáveis nesta Governança; os limiares, no Salesforce.
        </p>
        {data.parametrosReferencia.length === 0 ? (
          <Vazio>
            Nenhum parâmetro de referência disponível — ver as lacunas do card
            acima.
          </Vazio>
        ) : (
          <Tabela
            head={['Parâmetro', 'Referência', 'Fora da faixa', 'Fonte']}
            rows={data.parametrosReferencia.map((p) => [
              p.parametro,
              p.referencia,
              p.foraDaFaixa,
              p.fonte,
            ])}
          />
        )}
      </Card>

      {/*
       * 3 — Limiares econômicos POR TIPO DE PROPOSTA.
       *
       * ⚠️ As colunas são as do protótipo (`Tipo de proposta | Margem mín. |
       * TIR mín. | VPL mín. | Na violação`). A primeira versão listava as
       * regras cruas do org (`Grupo | Parâmetro | Operador/Valor | Nível`) e o
       * negócio apontou ("colunas totalmente diferentes do protótipo").
       */}
      <Card
        dono="BP Financeiro"
        titulo="Limiares econômicos por tipo de proposta"
        badge="Salesforce · ao vivo"
        testId="politica-card-limiares"
        lacunas={data.lacunasLimiares}
      >
        <p className="mb-2.5 text-(length:--t-small) text-(--color-text-muted)">
          O piso de cada eixo, na faixa que o Salesforce publica. Violar o piso
          escala a alçada para o nível da última coluna.
        </p>
        {data.limiares.length === 0 ? (
          <Vazio>
            Nenhum limiar disponível — os limiares são configurados no Salesforce.
          </Vazio>
        ) : (
          <Tabela
            head={[
              'Tipo de proposta',
              'Margem mín.',
              'TIR mín.',
              'VPL mín.',
              'Na violação',
            ]}
            rows={data.limiares.map((l) => [
              /*
               * O tipo de proposta é o que o protótipo pede na 1ª coluna; o
               * grupo do org vai abaixo, porque é ele que identifica QUAL
               * negociação (Implantação, Renovação, Vinculação…) e sem ele duas
               * linhas `PCR` ficariam indistinguíveis.
               */
              `${l.tiposProposta.join(', ') || '—'} · ${l.grupo}`,
              l.margem ?? '—',
              l.tir ?? '—',
              l.vpl ?? '—',
              l.naViolacao.join(' · ') || '—',
            ])}
          />
        )}
      </Card>

      {/*
       * 4 — Verba / orçamento de BP: OCULTO (ver `SHOW_VERBA_BP_CARD`).
       */}
      {SHOW_VERBA_BP_CARD && (
        <Card
          dono="BP Financeiro"
          titulo="Verba / orçamento de BP"
          badge="Parametrização local"
          testId="politica-card-verba"
          lacunas={data.lacunasVerba}
        >
          {data.verba ? (
            <Tabela
              head={['Referência', 'Verba (teto)']}
              rows={[[data.verba.referencia, brl(data.verba.verba)]]}
            />
          ) : (
            /*
             * ⚠️ Um teto de R$ 0,00 NÃO é exibido: ele afirmaria orçamento zero,
             * que é diferente de "ninguém parametrizou". O raciocínio fica aqui,
             * não na tela — a frase do usuário diz o que fazer, não por quê.
             */
            <Vazio>A verba de BP ainda não está parametrizada.</Vazio>
          )}
        </Card>
      )}

      {/*
       * 5 — Premissas da política desmarcáveis.
       *
       * ⚠️ O protótipo diz `SNEG (coordenação)` para a premissa da política; o
       * org diz **VPCVIM**. Vale o org — ele é a configuração que roda.
       */}
      <Card
        dono="BP Financeiro"
        titulo="Premissas da política desmarcáveis"
        badge="Salesforce · ao vivo"
        testId="politica-card-premissas"
      >
        <p className="mb-2.5 text-(length:--t-small) text-(--color-text-muted)">
          Desmarcar uma destas premissas na análise escala a alçada para o nível
          ao lado. No Salesforce isto é uma regra de competência cujo lado
          direito é <code>false</code>.
        </p>
        {data.premissas.length === 0 ? (
          <Vazio>
            Nenhuma premissa desmarcável disponível — elas são configuradas no
            Salesforce.
          </Vazio>
        ) : (
          <Tabela
            head={['Premissa', 'Ao desmarcar, escala para', 'Negociação']}
            rows={data.premissas.map((p) => [
              p.premissa,
              p.nivelAoDesmarcar ?? '—',
              p.grupo,
            ])}
          />
        )}
      </Card>
    </div>
  );
}

/**
 * O card "Verba / orçamento de BP" aparece? **Não** — pedido do negócio em
 * 08/09/2026: *"Pode omitir o card Verba / orçamento de BP. Pode deixar, mas
 * não deixa aparecendo"*, com *"depois voltamos nele"*.
 *
 * ## Por que é um SWITCH, e não a remoção do card
 *
 * "Depois voltamos nele" é a especificação: reverter tem de ser um flip, não
 * reconstruir a leitura. Então **nada foi removido** — o backend segue servindo
 * `verba` e `lacunasVerba`, o `<Card>` segue escrito e testado (o teste mocka o
 * switch ligado), e o único efeito é a renderização. Mesmo precedente do
 * `SHOW_COMPANY_GROUP_CARD` da 360º.
 *
 * ## O que a medição de 08/09/2026 sustenta
 *
 * Nenhuma das quatro colunas do protótipo (Diretoria/Período/Saldo/Alerta) tem
 * fonte viva: a integração de orçamento do org está **desligada**
 * (`Reserva_De_Orcamento_Ativada__c = false` nas 5 linhas de metadado),
 * `Opportunity.Orcamento_Restante__c` é nulo em 100% das oportunidades,
 * `Budget_Confirmed__c = true` em zero, não existe objeto de orçamento no org
 * (805 varridos) e **"Franquias" não é dimensão que exista** — o `Opportunity`
 * não tem campo "Diretoria".
 *
 * ⚠️ **Isto NÃO é a regra da lacuna nomeada sendo abandonada.** Ela vale para
 * campo faltando DENTRO de um card que informa; aqui o único fato é o teto local
 * (que em produção nem existe — o seed retorna cedo lá), ao lado de três
 * lacunas. É o mesmo critério que ocultou o card de Grupo Empresa da 360º.
 *
 * ⚠️ **A verba não deixou de existir no produto** — ela vive onde funciona: o
 * card "Verba (BP) disponível" dos Recursos financeiros da proposta (ADO
 * 67805), onde o `utilizado` é real. O que não existe é a visão **consolidada
 * por diretoria**.
 *
 * **Gatilho de revisão:** ligar a Consulta/Reserva de Orçamento no org e o
 * espelho passar a ser populado.
 */
const SHOW_VERBA_BP_CARD = false;

// ---------------------------------------------------------------------------
// Apresentação
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
  lacunas?: Lacuna[];
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
        /*
         * ⚠️ Tom de ATENÇÃO (`--yellow-700`), nunca `--color-danger`: nada
         * falhou — é um campo cuja fonte ainda não o entrega, e a frase nomeia
         * qual fonte é.
         */
        <ul
          data-testid={`${testId}-lacunas`}
          className="mt-3 flex flex-col gap-1.5 rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2"
        >
          {lacunas.map((l) => (
            <li
              key={l.campo}
              className="text-(length:--t-small) text-(--yellow-700)"
            >
              <strong>{l.campo}:</strong> {l.motivo}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Um par rótulo/valor do `kv2` do protótipo.
 *
 * `null` rende travessão — nunca um valor plausível. É o que separa "esta
 * plataforma não sabe" de um número que alguém parametrizou.
 */
function Par({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <div className="text-(length:--t-small) font-bold uppercase tracking-[.3px] text-(--color-text-muted)">
        {rotulo}
      </div>
      <div className="mt-0.5 text-(length:--t-caption)">{valor ?? '—'}</div>
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-1.5 text-(length:--t-caption) text-(--color-text-muted)">
      {children}
    </p>
  );
}

function Tabela({ head, rows }: { head: string[]; rows: string[][] }) {
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
              <tr key={`${row[0]}-${i}`}>
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

/**
 * A verba em BRL.
 *
 * O valor chega como **string decimal** (o dinheiro nunca atravessa a API como
 * número). Valor que não parseia é exibido CRU, nunca como `R$ 0,00` — um zero
 * fabricado afirmaria um teto de zero.
 */
function brl(valor: string): string {
  const n = Number(valor);
  if (!Number.isFinite(n)) return valor;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
