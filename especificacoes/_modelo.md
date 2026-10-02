# <ID-ADO> · <Nome da funcionalidade>

> Copie este arquivo para `especificacoes/<ID-ADO>-<slug>.md`. Preencha com o design, antes de
> codar. O que não estiver escrito aqui o desenvolvedor vai ter de adivinhar.

- **Task:** <link do ADO>
- **Branch / PR:** `feat/<ID-ADO>-<slug>` · <link do PR>
- **Status:** rascunho | pronta para task | portada em <data> (PR de produção <link>)

## Problema

<Qual dor do usuário isto resolve? Uma ou duas frases.>

## Quem usa

| Perfil | Vê | Age (o quê) |
|---|---|---|
| Líder de Território | | |
| SNEG | | |
| <outros dos 13 perfis> | | |

## Onde e quando

- **Tela(s):** <rota, ex.: `/oportunidades/[id]` aba Análise>
- **Fase(s) da oportunidade:** <preenchimento, análise, aprovação, minuta, assinatura, pagamento, concluída>
- **Cenário no protótipo para ver:** <ex.: OPP-0003 como SNEG>

## Regras

<Frases verificáveis. Uma regra por linha.>

1. <O botão "X" só aparece quando …>
2. <O valor "Y" é …>
3. <Depois de confirmar, a oportunidade …>

## Estados da tela

| Estado | O que aparece |
|---|---|
| Vazio | |
| Carregando | |
| Preenchido | |
| Erro | |
| Sem permissão (perfil que só lê) | |

## Dados

### Campos novos ou alterados

| Campo (no tipo do front) | Significado | Origem | Obrigatório |
|---|---|---|---|
| `nomeDoCampo` | | Salesforce `Objeto.Campo__c` / SAP / cálculo do backend / digitado / **não sei** | sim/não |

### Rotas da BFF (o contrato)

| Método | Rota | Lê / faz | Tipo de resposta | Mock em |
|---|---|---|---|---|
| GET | `/api/...` | | `Tipo` (`src/lib/.../types.ts`) | `src/mocks/handlers/<dominio>.ts` |

### Integrações e efeitos

<O que precisa acontecer fora do sistema: gravar no Salesforce, notificar alguém, gerar documento,
abrir pendência, registrar na auditoria. "Nenhum" é uma resposta.>

## Fora do escopo

<O que foi conversado e ficou para depois.>

## Perguntas em aberto

- [ ] <Pergunta> — <quem responde>
