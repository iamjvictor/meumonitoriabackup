# Sessão antiga após cadastro de aluno

## Objetivo
Evitar que uma credencial expirada do navegador sobrescreva a sessão recém-criada por cookie durante o cadastro ou login de aluno.

## Critérios de aceite
- **AC-001:** se login/cadastro não retornar access token no corpo, remover o token antigo do `localStorage` e deixar a autenticação por cookie atuar.
- **AC-002:** se a API retornar access token, persistir o token novo normalmente.
- **AC-003:** cadastro segue para a próxima ação autenticada sem anexar um bearer token expirado.
