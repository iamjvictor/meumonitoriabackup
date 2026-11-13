# Plano de testes e evidências

Estado: cenários especificados, não executados neste pacote de documentação.

| Cenário | AC | Nível e dados | Resultado esperado |
|---|---|---|---|
| T01 Upload real QUESTIONS | 001,014 | Integração local: API, fila, parser, embeddings reais, modelo real, banco e Storage isolados | Trace encadeia todas as etapas; leitura do banco coincide com saída consolidada; KNOWLEDGE_BASE não muda. |
| T02 Duas provas | 002,003 | Fixture sintética com mesma numeração, títulos e respostas diferentes | Associação correta por segmento; permutar páginas, títulos e ordem das tabelas sem regressão. |
| T03 Busca multimodal | 004,009 | Gabarito no início/meio/fim, só imagem, tabela em duas páginas, sem palavra gabarito; mais de 12 candidatos | Busca alcança evidência e informa cobertura; chamada recebe bytes da imagem quando necessários. |
| T04 Isolamento | 004 | Outro documento contém resposta semelhante; LLM pede ID externo | Ferramenta não acessa documento fora do estado autorizado. |
| T05 Evidência falsa/conflitante | 005,008 | Resposta mockada com foundInSource=true e trecho inventado, prova errada ou leitura visual ambígua | Não atribuir origem comprovada; reconsultar ou propor IA com alerta; guardar evidências e conflito. |
| T06 Fragmentos e duplicatas | 006 | URL, legenda, questão em duas páginas, mesmo número em duas provas | URL não ganha opções; união preserva contexto; questões de provas distintas permanecem separadas. |
| T07 Alternativas | 007 | I/II/III, verdadeiro/falso, A–H contaminadas por afirmações, opções incompletas e discursiva | Cinco opções; afirmações no enunciado; restauração da fonte distingue-se de geração; patch auditável. |
| T08 Versões | 003,007 | Alterar opções enquanto resultado antigo de gabarito retorna | Resposta antiga não é aplicada; novo gabarito usa versão final. |
| T09 Sem gabarito | 008,010 | Questão válida com contexto suficiente e outra com figura ausente | Proposta IA A–E; incerteza e perda de imagem explícitas; sem aprovação automática. |
| T10 Fórmulas e figuras | 009 | Quimica-3, Pedro Lucas e figuras em alternativas | Comparação visual PDF → saída → banco → interface; índices/expoentes, sinais, âncoras e figuras preservados; ilegível sinalizado. |
| T11 Falha/reinício | 011 | Interromper após chamada, após checkpoint e após gravação; replay | Sem duplicatas ou perda de edição humana; histórico de tentativas e retomada. |
| T12 Erros do provider | 010,012 | JSON inválido, indisponibilidade multimodal, recusa, truncamento, download falho | Rodada corretiva de schema; sem queda silenciosa para texto; encerramento com pendência/falha explícita, logs sem segredos. |
| T13 Corpus real | 013 | IFF, Pedro Lucas, Quimica-3 com modelo/config versionados | Critérios da spec; no IFF 40 candidatos únicos e gabarito correto associado; conferir conteúdo das opções além da letra. |
| T14 Documento longo | 002,004,011,012 | Documento com múltiplos segmentos e gabarito fora do lote | Cobertura auditável, retomada por lote, busca global e métricas de contexto repetido. |

## Execução e relatório

Fixtures e executores ficam em tests/document-parser; resultados devem registrar hash, versões, configuração sanitizada, etapas reais/mockadas, páginas/questões cobertas, tempo, tokens, custo quando conhecido e limites. Utilizar backend/.env sem imprimir segredos; impedir substituição acidental pela chave herdada. Custos de tentativas falhas com uso desconhecido não são contabilizados como zero.

Não aceitar teste que preencha manualmente página/nome do gabarito no prompt. A transcrição manual do gabarito de referência pertence somente ao avaliador e não deve ser injetada no prompt. O PDF original permanece integral: seus próprios gabaritos devem estar disponíveis à busca do agente, que precisa localizá-los e associá-los sem receber a resposta do avaliador. Uma execução real aprovada não prova generalização universal: repetir T13 três vezes para medir variabilidade e registrar todas as execuções, sem selecionar apenas a melhor. Falhas do provedor são separadas de erros de conteúdo e mantidas no relatório.

Comandos serão registrados pelo QA após definição dos arquivos de teste; não há comando de suíte futura declarado como existente. Aceite ponta a ponta exige screenshot da revisão e consultas ao banco isolado, além do JSON.
