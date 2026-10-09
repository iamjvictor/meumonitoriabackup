# Fluxo de autenticação em origens públicas — especificação TDD

## Objetivo

Garantir que um usuário consiga fazer login, manter a sessão ao abrir/recarregar o frontend publicado por uma origem ngrok configurada, fazer logout real e, em seguida, autenticar outra conta sem reutilizar identidade, token ou dados da conta anterior.

O mesmo contrato deve funcionar quando o frontend for publicado em outro domínio HTTPS, desde que a origem esteja explicitamente configurada no backend.

## Contexto atual

O sistema usa Supabase Auth no backend, Fastify na API e Next.js/React no frontend. O backend emite cookies `HttpOnly` e o login também retorna o `accessToken` para que o frontend faça autenticação explícita por `Authorization: Bearer <token>`.

O frontend usa `mm_access_token` no `localStorage` para sobreviver ao reload e um interceptor global para anexar o Bearer token às requisições protegidas. O logout chama `/api/v1/auth/logout`, limpa cookies no backend e remove o estado local.

Os sintomas que motivam esta spec são:

- login concluído no backend, mas `/api/v1/session` chega sem `Authorization` e sem cookie;
- CORS variando entre origens ngrok;
- logout visualmente concluído sem invalidar o estado usado pela próxima requisição;
- necessidade de testar login A → logout → login B, em vez de validar apenas funções isoladas.

## Decisões de contrato

### Login

`POST /api/v1/auth/login` recebe `{ email, password }` e responde 200 com:

```json
{
  "data": {
    "userId": "user-id",
    "email": "user@example.com",
    "role": "student",
    "accessToken": "jwt-access-token"
  }
}
```

O `refreshToken` nunca aparece no JSON. A resposta também pode emitir `mm_access_token` e `mm_refresh_token` como cookies `HttpOnly`; o frontend não depende exclusivamente deles.

O cliente deve persistir o `accessToken` sem registrar seu valor em logs e deve substituir o token anterior, nunca combiná-lo com o estado da conta anterior.

### Sessão

`GET /api/v1/session` deve aceitar o Bearer token e retornar 200 com a identidade correspondente. Sem Bearer token válido e sem cookie válido, deve retornar 401.

O interceptor deve anexar o header às rotas `/api/v1/` protegidas e à própria rota `/api/v1/session`, mas nunca sobrescrever um `Authorization` explicitamente fornecido pelo chamador.

### Logout

`POST /api/v1/auth/logout` deve ser público e idempotente. Deve limpar os cookies de acesso e refresh com os mesmos atributos de caminho/domínio necessários para apagar os cookies emitidos no login e responder 204.

No cliente, o logout deve:

1. tentar revogar a sessão no backend com `credentials: 'include'`;
2. sempre limpar `mm_access_token`, `mm_refresh_token`, `mm_user_role`, `mm_user_info` e caches de perfil;
3. atualizar o contexto para estado anônimo;
4. impedir que qualquer requisição posterior envie o token da conta anterior;
5. permitir novo login sem recarregar a aba.

Falha de rede no logout não pode deixar o token local ativo.

### CORS e ngrok

O backend deve refletir somente origens permitidas pela configuração (`CORS_ORIGINS` e/ou `PUBLIC_FRONT_URL`), sem usar `*` junto com credenciais.

O preflight para `GET /api/v1/session` deve aceitar `Authorization`, `Content-Type`, `Cookie` e o header de bypass do aviso do ngrok quando aplicável. A origem deve ser comparada normalizada, sem barra final.

Uma URL ngrok diferente da anterior só é válida depois de ser incluída na configuração do backend e de o processo/túnel ser reiniciado. O frontend não pode depender de uma origem codificada no código.

## Fluxos obrigatórios

### Fluxo 1 — login e reload

1. Usuário A envia login válido.
2. O cliente recebe `data.accessToken` e salva o token.
3. A primeira validação de sessão envia `Authorization: Bearer <token>`.
4. A API responde a identidade de A.
5. Reload da mesma origem mantém a sessão de A enquanto o token for válido.

### Fluxo 2 — logout completo

1. Usuário A está autenticado.
2. Usuário aciona logout.
3. A API recebe `POST /api/v1/auth/logout` com credenciais.
4. O cliente limpa todos os dados locais mesmo se a API falhar.
5. Uma chamada posterior a `/api/v1/session` não envia Bearer de A e recebe 401.

### Fluxo 3 — troca de conta na mesma aba

1. Usuário A faz login e tem sessão 200.
2. Usuário A faz logout.
3. Usuário B faz login sem reload.
4. A sessão seguinte envia somente o token de B.
5. A API retorna exclusivamente a identidade de B.

### Fluxo 4 — duas origens públicas

1. O frontend roda em duas origens HTTPS distintas, por exemplo duas URLs ngrok.
2. Ambas estão explicitamente permitidas no backend.
3. Login, preflight e sessão funcionam em cada origem sem aceitar origem não configurada.
4. Cookies são emitidos com `Secure` e `SameSite=None` quando a requisição é HTTPS via proxy.

## Estratégia de testes

### Backend

- Teste unitário do controller de login: formato flat do `accessToken` e ausência do refresh token.
- Teste unitário de cookies: atributos HTTPS e limpeza do logout.
- Teste do middleware: prioridade do Bearer, ausência de credencial e identidade associada ao token.
- Teste HTTP do CORS/preflight: origem permitida, origem rejeitada, headers e credenciais.
- Teste integrado do fluxo: login A, sessão A, logout, sessão 401, login B e sessão B.

### Frontend

- Teste unitário de normalização da resposta de login.
- Teste unitário do interceptor: lê o token atual a cada requisição, anexa Bearer e preserva Authorization explícito.
- Teste unitário de `revokeClientSession`: chama logout, limpa estado em sucesso e em erro.
- Teste de contexto: logout atualiza estado e novo login substitui a identidade.
- Teste Playwright determinístico com API interceptada para o fluxo A/B completo.

### Smoke contra ngrok

O smoke será opt-in e não usará credenciais fixas no repositório. Variáveis obrigatórias:

- `AUTH_SMOKE_FRONTEND_URL`
- `AUTH_SMOKE_API_URL`
- `AUTH_SMOKE_USER_A_EMAIL`
- `AUTH_SMOKE_USER_A_PASSWORD`
- `AUTH_SMOKE_USER_B_EMAIL`
- `AUTH_SMOKE_USER_B_PASSWORD`

O teste deve falhar com mensagem clara quando uma variável faltar, não imprimir senhas/tokens e validar requests reais de login, sessão, logout e troca de conta.

## Observabilidade e segurança

- Logs podem registrar status, request id, usuário mascarado e presença de token, nunca token, senha ou refresh token.
- O cliente deve registrar apenas `hasAccessToken` e chaves da resposta, se diagnóstico for necessário.
- Testes devem verificar que o token A não aparece no request após logout e que a identidade B não é obtida com token A.
- O cache de sessão do backend não pode devolver a identidade de A para o token de B.

## Fora de escopo

- Alterar o provedor Supabase Auth.
- Criar um novo mecanismo de refresh token no frontend.
- Permitir CORS aberto para qualquer origem.
- Usar `sessionStorage` como substituto do contrato principal.
- Automatizar criação ou exclusão de contas reais de teste.

## Critérios de aceite

- Todos os testes unitários, de contrato e E2E determinísticos passam.
- O fluxo A → sessão A → logout → 401 → login B → sessão B passa sem reload.
- O smoke ngrok passa quando executado com duas contas e origens configuradas.
- Nenhuma requisição protegida após logout carrega o token A.
- Origem não configurada não recebe headers CORS permissivos.
- Typecheck e lint de frontend/backend passam.
