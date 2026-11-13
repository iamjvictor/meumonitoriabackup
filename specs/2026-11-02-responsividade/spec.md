# Especificação: auditoria de responsividade

## Objetivo e escopo
Inventariar, verificar e corrigir problemas de responsividade em todas as telas acessíveis do frontend, incluindo rotas dinâmicas, layouts compartilhados, modais, menus e estados relevantes. Preservar funcionalidades e identidade visual. O inventário deve ser produzido a partir de `frontend/src/app`, navegação e fluxos reais; não presumir que uma lista inicial esteja completa.

## Critérios de aceite
- **AC-001:** inventário rastreável de cada rota, perfil de acesso, pré-requisitos, estados e componentes sobrepostos, incluindo rotas dinâmicas e inacessíveis com motivo.
- **AC-002:** cada tela e estado relevante é inspecionado nas larguras 320, 375, 390, 768, 1024, 1280 e 1440 CSS px; testar também paisagem 844×390 e zoom de 200% em fluxos representativos. Registrar altura, navegador e limitações; larguras intermediárias onde houver quebra.
- **AC-003:** sem rolagem horizontal da página, conteúdo cortado, sobreposição que impeça uso ou controles inacessíveis. Rolagem horizontal localizada é permitida quando necessária, claramente acessível e sem ampliar a página.
- **AC-004:** navegação, formulários, ações, menus, diálogos, tabelas e feedbacks permanecem utilizáveis por toque e teclado; foco visível, texto legível e conteúdo disponível sem depender exclusivamente de hover.
- **AC-005:** estados de carregamento, vazio, erro, dados extensos e sucesso aplicáveis são cobertos; fluxos de aluno, professor, autenticação e públicos são exercitados quando houver acesso.
- **AC-006:** problemas reproduzíveis são registrados com rota, perfil, estado, viewport, passos, severidade, evidência e resultado após correção; bloqueios são explícitos, nunca tratados como aprovados.
- **AC-007:** testes automatizados de regressão cobrem layouts compartilhados e fluxos críticos em larguras representativas; inspeção visual complementa testes de overflow e funcionalidade. Suítes pertinentes e verificações de lint e tipos têm resultado registrado.
- **AC-008:** matriz final relaciona rota/estado/viewport, cenário, evidência e resultado de QA independente; nenhuma aprovação é inferida somente de testes verdes.

## Limites
Não alterar regras de negócio, conteúdo ou contratos sem necessidade e sem registrar decisão. Não utilizar dados reais sensíveis em screenshots ou fixtures. Não realizar deploy, migrations, commit ou operações externas sem autorização explícita. Não apagar alterações preexistentes nem artefatos de outros trabalhos. A validação por emulação não equivale a testes em aparelhos físicos: registrar essa limitação.
