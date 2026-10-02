import { fatia } from './store';

/** Controles do protótipo, alterados em `/prototipo`. Voltam ao padrão no "Restaurar dados". */
export interface ConfiguracaoPrototipo {
  /** Atraso artificial de cada resposta — deixa os estados de carregamento visíveis. */
  latenciaMs: number;
  /** Quando ligado, toda ação (POST/PUT/PATCH/DELETE) falha com o status abaixo. */
  falharAcoes: boolean;
  statusFalha: number;
  mensagemFalha: string;
}

export const configuracao = fatia<ConfiguracaoPrototipo>('configuracao', () => ({
  latenciaMs: 250,
  falharAcoes: false,
  statusFalha: 503,
  mensagemFalha: 'Serviço temporariamente indisponível. Tente novamente em instantes.',
}));
