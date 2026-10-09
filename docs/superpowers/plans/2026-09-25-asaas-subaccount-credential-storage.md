# Plano: credencial segura de subcontas Asaas

## Ordem de execução

Implementação TDD em seis tarefas pequenas, com migração de banco antes do wiring final. Cada tarefa deve escrever o teste que falha, executar o teste vermelho, implementar o mínimo, executar novamente e só então refatorar.

## Task 1 — Criptografia e contrato do cofre local

**Arquivos:**

- Criar `backend/src/modules/payments/infrastructure/credentials/payment-account-credential.crypto.ts`.
- Criar `backend/src/modules/payments/infrastructure/credentials/payment-account-credential.store.ts`.
- Testar em `backend/src/modules/payments/__tests__/payment-account-credential.crypto.test.ts`.

**Contrato:**

```ts
type EncryptedCredential = {
  ciphertext: string; nonce: string; authTag: string; keyVersion: number;
};
interface PaymentAccountCredentialStore {
  encrypt(accountId: string, environment: 'SANDBOX'|'PRODUCTION', plaintext: string): EncryptedCredential;
  decrypt(accountId: string, environment: 'SANDBOX'|'PRODUCTION', value: EncryptedCredential): string;
}
```

Testes: round-trip AES-256-GCM; nonce diferente por gravação; falha com chave mestra ausente/tamanho inválido; AAD impede trocar credencial entre contas/ambientes; plaintext não aparece no objeto persistível nem no logger.

## Task 2 — Migração Prisma para credenciais

**Arquivos:**

- Criar a migração executando `npx prisma migrate dev --name payment_account_credentials`; o Prisma deve gerar o diretório versionado e o arquivo SQL.
- Alterar `backend/prisma/schema.prisma` adicionando `PaymentAccountCredential` 1:1.
- Testar contrato no `backend/src/modules/payments/__tests__/payment-account-credential.schema.test.ts`.

Adicionar FK cascade, unicidade por conta, ambiente, ciphertext/nonce/tag obrigatórios e `key_version` positivo. Executar `prisma validate`, `prisma generate` e teste de inserção/remoção em banco de teste.

## Task 3 — Capturar a `apiKey` e persistir atomicamente

**Arquivos:**

- Alterar `backend/src/modules/payments/infrastructure/providers/asaas/asaas-account.provider.ts` para transportar a chave somente no resultado interno transitório.
- Alterar `backend/src/modules/payments/application/commands/start-payment-account.use-case.ts`.
- Alterar `backend/src/modules/payments/infrastructure/persistence/payment-account.repository.ts`.
- Testar em `backend/src/modules/payments/__tests__/start-payment-account-credential.test.ts`.

O teste deve provar que a chave é recebida, cifrada e persistida junto com a conta; a resposta pública não contém a chave. Simular falha de cifra/transação e garantir que o professor não fica com `current_payment_account_id` apontando para uma conta sem credencial.

## Task 4 — Resolver seguro no overview

**Arquivos:**

- Alterar `backend/src/modules/payments/application/queries/get-payment-account-overview.use-case.ts`.
- Alterar `backend/src/modules/payments/payments-account.module.ts`.
- Testar em `backend/src/modules/payments/__tests__/get-payment-account-overview.credential.test.ts`.

Substituir o resolver ausente por um adapter que busca a credencial pelo `userId`, valida ambiente e descriptografa em memória. Cobrir conta de outro professor, ambiente divergente, ciphertext corrompido, credencial ausente e caminho aprovado com KPIs disponíveis.

## Task 5 — Rotação e limpeza explícitas

**Arquivos:**

- Criar `backend/src/modules/payments/application/commands/rotate-payment-account-credential.use-case.ts`.
- Criar `backend/src/modules/payments/http/payment-account-credential.routes.ts`.
- Alterar `backend/src/modules/payments/payments-account.module.ts` e `backend/src/server.ts`.
- Testar em `backend/src/modules/payments/__tests__/rotate-payment-account-credential.test.ts`.

Exigir sessão de professor, conta pertencente ao usuário e confirmação de ambiente. A rotação deve ser idempotente por chave de operação, substituir a credencial em transação e nunca retornar o segredo. A revogação local deve remover o ciphertext e deixar métricas indisponíveis até nova criação/rotação.

## Task 6 — Verificação ponta a ponta e documentação

**Arquivos:**

- Alterar `backend/src/modules/payments/__tests__/payment-account-overview.integration.test.ts`.
- Adicionar teste de contrato em `backend/src/modules/payments/__tests__/payment-account-credential.contract.test.ts`.
- Atualizar `docs/PAGAMENTOS-E-ASSINATURAS.md` e o runbook de variáveis de ambiente.

Executar: `npm run prisma:validate`, `npm run typecheck`, testes focados, suíte completa de pagamentos e, com credencial Sandbox real, criação de subconta → consulta de overview → rotação.

## Revisão de segurança

- Procurar no repositório por `apiKey`, `access_token`, `ciphertext` e garantir que nenhum log/DTO contém segredo.
- Validar que `ASAAS_CREDENTIAL_ENCRYPTION_KEY` não é prefixada com `NEXT_PUBLIC_` nem enviada ao frontend.
- Confirmar isolamento `SANDBOX`/`PRODUCTION` na consulta e na persistência.
- Confirmar que a exclusão local em cascata não remove pagamentos, assinaturas ou histórico de alunos.
