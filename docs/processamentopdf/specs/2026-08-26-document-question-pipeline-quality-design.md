# Qualidade do pipeline de questões — Design

## Objetivo

Processar documentos de questões sem perder candidatas recuperáveis, preservando a rastreabilidade e completando com IA os campos ausentes quando houver contexto suficiente.

## Requisitos

1. O retorno do Docling deve aceitar caixas delimitadoras válidas em seus formatos suportados. Um elemento isoladamente inválido não pode invalidar o documento inteiro.
2. Candidatas com enunciado fragmentado, alternativas ausentes ou continuação contextual devem ser promovidas para reconstrução por IA quando houver chunks de evidência.
3. Candidatas realmente irrecuperáveis continuam bloqueadas: enunciado vazio, múltiplas questões inseparáveis, evidência visual ausente quando obrigatória ou ausência total de contexto.
4. Gabarito e explicação devem ser gerados independentemente quando não existirem na fonte e só podem ser persistidos após validação estrutural e matemática.
5. Falha de classificação de tópico deve aplicar o tópico fallback válido; `topic_id` não deve ficar nulo quando esse fallback existir.
6. Falha de classificação ou perfil de tópico não deve impedir a extração das questões nem marcar o documento como parcial se as etapas essenciais terminarem.
7. Respostas estruturadas devem ser compactas, validadas localmente e ter fallback controlado para truncamento, schema inválido e resposta vazia.
8. O fluxo deve registrar contagens agregadas de candidatas promovidas, retidas por motivo, campos ausentes, fallbacks e operações pendentes.
9. `REVIEW_REQUIRED`/`PENDING_REVIEW` é estado normal do produto e não representa falha de processamento.

## Critérios de aceite

- Uma caixa inválida em uma página não causa falha global do parse; o layout continua utilizável e o evento registra a degradação.
- Uma candidata com contexto anterior/s seguinte e dados suficientes chega aos agentes de conclusão.
- Uma questão recuperável sem gabarito ou explicação é salva completa após conclusão e validação.
- Uma falha de tópico atribui o fallback e registra `topic_fallback_applied`.
- O mesmo PDF de 48 páginas produz mais questões completas que o baseline de 26 salvas, sem assumir como válidas candidatas realmente não-questionárias.
- Nenhuma questão salva como completa possui `correct_answer` ou `explanation` vazio.
- Os testes unitários, de contrato e de ingestão existentes continuam passando.

## Fora de escopo

- Alterar o modelo de dados público de questões.
- Remover a revisão humana.
- Apagar ou substituir o PDF original.
- Gerar flashcards automaticamente.

