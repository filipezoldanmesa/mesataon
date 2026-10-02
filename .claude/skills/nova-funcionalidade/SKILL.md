---
name: nova-funcionalidade
description: Use quando o design pedir uma tela, componente, campo, fluxo ou ajuste visual novo no protótipo do Gestor de Oportunidades — conduz da especificação ao PR, com tela no padrão de produção e dados mockados.
---

# Nova funcionalidade no protótipo

Quem pede é o design, por prompt. Quem vai implementar de verdade é um desenvolvedor, olhando o
diff deste PR. O seu trabalho é deixar as duas coisas prontas: **a tela funcionando com dado
fictício** e **a especificação que o desenvolvedor precisa para fazer o backend**.

Leia o `CLAUDE.md` da raiz antes de começar, principalmente "O mapa" e "Regras de código de produto".

## 1. Entender antes de desenhar

- Se o pedido não diz **quem usa** (quais dos 13 perfis), **em que momento do fluxo** (fase da
  oportunidade) e **o que acontece depois da ação**, pergunte. Uma pergunta agora custa menos que
  uma tela refeita.
- Procure se já existe algo parecido: `src/app/` (rotas), `src/components/` (componentes),
  `src/lib/<dominio>/types.ts` (dados que a tela já recebe). Mostre ao design o que pode ser
  reaproveitado.
- Confirme o ID da task (ADO). Sem ID, use um slug provisório e avise que o PR precisa do ID.

## 2. Branch

```bash
git checkout main && git pull
git checkout -b feat/<ID-ADO>-<slug>
```

Nunca trabalhe direto na `main` nem na branch de outra funcionalidade.

## 3. Especificação

Copie `especificacoes/_modelo.md` para `especificacoes/<ID-ADO>-<slug>.md` e preencha **com o
design**, antes de codar. Os campos que mais fazem falta no port:

- **Regras** em frases verificáveis ("o botão só aparece quando…", "o valor é a soma de…").
- **Origem de cada dado novo**: Salesforce (qual objeto/campo, se souber), SAP, cálculo do
  backend, digitado pelo usuário. "Não sei" é resposta válida, desde que escrita.
- **Estados**: vazio, carregando, preenchido, erro, e o que cada perfil vê.

## 4. Tela e componentes

- Siga as "Regras de código de produto" do `CLAUDE.md`: tokens, `<AppShell>`, `<Link>`,
  `withBasePath`, ícones de `icons.tsx`, os quatro estados, veredito vindo do tipo.
- Reaproveite componentes. Se precisar mudar um componente compartilhado, mude o mínimo e diga no
  PR quais telas ele afeta (é o que mais quebra no port).
- Tela nova de menu: siga como `src/components/header-nav.tsx` monta os itens e as permissões.

## 5. Dados mockados

Siga "Como criar um mock" no `CLAUDE.md`. Checklist:

- [ ] Tipo novo ou campo novo em `src/lib/<dominio>/types.ts`, com comentário de significado e origem.
- [ ] Função em `src/lib/<dominio>/<x>.api.ts` chamando `/api/...` com `withBasePath`.
- [ ] Rota em `src/mocks/handlers/<dominio>.ts` tipada com o tipo (`json<Tipo>(...)`).
- [ ] Dado coerente com o elenco (`src/mocks/elenco.ts`): a funcionalidade aparece em pelo menos
      uma oportunidade de cada fase em que faz sentido, e some (ou mostra o estado vazio) nas outras.
- [ ] Ações mudam o estado em memória, e o GET seguinte mostra o efeito.
- [ ] Regras por perfil (`temPapel`) quando a especificação diz que um perfil não pode agir.
- [ ] Se precisar de cenário novo (ex.: uma oportunidade num estado que nenhuma das 10 cobre),
      acrescente ao elenco com um `cenario` descritivo; ele aparece em `/prototipo`.

## 6. Verificar

```bash
pnpm check
```

E navegue de verdade: `pnpm dev`, entre em `/prototipo`, troque para cada perfil afetado, percorra o
fluxo, ligue a latência e a falha forçada para ver carregamento e erro. Se tiver as ferramentas de
navegador disponíveis, tire screenshots dos estados para o PR.

## 7. PR

- Título: `<ID-ADO> <descrição curta>`.
- Corpo: link para `especificacoes/<ID-ADO>-<slug>.md`, screenshots por estado/perfil, a lista de
  **arquivos de produto** alterados (fora de `src/mocks/`) e qualquer componente compartilhado
  mexido.
- `git push -u origin feat/<ID-ADO>-<slug>` e abra o PR para `main`.

## Armadilhas

- **Não "conserte" o que veio da produção** sem a funcionalidade pedir. Um ajuste solto num
  componente vira trabalho de port, revisão e risco em produção.
- **Não calcule regra na tela** para fazer o protótipo "funcionar". Calcule no mock e exponha o
  resultado num campo do tipo: é assim que a produção vai fazer.
- **Não importe `src/mocks/`** de nenhum arquivo de produto.
- **Nada de dado real**, nem para "ficar mais parecido".
