# Test plan — recomendação de plano e cartões de pagamento

## Critérios

- **UI-001:** quando o monitor tem preço anual válido, abrir o modal deixa anual selecionado e exibe a indicação “Recomendado”.
- **UI-002:** quando não há preço anual válido, mensal continua selecionado por padrão e o seletor anual não aparece.
- **UI-003:** métodos de pagamento aparecem em dois cards na mesma linha em telas médias/grandes e podem empilhar em telas pequenas; cada opção continua sendo um radio acessível.
- **UI-004:** mensal e anual mantêm os métodos corretos; o CTA continua desabilitado até que o aluno escolha um método explicitamente.
- **UI-005:** alternar o período limpa a seleção de pagamento, inclusive partindo do padrão anual; o checkout envia o intervalo/método selecionados.

## Cenários

1. Renderizar monitor com plano anual; verificar radio/card anual selecionado inicialmente e texto “Recomendado”.
2. Renderizar monitor sem plano anual; verificar mensal como padrão e ausência de indicação anual.
3. Verificar agrupamento visual responsivo via classes/layout do seletor e manter os dois métodos acessíveis.
4. Mudar anual → mensal → anual e verificar reset do método e bloqueio do CTA até nova escolha.
5. Selecionar plano e método e verificar payload correto enviado ao endpoint.

## Execução

Teste unitário Vitest/Testing Library focado em `TeacherStorefrontPaymentMethod.test.tsx`; revisão estática das classes responsivas e acessibilidade. Não chamar Asaas nem iniciar pagamentos.
