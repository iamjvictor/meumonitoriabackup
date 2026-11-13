# Plano de revisão independente de QA

Executado antes da implementação dos testes independentes. Escopo limitado a regressões verificáveis em unit tests sem credenciais, banco ou alterações de produção.

| QA | Critério | Reprodução | Aceite esperado |
|---|---|---|---|
| QA-01 | AC-003/005 | Candidato com resposta compatível preexistente, mas sem evidência auditável; invocar agente | Agente não deve pular validação de origem; prompt carrega número/caderno/versão quando disponíveis. |
| QA-02 | AC-005 | Agente declara foundInSource=true com evidência inventada/fora do contexto | Resultado nunca recebe SOURCE_DOCUMENT sem verificação da evidência pelo código. |
| QA-03 | AC-002/004 | Duas provas com mesmo número e tabelas diferentes; chamar busca autorizada | Evidência se associa ao segmento correto e a ferramenta permanece no documento do estado. Serviço real será bloqueado se não existir. |
| QA-04 | AC-006 | URL como enunciado atravessa revisor e agente | Fragmento não segue para geração de alternativas nem é tratado como completo. |
| QA-05 | AC-001/010 | Inspecionar caminho worker e integração LangGraph | Um teste de integração comprova que QUESTIONS invoca grafo antes de persistir e propaga status com pendências. Se não houver seam/API de teste, registrar lacuna e não fazer teste estático passar por comportamento. |

Testes serão adicionados em arquivo novo `answer.agent.qa.test.ts`; testes de serviço inexistente ou integração não conectável serão reportados como achados, não simulados como aceitos. Comando focado: `NODE_ENV=development PAYMENTS_PROVIDER=SIMULATED node --import tsx --test src/worker/services/question-graph/__tests__/answer.agent.qa.test.ts`. Falhas demonstram lacunas atuais; não alterar produção nem enfraquecer assertions.
