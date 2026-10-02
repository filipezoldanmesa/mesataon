/**
 * Fonte de dados da obra (ADR-0048).
 *
 * Re-exporta o cliente real direto — sem flag de ambiente, como manda a
 * convenção do repo. O backend já existe (issue B2), então não há mock: um
 * `*.mock.ts` aqui seria código morto. Componentes importam **daqui**, nunca do
 * `.api` direto, e os testes injetam stubs via prop.
 */
export {
  getObra,
  getObraTrilha,
  getObrasDisponiveis,
} from './obras.api';

export type { Obra, ObraOutroValor, ObraParcela, ObraReadModel } from './obra-mapping';
export { obraOptionLabel } from './obra-mapping';

export type { ObraPasso, ObraPassoEstado, ObraTrilha } from './obra-trilha-mapping';

/**
 * O fluxo "Adicionar obra" da proposta (documento de 09/09/2026 · ADR-0051).
 *
 * Fica no mesmo barril das leituras de obra para o bloco importar de um lugar
 * só — e para o dublê dos testes substituir tudo pela mesma porta.
 */
export {
  adicionarObraInvestimentos,
  adicionarObraRecursos,
  removerObraInvestimentos,
  removerObraRecursos,
} from './obra-da-proposta.api';
export type {
  AdicionarObraInvestimentosPayload,
  AdicionarObraRecursosPayload,
} from './obra-da-proposta.api';
