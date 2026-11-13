# Plano de QA — campos obrigatórios ao editar questões

| Cenário | AC | Nível | Resultado esperado |
|---|---|---|---|
| Rascunho sem enunciado ou com espaços | AC-005 | Frontend unit | Validador retorna erro do enunciado |
| Uma das alternativas A–E está ausente/vazia | AC-005 | Frontend unit | Identifica cada alternativa pendente |
| Gabarito ausente ou sem alternativa preenchida | AC-005 | Frontend unit | Retorna erro de gabarito |
| Botão salvar após rascunho inválido | AC-005 | Component/service unit | Feedback visual, sem chamada de rede |
| Questão incompleta enviada diretamente à API como edição de conteúdo | AC-006 | Repository unit | 422 por requisito e nenhuma atualização |
| Edição completa sem explicação ou com explicação vazia | AC-007 | Repository/controller unit | Atualização aprovada com sucesso |
| Atualização apenas de status | AC-008 | Repository/service unit | Fluxo atual preservado |
| Edição válida | AC-008 | Frontend unit | Atualização enviada com payload atual |

Dados: IDs e questões sintéticas; sem acesso a banco real ou serviços externos.
