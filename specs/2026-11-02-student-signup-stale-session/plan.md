# Plano

A API cria a sessão do aluno em cookies HttpOnly e não inclui o access token no corpo público da resposta. O modal de aluno deve eliminar um bearer token previamente armazenado quando não houver token novo, tanto em cadastro quanto em login. O teste de componente cobre token antigo + resposta cookie-based.
