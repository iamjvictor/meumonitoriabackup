# Módulo página pública do professor

Responsável pelas páginas comerciais públicas dos professores.

Essas páginas devem ser isoladas da área operacional do professor.

Este módulo é a principal origem de cadastro, compra e assinatura do aluno.

O objetivo é parecer a página do professor, não uma vitrine da plataforma.

Rota principal prevista:

- `/p/[teacherSlug]`

Formato futuro possível:

- subdomínio por professor: `[teacherSlug].meumonitor.ai`;
- domínio próprio apontando para o professor;
- domínio/caminho dedicado operado pelo MeuMonitor AI.

Fluxo esperado:

1. aluno acessa a página do professor;
2. escolhe um agente;
3. cria conta ou faz login;
4. assina o agente;
5. acessa a área do aluno.

Regra: não listar outros professores nessa página. Upsell futuro deve ser limitado a outros agentes do mesmo professor.

## API pública e convenções

Componentes usam `PascalCase`; hooks usam `camelCase` com prefixo `use`; serviços usam `camelCase` com sufixo `Service`; tipos usam `PascalCase`. A composição da rota pública deve permanecer isolada do módulo operacional do professor.
