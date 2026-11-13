# QA independente: upload local e checkpoint durável LangGraph

Data: 06/11/2026. Escopo: validar integração worker/upload QUESTIONS com checkpoint durável usando exclusivamente infraestrutura local isolada (`dbtemp`). Este plano deriva dos critérios AC-001, AC-010, AC-011, AC-012 e AC-014 da `spec.md` e complementa os planos de integração já existentes.

## Limites operacionais

- Não executar migrations, DDL, deploy, ou escrita em banco remoto.
- Primeiro verificar que `dbtemp` está ativo e que a URL alvo é loopback/local; nunca imprimir credenciais.
- Testes unitários não devem depender de banco ou LLM externo.
- Testes PostgreSQL são opt-in e somente leitura quanto ao schema: podem inserir/ler/excluir dados de teste em tabelas já preparadas, mas não criar nem alterar tabelas. Se o schema auxiliar não existir, registrar como bloqueio de preparação e não tentar remediar.
- Não usar `MemorySaver` como evidência de durabilidade. Ele serve somente para testar o adaptador e a política de retomada em memória.

## Cobertura e método

| Área | Cenário independente | Evidência esperada |
|---|---|---|
| Checkpoint durável | Gravar estado intermediário, encerrar o saver/processo e abrir nova instância contra o mesmo banco | Novo saver recupera checkpoint, nó pendente e escopo corretos (AC-011). |
| Escopo/origem | Duas execuções/documentos/versões compartilham o mesmo banco; consultar por cada configuração | Nenhum checkpoint cruza execução, documento ou versão; identificadores vêm do documento/execução do worker, não de conteúdo gerado pela LLM. |
| Idempotência | Invocar execução já concluída duas vezes, com contagem observável de chamadas e gravações de questão | Segunda chamada retorna checkpoint terminal sem repetir nós com efeitos colaterais nem duplicar questão (AC-011). |
| Interrupção/retomada | Interromper após checkpoint de um nó; reabrir serviço e retomar | Continua do checkpoint e não reexecuta nós anteriores concluídos; falha sem checkpoint reentra na política de tentativa definida. |
| Flag fail-closed | Flag ausente/desligada, ligada sem saver durável, ligada com `MemorySaver`, e ligada com backend aprovado | Desligada preserva caminho legado; ligada sem persistência real falha antes da extração/persistência; apenas saver durável aprovado habilita LangGraph. |
| Upload/worker | Percorrer caminho real local de documento QUESTIONS e observar parser → chunks → extração → grafo → persistência | Uma única trilha de persistência usa saída consolidada do grafo; KNOWLEDGE_BASE não é afetado (AC-001/014). |
| Estado final | Questões gravadas após execução com pendências/avisos | Execução pode concluir com issues, mantendo todas as questões `PENDING_REVIEW` (AC-010). |
| Segurança | Inspecionar checkpoint e logs de teste por credenciais, PDF/base64/bytes | Persistem referências e estado necessário; segredos e binários não aparecem (AC-012). |

## Execução

1. Rodar testes unitários selecionados do checkpoint e integração worker sem serviço externo.
2. Inspecionar configuração `dbtemp` e confirmar ambiente local; não conectar se a configuração apontar para host não-loopback.
3. Verificar somente a existência das tabelas/índices requeridos pelo saver. Ausência de schema interrompe a parte PostgreSQL, sem DDL.
4. Se previamente preparado, rodar teste PostgreSQL opt-in com IDs QA isolados e limpeza limitada àquelas linhas de teste.
5. Executar upload/worker local somente se parser, banco local e provedor/configuração explicitamente habilitados estiverem disponíveis. Não trocar chave, modelo, ou endpoint em segredo; sem provider disponível, registrar lacuna.
6. Coletar logs/audit JSON sem tokens, IDs de usuário reais ou conteúdo integral sensível.

## Critério de conclusão

Reportar cada AC como PASS, FAIL ou BLOCKED com comando, saída observável e arquivo/linha. AC-011 não pode ser marcado PASS com `MemorySaver`; precisa haver retomada observada após nova instância usando armazenamento PostgreSQL local persistente. Upload local ponta a ponta não pode ser inferido por testes de função isolados. Qualquer falta de schema em `dbtemp` é dependência explícita de preparação do banco, não autorização para executar migrations.
