# Limites de validação para taxonomia de questões

## Objetivo

Permitir que a criação de monitores aceite nomes longos provenientes do catálogo de questões, sem truncar rótulos oficiais e sem enfraquecer os limites dos campos gerais do monitor.

## Problema atual

O assistente envia os caminhos de tópicos como texto achatado (`tópico > subtópico > subsubtópico`). O backend limita esse campo e os componentes da seleção do catálogo a 120 caracteres. Caminhos legítimos ultrapassam esse limite e a API rejeita a criação antes de persistir o monitor.

## Decisões

- Cada rótulo de taxonomia enviado em `questionBankSelections.topic`, `subtopic` e `subsubtopic` pode ter até 360 caracteres.
- A matéria raiz (`subjects[].name` e `questionBankSelections.subject`), o nome do monitor, a banca e `examType` mantêm seus limites atuais.
- O campo achatado `subjects[].topics[].name` aceita até 1086 caracteres: três rótulos de 360 caracteres separados por ` > ` (seis caracteres de separadores).
- Valores recebidos são preservados integralmente; o frontend e o backend não os truncam.
- `selectionKey` mantém o formato atual para seleções cujos componentes de taxonomia tenham até 120 caracteres. Se qualquer componente de taxonomia ultrapassar 120, gerar uma chave determinística compacta com prefixo `sha256:` a partir dos campos normalizados, mantendo o índice único limitado e sem alterar chaves já persistidas.
- O endpoint que recebe tópicos como caminhos achatados usa o mesmo limite de 1086 caracteres. Campos de nome do monitor e matéria continuam com limite 120.

## Fora do escopo

- Alterar o formato do payload para uma hierarquia aninhada ou IDs de catálogo.
- Modificar o materializador, as consultas do acervo ou o conteúdo das questões.
- Alterar os limites de título/descrição do monitor ou de matéria raiz.

## Camada TDD e critérios de aceite

1. O schema aceita um rótulo de taxonomia com 360 caracteres e rejeita um com 361.
2. O schema aceita um caminho achatado de 1086 caracteres e rejeita um com 1087.
3. Nome do monitor e nome da matéria acima de 120 continuam inválidos.
4. Uma seleção curta mantém exatamente a chave legada; uma seleção longa recebe uma chave `sha256:` determinística e igual para entradas equivalentes após normalização.
5. A validação do payload realista com matérias e seleções longas aceita a criação, sem truncar os valores.
6. O contrato das rotas de criação e adição de matérias aceita os caminhos de taxonomia até 1086 caracteres.

## Arquivos previstos

- `backend/src/models/monitor.model.ts`: limites de caminho e componentes de seleção.
- `backend/src/controllers/monitor.controller.ts`: limite de caminhos em rotas que recebem tópicos achatados.
- `backend/src/modules/question-bank/services/question-bank-selection.service.ts`: chave compacta determinística apenas para componentes longos.
- Testes dos schemas do monitor, do controlador e do serviço de seleção.
- Atualização do spec/plano de materialização do acervo, se necessário, somente para registrar a compatibilidade de chaves longas.
