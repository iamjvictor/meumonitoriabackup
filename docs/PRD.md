# PRD — MeuMonitor AI

## 1. Visão do produto

O MeuMonitor AI é uma plataforma que permite que professores transformem seus materiais, questões e conhecimento pedagógico em assistentes de estudo com IA, vendidos por assinatura mensal para seus alunos.

O professor cria uma página compartilhável, estrutura suas bases de conhecimento por categorias e subcategorias, cadastra questões e cria agentes especializados. O aluno assina um agente específico e passa a estudar com questões, chat com IA, desafio diário, ranking mensal e simulados personalizados baseados em desempenho.

## 2. Promessa de valor

### Para o professor

Criar um produto digital recorrente a partir do próprio conhecimento, materiais e audiência, sem precisar desenvolver tecnologia própria.

### Para o aluno

Ter um estudo guiado e personalizado, com questões, dúvidas respondidas com base nos materiais do professor e simulados adaptados aos seus pontos fracos.

## 3. Público-alvo inicial

O público-alvo amplo da plataforma são professores independentes ou produtores educacionais que desejam monetizar sua audiência com um produto recorrente.

Para validação inicial, o primeiro nicho será um professor de concurso público.

Esse recorte inicial é importante porque concursos públicos possuem:

- provas anteriores;
- bancas identificáveis;
- questões objetivas;
- categorias e subcategorias bem definidas;
- forte demanda por prática e diagnóstico de desempenho.

## 4. Cliente principal

O cliente principal da plataforma é o professor.

O modelo depende do professor como canal de aquisição orgânica, pois ele divulgará sua página/agente para sua audiência. O aluno é o usuário final pagante, mas a plataforma deve ser desenhada para maximizar a capacidade do professor de criar, publicar e vender seu assistente.

O MeuMonitor AI não deve funcionar como marketplace público de professores. O aluno pode assinar agentes de professores diferentes, mas a assinatura deve nascer sempre do contexto de uma página pública/divulgação de um professor específico. A plataforma não deve oferecer uma vitrine global que coloque professores concorrendo diretamente entre si.

## 5. Escopo do MVP

O MVP deve validar o ciclo principal:

1. professor cria sua estrutura de conteúdo;
2. professor cria um ou mais agentes;
3. aluno assina um agente;
4. aluno resolve questões;
5. aluno tira dúvidas no chat;
6. sistema acompanha desempenho;
7. sistema monta simulados personalizados com base nos pontos fracos do aluno.

## 6. Hipóteses principais

O MVP deve validar as seguintes hipóteses:

- Professores têm interesse em transformar materiais e questões em um produto digital recorrente.
- Alunos aceitam pagar mensalmente por um assistente de estudo vinculado a um professor.
- O professor consegue vender organicamente para sua audiência.
- O aluno percebe valor ao estudar com questões categorizadas e feedback personalizado.
- O chat com IA, limitado às fontes do professor, aumenta a confiança e utilidade do produto.
- O acompanhamento de desempenho por subcategoria melhora a percepção de personalização.

## 7. Modelo de monetização inicial

O aluno assina um agente específico.

No MVP, o preço será controlado pela plataforma:

- assinatura mensal inicial: R$59,90;
- turma beta com desconto;
- planos semestral e anual ficam fora do MVP;
- descontos por assinatura de dois ou mais agentes ficam fora do MVP.

No futuro, a plataforma poderá oferecer:

- plano semestral;
- plano anual;
- desconto por múltiplos agentes;
- pacotes de agentes;
- preços diferentes por agente;
- recursos premium.

## 8. Papéis de usuário

### Professor

Responsável por criar e manter as bases de conhecimento, categorias, subcategorias, questões e agentes.

### Aluno

Assina um agente e usa a plataforma para estudar, resolver questões, tirar dúvidas, participar do desafio diário e realizar simulados.

### Plataforma

Controla aprovações, pagamentos, regras de acesso, segurança, custos de IA e operação do produto.

No MVP, não haverá painel administrativo completo. A aprovação do professor será controlada por um campo de status no banco de dados.

## 9. Fluxo do professor

### 9.1 Cadastro

O professor deve conseguir criar uma conta e preencher informações básicas:

- nome;
- e-mail;
- senha;
- área de atuação;
- descrição curta;
- slug da página;
- dados básicos de apresentação.

Inicialmente, a plataforma operará com apenas um professor para validação. Mesmo assim, a estrutura deve prever status de aprovação.

Status possíveis:

- pending;
- approved;
- rejected;
- suspended.

### 9.2 Página compartilhável

O professor deve ter uma página pública para divulgar seu agente aos alunos.

A página deve conter:

- nome do professor;
- descrição;
- área de atuação;
- lista de agentes disponíveis;
- descrição de cada agente;
- chamada para assinatura;
- preço mensal.

### 9.3 Estruturação de conhecimento

O professor deve conseguir criar uma estrutura de conteúdo em categorias e subcategorias.

Exemplo:

- categoria: Gramática;
- subcategoria: Crase.

Cada subcategoria pode ter:

- materiais de base;
- livros;
- artigos;
- PDFs;
- questões;
- gabaritos;
- explicações;
- flashcards no futuro.

A base real da plataforma é composta pelas subcategorias. Os agentes são criados a partir da seleção de subcategorias.

### 9.4 Upload de materiais

O professor deve conseguir subir materiais relacionados a uma subcategoria.

Tipos esperados:

- PDFs de provas antigas;
- questões próprias;
- questões de livros autorizados;
- artigos;
- apostilas;
- materiais explicativos;
- gabaritos.

O sistema deve processar os arquivos para:

- extrair texto;
- identificar questões;
- identificar alternativas;
- associar gabarito quando disponível;
- sugerir categoria/subcategoria;
- preparar conteúdo para consulta do chat.

### 9.5 Banco de questões

O cadastro de questões seguirá fluxo híbrido:

1. professor envia materiais e gabaritos;
2. IA tenta extrair questões automaticamente;
3. IA sugere enunciado, alternativas, resposta correta, categoria e subcategoria;
4. professor revisa;
5. professor edita o que for necessário;
6. professor aprova a questão;
7. questão aprovada entra no banco do agente.

Questões devem poder conter:

- enunciado;
- alternativas;
- resposta correta;
- explicação;
- categoria;
- subcategoria;
- banca/perfil de prova;
- dificuldade;
- origem;
- status.

Status possíveis:

- draft;
- pending_review;
- approved;
- archived.

### 9.6 Criação de agentes

O professor pode criar vários agentes.

Um agente representa um assistente específico vendido por assinatura. Ele é composto por uma seleção de subcategorias e suas respectivas bases de conhecimento.

Campos básicos do agente:

- nome;
- descrição;
- objetivo;
- preço exibido;
- categorias/subcategorias incluídas;
- regras de escopo;
- status.

Status possíveis:

- draft;
- published;
- disabled.

Exemplo:

- agente: Português para Concursos;
- categorias: Gramática, Interpretação de Texto;
- subcategorias: Crase, Concordância, Regência, Orações.

## 10. Fluxo do aluno

### 10.1 Descoberta e assinatura

O aluno acessa a página compartilhável do professor, escolhe um agente e assina.

No MVP, o aluno assina um agente específico, não o professor inteiro.

O fluxo esperado:

1. aluno acessa página do professor;
2. escolhe agente;
3. cria conta ou faz login;
4. confirma plano mensal;
5. realiza pagamento;
6. recebe acesso ao agente.

### 10.2 Prática com questões

O aluno deve conseguir resolver questões do banco do agente.

As questões devem ser filtradas e selecionadas com base em:

- categorias do agente;
- subcategorias do agente;
- questões ainda não respondidas;
- questões respondidas incorretamente;
- desempenho anterior do aluno.

Dados registrados:

- questão respondida;
- alternativa escolhida;
- acerto ou erro;
- tempo de resposta;
- data/hora;
- categoria;
- subcategoria;
- agente;
- aluno.

### 10.3 Chat de dúvidas

O aluno deve poder fazer perguntas em texto para o agente.

O agente deve responder somente com base nas fontes cadastradas pelo professor e vinculadas às subcategorias daquele agente.

No MVP, a resposta será direta, sem exibir fontes, páginas ou citações ao aluno.

O sistema internamente deve registrar quais materiais/chunks foram usados para compor a resposta, para auditoria e melhoria.

O agente deve ser capaz de responder dúvidas gerais dentro do escopo do agente e dúvidas sobre questões específicas.

Exemplo:

> Por que a alternativa B está errada?

Nesse caso, o sistema deve usar a questão, a resposta correta, a explicação cadastrada e a base de conhecimento relacionada para gerar uma resposta.

Se não houver informação suficiente na base do professor, o agente deve informar que não tem base suficiente para responder com segurança.

### 10.4 Desafio diário

O aluno deve conseguir responder uma questão diária do agente.

O desafio diário serve para:

- gerar hábito;
- aumentar engajamento;
- criar competição leve entre alunos do mesmo agente.

O ranking do MVP será mensal e baseado na quantidade de acertos em desafios diários.

Critério do ranking:

- número de acertos no mês.

Critérios como tempo de resposta, streak e pontuação ponderada ficam fora do MVP.

### 10.5 Simulado personalizado

O aluno deve receber simulados personalizados com base no desempenho.

A lógica principal:

- identificar subcategorias em que o aluno tem pior desempenho;
- selecionar mais questões dessas subcategorias;
- priorizar questões que o aluno nunca respondeu;
- incluir questões que o aluno errou anteriormente quando fizer sentido.

No MVP, o simulado deve selecionar questões existentes no banco. A IA não deve criar questões inéditas para o simulado.

O objetivo é montar uma avaliação prática com base em dados reais de desempenho.

## 11. Regras do agente de IA

O agente deve:

- responder somente com base nas fontes cadastradas pelo professor;
- respeitar as subcategorias vinculadas ao agente;
- não usar conhecimento geral para complementar lacunas;
- não responder fora do escopo;
- informar quando não houver base suficiente;
- apoiar explicações de questões;
- manter linguagem clara e adequada ao estudo.

O agente não deve:

- inventar conteúdo;
- misturar bases de outros professores;
- misturar agentes diferentes;
- usar materiais de subcategorias não vinculadas ao agente;
- gerar resposta genérica sem base.

## 12. Requisitos funcionais do MVP

### Professor

- Criar conta.
- Ter status de aprovação.
- Criar página pública compartilhável.
- Criar categorias.
- Criar subcategorias.
- Enviar materiais para subcategorias.
- Enviar provas e gabaritos.
- Usar extração automática de questões por IA.
- Revisar e aprovar questões extraídas.
- Criar múltiplos agentes.
- Selecionar subcategorias que compõem cada agente.
- Publicar agente.
- Adicionar, remover ou arquivar conteúdo.

### Aluno

- Criar conta.
- Assinar um agente.
- Acessar área do agente.
- Resolver questões.
- Ver se acertou ou errou.
- Receber explicação de questão.
- Usar chat de dúvidas.
- Perguntar sobre uma questão específica.
- Participar do desafio diário.
- Ver ranking mensal.
- Realizar simulado personalizado.
- Ter desempenho registrado por categoria e subcategoria.

### Plataforma

- Controlar acesso por assinatura.
- Impedir acesso a agentes não assinados.
- Isolar dados por professor e agente.
- Registrar uso de IA.
- Registrar desempenho do aluno.
- Registrar pagamentos e status de assinatura.
- Calcular dados básicos para comissão futura.

## 13. Requisitos não funcionais

### Segurança e isolamento

- Todo conteúdo deve estar vinculado a um professor.
- Todo agente deve estar vinculado a um professor.
- Todo acesso do aluno deve ser validado contra assinatura ativa.
- A busca da IA deve ser filtrada por professor e agente antes de consultar a base.
- Dados de professores diferentes nunca podem se misturar.

### Confiabilidade

- Processamentos de arquivos devem ter status claro.
- Falhas de extração devem ser visíveis.
- Questões extraídas por IA não devem ser publicadas sem aprovação.

### Custos

- Toda chamada de IA deve registrar operação, modelo, tokens e custo estimado.
- O sistema deve registrar tokens por tipo de operação, incluindo chat, explicação de questão, extração, classificação, embeddings e geração de simulados.
- O sistema deve permitir análise de custo de IA por aluno, professor, agente, operação e período.
- O sistema deve registrar os custos reais de infraestrutura por período e fornecedor, incluindo Supabase, compute/worker, storage, bandwidth e serviços auxiliares.
- O sistema deve calcular o custo unitário aproximado por aluno e por assinatura, combinando custos de IA e infraestrutura alocada.
- O custo deve ser acompanhado desde a criação do primeiro usuário, mesmo antes de existir um painel financeiro completo.

### Economia unitária e limites

- O produto deve exibir internamente receita, custo variável, custo fixo rateado e margem estimada por assinatura.
- O sistema deve permitir definir limites de uso de IA por aluno para proteger a margem.
- Toda decisão de preço, limite de chat ou escolha de modelo deve poder ser apoiada por dados reais de consumo.

### Auditoria

- Respostas do chat devem registrar internamente quais trechos foram consultados.
- Alterações em conteúdos importantes devem preservar histórico mínimo.

## 14. Fora do escopo do MVP

Ficam fora do MVP:

- app mobile;
- voz;
- avatar;
- correção de redação;
- programa de indicação;
- marketplace público com vários professores;
- dashboard financeiro avançado;
- OCR complexo;
- planos semestral e anual;
- desconto por múltiplos agentes;
- preço customizado por professor;
- flashcards como funcionalidade principal;
- streak no desafio diário;
- ranking por tempo de resposta;
- IA gerando questões inéditas para simulados;
- painel administrativo completo.

Observação: o professor poderá adicionar ou remover flashcards no futuro, mas flashcards não fazem parte do núcleo do MVP.

## 15. Métricas de sucesso do MVP

### Professor

- professor consegue publicar um agente;
- professor consegue cadastrar subcategorias;
- professor consegue subir materiais;
- professor consegue revisar questões extraídas;
- professor consegue compartilhar sua página;
- professor consegue gerar assinaturas pagas.

### Aluno

- alunos assinantes resolvem questões;
- alunos usam o chat para dúvidas;
- alunos retornam para o desafio diário;
- alunos completam simulados;
- alunos percebem utilidade no diagnóstico por subcategoria.

### Negócio

- número de alunos pagantes na turma beta;
- conversão da audiência do professor para assinatura;
- retenção após o primeiro mês;
- uso médio de IA por aluno;
- custo real de IA por aluno;
- custo total de infraestrutura por mês;
- custo total e unitário por aluno, agente e assinatura;
- margem estimada por assinatura;
- feedback qualitativo do professor e dos alunos.

## 16. Riscos principais

### Extração de questões pode exigir revisão pesada

PDFs de provas, livros e apostilas podem ter formatação irregular. A extração automática pode errar enunciados, alternativas e gabaritos.

Mitigação:

- fluxo obrigatório de revisão;
- começar com materiais mais padronizados;
- aceitar cadastro manual ou correção manual.

### Escopo do MVP pode crescer demais

Questões, chat, desafio diário, ranking e simulado personalizado já formam um MVP relevante.

Mitigação:

- não incluir flashcards, app mobile, planos avançados ou dashboard financeiro no primeiro ciclo.

### Respostas da IA podem perder confiança se não seguirem a base

O aluno pode desconfiar se o agente inventar respostas ou fugir do material do professor.

Mitigação:

- restringir resposta à base do professor;
- registrar fontes internamente;
- responder “não tenho base suficiente” quando necessário.

### Professor pode demorar para estruturar conteúdo

O valor do produto depende da qualidade das categorias, subcategorias e questões.

Mitigação:

- começar com um professor acompanhado manualmente;
- usar IA para sugerir extrações;
- priorizar revisão simples.

## 17. Marcos do MVP

### Marco 1 — Fundação

- autenticação;
- cadastro de professor;
- status de aprovação no banco;
- página pública do professor;
- cadastro de categorias e subcategorias;
- criação de agentes.

### Marco 2 — Conteúdo e questões

- upload de materiais;
- processamento básico;
- extração de questões por IA;
- associação de gabarito;
- revisão e aprovação pelo professor;
- banco de questões por subcategoria.

### Marco 3 — Assinatura e acesso do aluno

- cadastro de aluno;
- assinatura mensal de agente;
- controle de acesso;
- área do aluno.

### Marco 4 — Estudo

- prática com questões;
- registro de respostas;
- explicação de questões;
- chat de dúvidas restrito à base do agente.

### Marco 5 — Engajamento e diagnóstico

- desafio diário;
- ranking mensal por acertos;
- cálculo de desempenho por subcategoria;
- simulado personalizado com questões do banco.

## 18. Decisões em aberto

As decisões abaixo devem ser fechadas no documento de arquitetura:

- stack técnica;
- provedor de autenticação;
- provedor de pagamento;
- estratégia de armazenamento de arquivos;
- estratégia de processamento assíncrono;
- estratégia de embeddings e busca vetorial;
- modelo inicial de banco de dados;
- regras de versionamento de conteúdo;
- critérios de seleção de questões para simulados;
- limites de uso do chat por aluno;
- política de comissão do professor.
