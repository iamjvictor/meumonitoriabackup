# Fila e espera de conversão Docling

Estado: em implementação. Objetivo: processar documentos em ordem de chegada dentro da capacidade configurada do parser, mantendo requisições em espera até haver vaga e concluindo a conversão sem prazo arbitrário local. A correção é global e não depende do PDF IFF. Preservar o contrato HTTP e a integridade de hashes, arquivos e imagens. Não modificar schema de Question.

- AC-001: requisições simultâneas aguardam a capacidade do parser; documento aguardando não começa conversão prematuramente. A fila não devolve erro apenas pelo tempo em espera.
- AC-002: conversão longa pode concluir mesmo após os limites anteriores de 300 e 600 segundos; backend permanece conectado e recebe o pacote completo. Cancelamento explícito e erros reais continuam observáveis.
- AC-003: preservar causa de erros de rede, timeout configurado e pacote inválido; não chamar erro genérico de rede de ZIP inválido.
- AC-004: tentativas concorrentes para mesmo conteúdo não multiplicam conversões ativas indevidamente; correlação e pacote por requisição permanecem válidos, inclusive cancelamento.
- AC-005: concorrência configurada, liberação em sucesso/falha e integridade das respostas funcionam com arquivos diferentes e no limite de memória; não inserir timeout local novo nas chamadas de IA.
- AC-006: reprocessar o documento IFF existente com chunks, embeddings, saída estruturada e questões pendentes de revisão, sem duplicar questões já revisadas; registrar evidências e pendências, inclusive gabaritos/imagens. Não reprocessar Quimica-3 nem Pedro Lucas.
- AC-007: QA independente executa regressão de fila, conversão longa simulada, erros de rede e contracts existentes, mais validação real IFF. Registrar limitações.

Observações: Docling demorou 660s de conversão e continuou após timeout do servidor de 600s. As chamadas do backend falharam em ~300s com exceção original oculta pelo wrapper; causa exata ainda requer reprodução. Fila deve manter logs de espera/conversão sem vazar documento ou segredos.
