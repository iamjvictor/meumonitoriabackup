# Frontend — MeuMonitor AI

Aplicação web em Next.js.

## Rotas principais

- `/` — landing principal para professores;
- `/alunos` — landing simples para aluno logar, sem vitrine de professores;
- `/professor` — área operacional do professor;
- `/aluno` — área autenticada do aluno;
- `/aluno/dashboard` — redirect legado para `/aluno`;
- `/p/[teacherSlug]` — página pública de venda de um professor específico;
- `/login` — autenticação placeholder.

## Diretriz de produto

O frontend não deve funcionar como marketplace.

O aluno pode assinar agentes de professores diferentes, mas a compra deve nascer sempre do contexto de uma página pública de professor, não de uma vitrine global da plataforma.

## Comandos

```bash
npm run dev
npm run lint
npm run typecheck
```
# front_meumonitor
