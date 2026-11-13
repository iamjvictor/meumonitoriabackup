# Especificação: redução de comandos Redis

## Objetivo e limites
Reduzir comandos ociosos do BullMQ e heartbeat e substituir o cache Redis de perfil público por cache local, mantendo processamento e recuperação seguros. Não migrar Redis, alterar histórico do chat, permissões, schema ou fazer deploy. Métricas de produção só serão apresentadas como comprovadas quando medidas. Valores propostos devem ser validados no Redis efetivamente utilizado.

## Contratos e critérios
- AC-001: `drainDelay` padrão 300 segundos para as quatro filas, configurável via `WORKER_DRAIN_DELAY_SECONDS` (inteiro de 1 a 300; fallback explícito 60); configuração inválida falha na inicialização.
- AC-002: job imediato acorda worker bloqueado sem aguardar o fim do timeout; testar latência com limite de 5 segundos em ambiente local e homologação com carga baixa.
- AC-003: job adiado e retry não iniciam antes do vencimento; em ambiente local sem carga iniciam até 5 segundos após vencimento. Registrar a latência observada na homologação, sem exigir SLA em produção.
- AC-004: reconexão após perda temporária do Redis retoma processamento sem reinício manual; em teste controlado retomada em até 30 segundos após disponibilidade.
- AC-005: comparar comandos em janelas equivalentes e explicitar janelas, versão, instâncias, carga e limitações; não alegar economia sem dados.
- AC-006: `stalledInterval` em pagamentos permanece 300.000 ms; documentos, simulados e materialização passam a 600.000 ms. Opções de concorrência, tentativas e remoção não mudam.
- AC-007: teste real com worker interrompido comprova recuperação com intervalos de teste reduzidos e registra prazo, sem prometer recuperação exata em produção.
- AC-008: teste independente de idempotência do processamento de pagamento repetido demonstra efeito de negócio único; usar infraestrutura isolada e dados sandbox, sem transações reais.
- AC-009: `WORKER_STALLED_INTERVAL_MS` opcional, inteiro entre 30000 e 900000, sobrescreve as quatro filas para reversão; inválido encerra inicialização. Sem variável aplicam-se os padrões por fila.
- AC-010: heartbeat inicial e depois a cada 120.000 ms, TTL 300 segundos. `WORKER_HEARTBEAT_INTERVAL_MS` e `WORKER_HEARTBEAT_TTL_SECONDS` configuráveis; exigir inteiros positivos e TTL maior que duas vezes o intervalo; reversão 60000/180.
- AC-011: preservar contrato HTTP e respostas de `/health/worker` em sucesso, ausência e falha Redis.
- AC-012: testar publicação, expiração e parada com relógio controlado e documentar detecção de até TTL após último heartbeat, acrescida do intervalo de consulta externa.
- AC-013: identificar e documentar configuração de sondas quando acessível; desconhecido é lacuna, sem alterar configuração externa.
- AC-014: opções e procedimentos de reversão documentados sem exclusão de chaves ou jobs.
- AC-015: cache local de perfil público compartilhado no mesmo processo entre rotas de professor e monitor, TTL absoluto de 60 segundos e máximo 1000 perfis, com expulsão LRU; falha ou perfil inexistente não é armazenado.
- AC-016: invalidação de slug anterior e novo após edição de perfil e por alterações de monitor preserva os pontos existentes. Invalidação local imediata inclusive sob leitura concorrente: consulta iniciada antes de invalidar não pode repovoar o cache com valor antigo.
- AC-017: caches de processos distintos são independentes; eventual desatualização no outro processo pode durar até 60 segundos desde sua última gravação; teste com relógio controlado.
- AC-018: leitura do perfil público não depende de Redis, inclusive quando indisponível; dados vêm do banco em cache miss.
- AC-019: remover clientes Redis usados exclusivamente pelo cache de perfil sem afetar demais módulos. Reutilizar singleton por processo, sem singleton global entre processos.
- AC-020: testar expiração, limite LRU, perfis inexistentes, erro de banco, concorrência e invalidação durante leitura; não armazenar falhas.
- AC-021: manter eventos de hit/miss/escrita/invalidação sem identificar Redis como origem; não expor conteúdo de perfil.
- AC-022: linha de base identifica réplicas, ambientes, versão, polling de saúde, comandos e jobs adiados; dados indisponíveis registrados como lacuna.
- AC-023: testes com Redis isolado cobrem job imediato, adiado, reconexão e recuperação; validação Upstash em homologação depende de acesso e não deve tocar filas reais.
- AC-024: documentar rollback independente de filas, heartbeat e cache; migração gradual só com autorização para deploy.

## Decisões
Cache local escolhido em vez de CDN ou Redis compartilhado: usuário aceita até 60 segundos de desatualização entre instâncias. Limite de 1000 é proposta operacional inicial, não garantia de memória em bytes. Pagamentos mantêm janela de detecção atual. Não iniciar execução nem realizar deploy apenas por este planejamento.
