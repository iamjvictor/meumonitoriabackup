# LangGraph para questões — plano de implementação

> **Para execução:** aplicar `superpowers:subagent-driven-development` ou `superpowers:executing-plans` conforme o fluxo do repositório. As tarefas são acompanhadas em [tasks.md](./tasks.md).

**Objetivo:** entregar questões estruturadas à persistência existente, com revisão e complementação coordenadas por grafo recuperável.  
**Arquitetura:** grafo TypeScript por lote com revisor por questão, ramificações paralelas e consolidação determinística. Documento, chunks e imagens permanecem em seus repositórios; checkpoints duráveis guardam referências e progresso.  
**Tecnologia:** backend TypeScript, LangGraph JS, Prisma/Postgres, Supabase Storage e OpenRouter.  
**Spec:** [spec.md](./spec.md).

## Restrições globais

Manter schema `Question`, contrato `{label,text}`, revisão humana, imagens/fórmulas e fluxo KNOWLEDGE_BASE; não enviar PDF à LLM; configurar modelo por fluxo; nenhuma migração remota ou deploy sem autorização. Estado e checkpoints podem necessitar tabelas próprias, distintas de `Question`; definir migration local e política de acesso antes de executar.

## Pontos de atenção da revisão

- Questão atravessa lotes e aparece na sobreposição: deduplicar apenas quando evidência for suficiente.
- Gabarito é gerado simultaneamente às alternativas: reconciliar com alternativas finais; letra sem correspondência vira pendência.
- Gabarito aparece numa imagem ou página distante: busca documental completa com referências e acesso visual.
- Interrupção entre resposta da LLM e gravação: retomar sem duplicar nem sobrescrever edição do professor.
- PDF discursivo, fórmula ou figura ausente: preservar contexto, gerar alternativas quando possível e explicitar pendências.

## Arquivos previstos

- `backend/src/worker/services/structured-question-extraction.service.ts`: separar extração estruturada da persistência, preservando evidências existentes.
- `backend/src/worker/services/question-graph/` (novo): estado tipado, grafos, nós, orçamento de lotes, roteamento, merge e validadores.
- `backend/src/worker/services/question-extraction.service.ts` e `document-worker.service.ts`: invocar serviço do grafo, consolidar resultado e preservar operação atual.
- `backend/src/repositories/question.repository.ts` e repositório de checkpoints próprio: persistência idempotente e proteção de revisão; migrations apenas para checkpoint/progresso se necessárias.
- `backend/src/config/ai-models.config.ts`, `env.ts`, `backend/.env.example`, `backend/package.json` e lockfile: configuração isolada e dependências.
- `backend/src/worker/services/**/__tests__/`, `backend/src/repositories/__tests__/`, `tests/document-parser/`: testes de contrato, grafo e corpus, com QA independente.
- `docs/processamentopdf/questoes.md` e índice: refletir comportamento depois de implementado; manter histórico.

## Sequência

1. Fixar contratos internos e estado versionado; verificar LangGraph JS/checkpointer compatíveis com runtime e persistência local. Definir controle de concorrência e chave estável por execução/lote/questão.
2. Separar extrator da gravação e introduzir serviço que persiste o resultado. Cobrir fórmula, figura, contrato de alternativas e questões já revisadas antes da integração.
3. Implementar revisor, alternativas e gabarito com saídas estruturadas e acesso autorizado a contexto e imagens. Paralelizar ramos independentes e reconciliar resposta textual com alternativas finais.
4. Adicionar lotes, cobertura, reconciliação conservadora de sobreposição e checkpoint durável. Exercitar falhas antes/depois da persistência e progresso parcial.
5. Integrar ao worker/API, status e campos existentes; adaptar somente configurações específicas. Não ativar globalmente sem estratégia de compatibilidade.
6. QA independente: testes de contrato, integração, retomada e corpus de PDF; executar uso real de modelo apenas com chave autorizada e banco/storage local isolados. Registrar custos, limites e resultados por questão.

Detalhes executáveis, responsabilidades e testes encontram-se nos arquivos de tarefas e QA. Toda mudança deve preservar o trabalho não commitado existente.
