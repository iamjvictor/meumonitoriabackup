# Relatório independente de QA — alternativas e contexto visual

Data: 07/11/2026. Escopo: contrato de proveniência AI_GENERATED, sequência alternativas → gabarito, preservação de pendências, e filtro de assets visuais lowercase. Testes são mockados, determinísticos e não chamam OpenRouter, Supabase ou banco. Não alterei produção nem critérios de aceite.

## Resultado por critério

| Critério | Resultado | Evidência |
|---|---|---|
| AC-007 — alternativas finais e proveniência | **Passou no caso normal** | O teste do grafo reproduz AI_GENERATED com evidenceQuote não nulo, confirma uma correção de schema e preserva cinco opções AI_GENERATED A–E. A origem não vira SOURCE_DOCUMENT. |
| AC-008 — gabarito proposto e revisão humana | **Passou no caso normal** | Após a correção, o agente de gabarito recebeu as cinco opções finais, respondeu A com origem AI_GENERATED e a saída continuou `PENDING_REVIEW`/`needsReview=true`, com pendência pedagógica preservada. |
| AC-009 — recuperação de figuras | **Passou no filtro do provider** | Fixture Prisma com `assetType='figure'` e `assetType='page'`: baixou e retornou somente os dois assets figure em lowercase; não baixou pages. Não cobre renderização real na interface. |
| Limite adicional de segurança — declaração explícita de impossibilidade | **Passou após o contrato `optionsUsable`** | Com `optionsUsable=false`, o nó gera `ALTERNATIVES_AGENT_INCOMPLETE` e não chama o agente de gabarito. A pendência pedagógica comum com `optionsUsable=true` ainda avança ao gabarito. |

## Comandos e resultados

Executados em `backend/`:

```sh
node --import tsx --test src/worker/services/question-graph/__tests__/reviewer-alternatives-answer-pending.qa.test.ts src/worker/services/question-graph/__tests__/prisma-context-provider.asset-type-lowercase.qa.test.ts
```

Resultado: 2 passaram e 1 falhou. A aprovação foi o cenário normal alternativas→gabarito e o teste visual. A falha foi o cenário `pendingIssue` que declara impossibilidade.

```sh
node --import tsx --test src/worker/services/question-graph/__tests__/alternatives.agent.retry.contract.test.ts src/worker/services/question-graph/__tests__/reviewer-agent-loop.test.ts src/worker/services/question-graph/__tests__/prisma-context-provider.asset-type.test.ts src/worker/services/question-graph/__tests__/prisma-context-provider.asset-type-lowercase.qa.test.ts src/worker/services/question-graph/__tests__/reviewer-alternatives-answer-pending.qa.test.ts
```

Resultado: 9 passaram e 2 falharam. Além da falha de impossibilidade, o teste existente `reviewer-agent-loop.test.ts` espera uma chamada de alternativas quando elas não podem ser concluídas, mas o grafo faz duas chamadas de alternativas antes de encerrar; nenhuma chamada de gabarito ocorreu nesse caso. Não alterei a expectativa existente. A spec define até duas rodadas de conteúdo por candidato, então esse ponto precisa ser reconciliado pelo dono do teste com a política atual.

Após a implementação do sinal explícito `optionsUsable`, rodei novamente a seleção focada com `alternatives.agent.qa.test.ts`, `alternatives.agent.retry.contract.test.ts`, `reviewer-agent-loop.test.ts` e os dois testes independentes deste QA. Resultado observado: **13 passaram e 1 falhou**. Os cenários normal, impossibilidade e `figure`/`page` passaram. A única falha restante foi uma asserção no teste `reviewer-agent-loop.test.ts` que esperava `correctAnswer === undefined`, embora o estado base contenha `null`. Não alterei esse teste.

## Achado acompanhado e corrigido na implementação

### Resolvido — o agente de gabarito não recebe opções declaradas inutilizáveis

**Reprodução:** execute em `backend/`:

```sh
node --import tsx --test --test-name-pattern="pendingIssue que declara impossibilidade" src/worker/services/question-graph/__tests__/reviewer-alternatives-answer-pending.qa.test.ts
```

O teste fornece cinco strings A–E e `optionsUsable=false` junto a `pendingIssue='Não foi possível criar cinco alternativas coerentes ou legíveis com o contexto disponível.'`. Antes da mudança, o grafo avançava ao gabarito. Após a mudança, o reviewer encerra sem chamar esse agente e mantém a pendência.

**Código relacionado:** [alternatives.agent.ts](../../backend/src/worker/services/question-graph/alternatives.agent.ts#L399) produz `ALTERNATIVES_AGENT_INCOMPLETE` se `optionsUsable` não for explicitamente `true` ou se as A–E não forem estruturalmente válidas. O reviewer trata esse issue como bloqueador do gabarito. O teste [reviewer-alternatives-answer-pending.qa.test.ts](../../backend/src/worker/services/question-graph/__tests__/reviewer-alternatives-answer-pending.qa.test.ts#L86) cobre o sinal `false`.

O alerta pedagógico comum segue permitindo gabarito quando as opções são utilizáveis; a declaração de inviabilidade impede o avanço.

## QA visual

O teste [prisma-context-provider.asset-type-lowercase.qa.test.ts](../../backend/src/worker/services/question-graph/__tests__/prisma-context-provider.asset-type-lowercase.qa.test.ts) usa registros persistidos em lowercase e emula igualdade exata da consulta. Foram retornadas `figure-question` e `figure-nearby`, sem `page-7`/`page-8`; somente os caminhos `figures/*.png` foram baixados. O provider usa `assetType: 'figure'` nas três consultas relevantes. Esse teste confirma seleção e download, não posição/renderização na UI nem bytes de storage reais.

## Contagem do upload local anterior

O artefato [report.json](../../tests/document-parser/local-agentic/artifacts/2026-11-07T13-48-28-287Z-08de44d5/report.json) contém 10 questões e **2/10 com `correctAnswer` AI_GENERATED**; 8/10 ficaram sem gabarito. O relatório de retry foi corrigido para refletir essa contagem.

## Lacunas

- Nenhum teste usou modelo remoto ou calculou custo; o contrato foi testado com respostas estruturadas dublês.
- A filtragem visual foi validada no provider com storage dublado; interface local e renderização de figuras continuam sem cobertura nesta rodada.
- O teste de impossibilidade usa texto livre exato em português e identifica a lacuna atual; eventual contrato tipado para essa sinalização exige teste correspondente após alteração autorizada pelo arquiteto.
