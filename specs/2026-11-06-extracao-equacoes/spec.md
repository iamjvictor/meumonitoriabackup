# Preservação de fórmulas pelo prompt de extração

## Direção atual

O usuário optou por testar **somente ajustes de prompt**, sem adicionar ferramenta, function calling ou cadeia de agentes. A extração mantém uma chamada estruturada contendo o texto integral e imagens disponíveis. Esta decisão substitui a proposta anterior de ferramenta de equações.

## Objetivo

Orientar a LLM a preservar fórmulas e equações de matemática, física e química, incluindo expoentes, índices, unidades, frações e posições, usando a evidência visual do documento quando disponibilizada. Incertezas devem ser sinalizadas para revisão; o modelo não deve inferir símbolos ausentes.

## Critérios

- AC-001: A extração recebe o documento integral em uma única chamada, sem registrar ou chamar nova ferramenta.
- AC-002: O prompt pede preservação literal de fórmulas e alternativas, incluindo sobrescritos/subscritos, com imagem como evidência quando disponível e indicação de incerteza quando ausente ou ilegível.
- AC-003: No PDF Pedro Lucas, avaliar Q07 A contra a imagem (`3 × 10¹⁷`); verificar as 10 questões e alternativas, sem inferir sucesso apenas pela contagem.
- AC-004: Testes cobrem contexto textual e imagem, saída estruturada e ausência de ferramenta; execução real do modelo é relatada separadamente de mocks, sem banco de produção.

## Limites

A formulação do prompt não garante reconhecimento visual perfeito. Falhas ou divergências devem continuar sinalizadas para revisão. Nenhuma migração, deploy, reprocessamento no banco ou alteração de credenciais.
