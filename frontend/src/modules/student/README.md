# Módulo aluno

Responsável pela experiência do aluno.

Existe uma separação importante:

- `/alunos`: página pública simples para login/entrada do aluno;
- `/aluno`: área autenticada do aluno.

A plataforma não deve exibir uma vitrine de professores. O aluno assina um agente ao entrar pela página pública de um professor específico.

- agentes assinados;
- prática de questões;
- chat;
- desafio diário;
- ranking;
- simulados;
- desempenho.

Rotas principais previstas:

- `/aluno`;
- `/aluno/agentes`;
- `/aluno/pratica`;
- `/aluno/chat`;
- `/aluno/simulados`.

## API pública e convenções

As rotas devem importar a superfície pública de `src/modules/student/index.ts`. Componentes são nomeados em `PascalCase`; hooks usam `camelCase` com prefixo `use` (por exemplo, `useStudentPerformance`); serviços usam `camelCase` com sufixo `Service`; tipos usam `PascalCase` e sufixo `Type` quando o contexto não for óbvio.

O módulo student não deve importar diretamente componentes ou serviços do módulo teacher. Integrações entre domínios devem passar por uma API compartilhada em `src/shared` ou por uma interface de serviço explícita.
