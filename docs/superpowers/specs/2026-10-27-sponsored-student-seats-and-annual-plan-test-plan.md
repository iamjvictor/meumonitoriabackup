# Test plan — Tela de turmas patrocinadas

## Critérios cobertos

- AC-PERSONA-001: compra particular mensal de uma vaga para e-mail ainda sem conta, quantity 1 e split vazio.
- AC-PERSONA-002: compra patrocinada de turma Exatas ENEM em lote, total pela quantidade e sem split.
- AC-PERSONA-003: claim só após confirmação do e-mail autenticado.
- AC-PERSONA-004: turmas/lotes independentes e bloqueio de email inválido/duplicado/ativo/cotação obsoleta.

- AC-UI-001: link de retorno e monitores carregados mesmo se o histórico falhar.
- AC-UI-002: monitor deve ser escolhido antes de exibir plano/e-mails.
- AC-UI-003: falha do histórico é recuperável e não bloqueia cotação.
- AC-UI-004: lista vazia, sem monitores, erros de monitor/cotação, preço alterado e checkout.
- AC-UI-005: revisão da compra antes de redirecionar; total e ausência de split claros.
- AC-UI-006: inclusão individual de e-mails, validação, duplicidade, remoção e edição.
- AC-UI-007: resumo da cotação no painel de compra.
- AC-UI-008: histórico por monitor expansível e estados vazios.
- AC-UI-009: editar lote não pago apenas após cancelar o checkout anterior com sucesso e recotar.
- AC-UI-010: lotes pagos/em processamento não permitem editar beneficiários.

## Cenários

### Personas de professor

1. **Aula particular, uma vaga mensal:** professor escolhe monitor, adiciona um único e-mail de aluno sem conta, confere uma vaga/total, checkout `RECURRENT` com quantidade 1 e split vazio. Depois da confirmação no fluxo autenticado, aluno confirma o mesmo e-mail e reivindica a vaga.
2. **Cursinho Exatas ENEM, turma de cinco:** professor escolhe o monitor Exatas ENEM, adiciona cinco alunos individualmente, confere nomes/quantidade/total e envia um único checkout patrocinado com cinco vagas e sem split.
3. **Nova turma em outro momento:** mesma persona cria segundo lote com e-mails diferentes; lote e idempotência são independentes do primeiro.
4. **Proteção contra cobrança errada:** endereço inválido, duplicado, já ativo ou cotação desatualizada não cria checkout.
5. **Email activation readiness:** sem e-mail verificado, claim é recusado; depois da verificação, o e-mail normalizado corresponde à vaga e invalida cache de acesso.

### Interface, API e estados

6. Carregamento bem-sucedido, seleção de monitor, plano mensal e vários e-mails normalizados; revisão e total corretos.
7. E-mail inválido ou duplicado bloqueia cotação.
8. Plano anual disponível; checkout enviado com intervalo e total cotado, seguido de redirecionamento.
9. Lista sem lotes mostra estado vazio; lotes existentes exibem estados das vagas e cancelamento mensal.
10. Falha ao listar histórico mantém a compra disponível, mostra aviso e permite nova tentativa.
11. Falha ao listar monitores oferece recuperação e impede operações sem monitor elegível.
12. Nenhum monitor publicado comunica ação necessária e não expõe campos de compra.
13. Falha de cotação conserva os dados para correção/retry.
14. Alteração de preço exige nova revisão; falha ao criar checkout não redireciona.
15. Ordem acessível dos campos e link de retorno ao dashboard.
16. Adicionar um e-mail por vez, validar entrada inválida/repetida e remover/editar um item já listado.
17. Revisão resume monitor, intervalo, lista de e-mails, quantidade e valores.
18. Histórico lista monitores mesmo sem lote, agrupa lotes por monitor, expande/fecha e mostra estado vazio sem alunos/vagas.
19. Editar lote pendente cancela checkout anterior primeiro; falha impede alteração; sucesso recota e cria novo checkout coerente.
20. Lotes pagos ou em processamento não exibem controles de edição; disputa de estado bloqueia substituição.

## Execução

`npm run test:unit -- tests/unit/TeacherSponsoredClassesPage.test.tsx`

`npm run typecheck`

## Addendum — forma de pagamento (2026-11-01)

- **AC-PAY-001:** plano anual oferece Pix e cartão; o checkout leva um único método e permanece `DETACHED`.
- **AC-PAY-002:** plano mensal oferece Pix e cartão; o checkout leva um único método e permanece `RECURRENT` mensal. Pix é uma cobrança recorrente de pagamento manual, não Pix Automático.
- **AC-PAY-003:** o menu expansível exige uma escolha para cotar/revisar/pagar; trocar o período limpa a escolha anterior.
- **AC-PAY-004:** o método aparece no resumo e na lista de lotes; lotes legados sem método são exibidos como cartão.
- **AC-PAY-005:** editar os e-mails de um lote pendente mostra e preserva o método já salvo.
- **AC-PAY-006:** criar os quatro pares plano/método não altera cotação ou split; checkout patrocinado continua sem split.

### Cenários adicionais

21. Com menu fechado, expandir forma de pagamento exibe Pix e cartão para o plano mensal; escolher um deles fecha o menu e atualiza resumo/revisão.
22. Trocar de mensal para anual (ou vice-versa) limpa o método e exige nova escolha antes de cotar.
23. Criar checkout anual Pix, anual cartão, mensal Pix e mensal cartão envia o método selecionado; mensal continua recorrente e anual avulso.
24. A resposta de histórico com `billingType` mostra o método gravado; lotes antigos sem campo usam cartão como fallback.
25. Ao editar lote pendente Pix/cartão, a tela informa que o método será mantido e atualiza somente os e-mails.

Implementador: `TeacherSponsoredClassesPage.test.tsx` e `TeacherSponsoredSeatService.test.ts` cobrem seletor, reset, payload, histórico e edição. QA independente deve validar os AC-PAY-001–006 antes de aprová-los na matriz de validação.
