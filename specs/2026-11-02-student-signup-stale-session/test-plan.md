# Plano de teste

| Cenário | Critérios | Resultado esperado |
|---|---|---|
| Cadastro retorna sessão por cookie, sem token no corpo, com bearer antigo no storage | AC-001, AC-003 | Bearer antigo removido ao concluir cadastro |
| Resposta contém access token | AC-002 | Token novo continua sendo armazenado |
