# Asaas MVP — desenho consolidado após revisão técnica

Data da revisão: 2026-09-23.
Status: requisitos de negócio confirmados; desenho técnico proposto; provas Sandbox pendentes.
Plano de execução: [checkout por fases](../plans/2026-09-23-asaas-checkout-mvp.md).
Substitui as decisões incompatíveis da [spec de 09/09](2026-09-09-recebimento-asaas-design.md); aquela permanece como histórico/evolução.

## Intenção e escopo

Habilitar a venda de monitores com cartão recorrente mensal, conta de recebimento Asaas do professor e confirmação financeira assíncrona. A plataforma emite as cobranças; o professor recebe por split. Construir monitores em rascunho continua permitido sem conta financeira; a exigência entra na publicação.

MVP: um monitor por checkout, usando exclusivamente o checkout hospedado do Asaas; a aplicação não coleta cartão. Sem indicação efetiva, carrinho agregado, anual, Pix, boleto ou promoções. O aluno pode manter vínculos independentes, sem impor a restrição legada de uma assinatura agregada por aluno ao novo domínio. Indicação fica somente modelada. Não construir agora dashboard administrativo completo nem microsserviço.

## Regras aprovadas

- Professor PF ou PJ; configuração financeira e documentos no Asaas.
- Conta aprovada por evento real permite publicação normal. Professor usa status existente 'active', em minúsculas; conta financeira tem estado próprio.
- Administrador pode dispensar a conta para publicação. A dispensa não significa conta aprovada.
- Monitor já publicado permanece visível e vendendo quando a conta se torna inelegível; parcela do professor fica na plataforma durante esse período, sem obrigação local de repasse retroativo.
- Restauração da conta volta a direcionar cobranças seguintes ao professor.
- Preço vem exclusivamente de Monitor.priceCents, default 5990. Novas compras usam o preço atual.
- Percentual inicial do professor: 50%; plataforma recebe o restante líquido. Só administrador altera.
- Percentual contratado é congelado ao iniciar a intenção de assinatura, apresentado junto ao pedido e conservado após a primeira confirmação. Expiração e nova intenção capturam condições novas.
- Mudar percentual não muda assinaturas vigentes. Mudar carteira muda o destino das cobranças seguintes, preservando o percentual contratado.
- Indicação futura: 40% professor + 5% indicador + 55% plataforma, sobre o líquido. Default da taxa de indicação modelada: 5%; desativada no MVP.
- Cancelamento encerra renovação e mantém acesso até o fim do período pago.
- Falha real de pagamento do aluno suspende o vínculo correspondente até regularização. Erro de API, falha de consulta e divergência de split não são falha de cartão.
- Professor acessa apenas seus dados financeiros; administrador acessa os dados autorizados da plataforma.

Preço de renovação permanece o preço contratado nesta versão. Reajustes de assinaturas existentes e promoções exigem uma regra futura; não derivar uma mudança de contrato de mera alteração em Monitor.priceCents.

## Arquitetura proposta

payments/index.ts é a fronteira para checkout, assinatura, conta e resumo financeiro. Infraestrutura Asaas implementa uma porta própria. payments persiste fatos financeiros e outbox; student-access projeta o acesso em transação com sua deduplicação. Nenhum controller financeiro concede acesso diretamente.

Escolha: novo domínio financeiro incremental, mantendo tabelas legadas e projetando acesso compatível. Estender o billing agregado seria menor inicialmente, mas herdaria identidade Stripe, uma assinatura ativa por aluno e evento único de confirmação. Reescrever imediatamente todo acesso tornaria a migração maior. A proposta preserva contratos de acesso e substitui sua fonte financeira por etapas.

Separar cinco identidades: pedido local, sessão de checkout, assinatura recorrente, cobrança de cada mês e evento de webhook. Uma assinatura tem N cobranças, uma cobrança tem N eventos. 'CONFIRMED' seguido de 'RECEIVED' não representa dois meses pagos.

## Constatações da documentação oficial

1. Checkout hospedado: POST /v3/checkouts, cartão e recorrência mensal. Usar callback para navegação e eventos para confirmação. A criação de checkout não cria prova de pagamento. [Referência](https://docs.asaas.com/reference/criar-novo-checkout), [recorrência](https://docs.asaas.com/docs/checkout-with-subscription-recurring).

2. Split percentual usa netValue; remanescente fica com a conta emissora. Não enviar a carteira da plataforma como recebedora de si mesma. [Split](https://docs.asaas.com/docs/split-de-pagamentos), [split no checkout](https://docs.asaas.com/docs/checkout-com-split-de-pagamento).

3. Alterar split da assinatura afeta novas cobranças geradas, não as existentes; estas exigem atualização individual. Logo, a promessa de próxima cobrança exige sincronização externa, inclusive cobranças pendentes. [Split em assinaturas](https://docs.asaas.com/docs/split-em-assinaturas).

4. POST /v3/accounts exige conta-pai PJ e dados como CPF/CNPJ, endereço e renda. Não temos esses dados no Teacher. Não-BaaS permite ativação/documentação na interface Asaas; BaaS usa outro fluxo. A existência de criação automática não resolve o requisito de preenchimento integral externo. [Criar subconta](https://docs.asaas.com/reference/criar-subconta), [criação e ativação](https://docs.asaas.com/docs/criacao-de-subcontas).

5. Conta usa accountStatus.general = APPROVED e dimensões de aprovação. Expiração cadastral pode exigir tratamento separado. 'SUSPENDED' será um estado local derivado de inelegibilidade, não um evento Asaas presumido. [Eventos de conta](https://docs.asaas.com/docs/webhook-para-verificar-situacao-da-conta).

6. Webhook usa header asaas-access-token, diferente de access_token das requisições à API. Responder HTTP 200 após persistência. [Configuração](https://docs.asaas.com/docs/criar-novo-webhook-pela-api), [fila](https://docs.asaas.com/docs/webhooks-queue-paused).

## Conta de recebimento e publicação

PaymentAccount conserva revisões de conta/carteira; professor aponta para a revisão corrente. Uma conta candidata em ativação não sobrescreve silenciosamente a conta corrente. Status local: NOT_STARTED, PENDING_DOCUMENTS, PENDING_ACTIVATION, ACTIVE, REJECTED, SUSPENDED. Conservar também valores brutos de general, commercialInfo, bankAccountInfo e documentation e a evidência do evento.

Monitor.allowPublishWithoutPaymentAccount é uma dispensa administrativa, default false. Não usar essa dispensa como instrução permanente para reter repasses: se a conta se tornar ativa, a parcela volta ao professor. PaymentCharge grava a decisão efetiva TEACHER ou PLATFORM_FALLBACK e motivo (ausência, restrição, inconsistência de carteira ou estado não verificável).

Timeout não prova suspensão. Pode levar ao fallback pretendido pelo negócio para nova operação, mas não marcar conta como suspensa nem presumir que uma atualização remota ocorreu. Toda incerteza é auditada.

Não existe garantia técnica de redirecionar dinheiro já liquidado ou de impedir falha de venda durante indisponibilidade total do gateway. Erro ambíguo de criação exige reconciliação antes de qualquer nova tentativa, inclusive tentativa sem split. Não implementar transferência reversa automática.

## Modelo financeiro e acesso

Teacher conserva percentual atual e indicador futuro. PaymentSubscriptionItem guarda percentual/preço contratados; PaymentCharge e PaymentSplit guardam carteira efetiva e valores observados por competência. Valores monetários em centavos; percentuais Decimal(7,4), recebidos em DTO como strings decimais. Saldo da plataforma é o remanescente. Valor líquido desconhecido permanece nulo, não zero nem bruto estimado como definitivo.

Taxas e valores recebidos prevalecem na conciliação. Cálculo local pode estimar com arredondamento explícito; testes Sandbox devem confirmar o comportamento de centavos do provider.

student-access permanece dono da projeção; ambos os caminhos legados de acesso precisam refletir suspensão e expiração. Apenas atualizar StudentSubscription deixaria StudentEnrollment ativo e liberaria acesso indevido.

Contagem de mês usa calendário, fuso America/Sao_Paulo e dia âncora com clamp ao último dia do mês, sem deriva do dia original. Eventos repetidos não somam tempo; cada cobrança tem competência e intervalo único. Regularização tardia deve conciliar calendário externo antes de conceder novo intervalo; provar esse comportamento no Sandbox antes de ativar renovação.

## Provas técnicas que antecedem ativação

- Onboarding externo: verificar caminho não-BaaS e credenciais necessárias. Se criação automática exigir coleta interna adicional, apresentar a incompatibilidade antes de implementar esse formulário; não mudar a preferência já informada.
- Correlação: provar checkout.id → payment.id → subscription.id. GET /payments aceita checkoutSession como filtro, mas confirmar campos reais recebidos nos webhooks. [Consulta](https://docs.asaas.com/reference/list-payments).
- Recuperação de criação incerta: externalReference correlaciona, não garante idempotência externa. Confirmar consultas suportadas para checkout sem ID.
- Troca/fallback: provar alteração de template e cobrança pendente; tratar captura concorrente como exceção conciliável.
- Renovação e regularização: provar datas, tentativas recusadas, pagamento posterior e atualização de cartão pelo ambiente hospedado.
- Produção exige ambiente, conta, IDs e webhooks próprios; não basta substituir ASAAS_API_KEY.

Essas provas podem ser executadas enquanto contratos, fake provider e migrations locais são preparados. Sua pendência bloqueia ativar o comportamento correspondente, não a organização do trabalho.
