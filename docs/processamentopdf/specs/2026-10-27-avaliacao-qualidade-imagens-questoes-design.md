# Avaliação da qualidade de imagens e perguntas contextuais

## Objetivo

Medir, depois de implementar o fluxo descrito na [spec de imagens em PDFs e no chat](./2026-10-27-chat-multimodal-document-images-design.md), se a imagem correta foi extraída, associada, recuperada e efetivamente enviada à IA, e se a resposta demonstra compreensão da dúvida do aluno e da figura. Esta é a segunda spec da entrega; nenhuma meta abaixo é um resultado já medido.

## Pré-requisitos e ordem

1. Implementar parser visual, armazenamento privado, vínculos chunk–asset e questão–asset, descrição/indexação, upload do aluno e mensagem multimodal conforme a spec de implementação.
2. Concluir os testes unitários, de contrato e de autorização junto de cada componente implementado.
3. Executar o corpus de avaliação ponta a ponta e revisão humana descritos aqui. Só então decidir o canário e a ampliação em produção.

## Medição da qualidade da saída

### Corpus de referência

Criar `tests/document-parser/visual-quality/gold.jsonl` com casos revisados por pessoa, versionados com hashes dos arquivos. Iniciar com `questionsQuimica.pdf` (especialmente a questão 01 e a tabela periódica da página 15), `ocrTeste.pdf` para verificar OCR e negativos visuais, e novos PDFs/imagens controlados que cubram gráfico com eixos, tabela, fórmula desenhada, duas questões na mesma página, foto nítida, foto ilegível e pergunta sem imagem. O corpus precisa conter perguntas diretas e **pelo menos um follow-up por questão visual**. Registrar a resposta esperada e os fatos visuais indispensáveis; a alternativa correta sozinha não mede compreensão.

Para o primeiro canário, anotar ao menos **20 perguntas**: 10 que dependem da imagem, 5 follow-ups ou trocas de questão e 5 negativas/distratoras. Manter as categorias identificadas no relatório para não esconder uma falha de gráfico atrás de bons resultados em perguntas só textuais.

Cada caso especifica `caseId`, hash do PDF ou foto, `documentId`/`questionId` esperados quando aplicável, página e bbox do visual esperado, texto da pergunta, histórico, assets esperados, fatos visuais obrigatórios, resposta aceitável, afirmações proibidas e se é legítimo pedir imagem melhor. Manter casos que exigem o visual e casos em que o texto basta; comparar a mesma pergunta com a imagem correta, sem imagem e com uma imagem distratora de outra questão.

### Métricas por etapa

| Etapa | Como medir | Meta de aceite inicial |
| --- | --- | --- |
| Extração | Assets esperados encontrados com página/recorte legível; falsos assets por página | 100% dos visuais críticos do corpus pequeno; qualquer perda explicada por warning. |
| Associação | Precisão e cobertura de vínculos questão–asset e chunk–asset contra anotação humana | 100% de ausência de vínculo com questão errada; casos ambíguos permanecem em revisão. |
| Recuperação | `recall@8` do chunk/asset esperado em perguntas sobre conhecimento | Pelo menos 90% no conjunto rotulado; investigar cada falha. |
| Contexto entregue | Comparar manifesto do prompt com IDs/hashes dos bytes realmente enviados ao provedor | 100% dos casos aceitos recebem questão, texto e imagem esperados; nenhuma imagem de outro escopo. |
| Resposta | Revisão humana dos fatos visuais, explicação ligada ao enunciado, fonte/página, incerteza e afirmações sem suporte | Pelo menos 90% de respostas com fatos visuais corretos e contextualização correta; 0 respostas que afirmam ter visto imagem ausente. |
| Conversa | Repetir perguntas diretas e follow-ups; trocar de questão na mesma conversa | 100% dos casos de troca/follow-up usam a questão e a imagem autorizadas do turno correto. |

Os percentuais são **gates propostos**, não resultados já medidos. Publicar numerador, denominador, modelo, versão do prompt, parâmetros, latência e custo por caso. Não tratar score automático de outro LLM como verdade única: usar revisão humana cega para interpretação e uma verificação determinística para asset IDs, hashes e páginas. Fazer comparação pareada com o fluxo textual atual; em perguntas que exigem a figura, a versão multimodal deve resolver o caso sem criar fatos que não estão no PDF.

### Rubrica de compreensão da pergunta contextual

Para cada resposta, o avaliador marca separadamente: (1) reconheceu a questão e a dúvida atual; (2) leu corretamente os elementos visuais necessários; (3) relacionou imagem, enunciado e alternativas sem trocar fontes; (4) explicou o raciocínio pedagógico; (5) citou página/fonte quando usou PDF; (6) declarou limitação quando faltou evidência. Uma resposta que apenas acerta a letra, mas erra gráfico, período, unidade ou premissa, **não passa**. Uma resposta correta por conhecimento geral, sem usar a imagem obrigatória, também não comprova o objetivo visual.

### Execução e relatórios

O plano de implementação deve entregar um script reproduzível que execute o corpus pelo parser, worker, storage e API de chat em ambiente de teste, capture manifestos de contexto e respostas em JSONL, compare os itens determinísticos e gere um relatório Markdown com falhas por etapa. A avaliação humana preenche a rubrica no mesmo relatório. O script não envia PDFs de produção nem grava imagens ou base64 nos logs. Rodar o mesmo corpus antes do rollout, no canário e após mudanças de modelo/prompt/parser; queda em uma métrica bloqueia a ampliação do rollout até investigação.

## Resultado esperado da avaliação

O relatório identifica cada perda por etapa — crop, vínculo, busca, prompt ou resposta — e distingue falha do sistema de erro de interpretação do modelo. Não aprovar uma implementação porque o modelo acertou por conhecimento geral uma pergunta que exigia a imagem. Se algum gate falhar, registrar casos, causa e correção antes do rollout.
