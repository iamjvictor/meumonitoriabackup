# Plano técnico

Desenho: [proposta de PDF](../../docs/processamentopdf/specs/2026-11-05-pedro-lucas-question-extraction-design.md). Plano detalhado: [implementação](../../docs/processamentopdf/planos/2026-11-05-extracao-questions-llm-estruturada.md).

1. Medir e corrigir cobertura do texto no worker/chunker/repositório; persistir embeddings antes da extração e representar falhas sem sucesso falso (AC-001/002).
2. Preparar corpo único ordenado com todas as referências de origem e limites explícitos; recusar entrada excessiva sem dividir nem truncar (AC-003).
3. Chamar uma LLM com schema estruturado e entradas textuais/visuais, validar origem e campos opcionais (AC-003–005).
4. Integrar ao worker e persistir questões para revisão sem agentes de completamento; preservar idempotência e isolamento de `KNOWLEDGE_BASE` (AC-006).
5. Executar QA independente e aceitação por arquivo; avaliar chamada real multimodal em separado dos testes locais simulados (AC-004/005/007).

Modelo exato, limites de tokens e compatibilidade de saída estruturada/visão serão verificados no ambiente de execução antes de configurar o provider. Não assumir equivalência entre igualdade de quantidade de páginas e cobertura integral do conteúdo. A interpretação sobre texto versus vetores está destacada em `spec.md`.
