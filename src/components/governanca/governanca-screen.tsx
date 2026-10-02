'use client';

import { type ReactNode, useMemo, useState } from 'react';
import Link from 'next/link';

import { AuditoriaPanel } from '@/components/auditoria/auditoria-panel';
import { FranquiaParametrizacaoScreen } from '@/components/franquia-admin/franquia-parametrizacao-screen';
import { CamposObrigatoriosCard } from '@/components/governanca/campos-obrigatorios-card';
import { DistribuicaoCcobCard } from '@/components/governanca/distribuicao-ccob-card';
import { DistribuicaoSnegCard } from '@/components/governanca/distribuicao-sneg-card';
import { DocumentosCatalogoCard } from '@/components/governanca/documentos-catalogo-card';
import { PadroesBpCard } from '@/components/governanca/padroes-bp-card';
import { PoliticaComercialCard } from '@/components/governanca/politica-comercial-card';
import { RoteamentoFranquiaCard } from '@/components/governanca/roteamento-franquia-card';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  GOVERNANCA_SURFACES,
  type GovernancaSurface,
} from '@/lib/governanca/surfaces';

/**
 * Governança — o painel de parametrização (`15-governanca.html`).
 *
 * ## A barra de abas é o PRIMEIRO item da página
 *
 * O protótipo abre com um cartão `.head` ("Administração e Parametrização" +
 * "Perfil: Administrador funcional (SNEG)") e a barra logo abaixo. O cartão saiu
 * a pedido do negócio, e com ele o `<h1>` visível: a página é nomeada pelo
 * breadcrumb e pelo item ativo do menu, e a linha de perfil repetia o chip do
 * cabeçalho — com o agravante de afirmar um perfil fixo ("SNEG") numa tela que
 * quatro perfis diferentes abrem.
 *
 * O `<h1>` permanece para leitor de tela: uma página sem cabeçalho de nível 1
 * quebra a navegação por títulos, e o `AuditoriaPanel` entra como `<h2>` de uma
 * página que precisa ter um `<h1>`.
 *
 * ## Uma aba por audiência, e cada uma com o seu gate
 *
 * - **Documentos** — `DocumentParametrizationView`: só o TI Administrador
 *   (21/09/2026). O catálogo de `document_parametrizations` e os documentos por
 *   modalidade de garantia. ⚠️ Passou a **adicionar e editar** no mesmo pedido —
 *   a feature-flag que a mantinha somente leitura foi removida, não ligada.
 * - **Campos obrigatórios** (21/09/2026) — `SnegCamposObrigatoriosGovernanca`:
 *   só o TI Administrador. Quais campos da proposta a conferência do analista
 *   cobra, por tipo (RN-F1-03). ⚠️ Veio de `/sneg/parametrizacao`, por pedido do
 *   negócio — MUDOU de casa, não foi duplicado.
 * - **Distribuição SNEG** — `SnegDistribuicaoGovernanca`: BP Financeiro e TI
 *   Administrador. Editar (parametrização) e Reatribuir (a fila em curso).
 * - **Distribuição CCOB** (04/09/2026, estreitada em 20/09/2026) —
 *   `CcobDistribuicaoGovernanca`: **BP Financeiro e TI Administrador** (a própria
 *   CCOB saiu com o pedido daquele dia). A mesma pergunta da aba ao lado, para a
 *   área que faz a análise prévia da garantia. Ganhou **Reatribuir** em
 *   08/09/2026.
 * - **Distribuição Franquias** (19/09/2026) — `RoteamentoFranquiaGovernanca`:
 *   Gestor de Franquias, BP Financeiro e TI Administrador. `(bandeira,
 *   gerência) → executivo`, lido na criação da proposta de franquia para montar
 *   a equipe da oportunidade. ⚠️ A aba se chamava "Roteamento de franquia" até
 *   20/09/2026, quando o negócio pediu o nome das irmãs — o `id` da aba, a rota
 *   e a permissão continuam `roteamento-franquia`: rótulo é vocabulário de
 *   tela, `id` é contrato.
 * - **Política comercial** (08/09/2026, estreitada em 20/09/2026) —
 *   `PoliticaComercialView`: **BP Financeiro e TI Administrador** (a SNEG saiu
 *   junto da Governança). Somente leitura: os documentos
 *   (`PL-1BR-00003`, `PG-1BR-00019`), os parâmetros de referência para
 *   aderência, os limites de exceção, a WACC/TMA, os limiares de alçada lidos
 *   AO VIVO do Salesforce e a verba de BP.
 * - **Padrões de BP** (21/09/2026) — `SnegPadroesBpGovernanca`: só o TI
 *   Administrador. As metas por negócio (`%` antecipado, `%` postecipado e custo
 *   de vinculação) que a análise compara. ⚠️ Fica **ao lado de Política
 *   comercial** por pedido do negócio, e a vizinhança é a certa: a aba ao lado
 *   LÊ estes dois números no card "Parâmetros de referência para aderência".
 *   ⚠️ Veio de `/sneg/parametrizacao`, que era o último bloco dela — a tela
 *   ficou sem nenhuma seção e foi REMOVIDA no mesmo pedido.
 * - **Franquias** (21/09/2026) — a união dos três gates das tabelas de franquia.
 *   ⚠️ Ela **era** a aba "Franquia" com um cartão-atalho para
 *   `/franquia/parametrizacao`; o negócio pediu *"levar Parametrização de
 *   Franquias (renomear para Franquias) para raiz de governança, substituindo o
 *   item Franquia"*, então o conteúdo passou a ser renderizado AQUI e a rota
 *   antiga redireciona. A quarta seção daquela tela, a **tabela de roteamento
 *   J10**, saiu no mesmo pedido — quem roteia executivo de franquia é a aba
 *   Distribuição Franquias, acima.
 * - **Parametrização** — os cartões que levam às telas de cadastro, cada um com
 *   o gate da rota de destino (ADO 67867). ⚠️ **Hoje ela não aparece para
 *   ninguém, e isso é derivado, não filtrado:** os dois cartões que restavam
 *   saíram em 21/09/2026 — "Parametrização SNEG" porque a tela foi removida
 *   (o último bloco virou a aba "Padrões de BP") e "Receitas e Despesas" porque
 *   o negócio a ocultou (*"se for preciso ajustar, faremos pelo banco de
 *   dados"*, `SHOW_RECEITAS_DESPESAS_SURFACE`). A aba volta sozinha no dia em
 *   que `GOVERNANCA_SURFACES` voltar a ter uma superfície com `href`.
 * - **Auditoria** — a trilha (`AuditTrailView`): só o TI Administrador desde
 *   21/09/2026. ⚠️ `GET /v1/auditoria` é o espelho EXATO desta lista — rota mais
 *   larga que a aba deixa o perfil removido lendo tudo por API (medido).
 *
 * ⚠️ A aba **Alçada estimada** do protótipo NÃO existe aqui, e é decisão do
 * negócio: o update de 08/09/2026 a escondeu (`style="display:none"`). As
 * fontes dela estão mapeadas (WACC/TMA §3.9, Índice R$/m³ §3.10, a cadeia
 * `CompetenceLevel__c`), então quem a construir não precisa re-derivá-las.
 *
 * ⚠️ **Quatro dessas abas somem para o BP Financeiro desde 21/09/2026**
 * (Documentos, Franquias, Parametrização e Auditoria), e duas delas sem uma
 * linha aqui: "Franquias" e "Parametrização" são derivadas de
 * `GOVERNANCA_SURFACES`, com as permissões do próprio catálogo — ele perdeu os
 * três gates das tabelas de franquia e os das telas de cadastro no mesmo dia.
 * Quem filtrar aba nesta tela para "resolver" um pedido desses deixa a
 * autoridade intacta: o cartão de "Parametrização" abre a tela de destino por
 * URL, e a aba "Franquias" monta o MESMO componente que a página montava — o
 * recorte tem de ser na permissão, nunca na barra de abas.
 *
 * As abas são FILTRADAS por permissão, não desabilitadas: uma aba que o perfil
 * não pode abrir seria controle morto, e o conteúdo dela é justamente o que ele
 * não deve enxergar. Perfil fora de todas nem chega aqui — a rota já responde
 * `NotFoundScreen`. Quem tinha a página antes continua com exatamente o que
 * tinha, agora dentro da aba correspondente.
 */

type AbaId =
  | 'documentos'
  | 'campos-obrigatorios'
  | 'franquias'
  | 'distribuicao-sneg'
  | 'distribuicao-ccob'
  | 'roteamento-franquia'
  | 'politica-comercial'
  | 'padroes-bp'
  | 'parametrizacao'
  | 'auditoria';

/**
 * O conteúdo de cada superfície do catálogo que vive DENTRO da Governança.
 *
 * ⚠️ **Ponto de montagem ÚNICO.** A alternativa — repetir as tabelas de franquia
 * aqui — criaria duas superfícies para o mesmo dado, que divergem na primeira
 * mudança. O que a aba mostra é literalmente o mesmo componente que a página
 * `/franquia/parametrizacao` montava antes de virar redirecionamento.
 *
 * ⚠️ **Toda superfície com `aba` precisa de uma entrada aqui, e vice-versa** —
 * sem isso a aba aparece e o painel fica vazio, que é pior que não ter a aba.
 * `governanca-screen.test.tsx` afere os dois sentidos.
 */
export const CONTEUDO_DA_ABA: Record<string, () => ReactNode> = {
  franquias: () => <FranquiaParametrizacaoScreen />,
};

export function GovernancaScreen() {
  const { can } = usePermissions();

  const surfacesPermitidas = useMemo(
    () =>
      GOVERNANCA_SURFACES.filter((surface) =>
        surface.permissoes.some((p) => can(p)),
      ),
    [can],
  );

  /*
   * Uma superfície com `aba` vira ABA; o resto vira cartão em "Parametrização".
   * Um catálogo, duas apresentações — nunca duas fontes.
   */
  const surfacesComAba = useMemo(
    () => surfacesPermitidas.filter((s) => s.aba),
    [surfacesPermitidas],
  );
  /*
   * O cartão de "Parametrização" NAVEGA, então ele exige `href` — e o predicado
   * é o que garante isso ao compilador. Superfície sem `aba` e sem `href` não
   * existe (seria uma superfície sem lugar nenhum), mas cair daqui em silêncio é
   * melhor que renderizar um `<Link>` para `undefined`.
   */
  const surfaces = useMemo(
    () =>
      surfacesPermitidas.filter(
        (s): s is GovernancaSurface & { href: string } =>
          !s.aba && typeof s.href === 'string',
      ),
    [surfacesPermitidas],
  );

  const abas = useMemo(() => {
    /*
     * ⚠️ **Matriz RBAC v2.1 (28/09/2026), "GOVERNANÇA · Parametrizações":**
     * a aba aparece para quem VISUALIZA (`GovernancaView` — hoje o SPCOM, além
     * dos executores) OU para quem EXECUTA aquela tabela (a permissão da aba).
     * O `||` é o que deixa o Gestor de Franquias ver SÓ as abas de franquia:
     * ele entra na Governança, mas não visualiza as parametrizações gerais.
     * Quem só visualiza a vê em modo leitura — cada card se defende sozinho com
     * a permissão de ESCRITA da própria tabela, a mesma que o backend exige.
     *
     * ⚠️ A Auditoria NÃO é parametrização e segue `AuditTrailView` (Admin).
     */
    const podeVer = (executar: Permission) =>
      can(Permission.GovernancaView) || can(executar);
    const disponiveis: { id: AbaId; label: string }[] = [];
    /*
     * Documentos é a PRIMEIRA aba, como no protótipo. Gate mais estrito que a
     * API de propósito (ver `Permission.DocumentParametrizationView`).
     */
    if (podeVer(Permission.DocumentParametrizationView)) {
      disponiveis.push({ id: 'documentos', label: 'Documentos' });
    }
    /*
     * Campos obrigatórios (21/09/2026) — *"puxar Parametrização → Parametrização
     * SNEG → Campos obrigatórios para a raiz de Governança"*. Fica ao lado de
     * Documentos porque as duas respondem a MESMA pergunta ("o que é exigido, e
     * até quando") em superfícies diferentes — e porque as duas são do TI
     * Administrador. O bloco MUDOU de casa: saiu de `/sneg/parametrizacao`,
     * tela que foi REMOVIDA no mesmo dia, quando o último bloco dela virou a aba
     * "Padrões de BP" logo abaixo.
     */
    if (podeVer(Permission.SnegCamposObrigatoriosGovernanca)) {
      disponiveis.push({ id: 'campos-obrigatorios', label: 'Campos obrigatórios' });
    }
    if (podeVer(Permission.SnegDistribuicaoGovernanca)) {
      disponiveis.push({ id: 'distribuicao-sneg', label: 'Distribuição SNEG' });
    }
    /*
     * Roteamento da CCOB (04/09/2026): a aba fica ao lado da Distribuição SNEG
     * porque é a MESMA pergunta ("quem responde por esta gerência?") para a
     * outra área. Cada uma com o seu gate: a da CCOB é da própria área mais o BP
     * Financeiro e o TI Administrador; a da SNEG não inclui a CCOB.
     */
    if (podeVer(Permission.CcobDistribuicaoGovernanca)) {
      disponiveis.push({ id: 'distribuicao-ccob', label: 'Distribuição CCOB' });
    }
    /*
     * Distribuição Franquias (19/09/2026): a aba fica ao lado das distribuições
     * porque é a MESMA pergunta ("quem responde por esta gerência?") para a
     * franquia — só que a resposta entra na EQUIPE da oportunidade quando a
     * proposta da bandeira é criada, em vez de abrir pendência. Gate próprio: o
     * Gestor de Franquias mais o BP Financeiro e o TI Administrador.
     *
     * ⚠️ O RÓTULO é o pedido de 20/09/2026, verbatim: as três abas de "quem
     * responde por esta gerência" passam a se chamar Distribuição. O `id`
     * (`roteamento-franquia`) NÃO acompanha — ele é a chave da aba ativa e o
     * nome do módulo/rota/permissão; trocá-lo renomearia contrato para
     * consertar texto.
     */
    if (podeVer(Permission.RoteamentoFranquiaGovernanca)) {
      disponiveis.push({ id: 'roteamento-franquia', label: 'Distribuição Franquias' });
    }
    /*
     * Política comercial (08/09/2026) — a ordem é a do protótipo, que a põe
     * depois das distribuições e antes da auditoria. Somente leitura: os
     * documentos são revisados fora daqui, os limiares no Salesforce, e a verba
     * não tem rota de edição.
     */
    if (can(Permission.PoliticaComercialView)) {
      disponiveis.push({ id: 'politica-comercial', label: 'Política comercial' });
    }
    /*
     * Padrões de BP (21/09/2026) — *"trazer Padrões de BP para a raiz de
     * Governança … deve ficar ao lado de Política comercial"*. A ordem é o
     * pedido, e ela se explica: a aba anterior LÊ `sneg_bp_standards` (o mix
     * antecipado e o custo de vinculação do card "Parâmetros de referência para
     * aderência") e esta é onde os dois são ESCRITOS. Quem estranha o número
     * exibido lá tem o lugar de corrigi-lo do lado.
     */
    if (podeVer(Permission.SnegPadroesBpGovernanca)) {
      disponiveis.push({ id: 'padroes-bp', label: 'Padrões de BP' });
    }
    /* As superfícies com aba própria (hoje: Franquias), na ordem do catálogo. */
    for (const surface of surfacesComAba) {
      if (surface.aba) {
        disponiveis.push({
          id: surface.aba.id as AbaId,
          label: surface.aba.label,
        });
      }
    }
    if (surfaces.length > 0) {
      disponiveis.push({ id: 'parametrizacao', label: 'Parametrização' });
    }
    if (can(Permission.AuditTrailView)) {
      disponiveis.push({ id: 'auditoria', label: 'Auditoria' });
    }
    return disponiveis;
  }, [can, surfaces.length, surfacesComAba]);

  const [ativa, setAtiva] = useState<AbaId | null>(null);

  /*
   * A aba ativa é a escolhida, ou a primeira disponível. Derivar em vez de
   * semear o estado num efeito evita o primeiro frame sem aba nenhuma — e
   * mantém a escolha válida se a lista mudar (a sessão resolve depois do
   * primeiro render, então `abas` começa vazia).
   */
  const atual = abas.some((aba) => aba.id === ativa) ? ativa : abas[0]?.id;

  return (
    <>
      <h1 className="sr-only">Governança · Parametrização</h1>

      {abas.length > 0 && (
        <div
          role="tablist"
          aria-label="Seções da governança"
          data-testid="governanca-tabs"
          className="mt-[18px] mb-[18px] flex flex-wrap gap-1.5"
        >
          {abas.map((aba) => {
            const on = aba.id === atual;
            return (
              <button
                key={aba.id}
                type="button"
                role="tab"
                id={`governanca-tab-${aba.id}`}
                aria-selected={on}
                aria-controls={`governanca-panel-${aba.id}`}
                onClick={() => setAtiva(aba.id)}
                className={`inline-flex h-9 items-center rounded-[var(--radius-xs)] border px-3.5 text-(length:--t-caption) font-bold ${
                  on
                    ? 'border-(--neutral-900) bg-(--neutral-900) text-white'
                    : 'border-(--color-border) bg-(--color-surface) text-(--color-text-muted) hover:border-(--secondary-500) hover:text-(--secondary-600)'
                }`}
              >
                {aba.label}
              </button>
            );
          })}
        </div>
      )}

      {atual === 'documentos' && (
        <div
          role="tabpanel"
          id="governanca-panel-documentos"
          aria-labelledby="governanca-tab-documentos"
        >
          <DocumentosCatalogoCard />
        </div>
      )}

      {atual === 'campos-obrigatorios' && (
        <div
          role="tabpanel"
          id="governanca-panel-campos-obrigatorios"
          aria-labelledby="governanca-tab-campos-obrigatorios"
        >
          <CamposObrigatoriosCard />
        </div>
      )}

      {atual === 'distribuicao-sneg' && (
        <div
          role="tabpanel"
          id="governanca-panel-distribuicao-sneg"
          aria-labelledby="governanca-tab-distribuicao-sneg"
        >
          <DistribuicaoSnegCard />
        </div>
      )}

      {atual === 'distribuicao-ccob' && (
        <div
          role="tabpanel"
          id="governanca-panel-distribuicao-ccob"
          aria-labelledby="governanca-tab-distribuicao-ccob"
        >
          <DistribuicaoCcobCard />
        </div>
      )}

      {atual === 'roteamento-franquia' && (
        <div
          role="tabpanel"
          id="governanca-panel-roteamento-franquia"
          aria-labelledby="governanca-tab-roteamento-franquia"
        >
          <RoteamentoFranquiaCard />
        </div>
      )}

      {atual === 'politica-comercial' && (
        <div
          role="tabpanel"
          id="governanca-panel-politica-comercial"
          aria-labelledby="governanca-tab-politica-comercial"
        >
          <PoliticaComercialCard />
        </div>
      )}

      {atual === 'padroes-bp' && (
        <div
          role="tabpanel"
          id="governanca-panel-padroes-bp"
          aria-labelledby="governanca-tab-padroes-bp"
        >
          <PadroesBpCard />
        </div>
      )}

      {surfacesComAba.map((surface) => {
        const conteudo = surface.aba && CONTEUDO_DA_ABA[surface.aba.id];
        if (!surface.aba || !conteudo || atual !== surface.aba.id) return null;

        return (
          <div
            key={surface.aba.id}
            role="tabpanel"
            id={`governanca-panel-${surface.aba.id}`}
            aria-labelledby={`governanca-tab-${surface.aba.id}`}
            data-testid={`governanca-aba-${surface.aba.id}`}
          >
            {conteudo()}
          </div>
        );
      })}

      {atual === 'parametrizacao' && (
        <div
          role="tabpanel"
          id="governanca-panel-parametrizacao"
          aria-labelledby="governanca-tab-parametrizacao"
          data-testid="governanca-parametrizacao"
        >
          <p className="mb-3 text-(length:--t-caption) text-(--color-text-muted)">
            Escolha a tabela que você mantém. O que for salvo passa a valer na
            hora, e toda alteração fica registrada com autor e data.
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {surfaces.map((surface) => (
              <Link
                key={surface.href}
                href={surface.href}
                data-testid={`governanca-card-${surface.href}`}
                className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px] transition-colors hover:border-(--secondary-500) hover:bg-(--neutral-25)"
              >
                <span className="block text-(length:--t-caption) font-bold text-(--secondary-500)">
                  {surface.titulo} →
                </span>
                <span className="mt-1 block text-(length:--t-caption) text-(--color-text-muted)">
                  {surface.descricao}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {atual === 'auditoria' && (
        <div
          role="tabpanel"
          id="governanca-panel-auditoria"
          aria-labelledby="governanca-tab-auditoria"
        >
          <AuditoriaPanel headingLevel={2} />
        </div>
      )}
    </>
  );
}
