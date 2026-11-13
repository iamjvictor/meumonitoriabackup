# Reteste completo do corpus de questões com formula enrichment

**Data:** 2026-11-06  
**Parser:** Docling 2.122.0, `do_formula_enrichment=True`  
**Extração estruturada:** DeepSeek V4.1 Flash, uma chamada por documento, saída JSON estruturada  
**Execução:** parser local HTTP + assets reais + respostas em repositório em memória. Nenhuma persistência no banco.

## Resumo

| PDF | Páginas | Chunks | Assets anexados | Questões retornadas | Alternativas | Resultado |
|---|---:|---:|---:|---:|---|---|
| Simulado Pedro Lucas | 5 | 8 | 1 | 10 | 5 em cada | Contagem correta; notação científica ainda achatada em mais de uma questão e há erros em fórmulas do enunciado. |
| Quimica-3 | 16 | 13 | 20 | 10 | 0, conforme caderno discursivo | Q04 recupera a reação catalisada em LaTeX; expoente de k fica achatado. Q05 contém fórmula mal reconhecida. |
| Estequiometria | 4 | 4 | 6 | 2 | 4 na primeira; 0 na segunda | Contagem/estrutura compatíveis com o PDF; teste de OCR ocorreu em PDF classificado como SCANNED. |

Cada documento foi enviado ao parser com SHA-256 conferido e todos os chunks/figuras resultantes foram fornecidos à chamada única da extração estruturada. Os arquivos `questionsQuimica.pdf` e `Quimica-3.pdf` têm o mesmo SHA-256; o duplicado não foi processado novamente.

## Verificação por documento

### Simulado Pedro Lucas

- Parser retornou 5 páginas, 8 chunks e 1 asset visual vinculado.
- A LLM retornou as questões 01–10 em uma chamada; todas têm cinco alternativas.
- A questão 07 preserva a opção A como `3 × 10 17`, sem sobrescrito em `10¹⁷`; o dado de Avogadro também aparece como `10 23`.
- Há outros erros de notação no texto estruturado: a equação da questão 01 contém, por exemplo, `PO _ { 4 / 2 }`, e a equação da questão 08 troca `O` por `0` em `CO₂`. Portanto, a contagem de dez não significa transcrição integralmente fiel.

### Quimica-3

- Parser retornou 16 páginas, 13 chunks e 20 assets; a saída não contém `formula-not-decoded`.
- A LLM retornou as 10 questões discursivas em uma chamada.
- Q04 agora contém a reação como fórmula em LaTeX: `2 H₂O₂(aq) → 2 H₂O(ℓ) + O₂(g)`, incluindo o catalisador MnO₂. Isso confirma que o enrichment corrigiu a lacuna da reação.
- O valor cinético ainda vem como `4,0 x 10 7 s - 1`, sem sobrescrito correto.
- Q05 contém `\lceil _ { 2 } O _ { 2 }` na fórmula de eletrólise, indício de leitura incorreta. O enrichment não corrigiu todas as fórmulas do documento.

### Estequiometria

- Parser classificou o PDF como `SCANNED`, executou OCR, e retornou 4 páginas, 4 chunks e 8 assets no pacote (6 ligados a páginas/chunks enviados ao modelo).
- A LLM retornou duas questões em uma chamada: a primeira com quatro alternativas; a segunda discursiva.
- Não houve marcador `formula-not-decoded` nos chunks usados. A alternativa D da primeira questão foi transcrita como `107`, igual à grafia impressa no PDF.
- Esta amostra comprova que o fluxo aceitou um PDF escaneado, mas não é uma auditoria visual linha a linha de todas as fórmulas/figuras.

## Comandos e artefatos

- Teste de configuração: `python -m unittest services/document-parser/tests/test_normalize_content_list.py -v` — 4/4 aprovados.
- O parser HTTP local foi reiniciado após ativar a opção e parou após a execução.
- Cada parser `/chunk/v2` e chamada estruturada ao DeepSeek terminou com sucesso; 3 chamadas estruturadas no total.
- Saídas completas por questão:
  - `tests/document-parser/results/simulado-pedro-lucas-formula-enrichment-real-2026-11-06.json`
  - `tests/document-parser/results/quimica-3-formula-enrichment-real-2026-11-06.json`
  - `tests/document-parser/results/estequiometria-formula-enrichment-real-2026-11-06.json`
- Sem gravação no banco e sem persistência de questões. O harness marcou chunks como prontos em memória para executar a extração estruturada; **não gerou nem persistiu embeddings reais**. Esta rodada validou parser/OCR/chunking/assets + LLM, não o ciclo de persistência/embeddings do worker.

## Conclusão

A ativação melhorou a recuperação da equação visual da Q04 de Quimica-3: o placeholder foi substituído por uma fórmula legível. A extração ainda não está correta em todas as fórmulas: subscritos/sobrescritos e alguns símbolos continuam sujeitos a corrupção, inclusive depois da resposta estruturada. O resultado é adequado para revisão do professor, mas não para considerar transcrição matemática/química exata sem validação adicional.
