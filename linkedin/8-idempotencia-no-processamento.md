# 8 - Processar duas vezes não deveria criar dois resultados

Pipelines de documentos são executados por workers, filas e retries. Uma mesma solicitação pode chegar mais de uma vez.

Sem idempotência, isso gera duplicidade, custo desnecessário e resultados difíceis de rastrear.

Por isso, usamos uma chave que representa a identidade do processamento: conteúdo, parser, configuração, modelo e versão do schema.

Se a mesma combinação já foi processada, o sistema pode reutilizar o resultado. Se uma versão importante mudar, um novo processamento é criado de forma explícita.

Idempotência parece um detalhe de infraestrutura, mas protege dados, custo e consistência.

#Backend #AIEngineering
