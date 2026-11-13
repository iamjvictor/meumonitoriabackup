# Plano de testes: resumo em estilo de código

Critério de aceite desta alteração: o resumo da compra deve ter fundo escuro, texto verde e branco, aparência de objeto de código, manter as informações atuais legíveis e adaptar-se a telas estreitas.

- Cenário 1 (render): renderizar o resumo e confirmar título, monitor, plano, forma de pagamento, quantidade/lista de alunos, total e aviso sobre repasse.
- Cenário 2 (estilos): verificar classes de superfície escura e cores de texto com contraste suficiente, inclusive rótulos e valores.
- Cenário 3 (responsivo): verificar estrutura sem largura fixa, itens longos com quebra/rolagem controlada e sem exigir overflow horizontal.

Métodos: teste unitário do componente e inspeção do diff/classes; typecheck. Limitação: contraste de cores Tailwind será estimado a partir dos tokens e confirmação visual em navegador, se disponível.
