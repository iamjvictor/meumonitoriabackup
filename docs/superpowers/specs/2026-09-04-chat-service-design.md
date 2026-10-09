# Especificação do Serviço de Chat por Matéria

**Data:** 2026-09-04  
**Status:** proposta para revisão  
**Produto:** MeuMonitor AI

## 1. Objetivo

Criar um serviço de chat persistente para o aluno conversar naturalmente com o agente de estudo, mantendo o contexto separado por matéria e respondendo dúvidas com base no conteúdo autorizado do monitor.

O chat será uma funcionalidade principal da área do aluno. Ele permanecerá disponível ao lado do conteúdo principal da aplicação e poderá receber contexto adicional quando o aluno iniciar uma dúvida a partir de uma questão.

## 2. Decisões de produto

- O chat será uma conversa normal, sem exigir que o aluno siga um roteiro pedagógico.
- Cada matéria do monitor terá uma conversa própria.
- O aluno terá no máximo um chat por matéria dentro de cada monitor.
- Um monitor com três matérias terá, portanto, até três contextos de conversa separados.
- A matéria selecionada no seletor do header define o chat ativo e o escopo principal do RAG.
- O histórico completo será salvo para preservar continuidade e permitir reabertura da conversa.
- O sistema poderá compactar o contexto no futuro, mas a primeira versão não dependerá dessa otimização.
- Uma dúvida iniciada em uma questão será encaminhada para o chat da matéria correspondente.
- O primeiro fluxo de dúvida usará uma mensagem sugerida, e não uma pergunta gerada automaticamente pela IA.

## 3. Escopo da primeira versão

### Incluído

- Chat persistente por matéria e monitor.
- Seletor de matéria no header do chat.
- Criação automática do chat quando o aluno acessar uma matéria pela primeira vez.
- Histórico de mensagens do aluno e do agente.
- Continuidade de contexto dentro da conversa.
- RAG filtrado por monitor, agente, matéria e tópico quando disponível.
- Abertura do chat a partir de uma questão.
- Inclusão do contexto da questão na mensagem enviada ao modelo.
- Registro de tokens, modelo, custo estimado, fontes recuperadas e status da resposta.
- Estados de carregamento, erro, resposta parcial e nova tentativa.

### Fora do primeiro escopo

- Múltiplas conversas manuais dentro da mesma matéria.
- Memória semântica complexa entre diferentes matérias.
- Tutoria ativa obrigatória.
- Geração automática de perguntas para iniciar dúvidas.
- Voz, áudio, imagem ou correção de redação.
- Compartilhamento público de conversas.
- Compactação automática do histórico como requisito de lançamento.

## 4. Conceitos e limites

### Monitor

Produto assinado pelo aluno, formado por um conjunto de matérias e conteúdos de um professor.

### Matéria

Unidade de organização do conteúdo e da memória do chat. É o limite principal de contexto da conversa.

### Chat

Conversa persistente entre um aluno e um monitor em uma matéria específica. A chave lógica do chat é:

```text
student_id + monitor_id + subject_id
```

### Contexto da questão

Informações temporárias ou persistidas associadas a uma questão em estudo, como enunciado, alternativas, resposta do aluno, gabarito, explicação, tópico e origem.

### Fontes RAG

Chunks aprovados e autorizados para o monitor, filtrados pelo escopo do chat. O chat nunca poderá buscar conteúdo apenas por similaridade sem aplicar os filtros de autorização.

## 5. Requisitos funcionais

### RF-01 — Listar matérias disponíveis

O sistema deve listar as matérias disponíveis no monitor ativo do aluno.

**Especificação:**

- Exibir nome, identidade visual e estado da matéria quando aplicável.
- O seletor deve mostrar somente matérias às quais o aluno possui acesso.
- A matéria selecionada deve permanecer visível no header do chat.
- A troca de matéria deve carregar o chat correspondente sem misturar mensagens.

### RF-02 — Criar ou recuperar o chat da matéria

O sistema deve recuperar o chat existente ou criar um novo chat para a combinação aluno, monitor e matéria.

**Especificação:**

- Deve existir no máximo um chat ativo por combinação `student_id`, `monitor_id` e `subject_id`.
- A criação deve ser idempotente.
- Um chat sem mensagens pode existir como estado inicial.
- O chat deve respeitar o status da assinatura e do acesso do aluno.

### RF-03 — Enviar mensagem

O aluno deve poder enviar uma mensagem textual para o chat da matéria ativa.

**Especificação:**

- A mensagem deve ser validada no servidor.
- A mensagem deve ser salva antes ou durante o processamento de forma que falhas não causem perda silenciosa.
- O sistema deve impedir envio para chat de matéria sem acesso válido.
- O sistema deve impedir que o cliente informe livremente outro monitor, agente ou matéria para ampliar o escopo.

### RF-04 — Gerar resposta contextualizada

O sistema deve gerar uma resposta usando o histórico relevante, o escopo da matéria e as fontes recuperadas pelo RAG.

**Especificação:**

O pacote de contexto inicial deve conter:

```text
identidade e regras do agente
monitor e matéria ativa
tópico ativo, quando disponível
histórico da conversa
contexto da questão, quando houver
chunks recuperados do conteúdo autorizado
```

- A resposta deve declarar incerteza quando as fontes não forem suficientes.
- O agente não deve inventar conteúdo apresentado como vindo dos materiais do professor.
- O sistema deve registrar as fontes utilizadas internamente.
- O modelo deve receber instruções para permanecer dentro da matéria e do monitor ativos.

### RF-05 — Usar RAG por matéria e tópico

O sistema deve buscar fontes relevantes dentro do escopo autorizado.

**Especificação:**

- Filtro obrigatório por monitor/agente e matéria.
- Filtro por tópico ou subtópico quando o contexto estiver disponível.
- Preferência por conteúdo aprovado e publicado.
- Chunks devem carregar proveniência suficiente para identificar documento, página, bloco e tópico.
- A quantidade de chunks deve possuir limite configurável para controlar custo e qualidade.

### RF-06 — Tirar dúvida a partir de uma questão

O aluno deve poder clicar em “Tirar dúvida com IA” durante a resolução ou revisão de uma questão.

**Especificação:**

- O sistema deve identificar a matéria e o tópico da questão.
- Deve abrir ou focar o chat da matéria correspondente.
- Deve anexar ao próximo envio o contexto da questão:
  - enunciado;
  - alternativas, quando existirem;
  - resposta selecionada pelo aluno, quando existir;
  - resposta correta, conforme a regra de exposição do produto;
  - explicação aprovada, quando existir;
  - tópico e subcategoria;
  - identificador da questão e sua origem.
- A interface deve iniciar com a mensagem sugerida: “Tenho uma dúvida sobre esta questão”.
- O aluno deve poder editar a mensagem antes de enviar.
- O contexto da questão deve ser tratado como contexto da conversa daquela matéria.
- A questão não deve ser enviada para um chat de outra matéria.

### RF-07 — Persistir histórico

O sistema deve salvar todas as mensagens do aluno e do agente associadas ao chat correto.

**Especificação:**

- Cada mensagem deve possuir autor, conteúdo, data, status e ordem dentro da conversa.
- Mensagens em processamento, concluídas e falhas devem ser distinguíveis.
- Uma falha de geração não deve apagar a mensagem do aluno.
- O aluno deve conseguir reabrir a conversa e visualizar o histórico.
- O histórico deve ser paginado para evitar carregar toda a conversa de uma vez na interface.

### RF-08 — Trocar de matéria sem perder contexto

Ao trocar a matéria no seletor, o sistema deve carregar o contexto daquela matéria.

**Especificação:**

- Mensagens da matéria anterior não podem aparecer no chat novo.
- O estado temporário de uma questão deve ser limpo ou substituído pela questão da nova matéria.
- A troca deve atualizar o escopo do RAG da próxima mensagem.
- O sistema deve manter a última matéria selecionada para facilitar o retorno do aluno, sem alterar a autorização do monitor.

### RF-09 — Exibir estados da conversa

O chat deve comunicar claramente seu estado ao aluno.

**Estados mínimos:**

- vazio;
- carregando histórico;
- enviando mensagem;
- gerando resposta;
- resposta parcial, se houver streaming;
- concluído;
- erro recuperável;
- limite de uso atingido;
- acesso indisponível.

### RF-10 — Registrar consumo e proveniência

Cada geração deve produzir um registro operacional.

**Dados mínimos:**

- aluno, monitor, agente e matéria;
- chat e mensagens relacionadas;
- operação e modelo/provedor;
- tokens de entrada e saída;
- custo estimado;
- duração e status;
- erro, quando houver;
- identificadores dos chunks recuperados;
- quantidade e pontuação dos resultados RAG.

## 6. Modelo de dados conceitual

As tabelas devem seguir os padrões existentes do projeto e podem ser adaptadas ao schema final.

### `student_subject_chats`

- `id`;
- `student_id`;
- `monitor_id`;
- `agent_id`, quando o agente for necessário para o escopo comercial;
- `subject_id`;
- `title` opcional, inicialmente derivado do nome da matéria;
- `last_message_at`;
- `status`;
- `created_at`, `updated_at`.

Restrição recomendada: unicidade por `student_id`, `monitor_id` e `subject_id`.

### `chat_messages`

- `id`;
- `chat_id`;
- `role`: `student`, `assistant` ou `system`;
- `content`;
- `status`: `pending`, `streaming`, `completed` ou `failed`;
- `source_question_id` opcional;
- `context_snapshot` opcional para auditoria do contexto usado;
- `created_at`;
- `completed_at`;
- `error_code` e `error_message` quando aplicável.

### `chat_generations`

- `id`;
- `chat_id`;
- `user_message_id`;
- `assistant_message_id`;
- `model`;
- `provider`;
- `input_tokens`;
- `output_tokens`;
- `estimated_cost`;
- `latency_ms`;
- `status`;
- `created_at`.

### `chat_retrieval_sources`

- `generation_id`;
- `document_id`;
- `chunk_id`;
- `subject_id`;
- `topic_id` quando disponível;
- `rank`;
- `similarity_score`;
- `used_in_prompt`.

### Integração com respostas de questões

O chat deve usar `StudentQuestionAttempt` como referência genérica para a resposta do aluno, independentemente da origem da questão.

O campo `mode` diferencia os fluxos:

```text
PRACTICE
DAILY_CHALLENGE
SIMULATED
```

O desafio diário continuará possuindo `DailyChallengeAttempt` como entidade específica para regras próprias, como uma resposta por aluno por desafio e composição do ranking. Nesse fluxo, a resposta cria os dois registros: a tentativa geral em `StudentQuestionAttempt` e o vínculo específico em `DailyChallengeAttempt`.

Para iniciar uma dúvida no chat, o sistema poderá receber o `questionAttemptId` e montar o contexto com a questão, a alternativa escolhida, o resultado e o tempo de resposta, quando disponíveis.

## 7. Montagem do contexto

### Primeira versão

Na primeira versão, o histórico completo deve ser armazenado, mas o backend deve aplicar uma janela configurável para montar o prompt, evitando crescimento ilimitado por requisição.

O contexto será montado nesta ordem:

1. regras do sistema e do agente;
2. escopo de autorização do monitor e da matéria;
3. tópico e contexto da questão, se presentes;
4. histórico recente da conversa;
5. fontes recuperadas pelo RAG;
6. mensagem atual do aluno.

O backend deve impor limites de tamanho para cada bloco e rejeitar ou reduzir entradas excessivamente grandes de forma controlada.

### Evolução planejada: compactação

Futuramente, o serviço poderá criar um resumo persistente da conversa e usar esse resumo junto de uma janela recente de mensagens.

Essa evolução deve preservar:

- fatos relevantes aprendidos na conversa;
- dúvidas ainda abertas;
- tópico estudado;
- decisões e explicações importantes;
- referência às questões discutidas.

A compactação não deve apagar o histórico bruto. Ela será uma representação derivada, versionada e regenerável.

## 8. Fluxo principal

```text
Aluno abre a área do monitor
        |
        v
Sistema identifica matérias autorizadas
        |
        v
Aluno seleciona uma matéria
        |
        v
Recupera ou cria o chat da matéria
        |
        v
Aluno envia mensagem
        |
        v
Valida acesso e monta pacote de contexto
        |
        v
Executa busca RAG com filtros de segurança
        |
        v
Gera resposta e registra consumo/proveniência
        |
        v
Salva resposta e atualiza o chat
```

### Fluxo originado em questão

```text
Aluno está resolvendo uma questão
        |
        v
Clica em “Tirar dúvida com IA”
        |
        v
Sistema identifica matéria e tópico
        |
        v
Abre o chat correto
        |
        v
Preenche “Tenho uma dúvida sobre esta questão”
        |
        v
Aluno edita ou envia
        |
        v
Contexto da questão + histórico + RAG são usados
```

## 9. Segurança e isolamento

- Toda leitura e escrita deve validar o aluno autenticado.
- O acesso deve ser validado contra a assinatura e o monitor ativo.
- O `subject_id` recebido do cliente deve ser conferido contra o monitor e a assinatura no servidor.
- O RAG deve filtrar por identificadores de tenant antes da similaridade ou junto dela.
- Conteúdo de outro professor, monitor ou matéria nunca deve entrar no prompt.
- O histórico de um aluno não pode ser acessado por outro aluno.
- Logs não devem expor tokens de autenticação nem dados desnecessários do aluno.
- O contexto enviado ao modelo deve ser auditável sem depender apenas do texto final da resposta.

## 10. Custos e limites

O custo dominante será o uso do modelo, especialmente tokens de entrada compostos por histórico, contexto da questão e chunks RAG.

Para controlar o custo:

- manter janela configurável de histórico no prompt;
- limitar quantidade e tamanho dos chunks RAG;
- limitar tamanho máximo das mensagens;
- limitar tamanho máximo das respostas;
- registrar tokens e custo estimado por geração;
- permitir limites de uso por aluno, monitor e assinatura;
- preparar a arquitetura para compactação futura;
- permitir troca de modelo por operação sem alterar o contrato do chat.

O armazenamento do histórico deve ser tratado separadamente do custo de inferência. Guardar as mensagens é barato; reenviá-las repetidamente ao modelo é o principal fator de crescimento variável.

## 11. Requisitos não funcionais

- O chat deve funcionar em layout responsivo, com painel persistente à direita em telas amplas.
- O histórico deve carregar de forma paginada.
- A geração deve suportar cancelamento ou timeout controlado.
- Falhas do provedor devem produzir uma mensagem recuperável para o aluno.
- Operações devem ser idempotentes quando houver retry.
- O serviço deve possuir logs estruturados e métricas de latência, erro, tokens e custo.
- O contrato do backend deve separar recuperação de contexto, execução do modelo e persistência.

## 12. Critérios de aceite

1. Um aluno com um monitor de três matérias consegue alternar entre até três chats independentes.
2. O histórico de Física não aparece ao abrir Matemática.
3. O sistema recupera o mesmo chat ao sair e retornar à matéria.
4. O aluno consegue enviar uma conversa normal sem estar resolvendo uma questão.
5. Ao iniciar uma dúvida por uma questão, o chat correto é aberto e recebe a mensagem sugerida.
6. A geração recebe o contexto da questão, a matéria, o tópico e os chunks autorizados.
7. Uma pergunta sobre uma matéria não recupera documentos de outra matéria.
8. Uma falha do modelo mantém a mensagem do aluno e permite tentar novamente.
9. Cada geração registra tokens, custo estimado, status e fontes recuperadas.
10. O histórico completo permanece salvo mesmo quando, no futuro, o prompt usar uma versão compactada.

## 13. Próxima etapa

Depois da aprovação desta especificação, o trabalho seguinte será criar o plano de implementação, detalhando migrations, contratos server-side, serviço de recuperação RAG, integração com o modelo, componentes do layout e testes.
