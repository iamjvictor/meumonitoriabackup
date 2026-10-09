# 4 - Texto livre nem sempre é uma boa saída para uma LLM

Quando uma LLM conversa com uma pessoa, texto livre pode ser suficiente.

Quando a resposta alimenta outro sistema, precisamos de estrutura.

Uma saída estruturada define campos, tipos e regras. Por exemplo: título, conteúdo, referências, confiança e origem.

Depois, validamos a resposta contra um schema antes de persistir ou encaminhar para outra etapa.

Isso transforma uma geração probabilística em um contrato verificável.

Se faltar um campo obrigatório, se um tipo estiver incorreto ou se a fonte não existir, o sistema pode rejeitar a saída e pedir revisão.

A LLM continua interpretando e gerando. Mas o software decide se o resultado atende ao contrato.

#LLM #StructuredOutput
