# Arquitetura do MeuMonitor AI: começando modular antes de distribuir

Uma das decisões mais importantes no desenvolvimento do MeuMonitor AI foi não começar criando dezenas de microserviços.

O sistema está evoluindo como um monólito modular, com processamento assíncrono e alguns componentes especializados separados.

Na prática, temos:

- uma API HTTP em Fastify para autenticação, monitores, documentos, alunos, compras e revisão de conteúdo;
- um worker separado para executar tarefas pesadas;
- Redis e BullMQ para controlar a fila de processamento;
- Postgres/Supabase como fonte central de dados;
- Supabase Storage para armazenar os PDFs;
- um serviço externo de parsing baseado em Docling;
- modelos de IA para embeddings, questões, explicações e flashcards.

O fluxo de um documento funciona assim:

1. O professor envia um PDF pela aplicação.
2. A API salva o arquivo no Storage e registra o documento no banco.
3. A API publica um job na fila.
4. O worker consome o job em segundo plano.
5. O documento passa pelo parser, extração de texto, normalização, detecção de blocos e criação de chunks.
6. O sistema gera embeddings e pode extrair questões ou criar flashcards.
7. Cada etapa atualiza seu próprio status e resultado no banco.

Essa separação resolve um problema importante: o upload não precisa esperar o processamento completo de um PDF, que pode envolver parsing, modelos de IA e várias etapas de persistência.

Também permite controlar retry, backoff, concorrência e processamento parcial.

Mas ainda não considero isso uma arquitetura de microserviços. API e worker continuam fazendo parte do mesmo produto e compartilham o banco. Os módulos de billing, alunos, questões e documentos ainda estão dentro do mesmo backend.

E isso é intencional.

Antes de distribuir tudo, precisamos consolidar os limites dos domínios. Um módulo bem definido dentro de um monólito costuma ser mais valioso do que um microserviço com fronteiras confusas.

O primeiro candidato real a se tornar um serviço independente é o parser Docling, porque ele possui dependências pesadas, ciclo de deploy próprio e necessidade potencial de escala separada.

A evolução planejada é:

```text
Monólito modular
        +
Worker assíncrono
        +
Fila de processamento
        +
Parser especializado separado
```

Depois, se a escala justificar, podemos separar filas e workers por capacidade: documentos, embeddings, questões, flashcards e tarefas agendadas.

Arquitetura não é sobre distribuir tudo o mais rápido possível.

É sobre criar limites claros o bastante para que a distribuição possa acontecer quando ela realmente fizer sentido.

#softwarearchitecture #backend #typescript #distributedsystems #ai
