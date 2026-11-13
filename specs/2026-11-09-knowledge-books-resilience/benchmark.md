# Benchmark local — 10/11/2026

Cinco páginas reais combinadas: Tabela Periódica p. 1 (texto); pH e pOH p. 2 (fórmulas manuscritas); Química-3 p. 11 (tabela); Fundamentos de Química Orgânica p. 3 (figura); Atkins p. 25 (escaneada). Cada uma foi convertida quatro vezes, com fórmulas ligadas/desligadas e escala OCR 3,0/1,5. A primeira medição inclui efeitos de inicialização/cache. Tempos incluem subprocesso; não são previsão para um livro.

| Amostra | Fórmulas | Escala OCR | Tempo (s) | Inicialização (s) | Status |
|---|---|---:|---:|---:|---|
| text | ligadas | 3.0 | 87.2 | 6.2 | COMPLETED |
| text | ligadas | 1.5 | 11.1 | 4.2 | COMPLETED |
| text | desligadas | 3.0 | 9.4 | 3.8 | COMPLETED |
| text | desligadas | 1.5 | 9.4 | 3.8 | COMPLETED |
| formula | ligadas | 3.0 | 18.4 | 3.8 | COMPLETED |
| formula | ligadas | 1.5 | 18.0 | 3.8 | COMPLETED |
| formula | desligadas | 3.0 | 16.4 | 3.8 | COMPLETED |
| formula | desligadas | 1.5 | 16.8 | 3.8 | COMPLETED |
| table | ligadas | 3.0 | 11.3 | 3.8 | COMPLETED |
| table | ligadas | 1.5 | 11.5 | 3.8 | COMPLETED |
| table | desligadas | 3.0 | 10.2 | 3.8 | COMPLETED |
| table | desligadas | 1.5 | 10.6 | 3.8 | COMPLETED |
| image | ligadas | 3.0 | 14.1 | 3.8 | COMPLETED |
| image | ligadas | 1.5 | 14.0 | 3.7 | COMPLETED |
| image | desligadas | 3.0 | 14.3 | 3.8 | COMPLETED |
| image | desligadas | 1.5 | 14.3 | 4.0 | COMPLETED |
| scan | ligadas | 3.0 | 107.7 | 4.4 | COMPLETED |
| scan | ligadas | 1.5 | 106.0 | 3.7 | COMPLETED |
| scan | desligadas | 3.0 | 23.3 | 3.7 | COMPLETED |
| scan | desligadas | 1.5 | 22.9 | 3.8 | COMPLETED |

## Comparação visual pontual

- Texto: descrição e organização da Tabela Periódica aparecem no resultado; não foi uma auditoria de todas as palavras.
- Fórmulas manuscritas: as quatro condições perderam o sinal negativo do expoente de Ka e corromperam a expressão de pH. Status de conversão completa não garante fidelidade científica.
- Tabela: as três substâncias e seus valores foram preservados, com perda da formatação dos subscritos.
- Figura: os rótulos e fragmentos foram recuperados; a interpretação das estruturas depende das imagens e de indexação visual.
- Atkins: parágrafos recuperados com erros de OCR; fórmulas ligadas reconhecem C=q/ΔT e Cv=ΔU/ΔT, embora a segunda apareça duplicada; fórmulas desligadas deixam marcadores de fórmula não decodificada.
- Não há evidência suficiente para mudar o padrão de fórmulas ou escala com base em cinco páginas. A página do Atkins levou 107,7/106,0 s com fórmulas e 23,3/22,9 s sem fórmulas, conforme as escalas listadas; desligá-las perdeu o conteúdo matemático.

Artefatos completos e templates de revisão ficam em `/tmp/mm-knowledge-pilot-20261109/` com permissões restritas; são temporários e não devem ser tratados como armazenamento permanente.
