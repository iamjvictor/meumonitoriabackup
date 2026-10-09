# Inventário Frontend — Fase 0

**Data:** 2026-09-06  
**Escopo:** inspeção estática do frontend em `src/app`, `src/modules`, `src/components`, `src/context` e `src/lib`. Nenhuma implementação existente foi refatorada, movida ou revertida.

## 1. Método e baseline

- Inventário por `rg --files`, contagem de linhas e inspeção de imports/classes Tailwind.
- Evidência estática; não houve captura de screenshots nem validação visual em navegador nesta fase.
- O working tree já possuía alterações antes deste artefato; elas foram preservadas.
- Stack declarada na especificação: Next.js 16.3/App Router, React 19, Tailwind v4, TypeScript, Supabase SSR e Framer Motion.

## 2. Rotas identificadas

| URL | Arquivo | Persona/observação |
|---|---|---|
| `/` | `src/app/(marketing)/page.tsx` | Marketing; composição de seções e modais |
| `/login` | `src/app/(auth)/login/page.tsx` | Auth; redirect server-side |
| `/alunos` | `src/app/(student-marketing)/alunos/page.tsx` | Landing do aluno |
| `/p/[teacherSlug]` | `src/app/(public-teacher)/p/[teacherSlug]/page.tsx` | Página pública do professor |
| `/areadoaluno` | `src/app/(student-app)/areadoaluno/page.tsx` | Dashboard do aluno |
| `/areadoaluno/agentes` | `.../agentes/page.tsx` | Agentes do aluno |
| `/areadoaluno/checkout` | `.../areadoaluno/checkout/page.tsx` | Reexporta `../../checkout/page` |
| `/areadoaluno/desempenho` | `.../desempenho/page.tsx` | Desempenho |
| `/areadoaluno/perfil` | `.../perfil/page.tsx` | Perfil |
| `/areadoaluno/planos` | `.../planos/page.tsx` | Planos |
| `/areadoaluno/pratica` | `.../pratica/page.tsx` | Prática/questões |
| `/checkout` | `src/app/(student-app)/checkout/page.tsx` | Checkout compartilhado |
| `/checkout/simulado` | `.../checkout/simulado/page.tsx` | Checkout de simulado |
| `/professor` | `src/app/(teacher)/professor/page.tsx` | Dashboard professor |
| `/professor/perfil` | `.../perfil/page.tsx` | Perfil professor |
| `/professor/monitores/[monitorId]` | `.../monitores/[monitorId]/page.tsx` | Workspace do monitor |

Também existem layouts em `src/app/layout.tsx`, `.../areadoaluno/layout.tsx` e `.../professor/layout.tsx`, além de assets de app (`icon`, `favicon`, fontes). Total: 16 páginas/entradas de rota listadas.

## 3. Módulos, componentes, contexts e guards

### Estrutura observada

- `src/modules/marketing`: 16 componentes e 2 services; usado pela home.
- `src/modules/public-teacher`: README apenas; a implementação pública está em `src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient.tsx`.
- `src/modules/student`: `StudentAuthModal.tsx` e README; módulo subutilizado.
- `src/modules/teacher`: componentes de header/dashboard/perfil/modais/guard, hooks e services.
- `src/components`: `AlertModal`, `ui/*` e `student-landing/*`.
- `src/context/AlertContext.tsx`: provider global no root layout.
- Contexto de aluno e seus guard/componentes estão dentro de `src/app/(student-app)/areadoaluno/`.

### Consumidores e fronteiras relevantes

| Origem | Dependência | Evidência |
|---|---|---|
| `areadoaluno/layout.tsx` | `StudentProvider`, `StudentSessionGuard` | linhas 2–8 |
| páginas de `areadoaluno/*` | `StudentHeader`, `StudentSidebar`, `StudentRightSidebar`, `useStudent` | imports nas linhas iniciais de `page.tsx`, `agentes`, `desempenho`, `perfil`, `planos`, `pratica` |
| `app/layout.tsx` | `AlertProvider` | linha 42 |
| marketing, storefront e páginas de planos/agentes | `useAlert` | `src/modules/marketing/components/LoginModal.tsx:21`, `StorefrontClient.tsx:30`, páginas de aluno |
| professor pages | `modules/teacher/*` services/components | `professor/page.tsx:4–7`, `perfil/page.tsx:3`, monitor page `:39–42` |
| storefront público | `StudentAuthModal`, `AlertContext`, UI shader cards | `StorefrontClient.tsx:28–30` |
| monitor page | `AlertModal` global solto | `[monitorId]/page.tsx:42` |

Não há `index.ts` de API pública nos módulos. `tsconfig.json` possui alias `@/* -> ./src/*`; não há aliases específicos por módulo.

## 4. God files candidatos

| Prioridade | Arquivo | Linhas | Sinais observáveis |
|---|---|---:|---|
| P0 | `src/app/(teacher)/professor/monitores/[monitorId]/page.tsx` | 4.244 | fetch/estado, workspace, abas, upload, questões, flashcards e múltiplos modais no mesmo arquivo; `useEffect` na linha 250 e layout principal na 1241 |
| P1 | `src/app/(student-app)/areadoaluno/pratica/page.tsx` | 1.251 | busca de questões, tentativas, flashcards, estado e UI; fetches nas linhas 423, 468, 510, 551 |
| P1 | `src/modules/marketing/components/TeacherRegistrationModal.tsx` | 1.189 | modal/formulário e fluxo de cadastro concentrados |
| P1 | `src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient.tsx` | 1.168 | sessão, compra, tabs, catálogo e modais; fetches nas linhas 170, 239, 418 |
| P1 | `src/app/(student-app)/areadoaluno/page.tsx` | 928 | dashboard, desafios, consistência, flashcards e modais; fetches nas linhas 93–95, 188, 251, 285 |
| P2 | `src/app/(student-app)/checkout/page.tsx` | 675 | fluxo de checkout completo |
| P2 | `src/modules/student/components/StudentAuthModal.tsx` | 673 | login, lead, signup e validação de senha |
| P2 | `src/app/(student-app)/areadoaluno/planos/page.tsx` | 606 | catálogo/planos e ações de compra |
| P2 | `src/modules/teacher/components/TeacherProfileView.tsx` | 731 | visualização/edição de perfil |
| P2 | `src/modules/teacher/components/TeacherDashboardOverview.tsx` | 631 | dashboard professor concentrado |
| P2 | `src/app/(student-app)/areadoaluno/StudentRightSidebar.tsx` | 733 | sidebar com lógica de negócio inline |

## 5. Baseline de responsividade por inspeção

| Alvo | Evidências | Baseline/riscos a validar |
|---|---|---|
| Mobile ~375px | vários `grid-cols-1`, `px-4/5`, `w-full`; storefront usa `md:hidden` em `StorefrontClient.tsx:649` | cobertura existe, mas há controles e conteúdo denso; monitor usa `h-screen w-screen overflow-hidden` (`:1241`), risco de clipping/scroll interno |
| Tablet ~768px | grids frequentemente saltam de base para `lg:grid-cols-12` em dashboard (`page.tsx:496,569`) e monitor (`:1741`) | breakpoint intermediário incompleto em áreas críticas; confirmar navegação, colunas e modais em 768px |
| Desktop ~1280px | `max-w-7xl`, `lg`, `xl:grid-cols-12`, barras laterais e painéis | layout desktop é o caminho mais contemplado; monitor depende de viewport inteira e múltiplos painéis |

Sinais positivos: `sm:grid-cols-2`, `sm:grid-cols-3/4`, `md`, `lg` e `xl` aparecem em marketing, storefront e prática; há `overflow-x-auto` para tabs/controles no storefront e monitor. Sinais de atenção: uso amplo de cores hardcoded e ausência de tokens, além de componentes de rota reutilizados via imports relativos.

## 6. Matriz de achados

| ID | Achado | Impacto | Evidência | Fase sugerida |
|---|---|---|---|---|
| A01 | Workspace do monitor é monolítico | Alto | 4.244 linhas; vários domínios no mesmo arquivo | 4 |
| A02 | Componentes do aluno vivem na pasta da rota | Alto | `areadoaluno/Student*.tsx`, `TeacherAvatar.tsx` | 2 |
| A03 | `modules/student` quase vazio | Médio | apenas `StudentAuthModal.tsx` | 2 |
| A04 | Módulos sem barrel/index público | Médio | nenhum `src/modules/*/index.ts` | 2 |
| A05 | Dashboard e prática misturam dados/UI | Alto | fetches e muitos estados nas páginas | 3/4 |
| A06 | Responsividade tablet não é uniforme | Médio | grids base→`lg` em dashboard/monitor | 3/4 |
| A07 | Modais pesados parecem carregados estaticamente | Médio | imports diretos nas páginas/home | 4/5 |
| A08 | Baseline visual ainda não capturado | Médio | inspeção sem screenshots | pré/pós-fases |
| A09 | Working tree pré-existente está sujo | Alto para execução | `git status --short` listou alterações em package, app, módulos e assets | todas; não misturar mudanças |
| A10 | Alias existe apenas como `@/*` | Baixo/Médio | `tsconfig.json` `paths` | 2 |

## 7. Dependências e riscos para as próximas fases

- Preservar contratos de `StudentContext`, `AlertContext`, services e endpoints antes de mover/extrair arquivos.
- Atualizar imports relativos das páginas de aluno ao reorganizar componentes; validar provider/guard e ordem de composição.
- O checkout em `areadoaluno/checkout/page.tsx` reexporta a página de checkout; qualquer extração deve manter ambas as URLs.
- O storefront público depende simultaneamente de módulo de aluno e contexto global; mudanças de fronteira podem afetar autenticação e compra.
- O monitor tem `overflow-hidden`, tabs horizontais e painéis condicionais; extrações precisam preservar scroll, altura e estado.
- Antes de Fase 2, separar/registrar as alterações pré-existentes do working tree para evitar atribuição incorreta.
- Fase 1 (tokens) deve manter os valores visuais atuais; hardcodes estão espalhados por `.tsx`.
- Não foram encontrados testes de componentes no escopo inspecionado; smoke checks e `tsc` devem acompanhar cada extração.

## 8. Critérios de entrada/saída sugeridos

### Para Fase 1

- Inventário deste documento aceito como baseline.
- Valores atuais de cores, radius e breakpoints registrados antes da centralização.
- `tsc --noEmit` sem novos erros.

### Para Fase 2

- Destinos de `Student*`, `TeacherAvatar`, `AlertContext` e `AlertModal` definidos.
- Todos os consumidores localizados e lista de imports atualizada.
- Rotas `/areadoaluno/*`, `/`, `/p/[teacherSlug]` e `/professor/*` preservadas.

### Para Fases 3–4

- Screenshots baseline em 375px, 768px e 1280px por rota crítica.
- Extrações com contratos explícitos de props/hooks e sem alteração comportamental intencional.
- Verificação TypeScript e smoke test das rotas afetadas após cada unidade.

## 9. Checklist da Fase 0

- [x] Rotas ativas em `src/app` mapeadas.
- [x] Módulos/componentes e contexts/guards inventariados.
- [x] Imports cruzados relevantes registrados.
- [x] God files candidatos priorizados.
- [x] Baseline mobile/tablet/desktop documentado por inspeção estática.
- [x] Riscos, dependências e critérios das fases seguintes registrados.
- [ ] Screenshots reais em 375/768/1280 capturados — pendente de execução visual.
- [x] Implementação existente não alterada pela Fase 0.

## Verificação executada

- `rg --files`, `rg -n`, `find ... | xargs wc -l` e `git status --short` executados com sucesso.
- Não executei `tsc` nesta fase para evitar gerar/atualizar artefatos derivados no working tree já modificado; a validação TypeScript fica como gate das fases de mudança.
