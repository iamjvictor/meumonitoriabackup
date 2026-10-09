# Análise consolidada de pendências — MeuMonitorAI

**Data:** 08/09/2026  
**Escopo:** frontend, backend, chat RAG, pagamentos, ingestão de documentos, qualidade, testes e operação.

Este arquivo substitui `RAGchat-PENDENTE.md`, `analisefrontend.md` e `analisebackend-PENDENTE.md`.

Prioridades:

- **P0:** bloqueia lançamento, segurança, cobrança ou promessa central do produto;
- **P1:** importante para a próxima entrega e confiabilidade;
- **P2:** melhoria estrutural, performance ou manutenção.

## P0 — Produto real

### 1. Pagamento de produção

- [ ] Escolher e integrar o gateway de produção.
- [ ] Substituir o provider simulado por um adapter real.
- [ ] Implementar checkout real para PIX, cartão e boleto, conforme suporte do gateway.
- [ ] Implementar webhooks assinados, validação de autenticidade, timestamp e request id.
- [ ] Deduplicar webhooks por identificador externo e permitir reprocessamento seguro.
- [ ] Processar pagamento aprovado, falha, cancelamento, estorno e chargeback.
- [ ] Persistir referências externas de pedido, cobrança, cliente e assinatura.
- [ ] Ativar assinaturas somente após confirmação do gateway.
- [ ] Implementar comissão, split e responsabilidades após definição comercial dos percentuais.
- [ ] Remover `MOCK_PAYMENT_CONFIGURED = true` do frontend.
- [ ] Remover ou isolar o fluxo simulado somente para ambiente de teste.
- [ ] Testar preço adulterado, compra repetida, sessão expirada, webhook duplicado e compra de outro aluno.
- [ ] Validar o fluxo manual completo com dois monitores.

**Evidências:** `frontend/src/modules/teacher/services/TeacherProfileService.ts`, `backend/src/modules/billing`, `backend/src/config/env.ts` e `backend/src/routes/student-purchase.routes.ts`.

### 2. Histórico do chat no Redis — decisão atual

**Decisão:** por enquanto, o contexto da conversa ficará somente no Redis. A persistência definitiva no banco não bloqueia a versão atual e fica registrada como evolução futura.

- [ ] Manter o isolamento por aluno, monitor e matéria.
- [ ] Monitorar TTL, quantidade máxima de mensagens e consumo de memória do Redis.
- [ ] Garantir que falhas do Redis mostrem erro recuperável ao aluno.
- [ ] Documentar claramente que o histórico é temporário.
- [ ] Futuramente, criar tabelas para chats, mensagens, gerações e fontes recuperadas.
- [ ] Futuramente, adicionar migration, paginação, auditoria e persistência definitiva.

**Evidências:** `backend/src/modules/chat/README.md` e `backend/src/modules/chat/repositories/redis-chat-history.repository.ts`.

### 3. Fase 3 do chat — adiada

**Decisão:** esta fase não é necessária agora e foi adiada. O chat continuará usando requisições normais, com uma resposta completa por mensagem e contexto temporário no Redis.

- [ ] Futuramente implementar streaming SSE.
- [ ] Futuramente exibir resposta parcial no frontend.
- [ ] Futuramente implementar retry automático com idempotência.
- [ ] Futuramente evoluir os estados de conversa para resposta parcial, limite de uso e acesso indisponível.
- [ ] Futuramente definir autenticação interna se o `chat-service` for separado.
- [ ] Futuramente separar o chat do worker quando houver necessidade de escala.

## P1 — Funcionalidades

### 4. Corrigir o ranking do aluno

- [ ] Remover `Math.random()` usado para total respondido e precisão.
- [ ] Remover pontuação fixa inserida para o aluno atual.
- [ ] Não exibir alunos fictícios quando a API estiver vazia ou indisponível.
- [ ] Criar estado vazio real para “ainda não há participantes”.
- [ ] Fazer o backend retornar total respondido, precisão, sequência e posição do aluno.
- [ ] Testar ranking vazio, usuário fora da primeira página, mês inválido e monitor sem acesso.

**Evidência:** `frontend/src/app/(student-app)/areadoaluno/ranking/page.tsx`.

### 5. Validar visualmente o frontend em ambiente real

- [ ] Subir frontend e backend ativos.
- [ ] Capturar screenshots em `375px`, `768px`, `1280px` e `1920px`.
- [ ] Validar login, área do aluno, prática, chat, ranking, checkout, perfil do professor e monitor.
- [ ] Corrigir overflow, clipping, sobreposição de sidebars e modais fora da viewport.
- [ ] Validar teclado virtual, orientação landscape e viewport baixa.

### 6. Completar a integração funcional do chat no frontend ✅

- [x] Confirmar carregamento das matérias autorizadas no seletor.
- [x] Confirmar criação/recuperação idempotente do chat por matéria.
- [x] Garantir troca de matéria sem misturar histórico ou contexto.
- [x] Confirmar que “Tirar dúvida com IA” envia somente referências validáveis.
- [x] Exibir e restaurar o indicador de questão/flashcard anexado.
- [x] Tratar especificamente `403`, limite de uso, falha de geração e resposta vazia.
- [x] Avaliar exposição de citações e fontes para o aluno.

### 7. Testes comportamentais

- [ ] Adicionar testes com Testing Library para dashboard, prática, chat, checkout, ranking e modais.
- [ ] Adicionar smoke tests com Playwright para os fluxos críticos.
- [ ] Testar loading, erro, vazio, retry e sessão expirada.
- [ ] Testar troca de matéria e anexos de questão/flashcard no chat.
- [ ] Testar acessibilidade básica dos controles principais.

## P1 — Backend e segurança

### 8. Modularizar rotas legadas ✅

- [x] Extrair de `protected.routes.ts` perfil do aluno, flashcards, acesso a monitores e consultas diretas ao Prisma.
- [x] Criar módulos verticais para perfil, flashcards, acesso, questões e chat.
- [x] Manter rotas como adapters HTTP, sem regra de negócio ou Prisma direto.
- [x] Definir composition root por módulo.

### 9. Padronizar contratos e erros ✅

- [x] Criar `AppError` com código, status HTTP, mensagem pública e detalhes internos.
- [x] Padronizar respostas de validação, autenticação, autorização e erro inesperado.
- [x] Evitar registrar objetos de erro completos com dados sensíveis.
- [x] Substituir `any` em payloads HTTP, billing, webhooks, compras e integrações Prisma.
- [x] Criar schemas Zod estritos para entradas e respostas principais.

### 10. Separar aplicação e bootstrap

- [ ] Criar `src/app.ts` para montar/configurar o Fastify.
- [ ] Deixar `src/server.ts` somente com ambiente e `listen`.
- [ ] Permitir testes com `app.inject()` sem abrir porta real.
- [ ] Adicionar testes HTTP de autenticação, ownership, validação e erros.

### 11. Preparar operação e escala

- [ ] Separar worker de documentos do scheduler de desafio diário.
- [ ] Reduzir dependência do worker em repositórios globais da API.
- [ ] Revisar cache de sessão em memória para múltiplas instâncias.
- [ ] Criar health checks para API, Redis, banco, worker e provider de IA.
- [ ] Criar métricas, logs estruturados, alertas e correlação por `requestId`.

## P1 — Documentos, questões e RAG

### 12. Concluir ingestão visual V3

- [ ] Fixar versão efetiva do MinerU e dependências transitivas.
- [ ] Diferenciar falha de comando, timeout, dependência ausente e falha do parser.
- [ ] Finalizar adapter para layout interno, páginas 1-based, bbox normalizada e assets.
- [ ] Executar PDF real de 48 páginas com timeout controlado e preservar artefatos.
- [ ] Registrar tempo, memória, warnings, backend usado e resultado por documento.
- [ ] Persistir parse runs, elementos de layout, assets e relações de evidência.
- [ ] Integrar parser visual ao worker atrás de feature flag.
- [ ] Manter fallback para o extrator atual quando permitido.
- [ ] Reprocessar sem sobrescrever parse anterior ou conteúdo aprovado.
- [ ] Comparar MinerU com baseline e decidir `PASS`, `FAIL` ou `ALTERNATIVE_ADAPTER_REQUIRED`.

**Evidência:** [`2026-09-08-melhoria-v3.md`](2026-09-08-melhoria-v3.md) ainda marca persistência e conexão ao worker produtivo como não implementadas.

### 13. Validar qualidade com corpus real

- [ ] Criar corpus ouro de 40–60 páginas com colunas, fórmulas, tabelas, figuras e questões que atravessam páginas.
- [ ] Criar anotações esperadas de reading order, bbox, statement, alternativas, solução, assets, tópico e `shouldPromote`.
- [ ] Executar baseline e versionar resultados.
- [ ] Validar reconstrução, associação de gabarito/solução e bloqueio de contaminantes.
- [ ] Validar chunks de questão, teoria, solução e exemplos trabalhados.
- [ ] Comparar dense-only e híbrido usando Recall@K, MRR, NDCG e precisão de contexto.
- [ ] Reprocessar PDFs de regressão e comparar completas, incompletas, retidas e fallbacks.

### 14. Completar qualidade do pipeline de IA

- [ ] Garantir evidence IDs em cada campo gerado.
- [ ] Bloquear gabarito/explicação sem evidência ou com matemática corrompida.
- [ ] Implementar estados de revisão pendente para incompleta, visual, matemática e fonte ambígua.
- [ ] Implementar Quality Router entre fast path e parser visual.
- [ ] Implementar shadow mode, feature flag, revisão obrigatória e reprocessamento seguro.
- [ ] Criar avaliação independente de grounding e pedagogia.

## P2 — Manutenção do frontend

### 15. Reduzir dívida de lint ✅

- [x] Reduzir os 231 warnings registrados.
- [x] Priorizar `no-explicit-any` em fronteiras de API.
- [x] Migrar imagens legadas para `next/image` quando apropriado.
- [x] Corrigir regras de React Hooks e `setState` em effects.
- [x] Remover imports e estados não utilizados.
- [x] Trocar `window.location.href` por navegação do Next quando aplicável.
- [x] Configurar o lint do backend; atualmente `npm run lint` falha porque `eslint` não foi encontrado.

### 16. Segunda rodada de componentização

- [ ] Reduzir a página de prática do aluno.
- [ ] Extrair responsabilidades restantes de `TeacherRegistrationModal.tsx`.
- [ ] Extrair responsabilidades restantes de `StorefrontClient.tsx`.
- [ ] Criar teste de regressão antes de cada extração.
- [ ] Garantir APIs públicas por `index.ts` e barreiras de dependência.

### 17. Tokens, performance e responsividade

- [ ] Migrar hexadecimais restantes para tokens/primitives.
- [ ] Auditar imports de ícones Lucide.
- [ ] Adicionar lazy loading em imagens fora do viewport inicial.
- [ ] Remover `use client` de componentes sem interatividade.
- [ ] Aplicar container queries nos cards de dashboard.
- [ ] Garantir touch targets mínimos de 44px e grids intermediários para tablet.
- [ ] Validar sidebar, header, tabela de questões e layout de três colunas em desktop.

## P2 — Produto e operação

- [ ] Definir limites de uso do chat, tokens, custo e comportamento ao atingir limite.
- [ ] Criar painel interno para revisão de reports dos alunos.
- [ ] Permitir classificar, resolver e auditar reports de questões e flashcards.
- [ ] Definir política de exposição de gabarito e explicação no chat.
- [ ] Avaliar compactação persistente do histórico após a primeira versão.
- [ ] Avaliar query rewriting seletivo e decomposição de consultas no RAG.
- [ ] Planejar deploy separado do `chat-service` quando houver necessidade operacional.

## Verificações atuais

- Frontend typecheck: passou.
- Frontend testes estruturais: 21/21 passaram.
- Frontend build: passou.
- Backend typecheck: passou.
- Backend build: passou.
- Testes do chat: 24/24 passaram.
- Backend lint: não validado; `eslint` não foi encontrado.
- Validação visual real: não executada.
- Pagamento real: não concluído.
- Histórico do chat no Redis: solução atual aceita; persistência definitiva fica para o futuro.

## Ordem recomendada

1. Pagamento real.
2. Remoção dos dados artificiais do ranking.
3. Validação visual real.
4. Testes comportamentais.
5. Lint, bootstrap e modularização do backend.
6. Ingestão visual V3 e corpus de regressão.
7. Melhorias de performance, tokens e componentização.
8. Fase 3 do chat, quando houver necessidade de streaming, retry avançado ou escala.
9. Persistência definitiva do chat, quando a necessidade do produto justificar.
