# Design: questão salva com fórmula e evidência visual completas

## Intenção

Garantir que uma questão extraída de PDF possa ser salva para revisão docente com a notação matemática/química preservada, a evidência visual correta vinculada à questão e uma apresentação legível na interface. A validação alvo usa `Quimica-3.pdf`: Q04 para equação e notação inline; Q01 para figura/tabela vinculada ao enunciado.

## Diagnóstico observado

- Em Q04, Docling 2.122.0 com formula enrichment produz corretamente a reação em LaTeX, mas a constante inline `4,0 x 10⁷ s⁻¹` entra como texto sem sobrescrito.
- Em Q01/Q08 do Simulado e Q05 de Quimica-3, `FormulaItem.orig` mantém a sequência original correta, enquanto `FormulaItem.text` contém interpretações incorretas (`PO₄/₂`, `O` lido como `0`, `1/2` interpretado como `\lceil`). O chunker usa o texto serializado, descartando o campo original.
- O exportador inclui imagens que o Docling classifica como `picture` ou `figure` e também rasteriza páginas de PDFs SCANNED/MIXED para os demais fluxos OCR/conhecimento. Fórmulas são itens textuais, não assets visuais do parser; a única imagem extraída da página da Q04 era o rótulo “QUESTÃO 04”.
- O extrator aceita `visualEvidence` do modelo para persistir relações. O fluxo QUESTIONS precisa distinguir `FIGURE` detectada pelo Docling de `PAGE` gerada como fallback e só enviar/salvar a primeira, se realmente associada à questão.
- A tela de revisão exibe o enunciado em `<p>` como texto bruto. KaTeX já é usado em outra superfície do frontend, mas a revisão do professor não renderiza os delimitadores LaTeX.

## Critérios de aceite propostos

- AC-001: O conteúdo enviado à extração estruturada retém a saída LaTeX e o texto original do Docling para cada FormulaItem, sem substituir silenciosamente uma evidência pela outra; também fornece evidência geométrica para sobrescritos/subscritos que o Docling serializa como texto linear (por exemplo, `10⁷` e `s⁻¹`).
- AC-002: No fluxo QUESTIONS, somente imagens reconhecidas pelo Docling como figuras (`picture`/`figure`) são enviadas e salvas; imagens PAGE rasterizadas para OCR/conhecimento continuam disponíveis no documento, mas não são anexadas à questão. Não são criados recortes artificiais de página, questão ou fórmula. Sem figura detectada, a questão usa texto sem imagem.
- AC-003: A chamada estruturada única envia todo o texto, evidências matemáticas e apenas FIGURE do mesmo documento; a resposta preserva fórmulas com base no texto e na geometria dos glifos, associa figuras pela evidência/proveniência e usa um ponto de ancoragem textual validado para mantê-las na posição correspondente dentro do enunciado/alternativa.
- AC-004: O backend salva a questão em estado de revisão com texto, fontes e relações visuais corretos. A validação usa apenas Postgres/Storage locais de `dbtemp`; `.env` Supabase remoto não é usado para escrita.
- AC-005: A revisão docente renderiza LaTeX (incluindo índices e expoentes) e mostra a figura original vinculada no ponto ancorado do enunciado/alternativa, com texto alternativo e proveniência da página. Página, ordem de leitura e bbox do Docling são preservados; se a âncora textual não puder ser validada, a imagem fica no fim do texto com a proveniência explícita. Questões sem figura detectada aparecem apenas com seu texto estruturado.
- AC-006: O QA reproduz Q04 e Q05 de Quimica-3 e Q01 referindo-se à tabela periódica FIGURE do apêndice na página impressa 15; confirma a proveniência da página 15, conteúdo salvo no banco local e apresentação da figura junto ao trecho que a referencia na interface local. Q04 não recebe o selo decorativo da questão como figura. O critério não exige gerar gabarito; respostas permanecem para revisão docente.

## Limites

- Nenhuma escrita no Supabase remoto ou produção.
- Não inferir símbolos, valores ou gabarito ausentes da imagem.
- Uma resposta estruturada válida ou contagem correta de questões, isoladamente, não aprova fidelidade matemática nem apresentação visual.
- Enrichment Docling permanece habilitado.

## Abordagens consideradas

1. **Normalização só textual:** manter a fórmula enriquecida e corrigir LaTeX com regras. Custo menor, mas regras não resolvem com segurança `1/2` vs. glifo confundido e não recuperam imagem para a interface.
2. **Evidência textual e figuras detectadas (escolhida pelo usuário):** guardar lado a lado a fórmula serializada e `orig`; enviar na mesma chamada estruturada somente as figuras que o Docling identificou e vinculou à questão; persistir a relação da figura e renderizar LaTeX/figura na revisão. Assets PAGE continuam em nível de documento para OCR/conhecimento e ficam fora da relação da questão.
3. **Recortar páginas ou fórmulas para QUESTIONS:** forneceria contexto visual extra, mas criaria/anexaria imagem mesmo quando o Docling não identificou uma figura. Fica fora do escopo solicitado.

## Decisões propostas

- Incluir somente figuras `picture`/`figure` retornadas pelo Docling no contexto/associação de QUESTIONS; ligá-las aos chunks/questões pela proveniência e enviar/salvar apenas quando a relação com aquela questão for sustentada. Preservar `pageNumber`, `readingOrder`, `bbox` e ancorar a figura em um trecho literal validado do texto extraído.
- Manter assets PAGE de fallback para fluxos gerais SCANNED/MIXED, sem enviá-los nem associá-los como imagem de questão.
- Não criar screenshot adicional, crop de questão nem crop de FormulaItem.
- Preservar tanto a fórmula reconhecida quanto a original para que a LLM possa compará-las com as figuras realmente detectadas.
- Gerar teste real do parser e modelo, persistir apenas no Supabase local isolado em `dbtemp` e validar a tela de revisão local; sem credencial de produção para qualquer escrita.
- Delegar implementação ao agente `implementador` e revisão independente ao `revisor_qa`, conforme o fluxo do repositório.
