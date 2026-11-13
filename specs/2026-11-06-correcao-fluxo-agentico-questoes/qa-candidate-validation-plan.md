# QA independente — validação de candidatos

Plano preparado antes de testes exploratórios do módulo candidate-validation, associado a AC-005/006/007.

- Fragmentos: URL pura, legenda de figura, enunciado normal e frase legítima que começa com palavra potencialmente ambígua; validar sem depender da instituição/arquivo.
- Duplicatas: mesma questão com mesmo segmento e evidência, mesmo número em segmentos diferentes, mesma pergunta sem evidência compartilhada, entradas em ordem diferente; garantir conservadorismo e resultado determinístico.
- Patch do enunciado: citação integral no texto-fonte, normalização de whitespace/Unicode, citação ausente, evidência de outro ID, patch idêntico, citação parcial com conteúdo proposto não sustentado.
- Executar teste independente novo contra os helpers públicos do módulo. Não alterar produção. Falhas serão reportadas ao arquiteto como achados; revisão não define silenciosamente novo contrato.
