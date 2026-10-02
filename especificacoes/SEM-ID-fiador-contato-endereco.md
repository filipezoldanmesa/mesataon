# SEM-ID · E-mail, profissão e endereço do fiador e do cônjuge

- **Task:** sem ID do ADO ainda — o PR precisa do ID no título e este arquivo precisa ser renomeado.
- **Branch / PR:** `feat/<ID-ADO>-fiador-contato-endereco`
- **Status:** rascunho

## Problema

O formulário de fiador da garantia não coleta e-mail, profissão nem endereço completo, nem do
fiador nem do cônjuge. Esses dados não vêm do CPF e são necessários.

## Quem usa

Quem já indica garantia: o LT (`garantia.indicacao.submit` = `[LT, ADMIN]`), no card
"Garantias" da oportunidade e no ticket de pendência. Os demais perfis só leem (dossiê da garantia).

## Onde e quando

- **Telas:** `/oportunidades/[id]` (modal "Adicionar/Editar garantia") e o ticket de pendência
  "Cadastrar garantia" (mesmo componente de fiadores).
- **Tipos de garantia:** os que têm fiador PESSOA FÍSICA — fiança com lastro e fiança sem lastro.
  Na fiança bancária o fiador é o banco (CNPJ) e os campos não aparecem.
- **Cenário no protótipo:** `opp-001` como LT, tipo "Fiança com lastro".

## Regras

1. Para cada fiador pessoa física, e-mail, profissão e endereço completo são obrigatórios.
2. Quando o estado civil exige cônjuge (casado / união estável), os mesmos três campos são
   obrigatórios para o cônjuge, e só aparecem nesse caso.
3. Endereço completo = CEP, logradouro, número, bairro, cidade e UF. **Complemento é o único opcional.**
4. Trocar o estado civil para um sem cônjuge limpa os dados do cônjuge.
5. Tipo de documento, número do documento e órgão emissor **não** são pedidos: vêm do CPF.
6. O modal passa de 560px para 880px de largura máxima (card e ticket); abaixo de 640px os
   campos ficam em uma coluna.

## Estados da tela

Sem estado novo: os campos entram no formulário que já existe. Faltando algum obrigatório, o card
mostra a mensagem de erro do formulário e o ticket lista o que falta ao lado do botão.

## Dados

### Campos novos

Em `GarantiaFiadorItem` (`src/lib/garantia/indicacoes.types.ts`), todos `null` para o banco e para
linhas anteriores a esta entrega.

| Campo | Significado | Origem | Obrigatório |
|---|---|---|---|
| `email` / `conjugeEmail` | E-mail | digitado | sim (PF / cônjuge) |
| `profissao` / `conjugeProfissao` | Profissão | digitado | sim (PF / cônjuge) |
| `endereco` / `conjugeEndereco` | `EnderecoPessoa`: cep, logradouro, numero, complemento, bairro, cidade, uf | digitado | sim, menos `complemento` |

### Rotas da BFF

Sem rota nova. Os campos viajam em `fiadores[]` nas rotas de indicação já existentes (mock em
`src/mocks/handlers/garantia.ts`). O mock devolve 400 se faltar algum obrigatório.

### Integrações e efeitos

**Não sei:** onde esses dados são gravados (Salesforce? SAP?) e se a análise prévia / o contrato
passam a consumi-los. O DTO do backend (`FiadorDto`) e o payload da BFF (`src/lib/server`) precisam
aceitar os campos novos — não foram alterados aqui.

## Fora do escopo

Busca de endereço pelo CEP; validação de dígito de CPF, e-mail e CEP além do formato.

## Perguntas em aberto

- [ ] Onde cada campo é gravado no backend/Salesforce? — time de desenvolvimento
- [ ] Algum campo precisa aparecer no contrato ou na minuta? — negócio
