# Plano de QA — retomada do fluxo de questões

Data: 07/11/2026  
Escopo: validar retomada de execução LangGraph depois de checkpoint terminal e falha de persistência, sem alterar código de produção.

## Critérios cobertos

- **AC-011:** reiniciar após checkpoint e repetir após gravação não duplica questões nem altera revisão humana; chamadas com falha são retomadas dentro da política definida.
- **AC-001 (parcial):** confirmar que o worker persiste o resultado consolidado do grafo, sem caminho paralelo que ignore o revisor.
- **Persistência e retomada:** identidade por documento/versão/candidato e reaproveitamento de estado durável.

## Casos de teste

1. **Falha de banco após checkpoint terminal:** executar extração e grafo uma vez; fazer a primeira gravação falhar; reexecutar o mesmo documento/versão. A segunda tentativa deve ler o checkpoint antes de chamar extração, reutilizar exatamente o candidato e resultado originais, e concluir a gravação sem reexecutar nós concluídos.
2. **Não duplicação:** após retry bem-sucedido, repetir novamente a execução. O banco/repositório deve conter uma questão para a mesma identidade e manter `PENDING_REVIEW`; não pode substituir conteúdo editado pelo professor.
3. **Isolamento de versão:** mudar hash/versão do documento deve iniciar uma execução independente e não reutilizar o checkpoint anterior.
4. **Identidade do candidato:** preservar `candidateId`/referências de origem durante retomada; nunca associar resultado a questão diferente por índice/ordem do array.
5. **Checkpoint indisponível:** verificar que o sistema segue a política explícita de tentativa/falha, sem declarar execução concluída ou evidência/rastreabilidade inexistente.

## Evidências e comandos

- Inspecionar implementação e teste local específico de retry.
- Executar primeiro o teste direcionado, depois os testes unitários do serviço de extração estruturada.
- Se necessário, testar o saver Postgres em schema aleatório isolado do `dbtemp` local. Confirmar conexão host/porta/schema antes de qualquer escrita; nunca usar `backend/.env` sem substituir os endpoints remotos.
- Não executar migrations compartilhadas, chamadas a serviços externos, nem upload de produção neste QA.

## Resultado esperado

O retry após o checkpoint não chama novamente o extrator LLM, preserva candidato, resultado e origem, termina a persistência uma vez sem duplicatas, mantém revisão humana e não compartilha estado entre versões diferentes do documento. Limitações de integração local devem ser registradas em vez de interpretadas como aprovação.
