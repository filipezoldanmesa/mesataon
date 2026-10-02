/**
 * Fonte de dados da aba **Governança → Distribuição Franquias**. Sempre a API
 * real via BFF; os componentes importam daqui e os testes injetam stubs por prop.
 */
export {
  listRoteamentoFranquia,
  upsertRoteamentoFranquia,
} from './roteamento-franquia.api';
