# Qualidade do processamento de bases de conhecimento e questões

## Intenção

Um PDF com dez questões gerou apenas quatro questões salvas. O primeiro diagnóstico em `test/docsTeste/razao-proporcao-e-regra-de-tres.pdf` mostrou que `R$ 38,00` e `R$ 1.400,00` foram separados em blocos `QUESTION` iniciados por `00.`. Os chunks preservaram exatamente o texto dos blocos que receberam; a perda ocorreu antes, na montagem dos blocos. Ainda falta o PDF que produziu o resultado 4/10 para localizar as seis perdas reais.

O processamento deve extrair texto de PDFs digitais e escaneados, preservar a unidade de cada questão, gerar chunks citáveis para conhecimento e produzir um relatório por etapa que explique perdas e recusas. O worker continua responsável por fila, embeddings, persistência e revisão.

## Estado atual

- `KNOWLEDGE_BASE` em modo `docling`/`auto` envia PDF para `/chunk`, usa Docling, `HybridChunker` e tokenizer Qwen fixado em 500 tokens. O serviço só habilita OCR quando `DOCUMENT_PARSER_ENABLE_OCR=true`, porém o conversor de `/chunk` é criado antes da classificação de texto e aplica a opção de OCR ao documento inteiro.
- `QUESTIONS` usa PDF.js para extrair páginas, normalização, `assembleStructuralBlocks`, `ChunkService` e extração determinística/LLM. O layout Docling V3 pode ser persistido em paralelo, mas não fornece o texto para essa sequência. PDF escaneado pode terminar em `NEEDS_OCR` sem produzir questões.
- O construtor padrão de `/v1/parse` ignorava `DOCUMENT_PARSER_ENABLE_OCR`; o teste de configuração e a correção nesta entrega fazem o endpoint respeitar o valor da variável. O worker de `QUESTIONS` ainda precisa consumir o resultado Docling conforme a sequência abaixo.
- `splitBlockContent` preserva um bloco `QUESTION` inteiro; o chunker não corrige blocos abertos ou fechados na posição errada. O fallback LLM agrupa três chunks sem sobreposição entre grupos. Há cortes silenciosos de contexto em 200.000 e 18.000 caracteres.
- Os testes de upload com Docling/OCR e tokenizer de produção cobrem `/chunk` com PDFs de uma página; eles não demonstram recuperação de dez questões nem persistência final.

## Abordagens

1. **Ajustar apenas regex e limites do pipeline atual:** entrega rápida para alguns PDFs digitais, mas mantém OCR e layout separados da fonte efetiva de `QUESTIONS`.
2. **Usar Docling como fonte de páginas e layout para ambos os tipos, com montadores diferentes:** reaproveita OCR e proveniência; `KNOWLEDGE_BASE` continua com `HybridChunker`, enquanto `QUESTIONS` usa fronteiras pedagógicas. **Escolha proposta para implementação**, porque permite resolver o corte observado sem impor chunks de recuperação às questões.
3. **Usar `/chunk` também para questões:** reaproveita o endpoint atual, mas a divisão por tokens pode separar enunciado e alternativas e não oferece identidade estável por questão.

## Contrato de OCR

- O serviço analisa a camada de texto por página antes de converter. Em páginas com texto nativo suficiente, preserva esse texto; nas páginas sem texto suficiente, ativa OCR. Documento `MIXED` não deve perder as páginas com texto nem deixar páginas escaneadas vazias.
- `DOCUMENT_PARSER_ENABLE_OCR=true` é o recurso habilitador do serviço, não a ordem para fazer OCR em todas as páginas. O startup registra o valor efetivo e verifica que pesos RapidOCR necessários já estão na imagem. Se OCR for necessário e estiver indisponível, retorna código explícito e mantém o documento em estado que permita retry/revisão.
- `/v1/parse` e `/chunk` devem usar a mesma classificação e registrar `page_count`, `pages_with_native_text`, `pages_ocr_attempted`, `pages_ocr_succeeded`, duração e texto extraído por página, sem imprimir conteúdo do PDF.
- O worker deve consumir texto/layout Docling para `QUESTIONS` quando OCR for necessário. Até essa integração existir, configurar OCR no serviço Python não significa que `QUESTIONS` esteja coberto.

## Contrato de questões

- Uma unidade de extração representa uma questão, com número, intervalo de páginas, enunciado, alternativas e referências aos elementos de origem. Ela pode atravessar páginas e conter mais de 500 tokens. O limite de token de embedding não define sua fronteira.
- Um início de questão exige marcador numérico válido em posição estrutural. Fragmentos monetários como `R$ 38,00`, `R$ 1.400,00` e `R$ 30.000,00`, decimais, paginação e números de fórmulas não iniciam questão. O scanner não aceita `00.` como número de questão.
- O montador fecha a questão apenas quando encontra o próximo início confirmado, um cabeçalho de seção/gabarito/solução confirmado ou o fim do documento. Alternativas próximas e continuação na página seguinte pertencem à mesma unidade. Texto incerto é retido com motivo; não deve desaparecer silenciosamente.
- A extração determinística recebe a unidade completa. O fallback LLM recebe uma unidade ou janela com sobreposição e identificador da questão; um limite excedido gera evento `INPUT_LIMIT_EXCEEDED` e revisão/reprocessamento, nunca `slice` silencioso. A resposta deve indicar quais elementos e páginas a sustentam.
- Antes de salvar, comparar enunciado e alternativas com a fonte. Uma candidata parcial fica em revisão com `MISSING_SOURCE_CONTEXT`, `MISSING_ALTERNATIVE` ou motivo específico. Agentes de conclusão não inventam texto ausente do PDF para mascarar corte.

## Contrato de conhecimento

- `/chunk` devolve texto contextualizado, texto bruto, páginas e proveniência com contagem Qwen <= 500 tokens. Não aceita lista vazia como sucesso. Registrar cobertura de páginas e chunks sem proveniência; páginas sem texto por falha de OCR ficam explícitas.
- A qualidade é medida por perguntas de referência: o trecho correto deve aparecer nos resultados de recuperação e apontar para a página correta. Quantidade de chunks e cumprimento do limite são métricas técnicas, não substituem esse teste.

## Medição e aceite

Os dois testes de parser aceitam o mesmo PDF como entrada, usam as funções reais e gravam artefatos JSON locais sem acessar banco ou IA. O teste de `QUESTIONS` mostra texto por página, bloco, chunk, unidade/candidata determinística, motivo de descarte e comparação com uma lista opcional de números esperados. O teste de `KNOWLEDGE_BASE` chama `/chunk`, valida hash, páginas, limite de tokens e OCR observado; produz resumo por página e chunk. Ambos falham com saída não zero quando uma asserção solicitada pelo operador não é atendida.

### Baseline medido nesta entrega

O corpus agora inclui `tests/document-parser/ocrTeste.pdf` e `questionsQuimica.pdf`. O primeiro foi enviado ao `/chunk` com OCR ligado: classificação `SCANNED`, RapidOCR acionado, três chunks cobrindo as quatro páginas e recuperação de `pH` e `pOH`, ainda com ruído em fórmulas. No segundo, a correção do marcador `QUESTÃO` com número marginal produziu dez blocos e dez chunks integrais. O parser tratava frases iniciadas por “solução” como cabeçalho de resolução; em seguida, detectava falsos marcadores `C.` e os passos `1)`/`2)` como alternativas. Após restringir os cabeçalhos e exigir pelo menos duas alternativas, o caminho PDF.js gera dez candidatas reais, sem questões falsas da capa e sem rodapés nos enunciados. A promoção deixa nove prontas para completion e mantém a questão 01 em revisão visual porque depende da tabela periódica da página 15. A tabela interna da questão 09 é aceita, pois cabeçalho e três linhas de dados vieram no texto do chunk. `/v1/parse` com Docling ainda conclui sem abrir questões, porque os rótulos `QUESTÃO 08` sem pontuação não são reconhecidos. O teste mede a promoção mas para antes de IA e banco, então não confirma dez registros finais. Os testes e relatórios reproduzem esses limites em `tests/document-parser`.

As páginas 18–19 de `razao-proporcao-e-regra-de-tres.pdf` foram isoladas em um PDF digital de duas páginas e rasterizadas para outro PDF escaneado. Após corrigir a fronteira monetária, o teste digital encontra 11 blocos de questão com chunks completos, cobrindo os números 1–10; há dois itens distintos numerados 10 no material. O parser determinístico gera nove candidatas; os blocos 2 e 6 ficam sem candidata e devem ser investigados na próxima etapa. No escaneado, `/v1/parse` com RapidOCR conclui, mas a montagem encontra apenas os números 1–8: o OCR omite os marcadores 9 e 10 e seus textos são agregados ao bloco 8. Esse teste falha intencionalmente quando `--expect-numbers=1,2,3,4,5,6,7,8,9,10` é aplicado.

No mesmo PDF escaneado, o teste de conhecimento retorna três chunks, páginas 1 e 2 cobertas e contagem máxima de 478 tokens com o tokenizer Qwen fixado. Isso confirma conversão e chunking, mas não valida a separação pedagógica das questões.

Comandos dos dois parsers:

```bash
cd backend
npm run test:questions-parser -- /caminho/questoes.pdf /tmp/questoes.audit.json --source=auto --parser-url=http://127.0.0.1:8080 --expect-numbers=1,2,3,4,5,6,7,8,9,10

cd ../services/document-parser
python scripts/test_knowledge_parser.py /caminho/questoes.pdf --output /tmp/conhecimento.audit.json --expect-pages 2
```

O segundo comando requer o ambiente Python do parser com modelos carregados; o primeiro usa o parser HTTP apenas quando há página sem texto nativo suficiente ou `--source=docling` é solicitado. `DOCUMENT_PARSER_ENABLE_OCR=true` deve estar no processo HTTP.

Critérios para o PDF relatado como 10/4, depois que ele for disponibilizado:

1. As dez questões esperadas aparecem como dez unidades distintas com enunciado e alternativas preservados, ou cada exceção tem motivo e trecho de origem identificáveis.
2. Nenhum `00.` derivado de valor monetário vira questão; nenhuma questão é dividida por página, chunk ou limite de caracteres.
3. PDF digital e PDF escaneado de mesmo conteúdo produzem as mesmas questões identificáveis; diferenças de OCR ficam listadas por página.
4. O número de questões detectadas, candidatas, retidas e salvas fecha a conta; a diferença entre etapas é explicada por códigos de motivo.
5. Em conhecimento, os chunks cobrem páginas com texto, têm proveniência válida e não ultrapassam 500 tokens contextualizados.

## Sequência de implementação

1. Fixar corpus e expectativa por PDF: dez questões reais, digital, escaneado e misto. Os testes de parser registram o baseline antes de modificar a montagem.
2. Corrigir o falso início de questão em decimais/valores monetários com teste de regressão para `38,00`, `1.400,00` e continuação de página. Medir a contagem por etapa novamente.
3. Criar a unidade de questão com elementos/páginas de origem; substituir grupos fixos e cortes silenciosos na extração. Validar cobertura antes de conclusão e persistência.
4. Tornar OCR seletivo por página no parser, conectar seu texto ao fluxo `QUESTIONS` e preservar o contrato de `/chunk` para `KNOWLEDGE_BASE`.
5. Rodar os dois testes com os mesmos PDFs antes do rollout, comparar logs e resultados, e só então habilitar o novo caminho de questões em produção por configuração reversível.

## Riscos e limites

- `analyze_pdf_text_layer` hoje classifica o documento por proporção de páginas; OCR seletivo por página exige registrar a decisão de cada página e verificar como Docling trata páginas mistas.
- PDFs com colunas, figuras, fórmulas e gabaritos fora de ordem precisam de amostras próprias. Um número esperado sem gabarito manual não mede fidelidade do enunciado.
- O PDF que gerou 4/10 ainda não está identificado no workspace; não declarar recuperação 10/10 antes de executá-lo.
