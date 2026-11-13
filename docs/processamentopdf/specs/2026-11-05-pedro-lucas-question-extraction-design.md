# Proposta: extração estruturada de documentos QUESTIONS

## Objetivo e escopo

Ao receber um PDF com tag `QUESTIONS`, extrair todo o conteúdo recuperável com texto nativo e OCR adaptativo quando necessário; criar e salvar chunks e embeddings para o documento inteiro; depois enviar o conteúdo completo à LLM, que devolve um array estruturado com uma questão por objeto. Esta etapa não monta uma cadeia de agentes de alternativas, resposta e explicação. As questões são propostas para revisão do professor.

## Situação atual

O worker já executa extração, chunking e geração de embeddings antes da operação de extração de questões. Porém o chunking legado depende de blocos estruturais e suas regras de elegibilidade: não há garantia demonstrada de que todo o texto extraído se tornou chunks. A extração prioriza candidatas montadas pelo backend a partir de blocos `QUESTION`; o fallback LLM recebe somente determinados blocos `THEORY`/`EXAMPLE`. No Pedro Lucas, a auditoria determinística encontrou 5 candidatas para 10 questões. Uma contagem de blocos não comprova conteúdo correto ou persistência.

## Representação enviada à LLM

O pedido do usuário é enviar todos os embeddings do documento à LLM. Há uma distinção técnica necessária: embeddings são listas de números para busca semântica e não permitem recuperar de forma confiável as palavras, fórmulas e alternativas originais. Enviar somente vetores numéricos impediria validar a extração fiel. Portanto, a proposta executável é enviar **o texto correspondente a todos os chunks**, com IDs e páginas, e manter os embeddings persistidos para recuperação. Essa interpretação substitui o envio literal dos vetores e deve permanecer explícita no plano.

## Fluxo proposto

1. Receber PDF `QUESTIONS`, preservar arquivo e extrair texto por página; aplicar OCR conforme classificação do parser e registrar avisos/páginas sem conteúdo.
2. Criar chunks que cubram integralmente o texto recuperado, incluindo instruções, enunciados, fórmulas e gabarito; registrar offsets/páginas e medir cobertura após normalização documentada. Nenhuma classificação prévia de `QUESTION` decide o que é enviado à LLM.
3. Persistir chunks com a associação ao documento/tag e gerar e persistir embeddings. Falhas de OCR, cobertura ou embeddings devem ficar visíveis e recuperáveis; não declarar sucesso integral enquanto persistirem.
4. Carregar todos os chunks do documento em ordem e enviar seus textos e proveniência ao modelo compatível com saída estruturada. Usar uma única chamada com todo o conteúdo em um corpo; se o limite do modelo for excedido, registrar erro explícito e recuperável, sem subdivisão nem truncamento silencioso.
5. Enviar imagens relevantes do PDF ao mesmo modelo multimodal quando necessárias para enunciados ou alternativas, com página e vínculo de origem. Se a imagem não estiver disponível ou legível, marcar os campos incertos para revisão. A confiabilidade do vínculo e a leitura real devem ser verificadas; o fluxo atual ainda não garante isso.
6. Validar esquema, referências e completude; registrar candidatas para revisão, com campos ausentes e falhas explícitos. O modelo não deve inventar dados ausentes. O resultado final não depende da classificação determinística prévia dos blocos.

## Contrato proposto

Resposta estruturada `{ "questions": [...] }`. Cada objeto contém `number` (string ou null), `statement` (string), `alternatives` (array de objetos `{label,text}`), `correctAnswer` (A–E ou null), `institution` (banca, string ou null), `year` (inteiro ou null), `sourceChunkIds`, `sourcePages` e evidência visual quando houver. A validação preserva o formato e a quantidade de alternativas da fonte; candidatas incompletas ficam com motivo registrado, sem inventar dados. Banca, ano e gabarito só são preenchidos quando sustentados pelo texto. A exigência de cinco alternativas aplica-se ao Pedro Lucas; documentos discursivos ou com quantidade diferente preservam sua estrutura original.

## Critérios de aceite

- AC-001: PDF nativo ou escaneado percorre extração adaptativa, chunks e embeddings para todo conteúdo extraído, com cobertura mensurável e falha explícita se houver lacuna.
- AC-002: A extração estruturada recebe todos os textos dos chunks em ordem e independe do tipo de bloco; PDFs que excedam o limite falham explicitamente sem subdivisão.
- AC-003: O Simulado Pedro Lucas produz 10 objetos distintos, cada um com enunciado completo e cinco alternativas da fonte, inclusive a continuidade da questão 08; sem mistura de questões.
- AC-004: Imagens do enunciado e das alternativas são vinculadas com proveniência; ausência/incerteza resulta em pendência de revisão. Banca e ano são opcionais e só saem quando presentes.
- AC-005: Salvar as questões propostas para revisão com proveniência e sem executar os agentes de complementação atuais neste fluxo.
- AC-006: A suíte cobre PDF nativo, escaneado, documento longo, falhas e limites, questões visuais e formatos anteriormente reconhecidos; distingue testes simulados de chamadas reais.

## Limites

Nenhuma garantia de OCR perfeito: cobertura dos chunks mede o texto reconhecido, não caracteres que o OCR não leu. A verificação real do modelo multimodal requer execução separada e análise do resultado; o teste com cliente simulado verifica contrato e fluxo. Esta entrega é desenho e plano; não altera código nem reprocessa banco.
