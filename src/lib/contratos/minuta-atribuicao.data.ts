/**
 * Camada de dados da atribuição da minuta.
 *
 * Re-exporta o cliente real — as telas importam daqui, nunca do `.api` direto
 * (convenção do repo), e os testes injetam stubs por prop.
 */
export {
  getMinutaAtribuicao,
  reatribuirAnalistaMinuta,
} from './minuta-atribuicao.api';
