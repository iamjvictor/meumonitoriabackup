# Validação

- AC-001: página pública abriu com 40 questões; formulário exibe cinco alternativas, gabarito e marcador de imagem, sem observação. Cancelamento e resposta simulada de salvamento verificados no navegador.
- AC-002: testes unitários conferiram a posição de imagens, a alternativa correta e o formato do hash. GET real retornou 40 registros.
- AC-003: PATCH real com marcador ausente respondeu HTTP 400 sem alteração de dados.
- AC-004: decisões permanecem no armazenamento local do navegador.
- Verificações: testes unitários do módulo e typecheck de backend e frontend passaram. O caminho de sucesso de PATCH foi simulado no navegador para evitar alterar conteúdo real durante a verificação.
- A rota pública está habilitada somente fora de produção. Ela não requer login e restringe a edição às 40 questões MANUAL IFF 2010.
