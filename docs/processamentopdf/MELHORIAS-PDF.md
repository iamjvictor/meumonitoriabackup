# Melhorias pendentes no processamento de PDFs

**Revisado em:** 29/10/2026. Este registro organiza problemas medidos e correções propostas para implementação posterior. O resultado local não comprova implantação nem qualidade em produção.

## Estado medido

No `questionsQuimica.pdf`, o fluxo textual de `QUESTIONS` com PDF.js identificou 10/10 blocos e 10/10 candidatas, com cobertura exata do texto dos blocos pelos chunks de questão. Nove candidatas ficaram `READY_FOR_COMPLETION`; a questão 01 ficou `VISUAL_PENDING`. O Docling v2 devolveu 13 chunks e 20 imagens, incluindo a tabela periódica da página 15. O dry run percorreu as dez candidatas, mas 19 chamadas ao OpenRouter receberam HTTP 401; nenhuma foi concluída pela IA e não houve persistência. Portanto, a comparação com as quatro questões antes observadas em produção ainda não mede questões finais salvas no mesmo ambiente.

## Problemas e correções

| Prioridade | Problema observado | Correção proposta | Como verificar |
| --- | --- | --- | --- |
| 1 | OpenRouter respondeu HTTP 401 no dry run. Sem IA válida, as questões discursivas não recebem alternativas, gabarito e explicação. | Configurar credencial válida no ambiente isolado de teste; validar autenticação antes de iniciar o lote e repetir a conclusão das dez candidatas. | Registrar por questão geração de campos, falhas dos agentes, validação do schema, revisão humana e número final persistido. Não contar candidatas percorridas como questões concluídas. |
| 1 | Erros de rede e autenticação podem aparecer como `INVALID_SCHEMA` porque `normalizeFailure` usa esse código para exceções não estruturadas. | Classificar autenticação, rede, timeout, resposta do provedor e schema separadamente; registrar código HTTP e causa sem expor credenciais nem conteúdo sensível. | Testes com 401, falha de conexão, timeout e resposta inválida devem produzir códigos distintos. |
| 1 | A questão 01 pede a tabela da página 15, mas seus chunks estão na página 3. O vinculador só procura assets nas páginas do enunciado e deixa uma imagem da página 3 como `PAGE_CANDIDATE`. | Extrair referências a anexos e páginas do documento, resolver a tabela específica pelo título/tipo/proveniência e registrar o motivo do vínculo. Referência apenas por página deve continuar em revisão quando houver ambiguidade. | Com o PDF real, vincular `#/pictures/16` da página 15 à questão 01; não vincular `#/pictures/4` da página 3 por engano. Testar documento com duas figuras e referência ambígua. |
| 1 | A promoção marca `VISUAL_PENDING` antes do vínculo e usa `requiresMissingFigure(..., false)`. Atualizar `visualStatus` depois não reavalia a candidata. | Após vínculo confirmado, reexecutar a validação de evidência e promover a candidata com transição idempotente; só concluir com IA quando a imagem correta estiver disponível. Manter revisão se o vínculo for ambíguo ou o recorte faltar. | Teste de transição `VISUAL_PENDING` → `READY_FOR_COMPLETION`, com imagem correta enviada ao modelo uma vez; falha de imagem permanece pendente. |
| 2 | Notação química perde subscritos e separa símbolos, como `C l` e índices deslocados na questão 01 e `CO₂`/`H₃PO₄` na questão 08. | Preservar a região original da fórmula como evidência visual ou serialização estruturada, usando coordenadas do layout; normalizar apenas casos com confiança alta e evitar que IA reconstrua fórmula sem fonte. | Corpus anotado de fórmulas: comparar transcrição e imagem com o PDF, medir símbolos, índices, carga e equações completos por questão. |
| 2 | Chunks Docling v2 de recuperação misturam páginas/questões e a tabela periódica gera texto ruidoso e um chunk muito curto. | Manter a delimitação de questões pelo fluxo estrutural; filtrar/rotular chunks tabulares ruidosos para recuperação, preservar imagem e proveniência da tabela e auditar chunks curtos. | Medir cobertura de 10/10 questões, ausência de mistura entre questões na entrada dos agentes e recuperação correta da tabela sem texto espúrio. |
| 2 | Não foi medido quantas questões do PDF chegam ao banco nem se o chat compreende a imagem vinculada. | Executar ingestão em banco/storage isolados com flags visuais, credencial válida e observabilidade por etapa; comparar resposta textual e multimodal com rubrica humana. | Contagens separadas de blocos, candidatas, promovidas, salvas, imagens vinculadas/enviadas e respostas aprovadas. Repetir o corpus antes de canário. |

## Ordem sugerida para retomar

1. Corrigir a autenticação do ambiente de teste e a classificação de erros; repetir o dry run para obter uma medição real da conclusão.
2. Implementar associação visual entre páginas e reavaliação de `VISUAL_PENDING`; testar com a tabela da questão 01 e distratores.
3. Corrigir a preservação de fórmulas e a qualidade dos chunks de recuperação usando corpus anotado.
4. Rodar ingestão completa em ambiente isolado e medir questões salvas e compreensão visual antes de qualquer canário.

## Evidências e especificações

- [Auditoria do PDF de química](../../tests/document-parser/results/questionsQuimica.quality-audit-2026-10-27.md)
- [Testes e fixtures do parser](../../tests/document-parser/README.md)
- [Qualidade do parser e questões](specs/2026-10-26-document-parser-quality-design.md)
- [Imagens de PDF e chat](specs/2026-10-27-chat-multimodal-document-images-design.md)
- [Avaliação visual](specs/2026-10-27-avaliacao-qualidade-imagens-questoes-design.md)
