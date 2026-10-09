# MVP — Plano de desenvolvimento do MeuMonitor AI

## 1. Objetivo do MVP

O MVP do MeuMonitor AI deve validar se um professor consegue transformar seu conteúdo em um assistente de estudo vendável por assinatura, e se alunos pagantes percebem valor ao estudar com questões, chat restrito à base do professor e simulados personalizados por desempenho.

O desenvolvimento será dividido em versões incrementais. A primeira parte será focada no professor, porque ele é o cliente principal e a base do produto depende da qualidade do conteúdo cadastrado por ele.

Diretriz comercial do MVP: não construir marketplace. O aluno pode ter conta no MeuMonitor AI e pode assinar agentes de professores diferentes, mas cada assinatura deve nascer a partir da página pública de um professor específico.

## 2. Estratégia de desenvolvimento

O MVP será desenvolvido em camadas:

1. fundação técnica;
2. área do professor;
3. conteúdo e questões;
4. agentes publicados;
5. área do aluno;
6. prática e desempenho;
7. chat com RAG;
8. simulados e desafio diário;
9. pagamento e beta fechado.

Em paralelo a todas as versões, o MVP terá uma trilha de economia unitária. O custo de IA e o custo real de infraestrutura serão medidos desde o primeiro usuário, mesmo que o painel de gestão desses dados seja inicialmente interno e simples.

A ordem prioriza criar primeiro o painel operacional do professor. Sem categorias, subcategorias, materiais, questões e agentes, a experiência do aluno não tem base suficiente para ser validada.

## 3. Escopo macro do MVP

O MVP inclui:

- cadastro/login;
- perfil de professor;
- status de aprovação do professor no banco;
- página pública compartilhável do professor;
- categorias e subcategorias;
- upload de materiais;
- banco de questões;
- fluxo híbrido de extração por IA + revisão do professor;
- criação de múltiplos agentes;
- assinatura de um agente pelo aluno;
- prática de questões;
- tracking de desempenho;
- chat restrito à base do agente;
- desafio diário;
- ranking mensal por acertos;
- simulado personalizado com questões do banco.
- instrumentação de custos desde o primeiro dia:
  - tokens por tipo de operação;
  - custo estimado de cada chamada de IA;
  - custos reais de Supabase, compute/worker, storage, bandwidth e serviços auxiliares;
  - custo total e custo médio por aluno, agente e assinatura;
  - margem estimada por assinatura.

O MVP não inclui:

- app mobile;
- marketplace público amplo;
- dashboard admin completo;
- split automático obrigatório desde o primeiro dia;
- planos semestral/anual;
- desconto por múltiplos agentes;
- flashcards como núcleo do produto;
- voz;
- avatar;
- correção de redação;
- OCR complexo como dependência obrigatória.

## 4. Versões do MVP

## V0 — Fundação técnica e estrutura do projeto

### Objetivo

Criar a base técnica para desenvolver o produto com organização suficiente para escalar.

### Escopo

- Inicializar projeto Next.js com TypeScript.
- Configurar Tailwind CSS.
- Definir estrutura de pastas.
- Configurar Supabase client/server.
- Configurar autenticação base.
- Criar projeto Supabase.
- Criar migrations iniciais.
- Criar tabelas iniciais de observabilidade e custos.
- Criar catálogo versionado de preços dos modelos utilizados.
- Criar função server-side única para registrar chamadas de IA com tokens, modelo, operação e custo.
- Criar estrutura para lançamento dos custos reais de infraestrutura por período.
- Configurar variáveis de ambiente.
- Definir layout base da aplicação.
- Criar navegação inicial.

### Entregáveis

- app Next.js funcionando localmente;
- autenticação conectada ao Supabase;
- estrutura inicial de banco;
- layout base;
- ambiente pronto para desenvolver módulos.

### Critério de aceite

- usuário consegue criar conta e fazer login;
- sessão funciona no frontend e no servidor;
- projeto roda localmente sem erros;
- banco tem as primeiras tabelas de usuário/perfil;
- uma chamada de IA de teste gera registro de tokens e custo estimado;
- uma despesa de infraestrutura pode ser registrada por fornecedor e período;
- é possível consultar o custo inicial por aluno e por assinatura.

## V1 — Área do professor

### Objetivo

Permitir que o professor crie sua presença inicial na plataforma e comece a estruturar sua base de conhecimento.

Esta é a primeira versão funcional prioritária.

### Escopo

#### Cadastro e perfil

- Criar perfil de professor.
- Definir status inicial do professor como `pending` ou `approved`.
- Editar informações básicas:
  - nome de exibição;
  - bio;
  - área de atuação;
  - slug;
  - descrição da página.

Para o primeiro professor beta, o status pode ser ajustado diretamente no banco.

#### Página pública do professor

- Criar rota pública baseada no slug.
- Exibir dados do professor.
- Exibir agentes publicados.
- Exibir preço mensal controlado pela plataforma.
- Exibir chamada para assinatura.

No primeiro momento, o botão de assinatura pode apontar para uma tela placeholder ou cadastro de interesse, até o gateway ser fechado.

#### Categorias e subcategorias

- Criar categoria.
- Editar categoria.
- Arquivar categoria.
- Criar subcategoria dentro de categoria.
- Editar subcategoria.
- Arquivar subcategoria.
- Listar estrutura de conhecimento do professor.

#### Agentes

- Criar agente.
- Editar nome, descrição e objetivo.
- Selecionar subcategorias que compõem o agente.
- Salvar agente como rascunho.
- Publicar agente.
- Desativar agente.

### Fora de escopo nesta versão

- upload real de materiais;
- extração de questões;
- chat;
- pagamento real;
- área do aluno;
- dashboard financeiro.
- painel financeiro visual completo; os dados de custo, entretanto, devem existir no banco desde V0.

### Entregáveis

- painel do professor;
- tela de edição do perfil;
- página pública do professor;
- CRUD de categorias;
- CRUD de subcategorias;
- CRUD de agentes;
- vínculo agente-subcategoria.

### Critério de aceite

- professor consegue configurar sua página;
- professor consegue criar categorias e subcategorias;
- professor consegue criar mais de um agente;
- professor consegue selecionar quais subcategorias entram em cada agente;
- agente publicado aparece na página pública;
- dados de professor são isolados por `teacher_id`.

## V2 — Materiais e base de conhecimento

### Objetivo

Permitir que o professor envie materiais para subcategorias e que o sistema prepare esses materiais para uso futuro no chat e na extração de questões.

### Escopo

- Upload de PDF por subcategoria.
- Salvar arquivo original em storage.
- Salvar metadados do documento.
- Calcular hash do arquivo.
- Detectar duplicatas simples.
- Criar status de processamento.
- Criar tabela/fila de jobs.
- Worker inicial para processamento assíncrono.
- Extração de texto de PDFs com texto selecionável.
- Divisão em chunks.
- Registro de chunks no banco.
- Preparação para embeddings.

### Fora de escopo nesta versão

- OCR completo;
- extração automática de questões;
- chat funcionando;
- busca vetorial em produção, se ainda não estiver pronta.

### Entregáveis

- tela de upload por subcategoria;
- listagem de materiais enviados;
- status do processamento;
- worker de extração textual;
- chunks salvos no banco.

### Critério de aceite

- professor consegue enviar PDF;
- arquivo fica salvo;
- documento muda de status durante processamento;
- texto é extraído quando o PDF permitir;
- chunks ficam vinculados a `teacher_id`, `document_id` e `subcategory_id`;
- falhas ficam visíveis.

## V3 — Banco de questões do professor

### Objetivo

Criar o banco de questões validado pelo professor, com fluxo híbrido de IA + revisão humana.

### Escopo

- Upload de provas/listas e gabaritos.
- Extração inicial de questões por IA.
- Identificação de:
  - enunciado;
  - alternativas;
  - resposta correta;
  - explicação, quando houver;
  - subcategoria sugerida;
  - dificuldade sugerida;
  - banca/ano, quando possível.
- Tela de revisão de questões.
- Edição manual de questão.
- Edição de alternativas.
- Marcação de resposta correta.
- Aprovação de questão.
- Arquivamento de questão.
- Cadastro manual de questão.

### Fora de escopo nesta versão

- resolução de questões pelo aluno;
- ranking;
- simulados;
- geração automática de questões inéditas.

### Entregáveis

- tela de banco de questões;
- tela de revisão;
- importação assistida por IA;
- cadastro manual;
- status `pending_review`, `approved` e `archived`.

### Critério de aceite

- questão extraída por IA não entra em uso sem aprovação;
- professor consegue corrigir questão antes de aprovar;
- questões aprovadas ficam vinculadas a subcategorias;
- agente consegue herdar questões das subcategorias selecionadas.

## V4 — Publicação de agente pronto para aluno

### Objetivo

Consolidar a experiência de criação de um agente vendável antes de abrir a área do aluno.

### Escopo

- Tela de preview do agente.
- Contagem de subcategorias incluídas.
- Contagem de materiais processados.
- Contagem de questões aprovadas.
- Validação mínima para publicação.
- Página pública exibindo agente publicado.
- CTA para assinatura/cadastro de interesse.

### Regra de publicação sugerida

Um agente só pode ser publicado se tiver:

- nome;
- descrição;
- pelo menos uma subcategoria;
- pelo menos uma questão aprovada ou material processado;
- professor aprovado.

### Entregáveis

- fluxo claro de rascunho para publicado;
- página pública útil para venda orgânica;
- validações de publicação.

### Critério de aceite

- professor entende se o agente está incompleto;
- agente publicado aparece publicamente;
- agente incompleto não é vendido como pronto;
- link público pode ser compartilhado.

## V5 — Área do aluno e assinatura beta

### Objetivo

Permitir que alunos entrem na plataforma e tenham acesso controlado a um agente específico.

### Escopo

- Cadastro/login de aluno.
- Tela pública do agente.
- Fluxo de assinatura beta.
- Controle de acesso por assinatura.
- Status de assinatura.
- Área inicial do aluno.

Como o gateway ainda será decidido, esta versão pode começar com assinatura manual/beta:

- aluno solicita acesso;
- pagamento pode ser controlado externamente no início;
- assinatura é ativada manualmente no banco ou por fluxo interno simples.

Depois, o gateway entra via integração.

### Fora de escopo nesta versão

- split automático;
- plano anual;
- múltiplos agentes com desconto;
- checkout definitivo, se gateway ainda não estiver escolhido.

### Entregáveis

- aluno consegue criar conta;
- aluno consegue acessar agente assinado;
- aluno sem assinatura é bloqueado;
- estrutura de assinatura está pronta para gateway real.

### Critério de aceite

- acesso ao agente depende de assinatura ativa;
- assinatura é vinculada a `student_id`, `teacher_id` e `agent_id`;
- aluno não acessa agente não assinado.

## V6 — Prática de questões e desempenho

### Objetivo

Criar o primeiro núcleo real de estudo do aluno: resolver questões e gerar dados de desempenho.

### Escopo

- Listar questões do agente.
- Resolver questão.
- Ver acerto/erro.
- Ver explicação da questão.
- Registrar tentativa.
- Registrar tempo de resposta.
- Calcular desempenho por subcategoria.
- Priorizar questões nunca respondidas.
- Permitir revisar questões erradas.

### Entregáveis

- tela de prática;
- feedback após resposta;
- histórico de tentativas;
- estatísticas por subcategoria.

### Critério de aceite

- cada resposta gera um registro de tentativa;
- desempenho por subcategoria é atualizado;
- questões exibidas pertencem ao agente assinado;
- aluno não acessa questões fora do escopo.

## V7 — Chat com RAG restrito à base do agente

### Objetivo

Permitir que o aluno tire dúvidas com um chat que consulta apenas a base cadastrada pelo professor para aquele agente.

### Escopo

- Interface de chat.
- Validação de assinatura ativa.
- Busca de chunks por `teacher_id`, `agent_id` e subcategorias do agente.
- Chamada ao modelo via OpenRouter.
- Prompt restritivo: responder somente com base nas fontes.
- Resposta direta para o aluno, sem exibir fontes.
- Registro interno dos chunks usados.
- Registro de custo/uso de IA.
- Perguntas sobre questão específica.

### Fora de escopo nesta versão

- envio de imagem pelo aluno;
- voz;
- citações visíveis para o aluno;
- memória longa avançada.

### Entregáveis

- chat funcional;
- RAG com filtros rígidos;
- logs de uso de IA;
- logs internos de recuperação.

### Critério de aceite

- chat só responde se aluno tiver assinatura ativa;
- busca não retorna conteúdo de outro professor/agente;
- se não houver contexto suficiente, agente informa limitação;
- custo de IA é registrado.

## V8 — Desafio diário e ranking mensal

### Objetivo

Criar engajamento recorrente e competição leve entre alunos do mesmo agente.

### Escopo

- Selecionar uma questão diária por agente.
- Tela de desafio diário.
- Registro da resposta.
- Ranking mensal por acertos.
- Exibição por nickname/apelido.

### Fora de escopo nesta versão

- ranking por tempo;
- streak;
- badges;
- gamificação avançada.

### Entregáveis

- desafio diário;
- ranking mensal simples.

### Critério de aceite

- cada aluno responde o desafio uma vez;
- acertos contam para o mês correto;
- ranking é isolado por agente;
- ranking não expõe dados sensíveis.

## V9 — Simulado personalizado

### Objetivo

Gerar simulados com base no desempenho real do aluno.

### Escopo

- Calcular subcategorias fracas.
- Selecionar questões do banco.
- Priorizar questões nunca respondidas.
- Reaproveitar questões erradas quando fizer sentido.
- Gerar simulado semanal ou mensal.
- Registrar conclusão.
- Exibir resultado por subcategoria.
- Mostrar recomendações simples.

### Decisão inicial

O simulado deve usar questões já cadastradas. A IA não deve criar questões inéditas no MVP.

### Entregáveis

- tela de simulado;
- algoritmo inicial de seleção;
- relatório simples pós-simulado.

### Critério de aceite

- simulado reflete pontos fracos do aluno;
- questões pertencem ao agente assinado;
- resultado atualiza desempenho;
- aluno recebe diagnóstico simples.

## V10 — Pagamento real e beta comercial

### Objetivo

Substituir controle manual de assinatura por gateway real e rodar uma turma beta paga.

### Escopo

- Escolher gateway.
- Criar checkout de assinatura mensal.
- Implementar webhooks.
- Atualizar status de assinatura automaticamente.
- Registrar pagamentos.
- Registrar desconto beta.
- Registrar comissão teórica do professor.

### Requisitos do gateway

- assinatura recorrente;
- boa operação no Brasil;
- suporte ou alternativa para split;
- webhooks confiáveis;
- suporte a cupom/desconto ou plano beta;
- documentação clara.

### Entregáveis

- fluxo de pagamento real;
- assinatura ativada automaticamente;
- cancelamento/refalha refletidos no sistema;
- registros financeiros básicos.

### Critério de aceite

- aluno paga e recebe acesso;
- falha de pagamento bloqueia acesso quando aplicável;
- pagamento fica vinculado a aluno, professor e agente;
- comissão é registrada para conferência futura.

## 5. Prioridade imediata: começar pela parte do professor

A primeira frente de desenvolvimento deve ser a V0 + V1.

Ordem recomendada:

1. inicializar projeto;
2. configurar Supabase Auth;
3. criar tabelas de perfil/professor;
4. criar painel do professor;
5. criar edição de página;
6. criar categorias;
7. criar subcategorias;
8. criar agentes;
9. vincular agentes a subcategorias;
10. criar página pública do professor.

## 6. Backlog inicial da parte do professor

### Fundação

- Criar projeto Next.js.
- Configurar TypeScript.
- Configurar Tailwind.
- Configurar Supabase.
- Criar `.env.example`.
- Criar layout autenticado.
- Criar layout público.

### Auth

- Criar tela de cadastro.
- Criar tela de login.
- Criar logout.
- Proteger rotas autenticadas.
- Criar callback/session handling.

### Perfil de professor

- Criar tabela `profiles`.
- Criar tabela `teachers`.
- Criar formulário de criação de professor.
- Criar formulário de edição.
- Validar slug único.
- Criar status de aprovação.

### Dashboard do professor

- Criar home do painel.
- Mostrar resumo:
  - status do professor;
  - quantidade de categorias;
  - quantidade de subcategorias;
  - quantidade de agentes;
  - agentes publicados.

### Categorias

- Listar categorias.
- Criar categoria.
- Editar categoria.
- Arquivar categoria.
- Validar nome obrigatório.

### Subcategorias

- Listar subcategorias por categoria.
- Criar subcategoria.
- Editar subcategoria.
- Arquivar subcategoria.
- Validar vínculo com categoria.

### Agentes

- Listar agentes.
- Criar agente.
- Editar agente.
- Selecionar subcategorias.
- Publicar agente.
- Desativar agente.
- Validar agente antes de publicar.

### Página pública

- Criar rota `/p/[teacherSlug]` ou equivalente.
- Exibir informações do professor.
- Exibir agentes publicados.
- Exibir preço mensal.
- Criar CTA inicial.

## 7. Critérios para considerar a parte do professor pronta

A parte do professor pode ser considerada pronta para avançar para materiais/upload quando:

- professor consegue criar e editar perfil;
- professor tem uma URL pública;
- professor consegue criar categorias;
- professor consegue criar subcategorias;
- professor consegue criar vários agentes;
- professor consegue selecionar subcategorias por agente;
- agente publicado aparece na página pública;
- dados estão isolados por professor;
- rotas protegidas não permitem acesso anônimo;
- estrutura do banco suporta os próximos módulos.

## 8. Decisões que ainda precisam ser fechadas durante o desenvolvimento

- gateway de pagamento;
- deploy inicial em Vercel ou VPS;
- modelo de embeddings;
- fila inicial via Postgres ou Redis;
- limite inicial de uso do chat;
- política de comissão;
- tamanho padrão do simulado semanal;
- tamanho padrão do simulado mensal;
- regra exata de seleção do desafio diário.

## 9. Ordem de documentos

Os documentos devem ser usados assim:

1. `PRD.md`: define produto, escopo e comportamento esperado.
2. `ARCHITECTURE.md`: define arquitetura, módulos e modelo de dados.
3. `MVP.md`: define ordem prática de desenvolvimento e versões.
