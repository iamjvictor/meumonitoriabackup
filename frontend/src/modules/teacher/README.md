# Módulo professor

Responsável pela área operacional do professor:

- perfil;
- página pública;
- categorias;
- subcategorias;
- materiais;
- questões;
- agentes.

Rotas principais previstas:

- `/professor`;
- `/professor/perfil`;
- `/professor/categorias`;
- `/professor/subcategorias`;
- `/professor/agentes`;
- `/professor/materiais`;
- `/professor/questoes`.

## API pública e convenções

As rotas devem importar a superfície pública de `src/modules/teacher/index.ts` sempre que o recurso estiver publicado no barrel. Componentes são nomeados em `PascalCase`; hooks usam `camelCase` com prefixo `use` (por exemplo, `useMonitorQuestions`); serviços usam `camelCase` com sufixo `Service`; tipos usam `PascalCase` e sufixo `Type` quando houver ambiguidade.

O módulo teacher não deve importar diretamente componentes ou serviços do módulo student. Dependências compartilhadas devem viver em `src/shared`.
