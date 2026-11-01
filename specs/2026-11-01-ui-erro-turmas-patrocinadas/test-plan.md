# Plano de testes

- **AC-001 / cenário 1:** mocks de ambas as listagens retornam 500; confirmar um único alerta acessível, mensagem genérica e nova tentativa que chama ambas de novo.
- **AC-002 / cenário 2:** histórico falha, monitores carregam; confirmar aviso do histórico e cotação de compra utilizável.
- **AC-003 / cenário 3:** mensagem interna bruta não é renderizada; status 5xx vira orientação amigável.
