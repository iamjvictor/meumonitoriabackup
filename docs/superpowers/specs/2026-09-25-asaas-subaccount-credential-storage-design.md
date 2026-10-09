# Armazenamento seguro de credenciais das subcontas Asaas

## Contexto

As subcontas Sandbox dos professores foram encerradas no painel Asaas e os três registros locais correspondentes foram removidos. O fluxo atual cria a subconta, recebe `apiKey` na resposta do Asaas, descarta a chave e persiste somente `providerAccountId`, `walletId` e status. Por isso o painel financeiro não consegue consultar saldo, recebimentos ou transferências.

O Asaas retorna a chave da subconta somente uma vez. A chave da conta-pai continua sendo usada para criar e administrar subcontas; as consultas financeiras em nome da subconta devem usar a chave própria dela.

## Objetivo

Permitir que um professor crie novamente sua subconta Asaas e que o sistema:

1. capture a chave retornada na criação sem registrá-la em logs, respostas HTTP ou objetos de domínio públicos;
2. armazene a chave cifrada no banco, associada à conta e ao ambiente corretos;
3. persista o vínculo da conta somente quando a credencial tiver sido armazenada;
4. resolva a credencial com autorização por usuário/conta para consultar o overview financeiro;
5. suporte rotação e revogação sem expor o segredo;
6. impeça mistura entre credenciais Sandbox e produção.

## Fora de escopo

- Exclusão ou recriação automática de subcontas no Asaas.
- Exibição da API key para professores ou administradores.
- Uso da chave da conta-pai para consultar dados privados da subconta.
- Migração de credenciais antigas: os registros existentes foram removidos.

## Decisões de segurança

- A chave nunca será persistida em texto puro.
- O banco armazenará somente ciphertext, nonce/IV, tag de autenticação, versão da chave de criptografia e metadados mínimos.
- A chave mestra virá de `ASAAS_CREDENTIAL_ENCRYPTION_KEY`, com formato validado e tamanho mínimo de 32 bytes; ela não poderá ser enviada ao frontend nem registrada.
- A cifragem usará AES-256-GCM com nonce aleatório por credencial e AAD contendo `paymentAccountId` e ambiente.
- A descriptografia ocorrerá somente no backend, imediatamente antes da chamada ao Asaas, e o resultado não será incluído em logs, JSON, cache ou estado React.
- Toda leitura será autorizada pelo `userId` autenticado e pelo `paymentAccountId` pertencente ao professor.
- A referência opaca (`credentialRef`) poderá permanecer em `payment_accounts`; o material cifrado ficará em tabela separada com relação 1:1 e `ON DELETE CASCADE`.

## Modelo de dados

Adicionar `payment_account_credentials`:

| Campo | Regra |
|---|---|
| `id` | UUID, chave primária e referência opaca |
| `payment_account_id` | UUID único, FK para `payment_accounts`, cascade |
| `ciphertext` | texto/base64, obrigatório |
| `nonce` | base64, obrigatório |
| `auth_tag` | base64, obrigatório |
| `key_version` | inteiro positivo |
| `environment` | `SANDBOX` ou `PRODUCTION`, igual à conta |
| `created_at` / `rotated_at` | timestamps |

Restrições:

- `UNIQUE(payment_account_id)`;
- `CHECK(environment IN ('SANDBOX','PRODUCTION'))`;
- a aplicação rejeita divergência entre ambiente da conta e ambiente da credencial;
- nenhum campo de segredo aparece em `select` público, DTO, log ou resposta HTTP.

## Fluxo de criação

```text
Professor autenticado
  -> POST /teachers/me/payment-account
  -> conta-pai Asaas cria subconta
  -> resposta contém apiKey (transitória)
  -> serviço cifra apiKey
  -> transação grava payment_account + credential + profile
  -> vincula teachers.current_payment_account_id
  -> resposta retorna somente status, IDs públicos e onboardingUrl
```

Se a cifragem ou a transação falhar, a API retorna erro controlado e não apresenta a conta como pronta. A implementação registra um evento sanitizado de compensação necessária para a subconta externa, sem tentar repetir automaticamente um POST de criação.

## Fluxo de consulta

1. O endpoint autentica o professor.
2. O repositório busca a conta atual e a credencial pelo vínculo do professor.
3. O resolver valida ambiente e autorização, descriptografa em memória e entrega a chave somente ao provider.
4. O provider chama `/finance/balance`, `/payments` e `/transfers` com a chave da subconta.
5. Logs registram apenas conta, wallet, ambiente, recurso, status HTTP lógico, contagem e duração.
6. Falha de credencial retorna `metrics: null` com motivo interno classificado e mensagem pública genérica.

## Rotação e revogação

- `rotate` cria nova credencial cifrada, atualiza `credentialRef`/versão em uma transação e invalida a anterior após sucesso.
- `revoke` remove o registro cifrado local e marca a conta sem credencial; a revogação remota da chave exige endpoint de gerenciamento do Asaas e será uma operação explícita.
- Nenhuma operação de rotação registra o valor antigo ou novo.

## Observabilidade

Eventos estruturados:

- `payments.asaas_subaccount_credential_encryption_started/completed/failed`;
- `payments.asaas_subaccount_persistence_completed` com `hasCredential: true`;
- `payments.account_overview_credential_resolution_started/completed`;
- `payments.asaas_account_overview_response_received`.

Proibido nos logs: `apiKey`, ciphertext, token, header `access_token`, corpo integral do Asaas e dados bancários.

## Critérios de aceitação

- Nova criação grava uma credencial cifrada e nunca uma chave em texto puro.
- Recriação do mesmo professor não reutiliza credencial de outro ambiente ou professor.
- Consulta aprovada usa a chave da subconta e preenche os quatro KPIs.
- Ausência, corrupção, versão inválida ou ambiente divergente produz indisponibilidade controlada.
- Falha de persistência não deixa `current_payment_account_id` apontando para uma conta sem credencial.
- Rotação substitui a credencial sem duplicar a conta.
- Todos os testes unitários, de integração e typecheck passam.
