# 7 - Sistemas de IA precisam saber falhar

Parsers falham. APIs ficam indisponíveis. Um documento pode ser difícil de interpretar.

Por isso, um pipeline confiável não assume que todas as etapas sempre funcionarão.

Estamos definindo estados claros para processamento, incluindo sucesso, sucesso com avisos, falha e necessidade de fallback.

Quando algo dá errado, o sistema preserva o diagnóstico e evita tratar um resultado incompleto como válido.

Esse comportamento é importante porque uma falha explícita pode ser revisada. Uma resposta incorreta e silenciosamente aceita pode não ser percebida.

Em aplicações com IA, segurança também significa saber quando não responder.

#AIEngineering #Reliability
