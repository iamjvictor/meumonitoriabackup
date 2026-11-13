# QA independente — Task 1 backend de convites patrocinados

**Veredito spec:** parcial, com bloqueadores para critérios AC-004/005/006. Os contratos principais de token, fragmento, corpo estrito, dados da vaga e rotas estão implementados, mas há caminhos de ativação que podem criar conta sem vínculo e uma checagem incompleta de conta existente.

**Veredito quality:** não aprovado para habilitação em produção até corrigir achados importantes/críticos e executar integração em banco isolado. Nenhum código de produção foi alterado.

## Achados

### QA-BE-001 — Criação externa pode deixar conta sem vaga e sem retry útil

**Severidade: Alta** — `backend/src/modules/payments/application/commands/sponsored-seat-invitation.use-case.ts:71-73`, `backend/src/modules/payments/payments.module.ts:58-63`, `backend/src/repositories/auth.repository.ts:40-48`.

Depois de consultar a tabela `Student`, o fluxo cria usuário no Supabase e perfil Student; só então chama o resgate PostgreSQL. Se `StudentRepository.upsertStudent` falhar, AuthRepository não remove o usuário externo (a compensação existe apenas para erros de metadata ou sessão). Se `redeem` falhar, o usuário também já existe. No retry, o endpoint retorna `ACCOUNT_EXISTS`, enquanto o convite permanece sem resgate. O próprio relatório da implementação reconhece a segunda janela, mas não a primeira. Isso impede concluir AC-004 e a recuperação/retry de AC-006.

**Reprodução:** com um token válido e email sem conta, simular falha depois de `supabaseAdmin.auth.admin.createUser` (na persistência do perfil ou `repository.redeem`). Verificar que o Supabase mantém o usuário, a vaga segue `PAID_UNCLAIMED`, e novo POST `/activate` retorna 409 `ACCOUNT_EXISTS`; não há fluxo backend que conclua o vínculo para essa conta.

### QA-BE-002 — `ACCOUNT_EXISTS` só verifica a tabela Student, não o cadastro Supabase

**Severidade: Alta** — `backend/src/modules/payments/infrastructure/persistence/sponsored-seat-invitation.repository.ts:76-78`, `backend/src/modules/payments/application/commands/sponsored-seat-invitation.use-case.ts:71-72`.

A proteção prévia consulta `prisma.student`, mas a identidade de conta é criada no Supabase Auth. Usuários Auth existentes sem linha Student (p.ex. cadastro incompleto/legado) não são detectados; o provisionador tenta signup com o email já registrado e o controller devolve uma mensagem de login, porém não consome o convite nem vincula a vaga após autenticação. Esse caso não satisfaz o caminho operacional de conta existente descrito em AC-005 e plano.

**Reprodução:** preparar usuário Supabase com o email beneficiário sem registro `Student`, emitir convite e ativar. Signup externo falha por email existente; controller responde 409, mas não há endpoint/caso de uso que resgate a vaga após login autenticado com esse email. Dependente de Supabase real ou mock de `AuthRepository`; não executado por indisponibilidade de credenciais/serviço neste QA.

### QA-BE-003 — Revogação não é filtro explícito na elegibilidade

**Severidade: Média** — `backend/src/modules/payments/infrastructure/persistence/sponsored-seat-invitation.repository.ts:8-21,36-48,81-100`.

O critério operacional da spec/plano exige vaga paga ativa não revogada. As queries filtram `status: PAID_UNCLAIMED`, lote ativo e datas, mas omitem `accessRevokedAt: null` nos caminhos de emissão, resolução e resgate. O fluxo atual de chargeback também troca status para `REVOKED`, então a defesa por status cobre o caminho observado (`backend/src/modules/payments/infrastructure/persistence/payment-event.repository.ts:291-292`); ainda assim, o campo explícito de revogação é persistido e a garantia fica dependente de todas as rotinas manterem o status coerente. Não é possível reproduzir resgate indevido no fluxo atual sem dados inconsistentes ou alteração concorrente, então manter como endurecimento/risco de integridade, não como bloqueador confirmado.

### QA-BE-004 — Banco de testes não prova os cenários indicados e depende de env com nome restrito

**Severidade: Média (lacuna de evidência)** — `backend/src/modules/payments/__tests__/sponsored-seat-invitation.database.test.ts:7-10,58-80`.

Os três testes de banco foram ignorados. O guard exige que `DATABASE_URL` seja idêntica a `PAYMENTS_TEST_DATABASE_URL` e contenha literal `mm_asaas_flow_test`; isso evita por padrão o uso acidental de URL arbitrária, mas torna o teste impossível sem esse nome específico e nenhuma URL isolada foi fornecida. Além disso, o cenário chamado “repetição do resgate não duplica vínculo” espera que a segunda chamada rejeite, em vez de provar retry HTTP idempotente com retorno estável. A atomicidade impede duplicação, mas não demonstra o contrato de retry para o chamador.

## Cenários executados

- `cd backend && node --import tsx --test src/modules/payments/__tests__/sponsored-seat-invitation.use-case.test.ts src/modules/payments/__tests__/sponsored-seat-invitation.database.test.ts`
  - Resultado: 6 unitários passaram; 3 integração DB foram skipped; 0 falhas.
- `cd backend && npm run typecheck`
  - Resultado: passou (`tsc --noEmit`, exit code 0).
- Revisão estática dos arquivos de schema/migration, use case, repository, controller, rotas, módulo, server, env e contratos de Auth/cookies.
- Nenhum acesso a `DATABASE_URL`, migração ou serviço externo foi feito.

## Evidência por critério de aceite

| AC | Resultado | Evidência/lacuna |
|---|---|---|
| AC-001 | Parcialmente coberto | Unitário valida saída de URL/dados, mas integração mensal/anual foi skipped; a UI está fora do escopo desta Task 1. |
| AC-002 | Coberto em código | E-mail vem do resolve no servidor; schema de ativação é `.strict()` e só aceita nome/senha. Testes HTTP não executados. |
| AC-003 | Parcial | Ativação passa `role: student` e campos CPF/WhatsApp vazios ao fluxo atual; Auth/Supabase não foi exercitado. |
| AC-004 | Bloqueado | Resgate transacional cria seat/enrollment/subscription; contudo falha entre Auth e DB pode deixar conta sem vaga e sem caminho de retry. Sem DB isolada, não testado. |
| AC-005 | Parcial/risco | Token inválido/existente detectado em unitário e controller traduz erros; conta Auth sem perfil local não tem caminho de vínculo por login verificado. |
| AC-006 | Parcial | Token de 32 bytes em produção (`randomBytes(32)`), SHA-256, TTL 30 dias, header dedicado, CORS e rate limits por rota; não vi logger de request nem logs do token. Resolução e ativação têm rate limit. Atomicidade DB estática; corrida Auth concorrente e recuperação não verificadas. |
| AC-007 | Parcialmente coberto | Nenhum envio de email adicionado nos arquivos Task 1; sem teste/instrumentação demonstrando ausência de chamada externa. |

## Segurança, compatibilidade e contratos

- Token é gerado com 32 bytes, hash SHA-256 é persistido, URL usa fragmento e endpoints extraem token de header próprio; Fastify logger global aparece desativado (`backend/src/server.ts:52`), sem logging explícito do bearer nos arquivos revisados.
- Corpo de ativação é estrito; controller define cookies `mm_access_token` e `mm_refresh_token`, mas o `refreshToken` não é enviado no JSON. Isso é compatível com o padrão de cookies existente; login posterior retorna sessão via cookie/contrato atual.
- Rate limits específicos: emissão 10/15 min, resolve 30/15 min, activate 5/15 min. Rate limiter global também permanece. Header foi adicionado a CORS.
- Risco: `AuthRepository.signup` usa `email.toLowerCase()` e recebe string vazia para CPF/WhatsApp; a vaga compara `emailNormalized`. O vínculo não usa e-mail passado pelo browser. Não solicita CPF/telefone no contrato público.
- O papel da vaga segue strings (`PAID_UNCLAIMED`/`ACTIVE`) do domínio já existente, sem enum no Prisma; as queries são coerentes com os escritores consultados. Não identificado vazamento do token nos logs ou migration aplicada.

## Lacunas e encaminhamento

- Não há `PAYMENTS_TEST_DATABASE_URL` isolada; os testes DB ficaram skipped conforme a restrição de segurança. Nenhum teste de rota/controller nem Supabase Auth foi executado.
- Encaminhar QA-BE-001 e QA-BE-002 ao arquiteto para correção de produção antes de considerar a ativação aprovada. QA-BE-003 é endurecimento recomendado; QA-BE-004 requer completar evidência/semântica de retry com ambiente isolado.
- A migration permanece não aplicada; sua aplicação deve continuar na etapa autorizada de deploy.
