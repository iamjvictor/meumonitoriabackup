# Plano de QA independente — fila Docling

## Escopo

Validar comportamento da fila e do cliente HTTP v2 com testes locais determinísticos, sem iniciar Docling real, chamar OpenRouter/Supabase, reprocessar documentos ou incorrer em custos externos. O teste de conversão real do IFF (AC-006/AC-007) fica fora desta execução e deve ser realizado pelo arquiteto em ambiente autorizado depois dos testes locais.

## Critérios e cenários

| Critério | Cenário independente | Nível / evidência esperada |
| --- | --- | --- |
| AC-001 | Duas requisições concorrentes com capacidade 1: a segunda permanece aguardando e não entra na conversão até liberação da primeira; ambas concluem em ordem compatível com a fila. | Unit/in-process com conversor controlado por deferred promises; contagem máxima de conversões ativas = 1 e ordem registrada. |
| AC-002 | Um trabalho simulado dura mais que 300 s e que 600 s no relógio lógico sem esperar em tempo real; o cliente permanece conectado até receber integralmente o ZIP. | Unit no cliente + fake timers/relógio controlado; avanço de tempo virtual e asserts de estado/pacote. |
| AC-002 | Cancelamento explícito durante espera e durante resposta interrompe somente a requisição cancelada e não impede as demais de terminarem. | Unit/in-process; sinal de cancelamento e estados finais verificados. |
| AC-003 | Falha de conexão, timeout de transporte configurado, status HTTP de erro, content-type incorreto e ZIP inválido mantêm códigos/causas distintos. | Unit do cliente com fetch/Response controlados; asserts sobre classe, código e `cause` sem chamadas de rede. |
| AC-004 | Duas requisições com mesmo conteúdo e identificadores diferentes não causam conversões simultâneas redundantes; correlação e pacote retornado a cada chamador permanecem corretos. | Unit/in-process; contar conversões e validar `requestId` e hash no resultado. Cancelamento de uma chamada verifica isolamento da outra. |
| AC-004 | Bytes iguais com metadados que alteram a conversão (em particular, extensão do nome no endpoint `/v1/parse`) não compartilham resultado incompatível; os dois chamadores recebem resultado correspondente à própria entrada. | Teste HTTP local com parser stub que registra o filename recebido. Mesmo conteúdo com extensões distintas deve gerar operações isoladas ou ser rejeitado com erro de entrada claro. |
| AC-005 | Conteúdos diferentes respeitam capacidade configurada; liberação ocorre tanto no sucesso como em exceção; tamanhos de resposta próximos ao limite não corrompem pacote nem assets. | Unit/in-process da fila e regressão do contrato v2 existente. |
| AC-005 | Configuração da fila não altera limites ou comportamento das chamadas de IA. | Inspeção estática do diff/configuração e execução direcionada de testes unitários relacionados, sem chamadas externas. |
| AC-006 | Reprocessamento do IFF com chunks, embeddings, questões pendentes, sem duplicar revisadas e com evidências multimodais. | Fora do escopo local seguro desta rodada; exige execução controlada com dados e serviços autorizados. Registrar como não avaliado, não presumir aprovação. |
| AC-007 | Regressões locais e documentação de lacunas. | Comandos executados, resultados e matriz final neste relatório. Não inclui replay real do IFF. |

## Dados e isolamento

- Usar buffers PDF sintéticos e pacote ZIP v2 sintético com hashes conhecidos.
- Usar conversor stub e relógio/timers controlados; nenhum arquivo de professor é enviado.
- Não ler/gravar banco, storage, filas remotas, nem chamar parser ou LLM.
- Os testes QA devem ser adicionados em arquivo próprio, sem substituir ou enfraquecer testes existentes.

## Execução prevista

1. Executar os testes QA novos e o conjunto unitário existente do cliente `doc-chunker-v2`.
2. Executar testes direcionados de fila/concurrency do parser somente se forem locais e isolados.
3. Inspecionar diff de produção contra AC-001..AC-005, contratos v2, cancelamento, memória, logs e tratamento de erro.
4. Marcar AC-006 como pendente até reprocessamento real autorizado do IFF; relatar AC-007 parcial se esse teste não ocorrer.

## Critério de resultado

Um cenário passa somente com asserção de comportamento observável, sem depender de temporização real, mocks de implementação sem efeito verificável ou acesso externo. Falhas e comportamentos sem teste serão reportados com severidade, arquivo/linha e reprodução.
