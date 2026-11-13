# Etapa do banco de questões opcional

## Objetivo e critérios de aceite

Permitir que o professor pule a etapa de questões pré-salvas sem escolher perfis de prova ou bancas. A seleção de questões do acervo continua opcional; a etapa seguinte continua responsável por exigir uma matéria e tópicos para criar o monitor.

- **AC-001:** Em “Banco de Questões”, continuar avança mesmo sem perfil/banca selecionado.
- **AC-002:** Sem perfil selecionado, questões e matérias do catálogo não são importadas para o monitor.
- **AC-003:** A mensagem da tela explica que o acervo é opcional e que matérias podem ser criadas manualmente.

## Abordagem e plano

Remover somente a validação que bloqueava a navegação na etapa 3 e atualizar o texto do estado vazio. Manter `syncCatalogToSubjects`, que não inclui conteúdo de catálogo sem perfis selecionados, e preservar a validação de matéria/tópicos nas etapas seguintes.

Arquivos: `frontend/src/modules/teacher/components/TeacherMonitorCreationModal.tsx`.

## Validação

- AC-001: código da etapa 3 agora limpa erro existente, sincroniza e avança para a etapa 4 sem validar perfis.
- AC-002: `filterQuestionBankCatalogByProfiles` retorna catálogo vazio quando a lista de perfis está vazia; a sincronização não importa conteúdo.
- AC-003: copy do estado vazio informa que o banco é opcional e orienta a criação manual.
- Typecheck frontend: `npm run typecheck` — aprovado.
