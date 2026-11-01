# Plano: ampliar limites da taxonomia de monitores

Spec: `docs/superpowers/specs/2026-10-25-monitor-taxonomy-validation-design.md`.

## Etapas

1. Adicionar testes de contrato para os limites 360/361, caminhos 1086/1087, limites gerais preservados e payloads realistas.
2. Adicionar testes para chaves de seleção legadas e chaves SHA-256 determinísticas para rótulos longos.
3. Adicionar teste para o schema do endpoint de adição de matéria com caminho achatado.
4. Rodar os testes e confirmar falhas antes da implementação.
5. Ajustar schemas e geração de chaves sem alterar dados existentes; rodar testes focados e typecheck.

## Restrições

- Sem truncamento, migração de banco ou mudança no formato do payload.
- Nome do monitor, matéria raiz, banca e examType mantêm limites atuais.
- Preservar exatamente `selectionKey` atual quando componentes de taxonomia tiverem até 120 caracteres.
