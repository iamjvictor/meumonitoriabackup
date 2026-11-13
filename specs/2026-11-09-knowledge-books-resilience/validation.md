# Evidências e lacunas

Status: implementado sob flag desativada; validação parcial. Nenhuma migration foi aplicada em produção.

## Base observada

- Imagem local: Docling 2.122.0; `document_timeout` e `page_range` presentes; CUDA indisponível no container consultado.
- Conversor ativa fórmulas e usa `images_scale=1.0`; opção OCR observada usa scale=3.0. Escalas não são intercambiáveis.
- Conversão atual do documento inteiro precede persistência dos chunks.
- Cliente v2 desabilita limites de dispatcher; timeout de rede não garante cancelamento da conversão.
- Acervo mostrou chunks READY com contexto corrompido e índices visuais falhos: sucesso técnico não prova qualidade.

## Matriz de aceite

| AC | Pacotes | Cenários | Resultado |
|---|---|---|---|
| 001 | P1 | Perfil/defaults | Passou: defaults e perfil alternativo, hash Python/TS |
| 002 | P2,P4 | Livro 354 páginas | Passou planejamento real em banco isolado: 36 lotes |
| 003 | P3,P4 | Checkpoint/crash/outro host | Parcial: processos separados e disco local; Storage remoto não testado |
| 004 | P2,P4 | Processo infinito/orçamento | Passou teste sintético e watchdog real em página do Atkins |
| 005 | P3,P4 | Retry/concorrência | Passou concorrência real e reexecução com checkpoints em banco isolado |
| 006 | P2,P4 | Heartbeat/progresso | Passou testes focais; observar em homologação |
| 007 | P5 | Cobertura/publicação | Parcial: falhas/lacunas bloqueadas; OCR pode corromper conteúdo com status técnico completo |
| 008 | P2,P5 | Fronteira 10–11 | Parcial: teste sintético e bloqueio conservador; falta provar reconstrução semântica |
| 009 | P3–P5 | Tenant/geração/rollback | Parcial: FKs, RLS e publicação testados isoladamente; rollback ainda sem teste real |
| 010 | P1 | Benchmark cinco páginas | Passou 20 medições; comparação visual pontual documentada |
| 011 | P5,P6 | Recuperação e evidência | Parcial: busca SQL com embeddings simulados; falta chat e modelo reais |

Lacunas antes da execução: reconciliar o plano com o diff preexistente, definir base de implementação, confirmar contrato de progresso existente, revisar migration e política de retenção com os padrões atuais. O plano não estima duração do OCR nem garante ganho sem benchmark.

## Revisão independente do plano

revisor_qa revisou os cinco artefatos. Foram incorporados: orçamento configurável ampliado para piloto, medição explícita do custo de inicialização, FK composta de isolamento, cobertura objetiva por página e regras de coexistência/rollback de gerações. Revisão é documental e não aceita implementação inexistente. Inventário exaustivo dos leitores permanece tarefa obrigatória de P5.


## Execução local em 10/11/2026

- Benchmark real: 20/20 conversões concluídas em amostra de cinco páginas (Tabela Periódica p.1, pH e pOH p.2, Química-3 p.11, Orgânica p.3 e Atkins p.25), quatro combinações de fórmulas e escala por página. Artefatos locais restritos em `/tmp/mm-knowledge-pilot-20261109/`; saída de resumo em `results.json`. Dados apenas locais, não são garantia de persistência após limpeza do sistema.
- Comparação visual pontual: tabela de Química-3 preservou as três linhas e valores; pH manuscrito perdeu o sinal do expoente de Ka e corrompeu a fórmula do pH nas quatro combinações; Orgânica produziu fragmentos e imagens, exigindo indexação visual e revisão; Atkins recuperou parágrafos, mas manteve erros de OCR. Na página do Atkins, fórmulas ativas levaram 107,7 s (escala 3,0) e 106,0 s (1,5); desligadas, 23,3 s e 22,9 s, respectivamente, mas retornaram marcadores de fórmula não decodificada. Não mudar default por esta amostra. Primeira medição teve inicialização a frio, então tempos não são estimativa do livro inteiro.
- As duas migrations foram aplicadas, em ordem, em PostgreSQL 17 temporário isolado com esquema mínimo sintético. Verificaram-se restrição de unicidade de chunks legados e rejeição por FK de professor incorreto. Não equivale a executar todas as migrations versionadas nem um teste de RLS por role.
- QA independente: testes focais backend e parser passaram; schema validado; RAG de descoberta filtra geração ativa e modelo. A prova sintética de fronteiras conserva ordem/heading, mas não prova reconstrução semântica real de parágrafos/tabelas divididos; fronteiras ambíguas são bloqueadas. Pode haver falso positivo com duas tabelas independentes consecutivas.
- Ainda requer piloto completo com checkpoints e retomada sobre cópia do Atkins, banco/Storage isolados, testes de RLS por role e verificação ponta a ponta do chat/visual. Nenhuma alteração foi aplicada em produção. A flag permanece desativada por padrão.

## Retomada da validação em 10/11/2026

- Parser: 46 testes passaram, incluindo timeout, desconexão e job compartilhado; após correção do hash do perfil, 10 testes focais adicionais passaram. Backend: 26 testes focais passaram; typecheck e Prisma validate passaram. A reexecução após correção de configuração fez 10 testes adicionais passarem.
- Três migrations novas aplicadas em ordem num PostgreSQL 17 com esquema mínimo sintético; unicidade legada e FK de tenant verificadas. O histórico completo em banco vazio falhou em migration anterior `20260817194200_add_question_topic_links`: tabela `questions` inexistente. Sem alteração em produção.
- PostgreSQL local com schema Prisma atual: duas solicitações concorrentes geraram uma run, 36 lotes (351–354 último), e um lease. Roles: authenticated sem acesso aos registros de ledger e service_role com BYPASSRLS, após habilitar RLS e grants no ambiente isolado.
- Parser real + PostgreSQL real + armazenamento em disco simulado: processo A converteu um lote; processo B retomou somente o segundo; publicação gerou dois chunks com embeddings simulados; execução explícita nova reaproveitou dois checkpoints com zero chamadas ao parser e publicou outra geração. Outro teste de busca SQL retornou 2 chunks com embedding simulado; isso não é validação do chat nem do Storage remoto.
- Piloto isolado de duas páginas do Atkins: primeiro lote concluiu; a segunda página ultrapassou 600 s e watchdog encerrou o subprocesso. Cliente antigo apresentou timeout implícito aos 300 s, posteriormente corrigido; teste automatizado cobre configuração do dispatcher e deadline explícito. Artefatos desse teste específico eram simulados em memória.
- Proveniência de imagens, continuidade semântica em páginas reais e qualidade de fórmulas não estão completamente resolvidas. A feature deve permanecer desativada até homologação com Storage real de teste e revisão destes critérios.

## Fechamento da revisão local

- Última execução: 46 testes do parser e 27 testes focais do backend passaram; `npm run typecheck` e `npx prisma validate` passaram. QA independente confirmou tratamento de tenant, hash, versão do manifest e concorrência; revisão não equivale a homologação integral.
- Três migrations do recurso aplicadas em sequência em PostgreSQL 17 com esquema mínimo sintético. Histórico inteiro em banco vazio continua bloqueado pela migration anterior `20260817194200_add_question_topic_links`, que referencia tabela `questions` ausente. Não foram executadas migrations em produção.
- Processos separados com parser real, PostgreSQL isolado e adaptador de Storage em disco: interrupção após lote 1; retomada executou somente lote 2; publicação com embeddings simulados; nova execução reutilizou dois checkpoints com zero chamadas ao parser e publicou uma segunda geração; rollback real voltou à primeira. Busca SQL em outro teste encontrou os dois chunks. Storage/Supabase e geração de embeddings reais não foram exercitados ponta a ponta neste piloto.
- Benchmark: ver `benchmark.md`. Página manuscrita perdeu sinal do expoente em todas as condições; uma página do Atkins ultrapassou 600 s e foi interrompida pelo watchdog. Mecanismo está disponível sob flag desativada, não é garantia de que o livro completo ou OCR científico estejam prontos para produção.
- Mantêm-se abertas: validação de continuidade semântica real de parágrafo/tabela em fronteiras, piloto completo de 354 páginas com Storage de homologação e perguntas reais pelo chat/RAG. Nas fronteiras ambíguas, bloqueio conservador pode exigir revisão e pode gerar falsos positivos.
