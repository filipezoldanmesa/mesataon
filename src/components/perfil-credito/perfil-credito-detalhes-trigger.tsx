'use client';

import { useCallback, useState } from 'react';

import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import { getPerfilCredito as defaultGetPerfilCredito } from '@/lib/perfil-credito/perfil-credito.data';
import type { PerfilCredito } from '@/lib/perfil-credito/types';
import { PerfilCreditoDetalhesModal } from './perfil-credito-detalhes-modal';

type Estado =
  | { status: 'fechado' }
  | { status: 'carregando' }
  | { status: 'erro' }
  /** `perfil: null` = a concessão não exige levantamento (204 da BFF). */
  | { status: 'aberto'; perfil: PerfilCredito | null };

type Props = {
  opportunityId: string;
  /** O texto do gatilho — normalmente o resumo já exibido na linha. */
  children: React.ReactNode;
  /** Cabeçalho do modal: o cliente a que a análise se refere. */
  subtitulo?: string | null;
  /** Injetável nos testes. */
  getPerfil?: (id: string) => Promise<PerfilCredito | null>;
};

/**
 * Torna um resumo do perfil de crédito CLICÁVEL e abre o detalhamento
 * (ADO 67948).
 *
 * ## Por que o gatilho e a busca moram juntos
 *
 * Duas telas mostram o resumo — a da garantia (a linha "Análise de perfil
 * (pré-condição)", que é onde o bug foi reportado) e a linha "Perfil / Risco" do
 * workspace da SNEG. Se cada uma buscasse o detalhe por conta própria, as duas
 * divergiriam no estado de erro e no gate de permissão, que é a divergência que
 * um componente único existe para impedir. Uma terceira superfície passa a ser
 * uma linha.
 *
 * ## A busca é TARDIA, no clique
 *
 * `GET .../perfil-credito` é chamado a cada render das telas que exibem a pill;
 * carregar o detalhe junto poria mais uma requisição em toda pintura para um
 * modal que quase nunca é aberto. Como o detalhe é um snapshot gravado, buscar
 * no clique também garante que ele esteja fresco em relação a um levantamento
 * que concluiu enquanto a tela estava aberta.
 *
 * ## Sem a permissão, NÃO há controle
 *
 * `GET .../perfil-credito` é `@Roles(LT, SNEG, CCOB, ADMIN)`; para os outros
 * nove perfis a rota responde 403. Oferecer o clique a eles renderizaria um
 * botão cujo único desfecho é uma mensagem de erro — controle morto. O resumo
 * continua sendo exibido como texto: quem vê a pill continua vendo a pill.
 */
export function PerfilCreditoDetalhesTrigger({
  opportunityId,
  children,
  subtitulo,
  getPerfil = defaultGetPerfilCredito,
}: Props) {
  const { can } = usePermissions();
  const [estado, setEstado] = useState<Estado>({ status: 'fechado' });

  const abrir = useCallback(async () => {
    setEstado({ status: 'carregando' });
    try {
      const perfil = await getPerfil(opportunityId);
      setEstado({ status: 'aberto', perfil });
    } catch {
      setEstado({ status: 'erro' });
    }
  }, [getPerfil, opportunityId]);

  if (!can(Permission.PerfilCreditoView)) {
    return <>{children}</>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void abrir()}
        disabled={estado.status === 'carregando'}
        aria-label="Ver detalhes da análise de perfil"
        data-testid="perfil-credito-detalhes-trigger"
        className="text-left underline decoration-dotted decoration-from-font underline-offset-2 hover:decoration-solid disabled:opacity-60"
      >
        {children}
      </button>

      {/*
        * Falha de leitura é dita NA LINHA, não num modal vazio: abrir uma janela
        * para dizer que não deu para ler custa dois cliques para nada. E a frase
        * nomeia a ação que pode resolver — é o único caso em que repetir ajuda.
        */}
      {estado.status === 'erro' && (
        <span
          className="ml-2 text-(length:--t-small) text-(--color-text-muted)"
          data-testid="perfil-detalhes-erro"
        >
          Não foi possível carregar os detalhes. Tente novamente.
        </span>
      )}

      {/*
        * `perfil: null` é a concessão não exigir levantamento (CA-F0-01.2) — um
        * fato de negócio, e o modal seria cinco blocos vazios. A frase fica na
        * linha, como o erro.
        */}
      {estado.status === 'aberto' && estado.perfil === null && (
        <span
          className="ml-2 text-(length:--t-small) text-(--color-text-muted)"
          data-testid="perfil-detalhes-nao-exigido"
        >
          Esta concessão não exige análise de perfil.
        </span>
      )}

      {estado.status === 'aberto' && estado.perfil !== null && (
        <PerfilCreditoDetalhesModal
          perfil={estado.perfil}
          subtitulo={subtitulo}
          onClose={() => setEstado({ status: 'fechado' })}
        />
      )}
    </>
  );
}
