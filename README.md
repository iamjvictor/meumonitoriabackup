# MeuMonitor AI

## A plataforma que transforma conhecimento em preparação personalizada

O MeuMonitor AI ajuda professores a criarem experiências de estudo completas e personalizadas — e ajuda alunos a estudarem com mais clareza, prática e acompanhamento.

Em um único ambiente, o professor organiza sua metodologia, materiais, questões e flashcards. O aluno encontra um plano de estudos orientado, pratica com conteúdos revisados e pode tirar dúvidas com uma IA conectada à base de conhecimento correta.

## O problema que resolvemos

Professores costumam ter conhecimento, materiais e experiência, mas nem sempre possuem uma estrutura simples para transformar tudo isso em um produto educacional organizado.

Do outro lado, os alunos enfrentam excesso de conteúdo, dificuldade para saber o que estudar e respostas genéricas que não consideram o material da sua preparação.

O MeuMonitor AI conecta essas duas necessidades:

- o professor cria e organiza seu próprio agente preparatório;
- o conteúdo fica dividido por matérias e tópicos;
- questões e flashcards podem ser gerados e revisados;
- o aluno estuda dentro de uma experiência orientada;
- a IA responde com base nas fontes autorizadas daquele conteúdo.

## Para professores

O professor pode transformar sua experiência em uma preparação digital própria, com identidade, conteúdo e método.

### Crie seu agente preparatório

Cada agente pode representar uma preparação específica, como ENEM, concursos, vestibulares ou uma disciplina especializada. O professor define o objetivo, a descrição, o público e a estrutura do produto.

### Organize o conteúdo por tópicos

Materiais, questões e flashcards são organizados por matéria e tópico. Assim, o professor consegue trabalhar uma parte da preparação por vez, acompanhar o progresso e manter tudo fácil de revisar.

### Use IA com supervisão do professor

O MeuMonitor AI pode auxiliar na extração, classificação e criação de questões e flashcards. O professor continua no controle: conteúdos gerados ou extraídos passam por revisão antes de serem disponibilizados aos alunos.

### Construa um produto próprio

O agente pode ter página pública, identidade visual, descrição, público-alvo e modelo comercial. A proposta é permitir que cada professor ofereça uma preparação com sua própria metodologia, sem depender de uma experiência genérica.

## Para alunos

O aluno encontra uma experiência de estudo mais direcionada ao objetivo que escolheu.

- acesso aos agentes e conteúdos autorizados;
- estudo organizado por matéria e tópico;
- prática com questões revisadas;
- revisão com flashcards;
- acompanhamento de desempenho e constância;
- simulados e desafios para reforçar o aprendizado;
- chat com IA contextualizado pelo conteúdo da preparação;
- histórico de conversa separado por matéria.

## O chat com IA

O chat não funciona como uma conversa genérica sem contexto. Ele utiliza a base de conhecimento autorizada para a preparação e respeita o acesso do aluno.

Isso permite que o aluno:

- tire dúvidas sobre o material estudado;
- pergunte sobre uma questão ou flashcard específico;
- mantenha o contexto da conversa por matéria;
- receba respostas relacionadas às fontes disponíveis;
- estude sem misturar conteúdos de preparações diferentes.

Nesta etapa, o histórico temporário do chat é armazenado no Redis, mantendo o contexto da conversa enquanto ele estiver disponível. A persistência definitiva no banco está planejada para uma evolução futura.

## Como funciona

```text
Professor cria uma preparação
          ↓
Organiza matérias, tópicos e materiais
          ↓
IA ajuda a estruturar questões e flashcards
          ↓
Professor revisa e aprova o conteúdo
          ↓
Aluno acessa a preparação
          ↓
Estuda, pratica, revisa e conversa com a IA
```

## Diferenciais do MeuMonitor AI

- **Conteúdo com identidade do professor:** cada preparação nasce da experiência e do método de quem ensina.
- **IA com contexto:** as respostas são orientadas pelas fontes autorizadas, não apenas por conhecimento genérico.
- **Revisão humana:** o professor decide o que será publicado e utilizado pelo aluno.
- **Organização pedagógica:** materiais, questões e flashcards seguem a estrutura de matérias e tópicos.
- **Experiência contínua:** estudo, prática, revisão, desempenho e dúvidas ficam no mesmo ambiente.
- **Arquitetura preparada para evolução:** o produto começa simples, mas foi organizado para crescer com segurança.

## Nossa arquitetura, em linguagem simples

O MeuMonitor AI é dividido em partes que trabalham juntas:

- **Frontend:** a experiência que professores e alunos utilizam no navegador.
- **Backend:** a camada que controla usuários, permissões, conteúdos, agentes, questões, chat e regras do produto.
- **Banco de dados:** guarda as informações estruturadas da plataforma, respeitando o vínculo entre professor, aluno, conteúdo e assinatura.
- **Redis:** mantém o contexto temporário das conversas e apoia tarefas que precisam de velocidade.
- **IA e RAG:** localizam informações relevantes nos materiais autorizados e ajudam a gerar respostas, questões e flashcards contextualizados.
- **Workers assíncronos:** processam arquivos, extraem conteúdo, criam embeddings e executam tarefas demoradas sem travar a experiência do usuário.
- **Camada de pagamentos:** preparada para conectar agentes publicados a assinaturas e compras com segurança.

A arquitetura segue uma abordagem modular: começamos com uma aplicação integrada para reduzir complexidade e custo, mas mantemos os principais domínios separados para que possam evoluir de forma independente quando o produto crescer.

## Segurança e controle de acesso

O acesso aos conteúdos não depende somente da interface. O backend valida a identidade do usuário, seu papel na plataforma e sua autorização para acessar cada preparação, matéria ou material.

Também seguimos princípios importantes:

- conteúdos de professores ficam protegidos;
- alunos só acessam o que está liberado para sua conta;
- questões e flashcards precisam estar aprovados antes de entrar na experiência do aluno;
- o chat utiliza somente o contexto autorizado;
- informações internas e dados sensíveis não devem ser expostos nas respostas públicas ou nos logs.

## Estado atual

O projeto está em evolução contínua, com foco em consolidar:

- a experiência de criação de agentes pelos professores;
- o processamento inteligente de documentos;
- a qualidade de questões e flashcards;
- o chat contextualizado por matéria;
- o acompanhamento de desempenho dos alunos;
- a integração comercial de pagamentos.

## Estrutura do projeto

```text
.
├── frontend/   # Aplicação web para professores e alunos
├── backend/    # API, regras de negócio e workers
├── services/   # Serviços auxiliares, como processamento de documentos
├── docs/       # Documentação de produto, arquitetura, specs e planos
└── test/       # Documentos, resultados e experimentos de validação
```

## Documentação

- [Arquitetura técnica](docs/ARCHITECTURE.md)
- [PRD do produto](docs/PRD.md)
- [Visão do MVP](docs/MVP.md)
- [Análise consolidada e planos atuais](docs/superpowers/plans/2026-09-08-analise-consolidada.md)
- [Spec de recebimento com Asaas](docs/superpowers/specs/2026-09-09-recebimento-asaas-design.md)
- [Plano do Payments Service com Asaas](docs/superpowers/plans/2026-09-09-payments-service-recebimento.md)
- [Documentação de autenticação](AUTH.md)

## Desenvolvimento local

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
npm run dev
```

O MeuMonitor AI está sendo construído para tornar o conhecimento de bons professores mais acessível, organizado e útil no momento em que o aluno realmente precisa aprender.
