# Convite e criação de conta para aluno patrocinado

**Status:** aprovado pelo usuário em 01/11/2026; implementação autorizada.
**Data:** 01/11/2026

## Intenção

Preparar o destino do link que futuramente será enviado ao aluno depois que o professor comprar uma vaga patrocinada. O aluno deve ver quem o convidou, qual monitor recebeu, por quanto tempo terá acesso e criar a conta usando o e-mail que o professor cadastrou.

## Abordagens consideradas

1. **Página de convite com link validado pelo backend (recomendada):** uma rota pública valida um token, busca os dados reais da vaga e mostra o formulário de cadastro. O backend fixa o e-mail a partir da vaga e cria a conta somente após validar o convite. Evita confiar em e-mail, professor ou plano passados na URL.
2. **Formulário público com contexto em parâmetros da URL:** mais rápido, mas permite adulterar o e-mail e a apresentação do convite; não prova que o aluno controla o e-mail beneficiário. Rejeitada por segurança.
3. **Usar somente o cadastro/modal atual:** reaproveita autenticação, mas não apresenta o contexto do convite nem mantém o vínculo do convite durante o cadastro. Não atende à experiência solicitada.

## Desenho proposto

- Criar uma página própria em `/convite/aluno#token=...`, sem navegação de professor. Manter o bearer token no fragmento da URL para não enviá-lo nos logs/referers HTTP.
- Ao abrir, validar o token com a API e carregar somente os dados associados à vaga: nome do professor, nome do monitor, e-mail convidado, período mensal/anual e datas do acesso.
- Apresentar uma mensagem de boas-vindas e um formulário simples com nome, senha e confirmação da senha. O e-mail aparece preenchido e bloqueado; CPF e telefone não serão solicitados.
- Ao criar a conta, o backend valida novamente o token, cria um usuário estudante para o e-mail exato da vaga, autentica a sessão e vincula a vaga paga. Contas existentes recebem uma opção para entrar; o vínculo ocorre após autenticação com o mesmo e-mail verificado.
- Tratar carregamento, convite inválido/expirado/utilizado, e-mail já cadastrado, falha de rede, cadastro concluído e acesso já resgatado.
- Gerar tokens aleatórios, de uso único e com validade de 30 dias; persistir somente hash, nunca token aberto. Enviar o token à API num header próprio, não em caminho, query ou corpo, e nunca registrá-lo nos logs.
- Um endpoint autenticado pelo professor emite/reemite o link para uma vaga elegível; o serviço de e-mail futuro poderá reutilizar o mesmo caso de uso. O serviço/provedor de envio e o disparo automático ficam fora deste trabalho.

## Direção visual e interação

- **Tese visual:** uma recepção clara e acolhedora, alinhada à identidade atual do MeuMonitor AI, com foco no convite e no próximo passo do aluno.
- **Conteúdo:** marca; saudação do professor; resumo compacto do monitor e período; formulário; ação principal para criar conta; caminho secundário para quem já possui conta.
- **Interação:** validar o link ao abrir; mostrar progresso e erros junto ao formulário; após o cadastro, indicar a vaga vinculada e encaminhar o aluno à área de estudos.

## Limites

- Não implementar envio de e-mail nesta etapa.
- Não criar usuário antes de validar o convite.
- Não aceitar e-mail, professor, monitor, duração ou estado de pagamento definidos pelo navegador.
- A vaga só pode ser resgatada se estiver paga, ativa, não expirada e se o endereço do convite coincidir com o e-mail da conta.

## Critérios de aceite

- **AC-001:** link válido mostra professor, monitor, e-mail convidado e plano/duração vindos do backend.
- **AC-002:** e-mail do convite não pode ser alterado no formulário e o backend o determina a partir da vaga.
- **AC-003:** aluno cria conta de estudante com nome e senha, sem precisar informar CPF ou telefone.
- **AC-004:** cadastro por convite vincula a vaga correspondente e encaminha o aluno para sua área de estudos.
- **AC-005:** convite inválido, expirado, já usado, vaga não paga e conta já existente recebem caminhos e mensagens compreensíveis.
- **AC-006:** tokens são aleatórios, expiram, são armazenados apenas como hash e não aparecem em logs; endpoints são limitados contra abuso e retries não duplicam conta ou acesso.
- **AC-007:** nenhum e-mail é enviado nesta etapa; o formato da URL fica pronto para o serviço de envio futuro.
