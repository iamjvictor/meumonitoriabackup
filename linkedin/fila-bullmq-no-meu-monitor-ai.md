# Por que usamos uma fila com BullMQ no MeuMonitor AI?

Processar um PDF não é uma operação rápida.

Um único documento pode envolver upload, parsing, extração de texto, normalização, detecção de blocos, criação de chunks, embeddings, geração de questões e criação de flashcards.

Se tudo isso acontecesse dentro da mesma requisição HTTP, o usuário teria que esperar o processamento terminar. Além disso, qualquer falha no meio do caminho poderia deixar a requisição presa ou obrigar o sistema a começar tudo novamente.

Por isso escolhemos uma estrutura de dados de fila.

A fila cria uma separação clara entre:

- receber uma solicitação;
- executar um processamento pesado.

No nosso caso, a API recebe o documento, salva o arquivo e registra o estado inicial. Depois, publica um job na fila. O worker fica responsável por consumir esse job e executar o processamento em segundo plano.

O fluxo é:

```text
Professor envia PDF
        ↓
API salva o documento
        ↓
API publica um job
        ↓
Redis / BullMQ
        ↓
Worker consome o job
        ↓
Pipeline processa o documento
        ↓
Banco recebe status e resultados
```

## Por que BullMQ?

Escolhemos BullMQ porque ele já oferece uma camada madura sobre Redis para execução de jobs assíncronos.

Não precisamos implementar manualmente:

- armazenamento de jobs;
- controle de estados;
- consumo concorrente;
- retries;
- backoff;
- jobs concluídos e falhos;
- remoção automática de histórico;
- conexão entre produtores e consumidores.

Além disso, BullMQ se integra naturalmente ao nosso backend TypeScript/Node.js e permite separar a API do worker sem criar uma infraestrutura de mensageria complexa neste estágio do produto.

## Como implementamos

A API publica jobs na fila `monitor-documents`:

```ts
await documentQueue.add(
  'process-document',
  { documentId: document.id },
  { jobId: document.id },
);
```

O worker consome a fila em um processo separado:

```ts
new Worker(
  'monitor-documents',
  async (job) => {
    return documentWorkerService.process(job.data.documentId);
  },
  {
    connection: redisConnection,
    concurrency: 2,
  },
);
```

Também configuramos três tentativas com backoff exponencial. Se um processamento falhar temporariamente, o job não é descartado imediatamente. Ele pode ser executado novamente depois de alguns segundos.

Quando todas as tentativas terminam, o worker marca o documento como falho e registra o erro.

## Impacto no sistema

O primeiro impacto foi na experiência do usuário: o upload deixa de depender do tempo total de processamento do documento.

O segundo foi na resiliência. Uma falha em um modelo de IA, no parser ou em uma etapa de persistência pode ser tratada pelo mecanismo de retry, sem bloquear a API inteira.

O terceiro foi na escalabilidade. Podemos aumentar a quantidade de workers ou a concorrência sem alterar o fluxo HTTP.

O quarto foi na observabilidade. O documento possui status geral e status por operação, permitindo identificar se o problema aconteceu na extração, nos embeddings, nas questões ou nos flashcards.

Mas filas também trazem responsabilidades.

O sistema passa a ser eventualmente consistente: o documento é aceito primeiro e fica pronto depois. Redis se torna uma dependência importante. E os jobs precisam ser idempotentes, porque uma mesma operação pode ser executada novamente após um retry.

Por isso, a fila não é apenas um detalhe de infraestrutura. Ela influencia o modelo de estados, a persistência, os erros, a observabilidade e a experiência do usuário.

No MeuMonitor AI, BullMQ funciona como a ponte entre uma API rápida e um pipeline de processamento pesado.

Essa separação nos permite continuar evoluindo o produto sem transformar cada upload em uma operação longa, frágil e difícil de escalar.

#backend #bullmq #redis #typescript #softwarearchitecture #distributedsystems
