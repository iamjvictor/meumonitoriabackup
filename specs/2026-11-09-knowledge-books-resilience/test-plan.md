# Plano de QA proposto

Planejamento apenas; nenhum teste executado neste turno. Revisor independente deve revisar cenários e completar comandos específicos quando módulos existirem.

| Cenário | Critérios | Evidência esperada |
|---|---|---|
| Perfil inválido e configuração padrão | 001 | Rejeita limites inválidos; defaults equivalentes à versão anterior |
| Livro de 354 páginas | 002 | 36 lotes sem lacunas/sobreposição, final 351–354 |
| Checkpoint interrompido em cada fronteira de I/O | 003,005 | Nunca considera arquivo parcial concluído; retoma só faltantes |
| Matar worker após três lotes e reiniciar em outro host | 003,005 | Recupera Storage; três lotes não são convertidos novamente |
| Conversão artificialmente infinita | 004 | TERM/KILL dentro de prazo; sem filho órfão; estado terminal |
| Retry e orçamento de documento | 004 | Máximo duas tentativas; orçamento acumulado não zera silenciosamente |
| Dois workers para a mesma execução | 005,009 | Uma publicação; fencing rejeita worker com lease vencido |
| Progresso e heartbeat | 006 | Contagem correta; última atividade visível; logs sem credenciais |
| Página vazia, escaneada ilegível e parcialmente convertida | 007 | Diferencia vazio de falha; não publica lacunas como READY |
| Tabela/parágrafo nas páginas 10–11 e imagens com referências repetidas | 008 | Conteúdo contínuo; imagens/IDs/páginas não colidem |
| Troca de geração e rollback | 007,009 | Leitor vê geração antiga ou nova completa; referências antigas preservadas |
| Documentos de professores diferentes com mesmo PDF | 009 | Não expõe artefatos/contexto de outro tenant |
| Fórmula on/off e escala atual/reduzida | 010 | Tempo e qualidade registrados; expoentes, tabelas e símbolos conferidos |
| Busca textual, fórmula e diagrama | 011 | Resposta sustentada pela evidência; mesma dimensão/modelo; sem geração staging |
| Fluxo QUESTIONS existente | escopo | Rotas e resultados não alterados pela flag de livros |

Execução prevista: `python -m unittest discover -s services/document-parser/tests` no ambiente Python do parser; suites TS focais existentes e novas no backend; `npm run typecheck` após instalar dependências pelo lockfile da base escolhida. Benchmark e testes de banco usam ambiente isolado. Usar fixtures sintéticas para falhas e uma amostra real para qualidade, sem depender exclusivamente de mocks.

Revisão QA incorporada: acrescentar FK composta cruzando tenants, 100% de páginas classificadas/zero FAILED, compatibilidade de cada leitor de geração e medição do percentual de tempo gasto inicializando modelos. Orçamento deve ser exercitado com valores pequenos em teste, sem esperar quatro horas.
