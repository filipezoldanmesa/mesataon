import { formatInstantDateBR } from '@/lib/date-format';
import type { OpportunityDetail } from '@/lib/opportunities/types';

/**
 * Onde a nota está sendo renderizada. Fechado de propósito: cada local tem
 * espaçamento e `data-testid` próprios, e um terceiro ponto de exibição precisa
 * ser declarado aqui — não improvisado com uma classe solta no call site.
 */
type LocalDaNota = 'cabecalho' | 'sendbar';

type Props = {
  devolucao: OpportunityDetail['devolucaoAoLt'];
  /** Default: `cabecalho` (a nota original, abaixo da linha do cliente). */
  local?: LocalDaNota;
};

/**
 * Espaçamento e identidade de teste por local.
 *
 * ⚠️ `data-testid` DISTINTO por local, e não um só repetido: com a nota nos dois
 * lugares ao mesmo tempo, `getByTestId` reprova com *"Found multiple elements"* —
 * e derrubaria as suítes que já afirmam a nota do cabeçalho. É a mesma armadilha
 * do `role="alert"` que quebrou três suítes de `pendencias/` de uma vez.
 */
const APRESENTACAO: Record<LocalDaNota, { testId: string; espacamento: string }> = {
  cabecalho: { testId: 'devolucao-ao-lt-note', espacamento: 'mt-2.5' },
  // Na sendbar o ritmo é o `gap` do flex do rodapé; margem própria abriria um
  // vão a mais dentro de uma barra que já é medida para reservar altura.
  sendbar: { testId: 'devolucao-ao-lt-note-sendbar', espacamento: '' },
};

/**
 * Nota discreta: a oportunidade INTEIRA foi devolvida ao LT (por BP, SNEG, TI
 * Administrador, SPCOM, Gestor de Franquias ou TI Sustentação — Matriz RBAC v2.1) e ela voltou ao
 * preenchimento (`DEVOLVER_AO_LT` — 27/08/2026).
 *
 * ## Por que discreta, e não um alerta
 *
 * Pedido explícito do produto: "não pode ter um destaque muito grande, tem que
 * ser sutil". A oportunidade devolvida **é** uma oportunidade em preenchimento
 * — a tela inteira já está correta para o LT, e o que falta é a razão de ela
 * ter voltado. Um `Alert` de largura total competiria com o próprio formulário
 * que ele precisa corrigir.
 *
 * Daí a forma: uma linha de legenda, com uma barra fina em `--yellow-700` como
 * único acento. Sem fundo preenchido, sem ícone, sem pill — a pill de fase ao
 * lado já diz "Em preenchimento", e uma segunda pill dizendo "Devolvida"
 * afirmaria um estado que a máquina não tem.
 *
 * ⚠️ `--yellow-700` é o token de "Exceção/Atenção" do repo, e não
 * `--color-danger`: nada falhou. A devolução é um passo do processo, e vermelho
 * leria como erro do sistema.
 *
 * ## Quando aparece
 *
 * Só quando o backend manda o campo, e ele só o manda enquanto a fase é de
 * preenchimento (`projetarDevolucaoAoLt`) — o recorte é de lá, não daqui, senão
 * a mesma pergunta teria dois donos. Reenviada a oportunidade, a nota some.
 *
 * O motivo é obrigatório no ato, então nunca há nota sem razão; o autor pode
 * faltar em linha sem snapshot de nome, e aí a frase simplesmente não o cita.
 *
 * ## Dois locais (relato de 18/09/2026)
 *
 * > *"o motivo da devolução deve ser sempre exibido na barra inferior da
 * > oportunidade até o LT enviar novamente para análise."*
 *
 * A nota do cabeçalho responde a pergunta certa e **sai de cena ao rolar** — e a
 * tela de preenchimento é longa, então o LT passa o trabalho inteiro sem o
 * motivo à vista. A sendbar é a única superfície que acompanha a rolagem, e é
 * onde fica o gesto de reenviar. As duas usam ESTE componente: uma segunda
 * redação divergiria da primeira justamente na frase que explica a devolução.
 *
 * O "até o LT enviar novamente" continua sendo do backend
 * (`projetarDevolucaoAoLt` só projeta enquanto a fase é de preenchimento) — o
 * recorte não é refeito aqui, nem no rodapé.
 */
export function DevolucaoAoLtNote({ devolucao, local = 'cabecalho' }: Props) {
  if (!devolucao) return null;

  /*
   * `formatInstantDateBR` respeita o fuso do Brasil e devolve "—" para valor
   * indecifrável — que aqui vira ausência da data, nunca um travessão solto no
   * meio da frase.
   */
  const data = formatInstantDateBR(devolucao.em);
  const quando = data === '—' ? '' : ` em ${data}`;
  const porQuem = devolucao.porNome ? ` por ${devolucao.porNome}` : '';

  const { testId, espacamento } = APRESENTACAO[local];

  return (
    <p
      data-testid={testId}
      className={`${espacamento} border-l-2 border-(--yellow-700)/60 pl-2.5 text-(length:--t-caption) text-(--color-text-muted)`.trim()}
    >
      {/*
       * Sem "pela SNEG": desde a Matriz RBAC v2.1 (28/09/2026) também SPCOM,
       * Gestor de Franquias e TI Sustentação devolvem, e a nota não recebe o
       * perfil do autor — nomear a SNEG afirmaria um fato falso. O NOME de quem
       * devolveu segue em `porQuem`.
       */}
      <span className="font-bold">
        Devolvida ao LT{quando}
        {porQuem}.
      </span>{' '}
      {devolucao.motivo}
    </p>
  );
}
