A seguir está um **documento técnico de engenharia** da plataforma, sem código, focado em requisitos, módulos e fases. É algo que você pode usar como base de PRD/Design Doc para arquitetura e desenvolvimento.

***

# 1. Visão geral do produto

## 1.1. Conceito

Plataforma onde **cada professor** cria sua própria página e oferece um **assistente de estudos com IA** baseado:

- nos materiais que ele envia (apostilas, livros, artigos, provas);
- no **banco de questões** que ele cadastra;
- em **flashcards** estruturados;
- em lógica de **prática contínua** (questões livres) + **diagnóstico recorrente** (desafios, simulados, relatórios).

A IA é usada em dois pontos principais:

1. **Onboarding do professor**  
   - processamento dos arquivos (extração, OCR, chunking);
   - organização em categorias/subcategorias;
   - extração e classificação de questões;
   - sugestão de flashcards.

2. **Uso do aluno**  
   - tirar dúvidas por texto/imagem, usando RAG sobre a base do professor;
   - explicar questões;
   - apoiar geração de simulados e relatórios personalizados.

## 1.2. Usuários

- **Professor**
  - Quer transformar conhecimento e materiais em um produto recorrente, sem cuidar de tecnologia.
  - Divulga o assistente para sua audiência.
  - Recebe comissão recorrente sobre assinaturas.

- **Aluno**
  - Quer estudar para uma prova/exame/competência específica com ajuda de IA.
  - Usa questões, flashcards, desafios e simulados personalizados.
  - Quer saber exatamente onde está fraco e o que revisar.

- **Admin / Plataforma**
  - Quer um modelo saudável de margem (assinatura B2C + uso de IA controlado).
  - Garante segurança, qualidade e isolamento entre professores.

***

# 2. Arquitetura lógica

A plataforma se divide em três grandes blocos:

1. **Camada do professor**  
   - Configuração pedagógica e comercial.
   - Upload e organização de conteúdo.
   - Criação de agentes especializados.

2. **Camada do aluno**  
   - Experiência de estudo, prática e diagnóstico.
   - Interação com o agente.

3. **Camada de plataforma (núcleo)**  
   - IA, RAG, banco de questões, flashcards.
   - Assinaturas e comissões.
   - Segurança, custos e observabilidade.

***

# 3. Camada do professor

## 3.1. Onboarding do professor

### Objetivo

Levar o professor de “zero” a “assistente publicado”, com o menor atrito possível.

### Requisitos

- Cadastro simples (nome, e-mail, senha).
- Formulário rápido:
  - área de atuação (ex.: Português, Física, Inglês, Concursos).
  - público-alvo (ENEM, concursos, TOEFL, etc.).
  - nome da página (slug).
- Aceite de termos (autoria dos materiais, uso da IA, comissão, etc.).
- Possibilidade da plataforma aprovar/reprovar professores.

***

## 3.2. Página do professor

### O que é

Uma landing page própria (como se fosse um mini-site) em que o professor:

- explica quem é;
- descreve o que o assistente faz;
- mostra para que provas/objetivos serve;
- apresenta depoimentos (no futuro);
- leva o aluno ao botão de assinatura.

### Requisitos

- URL amigável (slug único).
- Sessão “Sobre o professor”.
- Descrição do(s) agente(s) disponíveis.
- Explicação breve da experiência de estudo:
  - tirar dúvidas;
  - questões;
  - flashcards;
  - simulados mensais;
  - relatórios.
- Chamada clara para ação (“Assinar agora”, “Começar”).

***

## 3.3. Taxonomia de conteúdo

### Conceito

Estrutura hierárquica que organiza o conteúdo do professor:

- **Matéria** → ex.: Português, Física, Inglês, Direito.
- **Categoria** → ex.: Gramática, Redação, Mecânica, Reading.
- **Subcategoria** → ex.: Crase, Orações subordinadas, Circuitos elétricos.
- **Perfil de prova** → ex.: FGV, Cebraspe, ENEM, TOEFL, IELTS.

### Requisitos

- Toda matéria/categoria/subcategoria é criada pelo professor em campos estruturados:
  - nome;
  - descrição;
  - vínculo com a matéria.
- Perfis de prova incluem:
  - tipo de exame (concurso, vestibular, idioma);
  - banca/instituição (FGV, ETS, etc.);
  - comentários específicos.
- O professor pode editar, mesclar e arquivar categorias.
- A IA pode sugerir categorias, mas o professor sempre confirma.

***

## 3.4. Upload e processamento de materiais

### Tipos de material

- Apostilas em PDF.
- Livros autorizados.
- Provas antigas.
- Listas de exercícios.
- Artigos.
- Resumos.
- Slides.

### Pipeline (alto nível)

1. **Upload**
   - Professor seleciona arquivos.
   - Sistema:
     - valida formato e tamanho;
     - calcula hash para detectar duplicatas;
     - salva metadados.

2. **Processamento assíncrono**
   - OCR quando necessário (documentos escaneados).
   - Extração de texto e imagens relevantes.
   - Limpeza de cabeçalho/rodapé, numeração.
   - Separação em blocos (chunks) de tamanho adequado.

3. **Enriquecimento com IA**
   - Identificação de matéria/categoria/subcategoria em cada trecho.
   - Sinalização de possíveis conflitos/erros.
   - Criação de metadados (ex.: tipo de conteúdo, capítulo, seção).

4. **Embeddings**
   - Geração de vetores para cada chunk.
   - Armazenamento em índice vetorial.

5. **Revisão**
   - Professor pode visualizar:
     - documentos processados;
     - erros;
     - estatísticas (páginas, tamanho).

### Requisitos

- Processamento robusto e tolerante a falhas.
- Reprocessamento possível sem perder histórico.
- Exposição clara de status (uploaded, processando, pronto, com erro).
- Contabilização do custo de IA por arquivo.

***

## 3.5. Extração e cadastro de questões

### Objetivo

Transformar materiais (especialmente provas/listas) em um **banco de questões estruturado**.

### Pipeline

1. Detectar blocos que parecem questões (enunciado + alternativas).
2. Separar:

   - enunciado;
   - alternativas;
   - resposta correta (quando presente);
   - explicação (quando houver);
   - imagens associadas.

3. Classificar cada questão:

   - categoria/subcategoria;
   - perfil de prova;
   - nível de dificuldade;
   - ano;
   - banca;
   - tipo de questão (múltipla escolha, VF, aberto).

4. Gerar um “score de confiança” para a classificação.
5. Levar questões com confiança baixa para revisão do professor.

### Requisitos

- Interface amigável para o professor revisar questões:
  - editar enunciado/alternativas;
  - corrigir categoria/subcategoria/perfil;
  - marcar resposta certa;
  - adicionar explicação.

- Suporte para:
  - questões com tabela/imagem;
  - questões sem resposta (para gabarito manual);
  - arquivamento (retirar de circulação sem apagar dados).

***

## 3.6. Geração e gestão de flashcards

### Objetivo

Ajudar na **memorização de conceitos** e não só na prática de questões.

### Fontes possíveis

- Conceitos importantes dos materiais.
- Explicações de questões.
- Resumos produzidos pelo professor.
- Erros frequentes dos alunos.

### Fluxo

1. IA propõe flashcards (frente/verso + categoria/subcategoria/perfil).
2. Professor revisa, edita, aprova ou descarta.
3. Flashcards aprovados entram na base e podem ser:
   - usados em sessões de revisão diárias;
   - acionados automaticamente após questões erradas.

### Requisitos

- Relacionar cada flashcard a:
  - categoria/subcategoria;
  - perfil de prova;
  - tópico específico.
- Histórico de revisão por aluno:
  - quantas vezes viu;
  - desempenho;
  - quando deve aparecer de novo (repetição espaçada).

***

## 3.7. Criação de agentes (assistentes)

### Conceito

Um **agente** é uma configuração especializada da base do professor:

- define **o que pode ser consultado**;
- define **para que tipo de prova**;
- define **como responde** (tom, nível, idioma).

### Campos básicos

- Nome do agente.
- Descrição.
- Matéria(s) atendida(s).
- Categorias/subcategorias incluídas.
- Perfis de prova (ex.: apenas FGV, apenas TOEFL).
- Conteúdos autorizados (documentos, questões, flashcards).
- Estilo/tom de resposta.
- Nível típico do aluno (básico, intermediário, avançado).

### Requisitos

- Um professor pode ter vários agentes segmentados:
  - “Português para concursos FGV”.
  - “Redação para ENEM”.
  - “Inglês para TOEFL”.
- O mesmo material pode ser usado por vários agentes.
- O mesmo aluno pode assinar mais de um agente do mesmo professor.

***

# 4. Camada do aluno

## 4.1. Acesso à página do professor e assinatura

### Fluxo

1. Aluno chega pela página do professor.
2. Lê a descrição do professor e dos agentes.
3. Escolhe um agente (ou pacote).
4. Cria conta/loga.
5. Escolhe plano (ex.: mensal).
6. Faz pagamento.
7. Ganha acesso ao painel do aluno para aquele agente.

### Requisitos

- Toda assinatura deve ser ligada a:
  - aluno;
  - professor;
  - agente;
  - plano;
  - origem (página do professor X).

***

## 4.2. Onboarding de estudo

### Objetivo

Coletar informações iniciais para personalizar a experiência.

### Dados

- Exame/objetivo principal.
- Data estimada da prova.
- Nível atual (autodeclarado).
- Tempo disponível por dia/semana.
- Áreas que ele sente mais dificuldade.

Opcional:

- pequeno diagnóstico inicial (10 questões rápidas).

### Resultado

- Configuração inicial de:
  - volume de questões;
  - intensidade de flashcards;
  - foco nas primeiras categorias.

***

## 4.3. Assistente de dúvidas (chat)

### O que o aluno pode fazer

- Perguntar qualquer coisa dentro do escopo do agente:
  - “Explique crase em exemplos de concursos FGV”.
  - “Por que essa alternativa está errada?”
  - “Me dê 3 exemplos de frases com oração subordinada adjetiva.”
- Enviar imagem de uma questão (foto da apostila).

### Comportamento esperado

- Respostas baseadas **nos materiais do professor** (prioridade).
- Uso de RAG para buscar:
  - trechos de apostilas;
  - questões similares;
  - explicações previamente definidas.
- Explicações passo a passo, alinhadas ao perfil do exame.
- Quando não souber, ser honesto:
  - “Não tenho base suficiente para responder isso com segurança”.

### Restrições

- Não sair do escopo (não virar um ChatGPT genérico).
- Não misturar TOEFL com IELTS, FGV com Cebraspe, etc.
- Não contradizer conteúdo do professor sem indicar falta de base.

***

## 4.4. Prática livre com questões

### Objetivo

Permitir que o aluno **resolva quantas questões quiser** e gerar dados de desempenho.

### Possibilidades

- “Estudar por tema”:
  - escolhe matéria;
  - escolhe categoria;
  - escolhe subcategoria;
  - define dificuldade.
- “Estudar por perfil de prova”:
  - ex.: apenas questões da FGV.
- “Revisar erros”:
  - foco apenas em questões erradas anteriormente.
- “Repetir questões-chave”:
  - questões importantes marcadas pelo professor.

### Dados coletados

- resposta escolhida;
- correto/incorreto;
- tempo de resposta;
- número de tentativas;
- numeração da questão;
- contexto (categoria/subcategoria/perfil).

***

## 4.5. Flashcards

### Experiência

- Tela de revisão diária com número limitado de cartões.
- Em cada cartão:
  - mostra frente;
  - aluno tenta lembrar;
  - revela verso;
  - aluno indica o quão difícil foi (errei/difícil/bom/fácil).
- Sistema agenda o próximo aparecimento do cartão.

### Requisitos

- Integrar com erros recorrentes:
  - errou muitas questões de “Crase”?  
    → mostrar mais flashcards de crase.
- Não sobrecarregar o aluno:
  - definir um teto diário (ex.: 20–50 flashcards).

***

## 4.6. Desafio diário

### Conceito

- Uma questão por dia, igual para todos os alunos **do mesmo agente**.
- Serve para:
  - manter hábito;
  - criar senso de comunidade;
  - gerar um dado leve de engajamento.

### Requisitos

- Questão selecionada de forma automática ou curada.
- Pode ter explicação após resposta.
- Pode gerar:
  - streak (sequência);
  - simples ranking entre alunos do agente.

***

## 4.7. Simulado semanal

### Objetivo

Medir de forma recorrente a evolução do aluno.

### Características

- 10 questões.
- Distribuição equilibrada entre:
  - categorias mais trabalhadas na semana;
  - algumas questões novas;
  - alguns itens de revisão.

### Requisitos

- Ser fácil de iniciar e terminar.
- Entregar resultado imediato:
  - nota;
  - erros e acertos;
  - recomendações rápidas.

***

## 4.8. Simulado mensal personalizado

### Objetivo

Fazer um **diagnóstico profundo** baseado no mês inteiro.

### Entradas

- histórico de:
  - questões resolvidas;
  - acertos e erros;
  - flashcards;
  - desafios;
  - simulados semanais;
  - tempo de resposta.

### Saída

- simulado de 20–30 questões que prioriza:
  - subcategorias fracas;
  - competências pouco praticadas;
  - tipos de questão problemáticos.

### Pós-simulado

- relatório com:
  - desempenho por matéria/categoria/subcategoria;
  - comparação com mês anterior;
  - principais erros conceituais;
  - sugestão de plano para o próximo mês.

***

# 5. Camada da plataforma (núcleo)

## 5.1. RAG e IA

### Princípios

- IA deve ser **economicamente viável**:
  - usar modelos menores para classificação e tarefas simples;
  - GPT-4o mini (ou similar) para respostas ao aluno.
- RAG deve ser:
  - **multi-tenant seguro** (nunca misturar dados de professor);
  - filtrado por agente, categoria, subcategoria e perfil;
  - parcimonioso em quantidade de chunks por resposta.

### Funcionalidades

- Extração de texto e OCR.
- Chunking inteligente (tamanho e overlap).
- Classificação semântica (tema, subtema, perfil de prova).
- Geração de embeddings.
- Busca vetorial com filtros rígidos.
- Montagem de contexto enxuto para respostas.
- Geração de explicações, flashcards e relatórios.

***

## 5.2. Segurança e multi-tenant

### Objetivo

Garantir que:

- um professor nunca veja dados de outro;
- um aluno nunca veja conteúdos não-autorizados;
- agentes não vazem dados entre perfis/provas.

### Estratégias

- Cada registro sensível deve ter `teacher_id`.
- Toda query de dados passa por:
  - validação de identidade;
  - filtro obrigatório por professor;
  - filtro por agente (quando aplicável).
- Os índices vetoriais também têm metadados de:
  - professor;
  - agente permitido;
  - categoria/perfil.

A OWASP RAG Security recomenda aplicar controle de acesso **antes** da busca vetorial, não após. [cheatsheetseries.owasp](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html)

***

## 5.3. Assinaturas, pagamentos e comissões

### Estrutura de monetização

- Plano B2C (ex.: R$49,90/mês por agente).
- O professor não paga mensalidade técnica.
- O professor recebe **comissão recorrente** sobre assinaturas ativas da sua página (ex.: 25%).
- Opcional: programa de indicação de professores (ex.: 3% do faturamento do indicado durante 12 meses).

### Requisitos

- Gestão de assinaturas:
  - ativação, renovação, cancelamento.
- Tratamento de:
  - pagamentos aprovados;
  - falhas;
  - reembolsos;
  - chargebacks.
- Cálculo de comissões:
  - comissão parcial apenas sobre pagamentos aprovados;
  - período de carência (ex.: 15–30 dias) antes de liberar saque;
  - histórico de comissões por professor.
- Exportação de dados para contabilidade/fiscal.

***

## 5.4. Custo de IA e controle de uso

### Objetivo

Evitar que uso extremo destrua a margem unitária.

### Estratégia

- Registrar:
  - tokens de entrada e saída por operação;
  - custo estimado por modelo;
  - operação (upload, chat, simulado etc.);
  - professor e aluno associados.
- Definir alvos:
  - custo médio de IA por aluno (ex.: meta R$3–R$6).
  - limite máximo aceitável (ex.: R$10–R$12).
- Aplicar:
  - rate limit por aluno;
  - limites de tamanho de mensagem/contexto;
  - fallback para modelo mais barato em tarefas simples;
  - resumo automático de histórico.
- Ajustar:
  - planos;
  - preços;
  - benefícios do plano premium (ex.: correção de redação, voz, avatar).

***

## 5.5. Observabilidade e métricas

### Indicadores de produto

- alunos ativos;
- tempo médio de estudo;
- número de questões resolvidas por aluno;
- número de flashcards revisados;
- taxa de conclusão dos simulados;
- retenção (D30, D60).

### Indicadores de IA

- tokens de entrada e saída por:
  - professor;
  - aluno;
  - agente;
  - tipo de operação.
- custo total por mês.
- custo médio por aluno.
- custo médio por professor.
- taxa de erro da IA (falhas, timeouts).

### Indicadores de negócio

- MRR por professor.
- número de assinaturas por professor.
- churn.
- CAC (quando houver campanha paga).
- LTV estimado por aluno/professor.

***

## 5.6. Economia unitária e custo real da operação

Esse controle faz parte do escopo desde o primeiro dia do projeto. O objetivo é saber se uma assinatura de R$59,90 permanece saudável conforme o uso do aluno cresce.

### Custos de IA

- registrar tokens de entrada e saída por tipo de operação;
- registrar modelo e provedor usados;
- registrar custo estimado por chamada;
- consolidar custo por aluno, professor, agente, assinatura e período;
- diferenciar custo de chat, explicação, extração, classificação, embeddings e simulado.

### Custos de infraestrutura

- registrar custos reais do Supabase;
- registrar custo de compute/worker, VPS ou plataforma de deploy;
- registrar storage, bandwidth e serviços de observabilidade;
- associar cada lançamento a fornecedor, serviço, ambiente e período;
- começar com lançamento manual baseado em fatura/painel e permitir automação futura via API.

### Indicadores obrigatórios

- custo de IA por aluno;
- tokens por operação;
- custo total de infraestrutura por mês;
- custo total por aluno ativo;
- custo por agente e por assinatura;
- custo variável, custo fixo rateado e margem estimada;
- alertas para consumo acima do limite definido.

O painel financeiro avançado pode ficar para depois, mas os eventos, custos e agregações básicas não podem ser adiados.

***

# 6. Fases de implementação (resumo)

## Fase 1 — MVP operacional

- Autenticação e perfis.
- Página do professor (simplificada).
- Upload de PDF + processamento básico de RAG.
- Taxonomia inicial (matéria, categoria, subcategoria).
- Criação de um agente por professor.
- Chat de dúvidas por texto.
- Assinatura única.
- Comissão fixa.

## Fase 2 — Banco de questões e prática

- Extração e cadastro de questões.
- Edição/revisão pelo professor.
- Tela de prática livre para o aluno.
- Registro de tentativas.
- Desafio diário.
- Simulado semanal.
- Relatório simples de desempenho.

## Fase 3 — Flashcards e diagnóstico mensal

- Geração e revisão de flashcards.
- Repetição espaçada básica.
- Simulado mensal personalizado.
- Relatório mensal detalhado.
- Dashboard de turma para o professor.

## Fase 4 — Otimização e planos premium

- Gestão fina de custos de IA.
- Planos avançados (voz, avatar, correção de redação).
- Programa de indicação de professores.
- Segurança RAG avançada (prompt injection, auditoria).
- Aplicativo mobile e integrações adicionais.

***

Se quiser, no próximo passo posso transformar isso em:

- um **sumário executivo para investidor** (1–2 páginas); ou
- um **checklist de tarefas técnicas** (backlog por fase, pronto para colocar em um board).
