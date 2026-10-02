/**
 * Fonte de dados da aba Governança → SNEG. Sempre a API real, pela BFF; os
 * componentes importam daqui e os testes injetam funções por prop.
 */
export {
  listGerenciasDistribuicao,
  reatribuirGerencia,
} from './distribuicao.api';
