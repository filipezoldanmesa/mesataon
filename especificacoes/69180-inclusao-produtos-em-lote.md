# 69180 · Inclusão de produtos em lote (tabela editável)

- **Task:** US 69180 — Melhoria na Experiência e Layout da Tela de Inclusão de Produtos
- **Branch / PR:** `feat/69180-inclusao-produtos-em-lote`
- **Status:** rascunho

## Problema

Incluir produtos um a um, num modal, é lento. O usuário precisa preencher todos os dados de
todos os produtos elegíveis de uma vez, numa tabela, com o sistema sugerindo o que puder.

## Quem usa

Os mesmos perfis que hoje incluem produto na proposta (`Permission.ProposalManage`). Os demais
perfis só leem a tabela de produtos já salvos e **não veem** a tabela de inclusão.

| Perfil | Vê | Age |
|---|---|---|
| LT e demais perfis de escrita da proposta | tabela de inclusão + produtos salvos | marca, edita, exclui, copia, limpa, salva |
| Perfis somente leitura | só os produtos salvos | nada |

## Onde e quando

- **Tela:** bloco "Produtos e simulação comercial" da proposta
  (`/oportunidades/[id]/propostas/[proposalId]` e `/propostas/nova`). Componente
  `ProductLinesBlock`; a tabela nova é `ProductBatchTable`.
- **Fase:** proposta em preenchimento / análise (a mesma trava de escrita de hoje).
- **Cenário no protótipo:** `opp-001` (cliente com produtos cadastrados) como LT. Para ver o
  estado "cliente sem cadastro", use um cliente fora de `CLIENTES_COM_ALLOWLIST`.

## Regras

1. A tabela carrega sozinha os produtos elegíveis **cadastrados para o cliente** (`Produtos
   Elegíveis`) que ainda não estão na proposta.
2. Cliente **sem** cadastro: a tabela abre vazia (o catálogo da área de venda tem milhares de
   produtos) e o usuário inclui por busca em "+ Adicionar produto".
3. Cada linha tem um check ("manter na proposta") e um botão X ("excluir da lista"). Só as linhas
   **marcadas** são salvas. Linha excluída sai da lista (volta pelo "+ Adicionar produto").
4. Sugestões do backend, todas editáveis exceto onde indicado:
   - **Início do consumo:** a data da criação da proposta (hoje, o 1º dia do mês seguinte,
     elevado ao início da análise).
   - **Fim do consumo:** o fim da análise da proposta.
   - **HV (meses):** derivado das duas datas pelo backend (não editável).
   - **Qtd. mesa (m³/mês):** não editável. Origem ainda não definida (mockada).
   - **Volume (m³/mês):** abre preenchido com a quantidade de mesa.
   - **Margem realizada** (antes "margem sugerida"): média dos últimos 12 meses do produto na
     base e zona de venda. Não editável. É a "margem sugerida" da US 68969.
   - **Margem proposta:** vazia por padrão; vazia ao salvar, o backend adota a margem realizada.
   - **Incoterm:** vem do cadastro do material.
   - **Prazo de pagamento:** vem da NEG vigente do cliente para o produto e a base; sem NEG,
     fica vazio.
5. **Total de volume** no rodapé: soma do volume das linhas marcadas.
6. **Copiar da linha de cima:** copia início, fim, incoterm e prazo de pagamento. Não copia
   volume nem margem, que variam por produto.
7. **Autosave:** cada alteração grava um **rascunho** após ~0,8 s e uma última vez ao sair da
   tela. O rascunho aceita linhas incompletas e vale para a proposta (não por usuário).
8. **Limpar campos:** pede confirmação e devolve a lista às sugestões do sistema.
9. **Salvar:** envia só as linhas marcadas, **tudo ou nada**. Se alguma linha estiver incompleta
   ou inválida, nada é gravado e a tela aponta cada campo faltando. Ao salvar, as linhas viram
   produtos da proposta e saem da tabela de inclusão. O indicador de cálculos é invalidado.
10. A validação de cada linha é a do salvamento individual de hoje: volume > 0, incoterm,
    prazo de pagamento com dias deriváveis, datas dentro da janela da análise, produto
    elegível, produto ainda fora da proposta, CPV na base.

## Estados da tela

| Estado | O que aparece |
|---|---|
| Carregando | "Carregando produtos elegíveis…" |
| Vazio, cliente com cadastro | "Nenhum produto pendente de inclusão." |
| Vazio, cliente sem cadastro | explica que não há cadastro e aponta "+ Adicionar produto" |
| Preenchido | tabela, total de volume, indicador do rascunho, Limpar campos, Salvar |
| Erro de carga | mensagem + "Tentar novamente" |
| Erro de salvamento | caixa de erro com uma frase por campo; campos em vermelho |
| Erro de autosave | aviso discreto; tenta de novo na próxima alteração |
| Sem permissão | a tabela de inclusão não aparece |

## Dados

### Contrato (BFF)

Tipos em `src/lib/proposals/product-batch.types.ts`; cliente em `product-batch.api.ts`.

| Método | Rota | Faz | Resposta | Mock em |
|---|---|---|---|---|
| GET | `/api/proposals/:id/product-batch` | rascunho salvo ou lista nova de elegíveis com sugestões | `ProductBatchDraft` | `src/mocks/handlers/propostas.ts` |
| PUT | `/api/proposals/:id/product-batch` | autosave (substitui o rascunho) | `ProductBatchDraft` recalculado | idem |
| DELETE | `/api/proposals/:id/product-batch` | limpar campos | `ProductBatchDraft` novo | idem |
| POST | `/api/proposals/:id/product-batch/rows` | adiciona um produto elegível com sugestões | `ProductBatchRow` (201) | idem |
| POST | `/api/proposals/:id/product-batch/submit` | salva as linhas marcadas, tudo ou nada | `ProductLine[]` · 400 `{ errors: [{ produtoCodigo, field, message }] }` | idem |

### Campos novos (`ProductBatchRow`)

| Campo | Significado | Origem | Obrigatório |
|---|---|---|---|
| `selecionado` | manter a linha na proposta | usuário | — |
| `quantidadeMesa` | quantidade de mesa, m³/mês | **não sei** (mockada) | não (só exibição) |
| `margemRealizada` | média 12 meses por produto/base/zona | backend (mesma da US 68969) | não (só exibição) |
| `prazoPagamento` | código SAP, vindo da NEG vigente | NEG do cliente; vazio sem NEG | sim ao salvar |
| demais | iguais a `UpsertProductLineInput` | ver `src/lib/proposals/types.ts` | ver regra 10 |

`ProductLine.margemSugerida` continua com esse nome no tipo; só o rótulo na tela mudou para
"Margem realizada".

### Integrações e efeitos

Nenhuma nova. O salvamento reaproveita a criação de linha de produto existente, uma por produto
marcado, numa única transação. O rascunho é novo e precisa de armazenamento no backend.

## Fora do escopo

- Edição de uma linha **já salva**: segue pelo modal "Editar" de hoje.
- Escolha de base por linha (a base é a do centro fornecedor padrão da conta).
- Ordenação, filtro e paginação da tabela.

## Perguntas em aberto

- [ ] Origem e regra da **quantidade de mesa** — negócio
- [ ] Cliente sem cadastro de produtos: a tabela vazia + busca atende? — negócio
- [ ] O rascunho é por proposta ou por usuário e proposta? — time de desenvolvimento
- [ ] O X exclui só da lista ou "descarta" o produto da proposta? Hoje, só da lista — negócio
