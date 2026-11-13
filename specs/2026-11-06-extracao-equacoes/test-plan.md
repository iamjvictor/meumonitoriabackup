# Plano de testes QA — prompt de fórmulas

## Escopo

Validar a decisão vigente da `spec.md`: somente ajuste de prompt na extração estruturada, preservando uma chamada documental única, schema e fluxo preexistentes. A proposta anterior de ferramenta visual/function calling foi cancelada pelo usuário; referências a testes dessa proposta são histórico e não fazem parte do aceite atual.

Não usar banco, persistência de produção, migrations ou credenciais impressas. A chamada real autorizada deve carregar `backend/.env` com `dotenv.parse` antes de importar a configuração, usar uma única requisição ao DeepSeek com texto integral e uma raster local da página 4; registrar saída e uso sem segredo.

## Casos

| ID | Caso | Evidência esperada |
|---|---|---|
| QAT-01 | Prompt estruturado | Instrui preservar sinais, frações, unidades, expoentes e índices; usar imagem anexada como evidência; indicar ambiguidade sem inferir. Não menciona tool/function calling. |
| QAT-02 | Chamada única e limite | Todos chunks em ordem num único corpo/chamada; documento acima do limite falha antes de chamar LLM; truncamento não persiste saída parcial. |
| QAT-03 | Imagem | Fixture multimodal confirma que imagem vinculada ao chunk acompanha a chamada e mantém proveniência. Distinguir asset raster sintético da imagem/crop do parser real. |
| QAT-04 | Integridade local | Saída Q07 sem expoente explícito não pode ser corrigida por reconciliação textual; deve sinalizar revisão. Saída explícita apoiada por imagem não deve ser degradada. |
| QAT-05 | PDF Pedro Lucas real | Uma chamada real, texto completo + raster da página 4, comparar as dez questões, cinco alternativas e Q07 A contra `3 × 10¹⁷`. Schema/count isolados não contam como aceite. |
| QAT-06 | Isolamento | Sem acesso ao banco de produção ou mutação de documentos. Separar resultados mock/offline, parser local e OpenRouter real. |

## Procedimento

1. Revisar diff específico do serviço/prompt, schema, cliente e testes; procurar novas ferramentas/function calling.
2. Executar testes unitários direcionados com `ASAAS_WEBHOOK_URL=https://example.test/webhook` somente como valor dummy para satisfazer validação local de env.
3. Inspecionar o PDF original e renderizar localmente a página 4; usar texto PDF integral e raster em uma chamada autorizada.
4. Salvar resultado JSON privado/sanitizado e comparar conteúdo das dez questões, alternativas e notação de Q07. Se captura falhar, não declarar o critério real como aprovado.
5. Registrar comandos, evidências, limitações e achados em `validation.md`; encaminhar alterações necessárias no código de produção ao arquiteto.
