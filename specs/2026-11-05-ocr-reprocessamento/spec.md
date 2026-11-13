# Correção do OCR e reprocessamento

Objetivo: usar o texto completo extraído pelo parser, inclusive OCR, no processamento do documento e reprocessar os três arquivos do professor, informando estados e questões.

- AC-001: texto extraído por OCR alimenta as etapas posteriores com páginas e ordenação preservadas; PDFs com texto continuam suportados.
- AC-002: reprocessamento mantém as referências existentes ou falha sem corrompê-las.
- AC-003: registrar resultado real por documento e quantidades de questões, com distinção entre candidatos e questões persistidas.
- Limites: preservar dados existentes, alterações de outros trabalhos e histórico; não executar testes automatizados sem solicitação.
