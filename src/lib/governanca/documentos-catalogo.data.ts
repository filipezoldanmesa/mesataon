/**
 * Fonte de dados da aba Governança → Documentos. Sempre a API real, pela BFF.
 * Componentes importam daqui; testes injetam a própria função por prop.
 */
export {
  criarDocumentoParametrizacao,
  editarDocumentoParametrizacao,
  getCatalogoDocumentos,
  getDocumentosPorModalidade,
  removerDocumentoParametrizacao,
} from './documentos-catalogo.api';
