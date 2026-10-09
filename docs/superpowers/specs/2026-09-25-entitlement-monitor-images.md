# Spec: imagens de monitores no snapshot de acesso

## Objetivo

Entregar a imagem do monitor junto do snapshot canônico de acesso do aluno,
para que agentes, prática e demais telas reutilizem o mesmo dado sem buscar a
imagem separadamente a cada navegação.

## Contrato

`GET /api/v1/student/access` retorna cada monitor com:

- `monitorId`
- `name`
- `avatarUrl` (`string | null`)
- `teacherAvatarUrl` (`string | null`)
- `teacherBannerUrl` (`string | null`)
- assinatura, permissões, matérias e contagens aprovadas já existentes

O backend lê `monitors.avatar_url` na mesma consulta do snapshot. O resultado
completo continua sendo armazenado em Redis pela chave
`entitlement:v1:{environment}:{studentId}`, com TTL de 60 segundos.

## Frontend

`EntitlementProvider` mantém as três imagens no snapshot normalizado. As telas
consumidoras usam `avatarUrl` para a capa do monitor e `teacherAvatarUrl` para
o avatar do professor/chat, sem fazer uma requisição adicional.

Quando a imagem for nula, a interface usa o avatar/gradiente já existente.

## TDD e aceite

- teste backend confirma que a imagem atravessa o serviço canônico;
- teste frontend confirma que deduplicação não remove a imagem;
- typecheck backend/frontend deve passar;
- nenhuma tela pode consultar um endpoint separado de imagem para esse fluxo.
