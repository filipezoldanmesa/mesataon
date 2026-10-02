# vibra-gestor-oportunidades-prototipo

Espelho navegável do **Gestor de Oportunidades**, com **todos os dados mockados**. É aqui que o
design cria funcionalidades novas, e é daqui que o time de desenvolvimento tira as tasks.

- **Produção é a fonte da verdade do que existe hoje.** Este repositório nasceu do `apps/web` do
  `vibra-gestor-oportunidades` e é re-sincronizado com ele (`pnpm sync:upstream`).
- **O protótipo é a fonte da verdade do que vai existir.** Tela nova, campo novo e fluxo novo
  nascem aqui, com dado fictício, e viram task olhando para o diff deste repositório.
- **Não há backend nem integração.** Nenhum dado real, nenhuma chamada a Salesforce, SAP, DocuSign
  ou Entra. O login é um seletor de perfil.

## Como rodar

```bash
pnpm install
pnpm dev                 # http://localhost:3000
```

Entre com **qualquer um dos 13 perfis** na tela de login. Em **`/prototipo`** você troca de perfil
num clique, restaura os dados, deixa as respostas lentas (para ver carregamentos) e força falha nas
ações (para ver os estados de erro). A tabela de cenários ali lista as 10 oportunidades do elenco,
uma por fase do fluxo.

```bash
pnpm check               # typecheck + lint + cobertura dos mocks — rode antes de abrir PR
```

## O mapa: o que é PRODUTO e o que é PROTÓTIPO

Isto é o mais importante deste arquivo, porque decide o que vai para produção.

| Área | É | Vai para produção? |
|---|---|---|
| `src/app/**` (páginas), `src/components/**`, `src/hooks/**`, `src/lib/**`, `src/middleware.ts`, `public/` | **Código de produto**, idêntico ao de produção | **Sim, copiado como está** |
| `src/mocks/**` | Os dados e as respostas falsas | Não — vira a especificação do backend |
| `src/app/api/**` | Rota coringa que entrega toda `/api/*` aos mocks | **Nunca** |
| `src/app/prototipo/**` | Painel de controle do protótipo | **Nunca** |
| `especificacoes/**` | Uma especificação por funcionalidade | Não — vira a descrição da task |
| `scripts/`, `package.json`, configs, este arquivo | Infra do protótipo | Não |

Consequência: **tudo o que você escreve em código de produto será copiado para produção por um
desenvolvedor.** Escreva como se fosse o PR final da tela. O que é provisório, falso ou específico
do protótipo mora em `src/mocks/`, e em nenhum outro lugar.

### Como a tela recebe dado (o contrato)

Em produção, a tela chama a BFF (`/api/...`), a BFF chama o backend e devolve o **tipo do front**
(`src/lib/<dominio>/types.ts`). Aqui, a mesma chamada cai em `src/app/api/[...path]/route.ts`, que
entrega para `src/mocks/handlers/<dominio>.ts`, que devolve **o mesmo tipo**.

```
tela  →  lib/<dominio>/<x>.api.ts  →  fetch(withBasePath('/api/...'))
                                          │
                 produção:  app/api/.../route.ts → backend → mapping → TipoDoFront
                 protótipo: mocks/handlers/<dominio>.ts ────────────→ TipoDoFront
```

A tela não sabe qual dos dois respondeu. O **tipo** e a **URL** são o contrato que o
desenvolvedor vai implementar de verdade. Por isso:

- **Tipo primeiro.** Campo novo nasce no tipo em `src/lib/<dominio>/types.ts`, com comentário
  dizendo o que ele significa e de onde viria (Salesforce? SAP? cálculo do backend?).
- **A tela nunca importa de `src/mocks/`.** Se a tela importa o mock, o port quebra. A única
  ponte é a URL `/api/...`.
- **Nunca crie `route.ts` dentro de `src/app/api/`.** O mock vai em `src/mocks/handlers/`.

## Fluxo de trabalho do design

Use a skill **`nova-funcionalidade`** (`.claude/skills/nova-funcionalidade/SKILL.md`): ela conduz o
passo a passo, da especificação ao PR. O resumo:

1. **Uma funcionalidade = uma branch = um PR**, a partir de `main` atualizada:
   `git checkout main && git pull && git checkout -b feat/<ID-ADO>-<slug>`.
2. **Especificação primeiro** em `especificacoes/<ID-ADO>-<slug>.md` (modelo em
   `especificacoes/_modelo.md`): o problema, quem usa (perfis), as regras, os estados da tela e os
   dados novos. Regra de negócio que não está escrita não existe para quem vai implementar.
3. **Tela e componentes** reutilizando o que já existe (veja "Regras de código de produto").
4. **Mock** do que a tela lê e das ações que ela dispara (veja "Como criar um mock").
5. **`pnpm check`** verde, e navegue o fluxo com os perfis afetados em `/prototipo`.
6. **PR** com o ID da task no título, screenshots e a lista de perfis testados.

## Regras de código de produto

Valem para tudo fora de `src/mocks/`, `src/app/api/` e `src/app/prototipo/`. São as convenções da
produção. Código que as quebra volta no port.

**Reuso antes de criar.** Antes de criar componente, procure em `src/components/` (há `ui/`,
`opportunities/`, `pendencias/`, `sneg/`, `contratos/`, `garantia/`…). Componente novo só quando
nenhum existente serve, e então genérico o bastante para o próximo uso.

**Design system.**
- Cores, tipografia, espaçamento e raios **só por token** de `src/app/globals.css`:
  `bg-(--secondary-500)`, `text-(length:--t-h3)`, `rounded-(--radius-xs)`. **Nenhum hex e nenhum
  px de fonte solto no código.** Se faltar token, diga no PR (hex em comentário documentando de
  onde veio é bem-vindo).
- Ícones em `src/components/icons.tsx` (SVG inline, `currentColor`). **Emoji não é ícone.**
- Página autenticada renderiza dentro do `<AppShell>`.
- Textos de tela em **pt-BR**. Comentários no código de produto em **inglês** (convenção da
  produção); nos mocks, pt-BR.

**Navegação e URLs.**
- Rota interna com `<Link>` do Next, nunca `<a href>` cru.
- Toda URL `/api/...` do cliente passa por **`withBasePath(...)`** (`@/lib/base-path`), inclusive
  em `href`/`src`. Aqui ela não faz nada; em produção, sem ela, a chamada dá 404 em todo ambiente.

**Estados da tela.** Toda tela de dados desenha os quatro: **vazio, carregando, preenchido e
erro**. Erro nunca vira lista vazia ("nenhuma pendência" é uma afirmação de negócio). Use
`/prototipo` (latência e falha forçada) para conferir cada um.

**Quem decide é o backend; a tela renderiza.**
- Regra que decide liberação, elegibilidade, aderência, alçada ou próximo passo **não é calculada
  na tela**. O tipo traz o veredito pronto (`podeEnviar`, `motivoBloqueio`, `statusPermitidos`,
  `acaoResolucao`) e a tela só o exibe. No protótipo, quem calcula o veredito é o **mock**, e a
  regra fica descrita na especificação.
- **Esconder o botão não pode esconder o fato.** Quem não pode agir quase sempre pode ler: retire o
  CTA e mantenha a frase que diz por que a coisa está parada.
- Permissão de UI usa o que já existe (`lib/auth-permissions.ts`, `lib/rbac-matrix.ts`,
  `RequirePermission`, `useAuth`). Rota não permitida mostra "página não encontrada", não "sem
  permissão".
- **Ausência de valor nunca vira default plausível.** Sem dado, o campo vai vazio e a tela diz que
  falta (nada de `'CIF'`, `0` ou `'LT'` "provisório").

**Picklists do Salesforce** usam `PicklistSelect` + `PicklistField.*`, nunca `<option>` fixo. Valor
novo de picklist é decisão do Salesforce da Vibra: registre na especificação.

**Funções de dados injetáveis.** Componentes recebem a função de dados por prop com default no
`*.data.ts` (é o padrão do repositório, e o que deixa a produção testar cada estado).

## Como criar um mock

1. **Tipo** em `src/lib/<dominio>/types.ts` (ou `<x>.types.ts`), o que a tela vai consumir.
2. **Função de dados** em `src/lib/<dominio>/<x>.api.ts`, no padrão dos vizinhos:
   `fetch(withBasePath('/api/<recurso>'))`, erro lido de `{ error }`. Reexporte em `<x>.data.ts`.
3. **Rota mockada** em `src/mocks/handlers/<dominio>.ts`, tipada com o tipo do passo 1:

   ```ts
   import type { MinhaCoisa } from '@/lib/<dominio>/types';
   import { json, naoEncontrado } from '../core/respostas';
   import { rotas } from '../core/router';
   import { oportunidade } from '../estado-compartilhado';

   rotas('<dominio>', [
     {
       method: 'GET',
       pattern: '/opportunities/:id/minha-coisa',
       handler: ({ params }) => {
         const o = oportunidade(params.id);
         if (!o) return naoEncontrado('Oportunidade');
         return json<MinhaCoisa>({ ... });
       },
     },
   ]);
   ```

   Domínio novo é arquivo novo em `src/mocks/handlers/` mais uma linha em `handlers/index.ts`.
4. **Dados coerentes com o elenco.** As oportunidades, clientes e usuários compartilhados estão em
   `src/mocks/elenco.ts` (`opp-001`…`opp-010`, uma por fase). Leia a fase atual de
   `src/mocks/estado-compartilhado.ts` (`oportunidade(id)`), não da constante, porque as ações a
   mudam. Estado próprio do domínio: `fatia('<dominio>-<coisa>', () => semente)` de
   `src/mocks/core/store.ts`.
5. **Ações mudam o estado.** `POST`/`PUT`/`PATCH`/`DELETE` alteram a fatia (e a fase, via
   `moverPara`), para o fluxo andar quando o usuário clica. Status igual ao da produção: `201` ao
   criar, `204` no `DELETE`, `200` vazio (`okVazio()`) nas rotas de ação. Erro é sempre
   `{ error: 'frase em pt-BR' }` (`erro(409, '...')`).
6. **Permissão por perfil** quando a regra importa para a tela: `temPapel(user, 'SNEG')` +
   `semPermissao()`. O Visualizador já é somente-leitura em todas as rotas.
7. `pnpm mocks:cobertura` acusa toda URL `/api/...` que alguma tela chama e ninguém mocka. Em
   runtime, rota sem mock responde **501** e o terminal do `pnpm dev` diz qual arquivo criar.

Downloads e streams: `pdf(titulo)`, `imagem(rotulo)` e `csv(...)` de `src/mocks/core/respostas.ts`.

## Dados fictícios — regra sem exceção

Este repositório é acessado por quem não tem acesso aos dados da Vibra. **Nada real entra aqui**:
nem nome de cliente, CNPJ, CPF, e-mail, valor de contrato, nem print de produção ou de staging.
Invente. CNPJ de exemplo segue o padrão do elenco (`11.222.333/0001-00`).

## Sincronizar com a produção

```bash
pnpm sync:upstream
```

Traz o que mudou no `apps/web` do `origin/develop` de produção (precisa do repositório de produção
clonado ao lado, ou de `UPSTREAM_DIR`). Funciona por merge da branch `upstream`, que guarda só
snapshots da produção: o que só a produção mudou entra limpo, o que só o protótipo mudou fica, e o
que os dois mudaram vira conflito para resolver à mão. Depois do sync:

- Rode `pnpm check`: tela de produção nova pode chamar rota que ainda não tem mock.
- **Funcionalidade já portada** some do diff naturalmente, porque a produção passa a ter o mesmo
  código.

`git diff upstream main -- src ':!src/mocks' ':!src/app/api' ':!src/app/prototipo'` mostra
**exatamente o que o protótipo tem e a produção ainda não tem**.

## Nunca

- Criar `route.ts` em `src/app/api/` ou chamar backend/URL externa.
- Importar `src/mocks/` de tela, componente ou `src/lib/`.
- Pôr dado falso, `if (prototipo)` ou valor provisório em código de produto.
- Alterar arquivo de produto sem necessidade da funcionalidade: cada linha mudada é uma linha que
  alguém vai ter de portar e revisar.
- Editar `src/lib/server/**` ou `src/middleware.ts` (infra de produção, fora do escopo do design).
- Usar dado real.
