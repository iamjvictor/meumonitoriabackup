# Vagas patrocinadas por professores e plano anual

**Status:** proposta de desenho para revisão; não implementar antes da aprovação.
**Data:** 27/10/2026

## Intenção

Permitir que professores comprem acesso a seus monitores para alunos, organizando vagas em turmas por monitor. O professor informa um ou mais e-mails, escolhe plano mensal ou anual e paga pelas vagas em lote. A compra patrocinada cobra somente a parcela da plataforma e não envia split ao professor. O aluno também poderá comprar o plano anual diretamente na página pública do professor; nesse canal permanece o split atual.

Cada compra forma um lote com seus próprios beneficiários e período. O professor pode comprar outro lote depois sem alterar a cobrança, o preço ou o período dos lotes anteriores.

## Estado atual e restrições encontradas

- A página pública de vendas inicia `POST /api/v1/payments/checkout` para um aluno autenticado. O provider cria somente checkout mensal recorrente de cartão e encaminha o split elegível do professor.
- No fluxo mensal atual, a confirmação financeira da cobrança dirige a liberação de acesso; `CHECKOUT_PAID` sozinho só atualiza o checkout.
- `PaymentOrder.studentId` é obrigatório e representa o aluno pagador/beneficiário atual; `PaymentSubscription` também pertence a um aluno.
- `PaymentSubscriptionItem` tem unicidade por `(subscriptionId, monitorId)`, portanto não representa várias vagas do mesmo monitor na mesma assinatura.
- Não existe plano anual no catálogo nem intervalo anual no checkout Asaas do sistema.
- O handler financeiro atual calcula um split esperado para o professor e adiciona um mês ao período confirmado. Os dois comportamentos precisam passar a respeitar o canal e a duração congelados no pedido.
- O Asaas Checkout aceita cobrança avulsa (`DETACHED`) e recorrente (`RECURRENT`), e aceita split em checkout avulso. A documentação define `CHECKOUT_PAID` como confirmação do pagamento do Checkout. O fluxo anual deve correlacionar esse evento ao pedido e processá-lo idempotentemente. [Checkout Asaas](https://docs.asaas.com/docs/asaas-checkout), [Eventos de Checkout](https://docs.asaas.com/docs/checkout-events), [Checkout com Split](https://docs.asaas.com/docs/checkout-with-payment-split).
- O professor pode informar e pagar vagas para e-mails ainda sem conta ou com conta ainda não verificada. Envio de convite/onboarding por e-mail fica fora desta etapa; a vaga fica paga, mas sem acesso associado, até uma conta autenticada verificar o mesmo e-mail.

## Objetivos

1. Adicionar uma entrada separada no painel do professor para turmas/vagas patrocinadas.
2. Permitir agrupar e-mails por monitor e comprar várias vagas no mesmo checkout.
3. Permitir compras mensais e anuais; cada lote é independente e pode começar em data diferente.
4. Para vagas patrocinadas, cobrar o professor, não enviar split a nenhuma carteira de professor e liberar as vagas somente após confirmação do Checkout avulso ou confirmação financeira do pagamento recorrente.
5. No checkout público, adicionar a opção anual avulsa mantendo o split do professor e liberar 12 meses após confirmação.
6. Manter alunos ainda não cadastrados como beneficiários pendentes, sem criar usuário ou credencial de autenticação artificial.
7. Permitir renovação manual com nova compra antes ou depois do fim do período vigente.
8. Preservar idempotência, inbox/outbox, estados de falha, trilha financeira e isolamento Sandbox/produção.

## Fora de escopo

- Enviar e-mails de convite, redefinição de senha ou onboarding ao beneficiário.
- Criar/alterar contas de autenticação de alunos a partir do e-mail informado pelo professor.
- Descontos promocionais, cupons, parcelamento anual ou preço negociado por turma.
- Alterar a regra comercial de split das compras diretas existentes.
- Renovar automaticamente um plano anual.
- Reescrever a experiência de cadastro/autenticação do aluno.

## Abordagens consideradas

### A. Canal patrocinado separado, com infraestrutura de pagamento/webhook compartilhada — recomendada

Manter a compra direta atual com sua própria política (aluno pagador, split do professor) e criar a compra patrocinada como outro tipo de origem financeira, com lote e vagas explícitos. Compartilhar provider Asaas, idempotência, checkout hospedado, inbox/outbox, processamento de evento e mecanismos de auditoria. A regra de split é determinada no servidor pelo canal/origem: checkout direto exige repasse elegível e é recusado antes de criar o pedido caso não haja wallet, aprovação ou percentual positivo; compra patrocinada sempre envia lista de splits vazia.

**Vantagens:** respeita quem paga e quem recebe o acesso; dá suporte a vários beneficiários sem forçar `studentId` obrigatório; protege o fluxo atual e deixa os estados do lote claros. **Custo:** exige novos registros para lote/vaga e integração da concessão de acesso para beneficiários já vinculados ou pendentes.

### B. Converter todo o modelo de pagamento em pedido genérico com pagador e vários beneficiários

Substituir a associação atual `PaymentOrder → Student` e assinatura por um modelo genérico de pedido, pagador, itens e beneficiários para todos os canais.

**Vantagens:** um modelo conceitual único a longo prazo. **Custos/riscos:** migração ampla e regressão potencial em checkout, webhooks, cancelamento, acesso e relatórios existentes; desproporcional para adicionar o canal patrocinado agora.

### C. Criar um módulo de cobrança patrocinada completamente independente

Criar novas tabelas, provider, webhook e processamento de pagamento exclusivos para professores.

**Vantagem:** isolamento inicial. **Custos/riscos:** duplica tratamento de webhook, idempotência e falhas; dificulta oferecer o anual diretamente ao aluno e conciliar cobranças entre canais.

**Escolha proposta:** A. O canal de negócio e os registros de lote/vaga são separados, enquanto a infraestrutura confiável de pagamento e webhook é compartilhada.

## Desenho funcional

### Painel do professor

- Incluir uma aba/área de **Turmas patrocinadas**, separada de **Alunos & Assinaturas**.
- Listar turmas agrupadas por monitor; cada turma mostra lotes mensais/anuais, período, situação do pagamento, total de vagas e estado de cada e-mail.
- A ação “Adicionar alunos” abre um formulário que seleciona plano e aceita uma lista de e-mails. Normalizar espaços e caixa, validar e deduplicar antes de gerar o valor.
- Mostrar revisão antes do checkout: monitor, plano, período, quantidade de vagas, e-mails e valor total cobrado do professor. Esclarecer que não haverá repasse ao professor nesse lote.
- Uma compra posterior cria outro lote. Ela não altera quantidade, valor ou renovação dos lotes anteriores.
- Exibir estados compreensíveis: checkout pendente, pagamento confirmado, vaga aguardando cadastro/vínculo, acesso ativo, vencido, cancelado/estornado e erro recuperável.
- Lotes mensais patrocinados renovam automaticamente como assinatura Asaas independente por lote; o professor pode cancelar a renovação do lote inteiro. Lotes anuais exigem renovação manual. Se a compra anual ocorrer antes do vencimento, os novos 12 meses começam no fim do período vigente; se ocorrer depois, começam na data de pagamento.

### Página pública de vendas

- Manter o fluxo mensal atual e adicionar o plano anual quando configurado.
- O aluno compra para sua própria conta. A opção mensal permanece recorrente; a anual gera uma cobrança única e, confirmada, concede 12 meses de acesso.
- O checkout anual direto inclui o split da conta do professor. Se o repasse não estiver elegível, o backend recusa a compra com `TEACHER_PAYOUT_UNAVAILABLE` antes de criar o pedido. O split só é processado pelo Asaas depois do recebimento.
- Não liberar acesso com o redirecionamento de sucesso. No mensal, `CHECKOUT_PAID` atualiza a sessão e a ativação continua ligada à confirmação financeira. No checkout anual avulso, `CHECKOUT_PAID` confirma o pagamento segundo o contrato Asaas; correlacionar `checkout.id` e aplicar idempotentemente.

### Preço

- O preço anual é calculado no backend pela fórmula `preço mensal × 12 × 0,8` e arredondado para centavos. Não é editável pelo professor nem persistido em uma coluna separada. O backend fornece o valor ao storefront, à cotação patrocinada e ao checkout.
- Para cada vaga patrocinada, cobrar a parcela da plataforma sobre o preço do plano do monitor; não enviar split ao professor.
- Proposta para a parcela: `preço bruto do plano × (100% − percentual do professor congelado na compra)`, arredondado em centavos e persistido como snapshot. No fluxo direto, o split do Asaas é calculado sobre `netValue`; na vaga patrocinada, o professor paga a parte da plataforma calculada sobre o preço exibido, e as taxas do Asaas reduzem o valor líquido recebido pela plataforma.
- Persistir preço bruto do plano, percentual comercial, valor cobrado por vaga, total do lote e regra usada. Não recalcular lotes existentes quando o professor mudar percentual ou preço do monitor.

## Fluxos

### Compra patrocinada em lote

1. Professor autenticado escolhe monitor publicado, plano e lista de e-mails.
2. Backend confirma propriedade do monitor pelo professor, status elegível, preço/percentual atual e validade/deduplicação dos e-mails.
3. Backend cria lote pendente, vagas beneficiárias e intenção de checkout com idempotência. O professor é pagador; cada e-mail é beneficiário.
4. Asaas recebe checkout hospedado pelo valor total do lote, sem `splits`. Plano mensal usa `RECURRENT` e cria uma assinatura independente por lote; plano anual usa `DETACHED`.
5. Webhook é persistido na inbox e processado. Para lote anual, `CHECKOUT_PAID` confirma a cobrança avulsa e é correlacionado pelo ID do checkout; para lote mensal, as cobranças iniciais e renovações são correlacionadas pelos eventos de pagamento/assinatura. Eventos complementares não duplicam cobrança ou acesso.
6. Para e-mail já associado a aluno com e-mail verificado correspondente, criar/ativar concessão de acesso por monitor e período. Para e-mail ainda sem conta, marcar a vaga como paga aguardando vínculo; o onboarding futuro só associa a vaga a uma conta autenticada cujo e-mail esteja verificado e corresponda ao beneficiário.
7. Cada lote mensal renova pelo ciclo mensal contratado; o professor pode cancelar a renovação do lote inteiro, mantendo acesso até o fim do período pago. Lote anual termina em 12 meses e exige nova compra para renovar. Renovação anual antecipada começa após o período vigente; renovação após expiração começa na confirmação do novo pagamento. Não há remoção individual, reembolso proporcional ou transferência de vaga neste primeiro escopo.

### Compra anual direta

1. Aluno autenticado escolhe anual na página pública do monitor.
2. Backend calcula o anual a partir do preço mensal, cria intenção com canal, intervalo e duração de 12 meses e congela o total/percentual.
3. Asaas recebe checkout `DETACHED` e split elegível do professor.
4. `CHECKOUT_PAID` correlaciona pelo ID do checkout, marca a compra avulsa paga uma única vez e concede acesso pelo período anual. Se também chegar evento de pagamento, ele é correlacionado à mesma compra e não duplica cobrança/acesso.

## Modelo de dados proposto

O desenho detalhado do schema será definido no plano técnico, respeitando as relações existentes. Requisitos mínimos:

- **Plano/oferta:** monitor, intervalo (`MONTHLY` ou `ANNUAL`), preço mensal de catálogo e estado de disponibilidade; preço anual derivado no backend pela fórmula aprovada. O preço congelado do pedido/lote preserva a cotação usada.
- **Lote patrocinado:** professor pagador, monitor, plano, quantidade, valor total, ambiente, status, chaves de idempotência e dados de correlação do checkout/assinatura Asaas.
- **Vaga patrocinada:** e-mail normalizado do beneficiário, lote, status, aluno vinculado opcional, datas do acesso, snapshots de preço e percentual, além de política de repasse explícita `NONE`.
- **Pedido direto:** origem, intervalo e período de serviço persistidos para webhooks, acesso e auditoria; pedido anual registra `DETACHED`, 12 meses e split aplicável.
- Unicidade para impedir duplicação acidental de e-mail no mesmo lote e regras contra concessão duplicada para aluno/monitor/período.
- Campos provider/environment e índices para correlacionar eventos autenticados sem usar payload sintético como prova de pagamento.

Uma vaga patrocinada não deve depender de uma linha `Student` antes do onboarding. A compra pode ser concluída mesmo que o e-mail ainda não tenha conta ou verificação; a vaga permanece `PAID_UNCLAIMED` e não concede acesso até uma conta autenticada comprovar, por e-mail verificado normalizado, que controla o e-mail beneficiário.

## Segurança, autorização e integridade

- Professor só pode comprar vagas para monitores próprios, publicados e disponíveis no plano escolhido.
- Nunca confiar no preço, percentual, valor total, professor, status ou split enviados pelo frontend; backend calcula e congela snapshots.
- O modo patrocinado usa política de split vazia definida exclusivamente no backend, nunca controlável por payload do cliente.
- O dispatcher distingue compra direta e patrocinada antes da persistência financeira. Para compra patrocinada, não cria `PaymentSplit` fictício do professor; grava política de repasse `NONE` no lote/pagamento.
- Exigir idempotency key e fingerprint da combinação monitor/plano/e-mails normalizados para impedir duplo clique e retry duplicado.
- Cancelar uma assinatura patrocinada cancela o lote mensal inteiro no fim do período pago; não há remoção individual, prorrateio ou transferência de vaga no primeiro escopo.
- Renovação anual antecipada do mesmo lote inicia após o período vigente; depois do vencimento inicia na confirmação do pagamento. Não há períodos simultâneos para a mesma vaga.
- Se o e-mail corresponder a uma conta não verificada, permitir a compra e manter a vaga pendente, sem acesso, até verificação. Normalizar e-mail com trim e lowercase; nunca vincular por nome ou e-mail não verificado.
- Se o e-mail já tiver acesso vigente ao mesmo monitor, rejeitar essa vaga antes do checkout e explicar o conflito, evitando cobrança duplicada por período sobreposto.
- Não expor dados pessoais de um aluno a outros professores; a turma só mostra os e-mails/nomes beneficiados pelo próprio professor.
- Eventos duplicados ou fora de ordem não duplicam lote, cobrança, vagas ou acesso; estorno/chargeback segue a política existente e revoga acesso conforme correlação.
- Para checkouts recorrentes existentes, `CHECKOUT_PAID` isolado não substitui a confirmação financeira que ativa a assinatura. Para compras avulsas, a documentação Asaas define `CHECKOUT_PAID` como confirmação do Checkout; o novo handler usa-o após correlação autenticada por `checkout.id`, com idempotência compartilhada com qualquer evento financeiro complementar.
- Banco e chaves Sandbox/produção permanecem isolados; nenhum teste sintético é enviado a webhook de produção.

## Erros que a interface deve tratar

- Monitor não pertence ao professor, não publicado ou sem plano disponível.
- E-mails inválidos, repetidos na lista, já ativos no mesmo monitor ou vinculados a uma vaga paga vigente.
- Conta Asaas/provedor indisponível, timeout, checkout criado remotamente sem persistência local e erro de configuração.
- Checkout pendente, cancelado, expirado ou já existente para a mesma chave idempotente.
- Pagamento recusado, overdue mensal, reembolso/chargeback e webhook atrasado/duplicado.
- E-mail ainda sem conta: mostrar “vaga paga; aguardando o aluno criar/acessar a conta com este e-mail”, sem declarar acesso ativo antes do vínculo.
- Mudança de preço/plano após abertura do formulário: mostrar preço congelado do checkout ou exigir nova confirmação, sem cobrança silenciosa de preço diferente.

## Revisão de testes exigida antes de produção

- Unitários para cálculo/snapshot de preços, mensal/anual, split presente no canal direto e sempre ausente no canal patrocinado, idempotência de lote/e-mail e estados de renovação.
- Integração com PostgreSQL para lote com múltiplos e-mails no mesmo monitor, diferentes lotes em datas distintas, aluno existente/inexistente e deduplicação de webhook.
- Contrato do provider Asaas: mensal patrocinado `RECURRENT` sem split; anual patrocinado `DETACHED` sem split; anual direto `DETACHED` com split elegível.
- Período: mensal aplica ciclos de um mês; anual direto e patrocinado aplicam exatamente 12 meses, sem renovar automaticamente.
- Webhook: `CHECKOUT_PAID` avulso ativa o lote anual uma vez; duplicatas e evento financeiro complementar não duplicam cobrança, split ou vaga; o handler não cria split de professor para patrocinado.
- Fluxo de eventos: checkout criado/cancelado/expirado não ativa; pagamento confirmado ativa todas as vagas válidas uma vez; overdue mensal suspende segundo a regra vigente; estorno/chargeback revoga; retry e correlação pendente recuperam sem duplicar.
- Autorização: professor não compra vagas para monitor alheio; estudante não invoca endpoint patrocinado; não há alteração de preço/split via payload.
- Frontend: lista e revisão do lote, erros por e-mail, checkout redirecionado, atualização de status após retorno/webhook e estados para conta ainda não vinculada.
- Sandbox opt-in: ao menos checkout anual avulso com split, mensal patrocinado sem split e anual patrocinado sem split, usando banco/Redis isolados e webhook temporário removido ao final.

## Chamadas de produto propostas para a implementação

1. Calcular o preço anual no backend como `preço mensal × 12 × 0,8`, arredondado para centavos; o professor não altera esse valor.
2. Calcular a parcela patrocinada como complemento do percentual do professor sobre o preço bruto. As taxas Asaas são descontadas do líquido recebido pela plataforma.
3. Manter cartão de crédito no checkout anual inicial, seguindo o checkout atual; PIX pode ser habilitado depois sem alterar o prazo anual.
4. Cancelar renovação mensal no nível do lote; anual é renovado manualmente. Renovação antecipada anual estende o período atual sem sobreposição; depois do vencimento inicia no pagamento. Sem remoção individual, prorrateio ou transferência de vaga neste primeiro escopo.
5. Bloquear inclusão de e-mail que já tenha acesso vigente ao mesmo monitor, evitando cobrança sobreposta.

## Critérios de aceite do desenho

### Critérios adicionais para a tela de turmas patrocinadas

- **AC-UI-001:** Ao abrir a tela, o professor consegue voltar ao dashboard e consultar seus monitores publicados independentemente de uma falha ao listar lotes anteriores.
- **AC-UI-002:** A compra começa pela seleção explícita de um monitor publicado; somente depois o professor escolhe o período e informa os e-mails beneficiários.
- **AC-UI-003:** Falha na listagem de lotes não bloqueia a compra; a interface informa que o histórico está indisponível e oferece nova tentativa.
- **AC-UI-004:** Estados de carregamento, nenhum monitor publicado, erro de monitores, falha de cotação, alteração de preço, criação de checkout e lista vazia são claros e recuperáveis.
- **AC-UI-005:** A revisão mostra monitor, período, alunos, preço total e política sem repasse antes de redirecionar ao checkout.
- **AC-UI-006:** A entrada de beneficiários é individual, com ação para adicionar cada e-mail à lista, validar duplicatas/invalidade e remover ou editar itens antes da cotação.
- **AC-UI-007:** O painel de compra apresenta um resumo da cotação no lugar do cartão “Como funciona”, incluindo monitor, período, e-mails, quantidade, valores e total.
- **AC-UI-008:** O histórico agrupa monitores em linhas expansíveis; ao expandir, mostra as vagas daquele monitor. Se não houver alunos/vagas, informa isso sem erro.
- **AC-UI-009:** Um lote não pago pode ter os e-mails editados com recotação, desde que o checkout Asaas anterior seja cancelado com sucesso e nenhuma confirmação de pagamento tenha ocorrido; valor, vagas e novo checkout devem permanecer sincronizados.
- **AC-UI-010:** Lotes pagos ou com pagamento em processamento não oferecem edição de beneficiários.
- **AC-PERSONA-001:** Professor de aula particular pode comprar uma vaga mensal para um único e-mail; cobrança e quantidade correspondem a uma vaga, sem split.
- **AC-PERSONA-002:** Professor de cursinho pode comprar uma turma chamada “Exatas ENEM” para vários e-mails em um checkout, com quantidade, total e política sem split coerentes.
- **AC-PERSONA-003:** O fluxo aceita e-mail que ainda não possui conta, mas somente libera a vaga quando uma conta autenticada confirma o mesmo e-mail.
- **AC-PERSONA-004:** Uma nova turma cria lote separado; e-mails inválidos, repetidos, já ativos ou cotação obsoleta não criam checkout.

- Professor pode pagar várias vagas do mesmo monitor em um checkout, sem split, e novos pedidos viram lotes separados.
- O preço patrocinado mostra apenas a parte da plataforma calculada pelo backend sobre o preço bruto; as taxas Asaas são refletidas no líquido recebido.
- Aluno existente recebe acesso após confirmação financeira; aluno ainda sem conta mantém vaga paga pendente até o vínculo autenticado do mesmo e-mail.
- O checkout público mantém o mensal com split e passa a oferecer anual avulso, confirmado por `CHECKOUT_PAID`, com split e acesso por 12 meses.
- Anual não renova automaticamente; a renovação antecipada começa após o período já pago e não cria sobreposição. Mensal patrocinado renova conforme a periodicidade do lote e pode ser cancelado por inteiro.
- Redirecionamento de sucesso não confirma pagamento; `CHECKOUT_PAID` confirma checkouts avulsos após correlação ao pedido.
