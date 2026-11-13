# Plano proposto de implementação

Estado: planejado; não executado. Contratos e critérios em [spec.md](./spec.md).

1. Definir tipos internos e identidade estável, sem migrar Question. Registrar snapshots, segmentos, versões, evidências e qualidade. Revisar compatibilidade com o contrato anterior.
2. Implementar validação/recuperação de candidatos, deduplicação e patch de enunciado antes de completar alternativas.
3. Implementar ferramenta de busca híbrida e associação de gabaritos; integrar carregamento multimodal e política de evidência.
4. Atualizar agentes e revisor com versões, origens, pendências e tentativas; executar alternativas antes do gabarito na mesma questão.
5. Integrar o grafo ao worker, removendo salvamento direto do caminho novo. Adicionar checkpoint durável e gravação idempotente, preservando revisão humana. Escolher mecanismo compatível com dependências instaladas e explicitar qualquer migração auxiliar antes de executá-la.
6. Validar corpus, upload até interface e regressão KNOWLEDGE_BASE. Só declarar integração aceita após evidências independentes.

A ferramenta e o domínio de validação podem ser implementados em paralelo depois dos contratos. Integração do revisor depende de ambos. Concorrência entre questões só entra depois de validação de versionamento/junção; não é pré-requisito para corrigir gabaritos.

[Pacotes e responsabilidade](./tasks.md) · [Cenários](./test-plan.md) · [Registro de aceite](./validation.md).
