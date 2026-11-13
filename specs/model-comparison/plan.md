# Plano

1. Validar catálogo e capabilities do OpenRouter por modelo/provedor; capturar fonte e timestamp. Restrições de retenção que não forem comprováveis permanecem destacadas.
2. Reutilizar o snapshot baseline existente: três PDFs, OCR/texto, 22 chunks/embeddings, blocos, imagens e relações. Criar banco local dedicado por teste/rodada e importar apenas o grafo sanitizado; nunca copiar questão gerada do baseline para o alvo.
3. No processo exclusivo do runner, carregar o env próprio, instalar o interceptor antes de importar os módulos TypeScript, descrever/indexar os assets visuais e executar o `QuestionExtractionService.processDocument` sobre Quimica-3. Não alterar `backend/src`.
4. Executar duas rodadas para cada combinação, além de usar o resultado Gemini já salvo como referência. Registrar uso/custos por resposta OpenRouter; obter preço por usage/call ou manter NAO_VERIFICADO, sem estimativa inventada.
5. Comparador produz tabela Markdown/CSV, comparação por questão, contexto visual, saída do chat Q03 quando verificada, custo/latência/tokens e variação entre rodadas.
6. QA independente revisa isolamento, roteamento, asserções, telemetria e artefatos. O usuário autorizou em 2026-11-02 executar os quatro testes locais; nenhuma chamada pode ir a produção/sandbox e erros de preflight continuam fail-closed.
