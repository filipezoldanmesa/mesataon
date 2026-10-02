/**
 * Fonte de dados da aba Governança → CCOB. Sempre a API real, pela BFF.
 * Componentes importam daqui; testes injetam a própria função por prop.
 */
export {
  listGerenciasCcob,
  reatribuirGerenciaCcob,
  upsertDistribuicaoCcob,
} from './distribuicao-ccob.api';
