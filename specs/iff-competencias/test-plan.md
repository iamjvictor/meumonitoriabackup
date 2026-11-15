# Plano de QA — competências IFF

- AC-001: comparar catálogo JSON com PDF; validar matriz, matéria/tópico/código e unicidade da chave matriz+matéria+código.
- AC-002: validar 480 registros de classificação, IDs existentes/únicos, descritores existentes e mesma matéria/matriz; confirmar relação N:N.
- AC-003: validar contrato GET/competencies, GET/iff e PATCH de seleção múltipla, troca de tópico, remoção de vínculos e rejeição de matéria incompatível; revisão visual do componente.
- AC-004: inspecionar registro da rota sem condição de NODE_ENV e fazer smoke HTTP em ambiente local apropriado.
- AC-005: amostrar classificações por matéria e confirmar lacunas explicitamente vazias; considerar apenas propostas até revisão pedagógica.

Execução: typecheck backend/frontend; testes focados existentes; scripts offline de integridade JSON; não executar migração nem alterar banco durante QA.
