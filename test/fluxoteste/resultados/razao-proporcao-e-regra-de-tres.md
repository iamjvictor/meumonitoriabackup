# Simulação offline do fluxo de ingestão

> Não acessa banco, Storage ou LLM. O arquivo simula os registros que seriam persistidos e o contexto preparado para a IA.

- Documento: `razao-proporcao-e-regra-de-tres.pdf`
- Caminho: `/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/test/docsTeste/razao-proporcao-e-regra-de-tres.pdf`
- Páginas extraídas: **48**
- Blocos detectados: **120** (86 elegíveis, 34 rejeitados)
- Chunks simulados: **89**
- Chunks de questão: **55**
- Status dos chunks: `EMBEDDING_PENDING`

## Registros simulados

### document

| campo | valor |
| --- | --- |
| id | offline-document |
| originalName | razao-proporcao-e-regra-de-tres.pdf |
| pageCount | 48 |
| persistence | simulada neste Markdown |

### document_blocks

| tipo | quantidade |
| --- | ---: |
| ANSWER_KEY | 2 |
| DEFINITION | 1 |
| EXAMPLE | 16 |
| FORMULA | 2 |
| LIST | 3 |
| QUESTION | 65 |
| SUBSECTION | 20 |
| THEORY | 11 |

### descartes

| motivo | quantidade |
| --- | ---: |
| ANSWER_KEY_FRAGMENT | 1 |
| INVALID_QUESTION | 9 |
| ISOLATED_ALTERNATIVE | 1 |
| TOO_SHORT | 3 |
| UNSUPPORTED_BLOCK_TYPE | 20 |

### document_chunks

| id | block | tipo | questão | páginas | índice | tokens | status | conteúdo |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |
| chunk-1 | block-4 | THEORY | - | 3-3 | 0 | 215 | EMBEDDING_PENDING | De forma a entender o conceito de raz˜ ao, vamos ilustrar a seguir uma situa¸ c˜ ao bem interes- sante. Suponha que trˆ es amigos, Pedro, Jo˜ ao e M´ arcio, juntaram dinheiro e jogaram, juntos, na loteria. Como a contribui¸ c˜ ao realizada por cada um dos amigos foi diferente, logo, eles teriam direito a diferentes partes de um poss´ ıvel prˆ emio. Suponha que Pedro contribuiu com 9 reais, Jo˜ ao contribuiu com 16 reais e M´ arcio contribuiu com 15 reais. Quem dever´ a receber a maior quantia? Claramente vocˆ e ter´ a a resposta correta em mente, pois, como Jo˜ ao contribuiu com mais dinheiro para a aposta, de certo teria direito a maior parte do prˆ emio. Vamos supor ent˜ ao que os amigos ganharam um prˆ emio de R$ 100.000, |
| chunk-2 | block-5 | QUESTION | 00 | 3-3 | 0 | 231 | EMBEDDING_PENDING | 00. Que parte caber´ a a cada um deles, sendo levado em considera¸ c˜ ao para a divis˜ ao a contribui¸ c˜ ao dada por cada um para a aposta? Note que o total da aposta feita pelos amigos foi de 9 + 16 + 15 = 40. Logo, cada amigo dever´ a receber um valor de acordo com sua contribui¸ c˜ ao e em rela¸ c˜ ao ao todo apostado. Dessa maneira, receber˜ ao as seguintes fra¸ c˜ oes do prˆ emio: 9 16 15 Pedro: ; Jo˜ ao: ; M´ arcio: 40 40 40 Cada uma dessas fra¸ c˜ oes ´ e uma raz˜ ao , pois trata-se de uma rela¸ c˜ ao existente entre dois valores de mesma grandeza. A palavra raz˜ ao vem do latim ratio e significa “divis˜ ao”. Utili- zamos desse conceito quando queremos comparar duas quantidades em uma mesma categoria. Sendo assim, podemos agora definir o conceito de raz˜ ao. |
| chunk-3 | block-7 | THEORY | - | 3-4 | 0 | 110 | EMBEDDING_PENDING | a Defini¸ c˜ ao 1 (Raz˜ ao) A raz˜ ao entre dois n´ umeros a e b , sendo b 6 = 0 , ´ e o quociente ou a : b . b a Observa¸ c˜ ao: Lemos a raz˜ ao como, “ a est´ a para b ”. b Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-4 | block-8 | EXAMPLE | - | 4-4 | 0 | 70 | EMBEDDING_PENDING | Exemplo A raz˜ ao entre as idades das irm˜ as Beatriz e Fernanda ´ e . Isso significa que, para cada 2 anos de Beatriz, Fernanda tem 3 anos. Ent˜ ao, por exemplo, se Beatriz tiver 6 anos, logo Fernanda ter´ a 9 anos. |
| chunk-5 | block-9 | THEORY | - | 4-4 | 0 | 162 | EMBEDDING_PENDING | Importante! Quando se trata de raz˜ ao, ´ e muito importante a ordem em que as informa¸ c˜ oes aparecem. Como assim? No exemplo anterior, em que a raz˜ ao entre as idades das irm˜ as Beatriz e Fernanda ´ e , dissemos que Beatriz tem 2 e Fernanda tem 3 anos. Mas se diss´ essemos a raz˜ ao entre as idades de Fernanda e Beatriz, ent˜ ao ter´ ıamos a raz˜ ao inversa . Existem in´ umeras aplica¸ c˜ oes de raz˜ ao e, a seguir, vamos exemplificar algumas importantes, como a escala , a densidade demogr´ afica , velocidade m´ edia e vaz˜ ao . |
| chunk-6 | block-10 | DEFINITION | - | 4-4 | 0 | 63 | EMBEDDING_PENDING | Escala: ´ e a raz˜ ao entre a dimens˜ ao do desenho ( d ) e a dimens˜ ao real do objeto por ele re- presentado ( r ). E comumente utilizado em mapas para representar distˆ ´ ancias. Assim, podemos escrever: d E = r |
| chunk-7 | block-11 | EXAMPLE | - | 4-5 | 0 | 195 | EMBEDDING_PENDING | Exemplo Quando vemos, por exemplo, uma miniatura que foi fabricada com uma escala de 1 : 200, isso quer dizer que a cada 1 cm da miniatura corresponde a 200 cm ou 2 m do objeto real. Ent˜ ao, suponhamos que a miniatura possua 7 cm de comprimento, ent˜ ao o objeto ter´ a 1400 cm ou 14 m de comprimento real. Densidade Demogr´ afica: tamb´ em chamada de densidade populacional, ´ e a raz˜ ao entre o n´ umero de habitantes ou popula¸ c˜ ao ( h ) e a superf´ ıcie do territ´ orio por eles habitada ( a ). Assim, podemos escrever: h Dd = a Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-8 | block-12 | EXAMPLE | - | 5-6 | 0 | 381 | EMBEDDING_PENDING | Exemplo Segundo o Instituto Brasileiro de Geografia e Estat´ ıstica (IBGE, 2016), o Estado do Rio de Janeiro apresenta uma densidade demogr´ afica de 365,23 hab/km 2 , sendo o segundo Estado com a maior densidade populacional do Brasil, superando S˜ ao Paulo com 166,23 hab/km 2 e ficando atr´ as do Distrito Federal, com uma densidade populacional de 444,66 hab/km 2 . Sabendo que o Estado do Rio de Janeiro apresenta uma densidade demogr´ afica de 365,23 hab/km 2 e possui um territ´ orio de 43.696.000.000 m 2 , Determine o n´ umero de habitantes do Estado do Rio de Janeiro. Solu¸ c˜ ao: Sabemos que, 43 . 696 . 000 . 000 m 2 = 43 . 696 km 2 , assim: h Dd = a h 65 , 23 = 43696 h = 365 , 23 · 43696 h ≈ 15 . 959 . 090 Dessa maneira, o Estado do Rio de Janeiro possui, aproximadamente, uma popula¸ c˜ ao de 15.959.090 habitantes. Vocˆ e sabe por que foi necess´ ario converter a unidade de medida? D´ uvidas sobre Velocidade M´ edia: ´ e a raz˜ ao entre a distˆ ancia percorrida e o tempo gasto para percorrer tal distˆ ancia. Assim, podemos escrever: d V m = t Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-9 | block-13 | EXAMPLE | - | 6-7 | 0 | 494 | EMBEDDING_PENDING | Exemplo H´ a mais de 10 anos, Usain Bolt bateu o recorde dos 100 metros em Berlim, em uma prova que lhe deu o t´ ıtulo mundial, com a impressionante marca de 9,58 segundos, que ainda hoje perdura como m´ aximo absoluto. Sabendo disso, qual foi a velocidade m´ edia de Bolt durante a prova? Solu¸ c˜ ao: Sabemos que: d V m = t V m = 9 , 58 V m ≈ 10 , 44 m/s Dessa forma, Usain Bolt completou a prova com a incr´ ıvel marca de 10,44 m/s. Vocˆ e sabe quanto ´ e essa velocidade em km/h? Vocˆ e n˜ ao se lembra como fazer a convers˜ ao de medidas de velocidade? A gente te conceitos. Vaz˜ ao: de forma sint´ etica, vaz˜ ao ´ e a raz˜ ao entre a quantidade de flu´ ıdo que passa por uma se¸ c˜ ao transversal de um duto por unidade de tempo. Assim, se afirmamos que uma torneira tem vaz˜ ao igual a 15 litros por minuto, ent˜ ao entende- se que a cada minuto passam por essa torneira 15 litros de ´ agua. Para medir a vaz˜ ao de uma torneira, poder´ ıamos encher, por exemplo, um balde de 12 litros e marcar o tempo que essa tor- neira levou para enchˆ e-lo. Suponha que esse tempo seja igual a 30 minutos. Qual a vaz˜ ao? Ora, 12 1 basta fazer a conta = 0 , 4 L/min . Se preferir, vocˆ e pode observar que 30 min = hora , 30 2 12 2 portanto, a vaz˜ ao pode ser calculada da seguinte maneira: = 12 · = 24 L/hora . 1 1 Dessa forma, podemos escrever: c V z = t Onde V z ´ e a vaz˜ ao, c a capacidade ou volume e t o tempo. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-10 | block-14 | EXAMPLE | - | 7-8 | 0 | 424 | EMBEDDING_PENDING | Exemplo Uma torneira sozinha enche um tanque em 6 horas enquanto outra torneira, tamb´ em sozinha, enche o mesmo tanque em 30 horas. Em quanto tempo as duas tornei- ras juntas enchem o tanque? (Tente fazer primeiro antes de ler a solu¸ c˜ ao desse problema.) Solu¸ c˜ ao: Uma forma de resolver esse problema ´ e usando o conceito de Vaz˜ ao . Seja t nossa inc´ ognita, ou seja, o tempo necess´ ario para que as duas torneira, juntas, encham o tangue. Vamos chamar de V 1 a vaz˜ ao da primeira torneira e V 2 a vaz˜ ao da segunda. Suponha que volume do tangue seja igual a c . c c Portanto, V 1 = e V 2 = . 6 30 Podemos imaginar que as duas torneiras juntas formem uma s´ o quando acionadas simultaneamente para encher o tanque e a vaz˜ ao dessa ´ unica torneira pode ser calculada de duas formas: • somando as duas vaz˜ oes; • dividindo o volume do tanque pelo tempo que as duas torneiras, juntas, levam para encher o tanque. Igualando as duas formas, temos: c  c  c  + = (Dividimos por c 6 = 0) 6 30 t 1 1 1 + = (Note que o MMC entre 6 e 30 ´ e 30.) 6 30 t 5 + 1 1 = 30 t 6 1 = 30 t 6 t = 30 t = = 5 Portanto, as duas torneiras, juntas, enchem o tanque em 5 horas. Concorda com a resposta? Pense um pouco. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-11 | block-15 | EXAMPLE | - | 8-9 | 0 | 285 | EMBEDDING_PENDING | Exemplo (UERJ 2017) No mapa, o trajeto total da tocha ol´ ımpica em territ´ orio brasileiro mede cerca de 72 cm, considerando os trechos por via a´ erea e por terra. A distˆ ancia real, em quilˆ ometros, percorrida pela tocha em seu trajeto completo ´ e de, aproximadamente: a) 3600 b) 7000 c) 36000 d)70000 Solu¸ c˜ ao: A escala dada pela figura, 1:50.000. 000. De acordo com a defini¸ c˜ ao de escala, significa que, para cada 1 cm no desenho, tˆ em-se 50.000.000 cm no real. Como no mapa, o percurso da tocha foi de 72 cm ent˜ ao no real temos: 72 · 50 . 000 . 000 = 3 . 600 . 000 . 000 cm = 36 . 000 km Assim, a distˆ ancia real percorrida pela tocha foi de 36.000 km. disponibilizado acima e assistindo ao v´ ıdeo. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-12 | block-16 | EXAMPLE | - | 9-10 | 0 | 426 | EMBEDDING_PENDING | Exemplo (ENEM 2010) Um professor dividiu a lousa da sala de aula em quatro partes iguais. Em seguida, preencheu 75% dela com conceitos e explica¸ c˜ oes, conforme a figura seguinte. Algum tempo depois, o professor apagou a lousa por completo e, adotando um procedimento semelhante ao anterior, voltou a preenchˆ e-la, mas, dessa vez, utilizando 40% do espa¸ co dela. Uma representa¸ c˜ ao poss´ ıvel para essa segunda situa¸ c˜ ao ´ e: Solu¸ c˜ ao: Diversos conceitos que utilizamos podem ser representados por raz˜ oes. Nesse exem- plo em quest˜ ao, o conceito de porcenta- gem tem o mesmo significado de raz˜ ao, pois porcentagem significa por cento , logo, expressa uma fra¸ c˜ ao de um n´ umero sobre 100. Quando o professor apagou a lousa e voltou a preenchˆ e-la,+ utilizando 40%, 40 2 nos podemos escrever: 40% = = 100 5 Dessa forma, a raz˜ ao , significado que o professor dividiu a lousa em 5 partes e utilizou apenas duas, logo, a representa¸ c˜ ao correta ´ e a letra C. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino a c Defini¸ c˜ ao 2 (Propor¸ c˜ ao) Sendo as raz˜ oes e , com b, d 6 = 0 , a igualdade entre duas raz˜ oes, b d a c ou seja, = , ´ e chamada Propor¸ c˜ ao . b d a c Observa¸ c˜ ao : Lemos a propor¸ c˜ ao = como, “ a est´ a para b , assim como, c est´ a para d . b d |
| chunk-13 | block-19 | FORMULA | - | 10-10 | 0 | 139 | EMBEDDING_PENDING | Propriedade Fundamental das Propor¸ c˜ oes (PFP): = se, e somente se, a · d = b · c . b d Essa propriedade ´ e comumente chamada de “produto dos meios ´ e igual ao produto dos extremos”. Os alunos e alunas, costumam chamar de “multiplicar cruzado”. De qualquer formar, sempre valer´ a que: a c = ⇔ a · d = b · c b d onde, M eios ︷ ︸︸ ︷ a ÷ b = c ÷ d ︸ ︷︷ ︸ Extremos |
| chunk-14 | block-20 | EXAMPLE | - | 10-11 | 0 | 147 | EMBEDDING_PENDING | Exemplo 5 x Determine o valor de x na propor¸ c˜ ao = . 3 27 Solu¸ c˜ ao: 3 · x = 5 · 27 x = x = 45 Coment´ ario: Consideramos importante que o estudante reflita o porquˆ e a PFP ´ e verda- deira. Em outras palavras, o que justifica “multiplicar cruzado”? Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino Vocˆ e lembra de fra¸ c˜ oes equivalentes? Ent˜ ao, considere, por 2 8 |
| chunk-15 | block-21 | EXAMPLE | - | 11-12 | 0 | 348 | EMBEDDING_PENDING | exemplo, as fra¸ c˜ oes e . Essas fra¸ c˜ oes s˜ ao equivalentes, 5 20 pois ambas representam o mesmo n´ umero, no caso, o n´ umero 2 8 0 , 4. Portanto, podemos escrever = e ao “multiplicar cru- 5 20 zado”teremos 2 · 20 = 8 · 5, que, obviamente, ´ e verdade. a c 1 a propriedade: Considere a propor¸ c˜ ao = . A soma do numerador com o respectivo b d denominador da primeira raz˜ ao est´ a para seu denominador, assim como, a soma do numerador com o respectivo denominador da segunda raz˜ ao est´ a para seu denominador, ou seja, a + b c + d = b d Prova a c = b d a c + 1 = + 1 (Somamos 1 em cada membro da equa¸ c˜ ao) b d a b c d + = + (Substitu´ ımos o 1 de cada membro por uma fra¸ c˜ ao.) b b d d a + b c + d = b d Da mesma forma, vocˆ e pode mostrar que, a + b c + d = a c bastando para isso utilizar o inverso das raz˜ oes. Deixamos como exerc´ ıcio para vocˆ e. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-16 | block-22 | EXAMPLE | - | 12-14 | 0 | 331 | EMBEDDING_PENDING | Sabendo que x + y = 16, determine o valor de x e y na propor¸ c˜ ao = . y 4 Solu¸ c˜ ao: Aplicando a 1 a propriedade temos, ︷ ︸︸ ︷ x + y 3 + 4 = y 4 16 7 = y 4 Usando a propriedade fundamental das propor¸ c˜ oes: 7 y = 16 · 4 y = Agora devemos estabelecer o valor de x . Sabemos que x + y = 16 e que y = , ent˜ ao: x + y = 16 x + = 16 x = 16 − x = Observa¸ c˜ ao: Poder´ ıamos, para determinar o valor de x , ter invertido as raz˜ oes e x 3 y 4 em seguida aplicado a 1 a propriedade. = ⇔ = y 4 x 3 ︷ ︸︸ ︷ y + x 4 + 3 = x 3 16 7 = x 3 7 x = 16 · 3 x = Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino 2 a propriedade: Essa propriedade ´ e bastante similar ` a propriedade anterior. Ao inv´ es de a c adi¸ c˜ ao, teremos a subtra¸ c˜ ao. Considere a propor¸ c˜ ao = . |
| chunk-17 | block-22 | EXAMPLE | - | 12-14 | 1 | 500 | EMBEDDING_PENDING | c˜ ao, teremos a subtra¸ c˜ ao. Considere a propor¸ c˜ ao = . A aplicabilidade ´ e similar ao exemplo dado na propriedade anterior. Aten¸ c˜ ao: Cuidado para n˜ ao “cortar” o que n˜ ao deve! a − b  c − S d  S N˜ ao fa¸ ca: = . b  S d  S 12 − 4  Por exemplo, ´ e errado fazer . 4  12 − 4 8 Proceda normalmente: = = 2. 4 4 Conta-se que todas as vezes que um estudante comete um erro assim, um urso Panda morre. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino 3 a Propriedade: A soma dos numeradores est´ a para a soma dos numeradores, assim como cada numerador est´ a para seu respectivo denominador, ou seja, a + c a c = = b + d b d Prova a c Iniciamos permutando os extremos da propor¸ c˜ ao = . Essa opera¸ c˜ ao ´ e v´ alida, conforme b d d c a propriedade fundamental das propor¸ c˜ oes, vista anteriormente. Assim teremos: = . b a Aplicamos agora a primeira propriedade: b + d a + c = b a Novamente trocamos os extremos: a a + c = b b + d c Permutando os meios ao inv´ es dos extremos, vocˆ e obter´ a a igualdade com . d Observa¸ c˜ ao: E comum vermos em outros materiais, sendo livros ou apostilas, as palavras ´ antecedente , para representar o numerador, e consequente , para representar o denominador de uma raz˜ ao. 4 a Propriedade: A diferen¸ ca dos numeradores est´ a para a diferen¸ ca dos denominadores, assim como, cada numerador est´ a para seu respectivo denominador, ou seja, a − c a c = = b − d b d Deixaremos a prova dessa propriedade para vocˆ e, uma vez que ela ´ e an´ aloga ` a prova da |
| chunk-18 | block-23 | FORMULA | - | 14-15 | 0 | 55 | EMBEDDING_PENDING | propriedade anterior. Ao inv´ es de usar a primeira propriedade vocˆ e dever´ a utilizar a segunda. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-19 | block-24 | EXAMPLE | - | 15-16 | 0 | 458 | EMBEDDING_PENDING | Exemplo a b Sabendo que a − b = 3, determine o valor de a e b na seguinte propor¸ c˜ ao: = . 3 5 Solu¸ c˜ ao: a − b a Utilizando a 4 a propriedade, temos: = . Logo, 3 − 5 3 3 a = − 2 3 − 2 a = 9 a = − Para descobrir o valor de b , voltamos em a − b = 3 e substitu´ ımos a = − . Assim: − − b = 3 b = − 3 − b = − Observa¸ c˜ ao: Se vocˆ e quiser verificar a solu¸ c˜ ao, basta substituir os valores encontrados na equa¸ c˜ ao a − b = 3. Se tivermos uma igualdade verdadeira, ent˜ ao nossa solu¸ c˜ ao para o problema est´ a correta. Caso contr´ ario, erramos em algum ponto e ser´ a necess´ ario refazer os c´ alculos. a b Essa substitui¸ c˜ ao tamb´ em pode ser feita na propor¸ c˜ ao dada = . 3 5 5 a Propriedade: O produto dos numeradores est´ a para o produto dos denominadores, assim como o quadrado de cada numerador est´ a para quadrado do seu respectivo denominador, ou seja, a · c a 2 c 2 = = b · d b 2 d 2 Prova a c a Vamos tomar a propor¸ c˜ ao = e multiplicar ambos os membros por , assim: b d b Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino a a c a · = · b b d b a · c a 2 = b · d b 2 c 2 c Da mesma forma vocˆ e obt´ em o resultado para a igualdade , apenas utilizando a raz˜ ao d 2 d como fator multiplicativo na prova acima. |
| chunk-20 | block-28 | QUESTION | 2 | 18-18 | 0 | 21 | EMBEDDING_PENDING | 2. Verifique se a raz˜ ao ´ e igual ` a raz˜ ao . 35 100 |
| chunk-21 | block-29 | QUESTION | 3 | 18-18 | 0 | 25 | EMBEDDING_PENDING | 3. Um produto que custa R$ 24,00 para ser fabricado ´ e vendido por R$ 38, |
| chunk-22 | block-30 | QUESTION | 00 | 18-18 | 0 | 38 | EMBEDDING_PENDING | 00. Determine a raz˜ ao entre: a) o pre¸ co de venda e o pre¸ co de custo. b) o lucro e o pre¸ co de venda. |
| chunk-23 | block-32 | QUESTION | 5 | 18-18 | 0 | 38 | EMBEDDING_PENDING | 5. Uma loja vendeu de uma pe¸ ca de tecido e depois do restante. O que sobrou foi 5 12 vendido por R$ 1.400, |
| chunk-24 | block-33 | QUESTION | 00 | 18-18 | 0 | 128 | EMBEDDING_PENDING | 00. Sabendo-se que o tecido foi vendido a R$ 5,00 o metro, o comprimento inicial da pe¸ ca era de: a) 200m b) 400m c) 800m d) 1.200m e) 1.600m 1 5 6. Um estudante gastou do seu sal´ ario com alimenta¸ c˜ ao. do que sobrou com educa¸ c˜ ao 7 6 e outras despesas. Restaram, ainda, R$ 286, 34. O seu sal´ ario ´ e de: |
| chunk-25 | block-35 | QUESTION | 7 | 18-19 | 0 | 180 | EMBEDDING_PENDING | 7. (UERJ 2017) Um anel cont´ em 15 gramas de ouro 16 quilates. Isso significa que o anel cont´ em 10 g de ouro puro e 5 g de uma liga met´ alica. Sabe-se que o ouro ´ e considerado 18 quilates se h´ a a propor¸ c˜ ao de 3 g de ouro puro para 1 g de liga met´ alica. Para transformar esse anel de ouro 16 quilates em outro de 18 quilates, ´ e preciso acrescentar a seguinte quantidade, em gramas, de ouro puro: a) 6 b) 5 c) 4 d) 3 Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-26 | block-36 | QUESTION | 8 | 19-19 | 0 | 216 | EMBEDDING_PENDING | 8. (UFF 2004) Dos 135 funcion´ arios de uma empresa localizada em Niter´ oi, moram na cidade do Rio de Janeiro. Dos funcion´ arios que moram na cidade do Rio de Janeiro, usam onibus at´ ˆ e a esta¸ c˜ ao das barcas e, em seguida, pegam uma barca para chegar ao trabalho. Sabe-se que 24 funcion´ arios da empresa usam exclusivamente seus pr´ oprios autom´ oveis para chegar ao trabalho, sendo que destes n˜ ao mora na cidade do Rio de Janeiro. Os demais funcion´ arios da empresa usam somente ˆ onibus para chegar ao trabalho. Determine: a) o n´ umero de funcion´ arios da empresa que usam somente ˆ onibus para chegar ao trabalho; b) o n´ umero de funcion´ arios da empresa que usam somente ˆ onibus para chegar ao trabalho e que n˜ ao moram na cidade do Rio de Janeiro. |
| chunk-27 | block-37 | QUESTION | 9 | 19-19 | 0 | 124 | EMBEDDING_PENDING | 9. (Vunesp) Um t´ ecnico de laborat´ orio manipula dois recipientes que contˆ em mistura das substˆ ancias A e B. Embora os volumes das substˆ ancias sejam iguais, num dos recipientes a 1 3 propor¸ c˜ ao de A para B ´ e (uma parte de A para duas de B) e no outro ´ e . Se ele juntar os 2 4 dois conte´ udos num ´ unico recipiente, qual passar´ a a ser a propor¸ c˜ ao de A para B? |
| chunk-28 | block-38 | QUESTION | 10 | 19-19 | 0 | 128 | EMBEDDING_PENDING | 10. (OBMEP 2006) Em uma caixa quadrada h´ a 4 bolas brancas e 2 bolas pretas, e numa caixa redonda h´ a 6 bolas, todas pretas. Paula quer que tanto na caixa quadrada quanto na redonda a raz˜ ao entre a quantidade de bolas brancas e o total de bolas em cada caixa seja a mesma. Quantas bolas brancas Paula precisa tirar da caixa quadrada e passar para a caixa redonda? a) Nenhuma b) 1 c) 2 d) 3 e) 4 |
| chunk-29 | block-39 | QUESTION | 10 | 19-20 | 0 | 169 | EMBEDDING_PENDING | 10. (OBMEP 2017) Para obter tinta de cor laranja, devem-se misturar 3 partes de tinta vermelha com 2 partes de tinta amarela. Para obter tinta de cor verde, devem-se misturar 2 partes de tinta azul com 1 parte de tinta amarela. Para obter tinta de cor marrom, deve-se misturar a mesma quantidade de tintas laranja e verde. Quantos litros de tinta amarela s˜ ao necess´ arios para obter 30 litros de tinta marrom? a) 7 b) 8 c) 9 d) 10 e) 11 Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-30 | block-41 | QUESTION | 11 | 20-20 | 0 | 212 | EMBEDDING_PENDING | 11. (ENEM 2011) Uma empresa possui um sistema de controle de qualidade que classifica o seu desempenho financeiro anual, tendo como base o do ano anterior. Os conceitos s˜ ao: insuficiente, quando o crescimento ´ e menor que 1%; regular, quando o crescimento ´ e maior ou igual a 1% e menor que 5%; bom, quando o crescimento ´ e maior ou igual a 5% e menor que 10%; ´ otimo, quando ´ e maior ou igual a 10% e menor que 20%; e excelente, quando ´ e maior ou igual a 20%. Essa empresa apresentou lucro de R$ 132.000,00 em 2008 e de R$ 145.000,00 em 2009. De acordo com esse sistema de controle de qualidade, o desempenho financeiro dessa em- presa no ano de 2009 deve ser considerado: a) insuficiente b) regular c) bom d) ´ otimo e) excelente |
| chunk-31 | block-42 | QUESTION | 12 | 20-20 | 0 | 253 | EMBEDDING_PENDING | 12. (ENEM 2010) No monte de Cerro Armazones, no deserto de Atacama, no Chile, ficar´ a o maior telesc´ opio da superf´ ıcie terrestre, o Telesc´ opio Europeu Extremamente Grande (E-ELT). O E-ELT ter´ a um espelho prim´ ario de 42 m de diˆ ametro, “o maior olho do mundo voltado para o c´ eu”. Dispon´ ıvel em: http://www.estadao.com.br. Acesso em: 27 abr. 2010 (adaptado). Ao ler esse texto em uma sala de aula, uma professora fez uma suposi¸ c˜ ao de que o diˆ ametro do olho humano mede aproximadamente 2,1 cm. Qual a raz˜ ao entre o diˆ ametro aproximado do olho humano, suposto pela professora, e o diˆ ametro do espelho prim´ ario do telesc´ opio citado? a) 1 : 20 b) 1 : 100 c) 1 : 200 d) 1 : 1 000 e) 1 : 2 000 |
| chunk-32 | block-44 | QUESTION | 15 | 21-22 | 0 | 465 | EMBEDDING_PENDING | 15. (ENEM 2011) Sabe-se que a distˆ ancia real, em linha reta, de uma cidade A, localizada no estado de S˜ ao Paulo, a uma cidade B, localizada no estado de Alagoas, ´ e igual a 2000 km. Um estudante, ao analisar um mapa, verificou com sua r´ egua que a distˆ ancia entre essas duas cidades, A e B, era 8 cm. Os dados nos indicam que o mapa observado pelo estudante est´ a na escala de: a) 1 : 250 b) 1 : 2 500 c) 1 : 25 000 d) 1 : 250 000 e) 1 : 25 000 000 16. (ENEM 2012) O esporte de alta competi¸ c˜ ao da atualidade produziu uma quest˜ ao ainda sem resposta: Qual ´ e o limite do corpo humano? O maratonista original, o grego da lenda, morreu de fadiga por ter corrido 42 quilˆ ometros. O americano Dean Karnazes, cruzando sozinho as plan´ ıcies da Calif´ ornia, conseguiu correr dez vezes mais em 75 horas. Um professor de Educa¸ c˜ ao F´ ısica, ao discutir com a turma o texto sobre a capacidade do maratonista americano, desenhou na lousa uma pista reta de 60 cent´ ımetros, que representaria o percurso referido. Dispon´ ıvel em: http://veja.abril.com.br. Acesso em: 25 jun. 2011 (adaptado). Se o percurso de Dean Karnazes fosse tamb´ em em uma pista reta, qual seria a escala entre a pista feita pelo professor e percorrida pelo atleta? a) 1:700 b) 1:7.000 c) 1:70.000 d) 1:700.000 e) 1:7.000.000 Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-33 | block-45 | QUESTION | 17 | 22-22 | 0 | 245 | EMBEDDING_PENDING | 17. (ENEM 2010) As Olimp´ ıadas de 2016 ser˜ ao realizadas no RJ. Uma das modalidades que trazem esperan¸ cas de medalhas para o Brasil ´ e a nata¸ c˜ ao. Ali´ as, a piscina ol´ ımpica merece uma aten¸ c˜ ao devido suas dimens˜ oes. Piscinas ol´ ımpicas tem 50 m de comprimento e 25 m de largura. Se a piscina Ol´ ımpica fosse representada em uma escala de 1:100, ela ficaria com medidas de: a) 0,5 cent´ ımetro de comprimento e 0,25 cent´ ımetro de largura. b) 5 cent´ ımetros de comprimento e 2,5 cent´ ımetros de largura. c) 50 cent´ ımetros de comprimento e 25 cent´ ımetros de largura. d) 500 cent´ ımetros de comprimento e 250 cent´ ımetros de largura. e) 200 cent´ ımetros de comprimento e 400 cent´ ımetros de largura. |
| chunk-34 | block-46 | QUESTION | 18 | 22-22 | 0 | 219 | EMBEDDING_PENDING | 18. (ENEM 2017) Uma televis˜ ao pode ser posicionada de modo que se consiga enxergar os detalhes de uma imagem em alta defini¸ c˜ ao. Considere que a distˆ ancia ideal, com conforto vi- sual, para se assistir ` a televis˜ ao de 32 polegadas ´ e de 1,8 metro. Suponha que haja uma rela¸ c˜ ao de proporcionalidade direta entre o tamanho da tela (medido em polegada) e a distˆ ancia ideal. Considere que um espectador disp˜ oe de uma televis˜ ao de 60 polegadas e que ele deseja se po- sicionar em frente a ela, com conforto visual. A distˆ ancia da televis˜ ao, em metro, em que o espectador deve se posicionar para que tenha conforto visual ´ e mais pr´ oxima de a) 0,33 b) 0,96 c) 1,57 d) 3,37 e) 3,60 |
| chunk-35 | block-51 | THEORY | - | 23-24 | 0 | 238 | EMBEDDING_PENDING | Na vida e na sociedade, as grandezas e as medidas est˜ ao presentes em quase todas as ati- vidades realizadas, por isso ´ e de fundamental importˆ ancia entender como aplicar os racioc´ ınios que envolvem medidas e grandezas associando-os aos fenˆ omenos quantitativos do mundo em que vivemos. Mas afinal de contas, o que ´ e grandeza? Grandeza ´ e tudo que pode ser medido e, dessa forma, seu valor pode variar, aumentando ou diminuindo. Temos como exemplos de grandezas: o comprimento, a massa, o volume, o tempo, a tempera- tura, a distˆ ancia, a velocidade, entre outras. Estaremos interessados em estudar dois tipos de comportamentos que ocorrem quando as grandezas sofrem varia¸ c˜ oes mas apresentam um padr˜ ao de regularidade. Nesse sentido, chama- remos as grandezas de diretamente proporcionais ou inversamente proporcionais . Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-36 | block-53 | THEORY | - | 24-24 | 0 | 263 | EMBEDDING_PENDING | Dizemos que duas grandezas s˜ ao diretamente proporcionais quando est˜ ao relacionadas de forma que, a raz˜ ao entre elas ´ e uma constante real e positiva. O professor Geraldo Avila ´ ( AVILA, 1986) melhor apresenta essa defini¸ ´ c˜ ao: Defini¸ c˜ ao 3 (Grandezas Diretamente Proporcionais) Diz-se que duas vari´ aveis (ou gran- dezas) x e y s˜ ao proporcionais – mais especificamente, diretamente proporcionais – se estiverem assim relacionadas: y = k · x ou y = k , onde k ´ e uma constante positiva, chamada constante x de proporcionalidade. De acordo com a defini¸ c˜ ao acima, temos que duas sucess˜ oes biun´ ıvocas, A = ( a 1 , a 2 , a 3 , ... ) e B = ( b 1 , b 2 , b 3 , ... ), de n´ umeros, reais e positivos, s˜ ao diretamente proporcionais se: a 1 a 2 a 3 = = = ... = k b 1 b 2 b 3 em que k ´ e chamada de constante de proporcionalidade . |
| chunk-37 | block-54 | EXAMPLE | - | 24-25 | 0 | 389 | EMBEDDING_PENDING | Exemplo Vamos tomar como exemplo, o pre¸ co a ser pago por determinada quantidade de gasolina em um Posto de combust´ ıvel. Pre¸ co (reais) 4 8 12 ... 40 ... ? Note que quando compramos apenas 1 litro de gasolina, pagamos o valor de R$ 4,00. Logo, se comprarmos o dobro de gasolina, pagaremos o dobro do pre¸ co, se compramos o triplo de gasolina, pagaremos o triplo do pre¸ co, assim por diante, sempre na mesma propor¸ c˜ ao . E aqui est´ a o significado de propor¸ c˜ ao direta, pois se comprarmos x litros de gasolina, devemos pagar um valor y que, necessariamente, dever´ a ser um m´ ultiplo de 4, ou seja, 4 x reais e, dessa maneira, as grandezas est˜ ao relacionadas pela equa¸ c˜ ao y = 4 · x . Se vocˆ e foi observador, na tabela n˜ ao temos o pre¸ co a ser pago por 17 litros do combust´ ıvel. Mas agora j´ a sabemos que o valor a ser pago ser´ a: y = 4 x = 4 · 17 = 68 reais Como gasolina ( x ) e pre¸ co ( y ) se relacionam como y = 4 x . Podemos escrever tamb´ em y = 4, assim os n´ umeros que expressam as grandezas variam na mesma raz˜ ao ( k ), x chamada de constante de proporcionalidade . Podemos escrever: y y = kx ou = k x Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-38 | block-56 | THEORY | - | 25-25 | 0 | 226 | EMBEDDING_PENDING | Dizemos que duas grandezas s˜ ao inversamente proporcionais quando est˜ ao relacionadas de forma que, o produto entre elas ´ e uma constante real e positiva. Novamente recorremos a defini¸ c˜ ao dada por ( AVILA, 1986): ´ Defini¸ c˜ ao 4 (Grandezas Inversamente Proporcionais) Diz-se que as vari´ aveis x e y s˜ ao inversamente proporcionais se y = k ou x · y = k , onde k ´ e uma constante positiva (constante x de proporcionalidade). Portanto, temos que duas sucess˜ oes biun´ ıvocas, A = ( a 1 , a 2 , a 3 , ... ) e B = ( b 1 , b 2 , b 3 , ... ), de n´ umeros, reais e positivos, s˜ ao inversamente proporcionais se: a 1 · b 1 = a 2 · b 2 = a 3 · b 3 = ... = k |
| chunk-39 | block-57 | EXAMPLE | - | 25-26 | 0 | 378 | EMBEDDING_PENDING | Exemplo Vamos usar o conceito de vaz˜ ao para ilustrar uma situa¸ c˜ ao com duas grandezas inversamente proporcionais. Imagine uma piscina cuja capacidade seja de 12.000 litros de ´ agua. Uma mangueira ´ e posta para encher a piscina. Quanto tempo levar´ a para essa piscina ser totalmente preenchida com ´ agua? Depende da vaz˜ ao da mangueira! Concorda? A tabela a seguir apresenta algumas possibilidades para a vaz˜ ao de uma mangueira e o tempo que levaria para encher a piscina. Vaz˜ ao ( L/h ) Tempo (Hora) A primeira linha da tabela ao lado indica 100 120 que para uma mangueira com vaz˜ ao igual a 150 80 100 litros por hora, precisamos de 120 ho- 200 60 ras para encher a piscina. De fato, se em 1 300 40 hora 100 litros s˜ ao “despejados”, ent˜ ao em 400 30 120 horas teremos 120 × 100 = 12000 litros de ´ agua. Observe na tabela acima que quando a vaz˜ ao dobra ou triplica o tempo fica reduzido para metade ou ter¸ ca parte, respectivamente. c O conceito de vaz˜ ao, definido anteriormente, ´ e: V z = ⇒ V z · t = c . Sendo c uma t constante, nesse caso, c = 12000, temos que vaz˜ ao e tempo s˜ ao grandezas inversamente proporcionais. Note que o produto entre os termos de cada linha ´ e sempre igual a 12000. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-40 | block-58 | EXAMPLE | - | 26-28 | 0 | 465 | EMBEDDING_PENDING | percurso levando-se em conta a velocidade m´ edia ( km/h ) do ve´ ıculo. Velocidade (km/h) 40 50 ... 80 100 120 Tempo (hora) 10 8 ... 5 4 ? Note que quando a velocidade m´ edia ´ e de 40 km/h, o tempo gasto em viagem ´ e de 10 h. Se o condutor aumenta a velocidade, fazendo com que a velocidade m´ edia atinja 80 km/h, ou seja, dobre, o tempo de viagem reduz para 4h, isto ´ e, metade. Se compararmos com o triplo da velocidade m´ edia, o tempo reduz a ter¸ ca parte, assim por diante, sempre na propor¸ c˜ ao inversa . E aqui vemos, mais um vez, o significado de propor¸ c˜ oes, onde velocidade e tempo se relacionam de maneira inversa. Se vocˆ e foi um bom observador viu que na tabela n˜ ao temos o tempo de viagem para uma velocidade m´ edia de 120 km/h. Mas, pelo que vimos, 120 km/h ´ e o triplo de 40 km/h, como a propor¸ c˜ ao ´ e inversa, o tempo gasto dever´ a ser a ter¸ ca parte de 10h. Temos: 10 h 10 · 60 min 600 min = = = 200 min = 3 h 20 min 3 3 3 Observa¸ c˜ ao: Poder´ ıamos sim, ter dividido a fra¸ c˜ ao inicial, mas ter´ ıamos uma d´ ızima peri´ odica como resposta ou ter´ ıamos que fazer uma aproxima¸ c˜ ao. Veja: = 3 , 33 ... ≈ 3 , 3h. Cuidado! 0,3h n˜ ao s˜ ao 3 minutos ou 30 minutos. Note que, se compararmos com o Temos que a velocidade m´ edia ( y ) para percorrer k quilˆ ometros em determinado tempo k ( x ) ´ e: y = . |
| chunk-41 | block-58 | EXAMPLE | - | 26-28 | 1 | 500 | EMBEDDING_PENDING | y ) para percorrer k quilˆ ometros em determinado tempo k ( x ) ´ e: y = . diminui e vice-versa, sempre na constante de proporcionalidade k . Podemos escrever: k y = ou y · x = k x Observa¸ c˜ ao: Vocˆ e pode verificar ainda que se multiplicarmos os n´ umeros das colunas na tabela, sempre teremos a mesma constante. E importante destacar que nem sempre duas grandezas s˜ ´ ao diretamente ou inversamente proporcionais. Tomemos, como exemplo, o caso da rela¸ c˜ ao entre o lado de um quadrado e sua area. A figura, a seguir, mostra claramente que, se dobrarmos o lado do quadrado, sua ´ ´ area n˜ ao fica multiplicada por 2 e sim, quadruplicada. N˜ ao sendo, portanto, grandezas proporcionais. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino N˜ ao h´ a propor¸ c˜ ao entre lado e ´ area de um quadrado. Observe a tabela a seguir: Lado 1 2 3 4 ... Area ´ 1 4 9 16 ... Raz˜ ao entre Lado e Area ´ 1 1 1 1 ... 2 3 4 Quando estudamos grandezas proporcionais, em muitos casos, recorremos a simplifica¸ c˜ oes para entender os conceitos envolvidos no conte´ udo. Nos exemplos a seguir, vamos pensar mais um pouco sobre isso e ver alguns casos de quando isso acontece. Vamos pensar mais um pouco... Por exemplo, podemos supor que o gasto de energia el´ etrica e o valor a ser pago s˜ ao diretamente proporcionais, uma vez que dobrando o consumo de energia, teremos de pagar o dobro do pre¸ co. Mas, se trouxermos o exemplo para a realidade, faz sentido pensarmos nas bandeiras de consumo (verde, amarela e vermelha) e nas tarifas por faixa de consumo que podem modificar, de um mˆ es para o outro, e alteram o valor do kW, podendo fazer com que as grandezas deixem de ser proporcionais. Vamos pensar agora em uma outra situa¸ c˜ ao. |
| chunk-42 | block-58 | EXAMPLE | - | 26-28 | 2 | 366 | EMBEDDING_PENDING | que podem modificar, de um mˆ es para o outro, e alteram o valor do kW, podendo fazer com que as grandezas deixem de ser proporcionais. Vamos pensar agora em uma outra situa¸ c˜ ao. mercado, dever´ a pagar o pre¸ co x , se compra 3 caixas, pagar´ a 3 x . Nesse racioc´ ınio, dizemos que as grandezas s˜ ao diretamente proporcionais. Mas, vamos supor que vocˆ e precise de um n´ umero elevado de caixas de leite, ´ e sensato supor que vocˆ e poder´ a negociar um desconto com o gerente e, assim, as grandezas deixariam de ser proporcionais. Outa situa¸ c˜ ao ´ e: se vocˆ e tem uma determinada quantidade de oper´ arios trabalhando em uma obra, o servi¸ co terminar´ a em x dias. Mas, se vocˆ e tem urgˆ encia e contrata o dobro de oper´ arios, somos levados a pensar que a obra terminar´ a na metade do tempo, o que n˜ ao necessariamente acontece de fato, pois simplificamos o problema afirmando que todas as pessoas trabalhariam com o mesmo empenho. O mais curioso ´ e que, se vocˆ e possui um grande poder de contrata¸ c˜ ao, nos levaria a crer que a obra possa ser terminada em um tempo bastante pequeno, digamos at´ e, imposs´ ıvel. Interessante, n˜ ao ´ e? Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-43 | block-60 | THEORY | - | 28-28 | 0 | 318 | EMBEDDING_PENDING | Defini¸ c˜ ao 5 Se quisermos dividir um n´ umero N em partes diretamente proporcionais aos n´ umeros a , b , e c , significa determinar os n´ umeros x , y , e z , de tal modo que: (I) as sequˆ encias ( x, y, z ) e ( a, b, c ) sejam diretamente proporcionais; (II) x + y + z = N Pela 3 a propriedade das propor¸ c˜ oes, temos, ent˜ ao: x y z x + y + z N = = = = y b c a + b + c a + b + c Defini¸ c˜ ao 6 Se quisermos dividir um n´ umero N em partes inversamente proporcionais , aos n´ umeros a , b , e c , significa determinar os n´ umeros x , y , e z , de tal modo que: (I) as sequˆ encias ( x, y, z ) e ( a, b, c ) sejam inversamente proporcionais; (II) x + y + z = N Assim, tamb´ em pela 3 a propriedade das propor¸ c˜ oes, temos, ent˜ ao: x y z x + y + z N ax = by = cz = = = = = 1 1 1 1 + 1 + 1 1 + 1 + 1 a b c a b c a b c Exemplos |
| chunk-44 | block-61 | QUESTION | 1 | 28-29 | 0 | 284 | EMBEDDING_PENDING | 1. Jo˜ ao ganhou 120 bombons em uma rifa e quer distribu´ ı-los em partes diretamente proporcionais ` as idades de seus filhos, que s˜ ao 3, 4 e 5 anos. Cada filho ganhar´ a quantos bombons? Solu¸ c˜ ao: Vamos supor A , B , C para identificar os filhos. Queremos que: ( A, B, C ) e (3 , 4 , 5) sejam diretamente proporcionais e que A + B + C = 120. Logo, A B C = = = k 3 4 5 Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino Continua¸ c˜ ao... Pela 3 a propriedade das propor¸ c˜ oes, temos: A + B + C 120 = = k 3 + 4 + 5 12 k = 10 Da´ ı temos que: A • = 10, ent˜ ao A = 30 B • = 10, ent˜ ao B = 40 C • = 10, ent˜ ao C = 50. Note que: 30 + 40 + 50 = 120 bombons. |
| chunk-45 | block-62 | QUESTION | 2 | 29-30 | 0 | 332 | EMBEDDING_PENDING | 2. Vamos agora dividir 188 em partes inversamente proporcionais a 3, 4 e 5. Solu¸ c˜ ao: Queremos que ( A, B, C ) e (3 , 4 , 5) sejam diretamente proporcionais e que A + B + C = 188. Logo, 3 A = 4 B = 5 C = k k k k Da´ ı temos: A = , B = e C = . Substituindo essas informa¸ c˜ oes em 3 4 5 A + B + C = 188. k k k + + = 188 3 4 5 20 k + 15 k + 12 k = 188 47 k = 7188 188 · 60 k = k = 240 Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino Continua¸ c˜ ao... Assim, k 240 • A = = = 80 3 3 k 240 • B = = = 60 4 4 k 240 • C = = = 48 5 5 Note que 80 + 60 + 48 = 188. Nesse exemplo, tivemos que somar fra¸ c˜ oes e, para isso, precisamos calcular o MMC, Antes de vocˆ e praticar com a lista de exerc´ ıcios que preparamos para vocˆ e, temos um desa- fio! Topa? |
| chunk-46 | block-64 | QUESTION | 00 | 30-30 | 0 | 144 | EMBEDDING_PENDING | 00. Essa gratifica¸ c˜ ao foi dividida entre eles em partes que eram diretamente proporcionais aos respectivos n´ umeros de horas de plant˜ oes que cumpriram no mˆ es e, ao mesmo tempo, inversamente proporcional ` a suas respectivas idades. Se um dos funcion´ arios tem 36 anos e cumpriu 24h de plant˜ oes e o outro, de 45 anos cumpriu 18h, coube ao mais jovem receber: a) R$ 302,50 b) R$ 310,00 c) R$ 312,5 d) R$ 325,00 e) R$ 342,50 |
| chunk-47 | block-66 | QUESTION | 21 | 30-31 | 0 | 100 | EMBEDDING_PENDING | 21. Fa¸ ca o que se pede: a) Divida o n´ umero 250 em partes diretamente proporcionais a 15, 9 e 6. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino b) Dividir o n´ umero 160 em partes inversamente proporcionais aos n´ umeros 2, 3 e 5. |
| chunk-48 | block-69 | QUESTION | 23 | 31-31 | 0 | 198 | EMBEDDING_PENDING | 23. Uma torneira, de vaz˜ ao constante, foi aberta para encher uma caixa, de 3m de altura, com ´ agua. A cada 15 minutos, o n´ ıvel da ´ agua ´ e medido e varia 50cm a cada medida. a) Quais s˜ ao as grandezas envolvidas? b) Construa uma tabela que permita acompanhar a evolu¸ c˜ ao do n´ ıvel da ´ agua na caixa. c) Identifique o comportamento das grandezas na tabela constru´ ıda no item (b) e constate que as grandezas tempo e altura s˜ ao diretamente proporcionais. d) Se ao inv´ es de uma, fossem utilizadas duas torneiras iguais a primeira, fa¸ ca a mesma coisa que se pede no item (b) e (c). para essa situa¸ c˜ ao. As grandezas ainda s˜ ao diretamente proporcionais? |
| chunk-49 | block-70 | QUESTION | 24 | 31-32 | 0 | 536 | EMBEDDING_PENDING | 24. (UFV) As prefeituras das cidades A, B e C constru´ ıram uma ponte sobre o rio pr´ oximo a estas cidades. A ponte dista 10 km de A, 12 km de B e 18 km de C. O custo da constru¸ c˜ ao, R$ 8.600.000,00, foi dividido em partes inversamente proporcionais ` as distˆ ancias das cidades ` a ponte. Com a constru¸ c˜ ao, a prefeitura da cidade A teve um gasto de: a) R$ 3.200.000,00 b) R$ 3.600.000,00 c) R$ 3.000.000,00 d) R$ 3.800.000,00 e) R$ 3.400.000,00 25. (UNICAMP) A quantia de R$1.280,00 dever´ a ser dividida entre 3 pessoas. Quanto receber´ a cada uma, se: a) A divis˜ ao for feita em partes diretamente proporcionais a 8, 5 e 7? b) A divis˜ ao for feita em partes inversamente proporcionais a 5, 2 e 10? 26. (ESAF) O TJ do Cear´ a verificou, em pesquisa de opini˜ ao p´ ublica, que, em cada 13 eleitores, 5 votam no PFL, 4 no PMDB, 3 no PT e 1 no PDS. Ent˜ ao, para 6.539.000 eleitores, a distribui¸ c˜ ao dos votos seria, respectivamente, para o PFL, PT, PDS e PMDB de: a) 2.650.000; 1.590.000; 530.000; 2.120.000 Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino b) 2.515.000; 2.012.000; 1.509.000; 503.000 c) 265.000; 159.000; 53.000; 212.000 d) 2.650.000; 2.120.000; 1.239.000; 530.000 e) 2.515.000; 1.509.000; 503.000; 2.012.000 |
| chunk-50 | block-72 | QUESTION | 27 | 32-32 | 0 | 231 | EMBEDDING_PENDING | 27. (ENEM 2014) Boliche ´ e um jogo em que se arremessa uma bola sobre uma pista para atingir dez pinos, dispostos em uma forma¸ c˜ ao de base triangular, buscando derrubar o maior n´ umero de pinos. A raz˜ ao entre o total de vezes em que o jogador derruba todos os pinos e o n´ umero de jogadas determina seu desempenho. Em uma disputa entre cinco jogadores, foram obtidos os seguintes resultados: Jogador I: Derrubou todos os pinos 50 vezes em 85 jogadas. Jogador II: Derrubou todos os pinos 40 vezes em 65 jogadas. Jogador III: Derrubou todos os pinos 20 vezes em 65 jogadas. Jogador IV: Derrubou todos os pinos 30 vezes em 40 jogadas. Jogador V: Derrubou todos os pinos 48 vezes em 90 jogadas. Qual desses jogadores apresentou maior desempenho? a) I b) II c) III d) IV e) V |
| chunk-51 | block-75 | QUESTION | 32 | 34-35 | 0 | 294 | EMBEDDING_PENDING | 32. (ENEM 2013) Muitos processos fisiol´ ogicos e bioqu´ ımicos, tais como batimentos card´ ıacos e taxa de respira¸ c˜ ao, apresentam escalas constru´ ıdas a partir da rela¸ c˜ ao entre su- perf´ ıcie e massa (ou volume) do animal. Uma dessas escalas, por exemplo, considera que o “cubo da ´ area S da superf´ ıcie de um mam´ ıfero ´ e proporcional ao quadrado de sua massa M ”. HUGHES-HALLETT, et al. C´ alculo e aplica¸ c˜ oes. S˜ ao Paulo: Edgard B¨ ucher, 1999 (adaptado). Isso ´ e equivalente a dizer que, para uma constante k > 0, a ´ area S pode ser escrita em fun¸ c˜ ao de M por meio da express˜ ao: 1 1 1 1 2 1 2 a) S = k · M b) S = k · M 3 c) S = k 3 · M 3 d) S = k 3 · M 3 e) S = k 3 · M Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-52 | block-78 | THEORY | - | 35-35 | 0 | 251 | EMBEDDING_PENDING | Nesta se¸ c˜ ao, estudaremos um conceito muito importante, pois ele pode ser aplicado aos mais diversos problemas e poder´ a salvar sua pele em uma quest˜ ao! Mas, cuidado, os alunos e alunas tendem a achar que ´ e poss´ ıvel usar regra de trˆ es em tudo e n˜ ao ´ e bem as- sim. Para se utilizar desse conceito, as grandezas envolvidas nos pro- blemas devem ser proporcionais, sejam elas diretamente ou inversa- mente. Os problemas que envolvem grandezas diretamente ou inversamente proporcionais podem ser resolvidos atrav´ es de um m´ etodo pr´ atico, chamado de regra de trˆ es , podendo ser simples ou composta, dependendo do n´ umero de grandezas envolvidas no problema. No caso da regra de trˆ es simples, calculamos as propor¸ c˜ oes entre as grandezas envolvidas e o nome se d´ a, uma vez que possu´ ımos 3 valores conhecidos e estamos em busca de uma inc´ ognita, chamada de quarta proporcional. Para resolver um problema utilizando regra de trˆ es simples, podemos seguir os seguintes |
| chunk-53 | block-79 | LIST | - | 35-36 | 0 | 449 | EMBEDDING_PENDING | passos: I. Identificar as grandezas do problema; II. Reconhecer se as grandezas s˜ ao diretamente ou inversamente proporcionais; III. Sendo diretamente proporcional, escrevemos a propor¸ c˜ ao entre os 4 valores envolvidos, sendo 3 conhecidos e uma inc´ ognita; IV. Sendo inversamente proporcional, fazemos a invers˜ ao de uma das raz˜ oes das grandezas e, a seguir, escrevemos a propor¸ c˜ ao entre os 4 valores envolvidos, sendo 3 conhecidos e uma inc´ ognita; V. Resolvemos a propor¸ c˜ ao estabelecida. Vejamos alguns exemplos. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino Exemplos Um trem, deslocando-se a uma velocidade m´ edia de 400 km/h, faz um determinado percurso em 3 horas. Em quanto tempo faria esse mesmo percurso se a velocidade m´ edia fosse de 480 km/h? Solu¸ c˜ ao: As grandezas do problema s˜ ao velocidade e tempo. Essas grandezas s˜ ao diretamente ou inversamente proporcionais? Se vocˆ e dobrar a velocidade, o tempo cai pela metade, sendo, portanto, inversamente proporcional. As setas servem para orienta¸ c˜ ao e lembrar que, nesse caso, devemos inverter uma das raz˜ oes, pois tem sentido contr´ ario, ou seja, variam na propor¸ c˜ ao inversa. Velocidade ↑ Tempo ↓ 400 3 480 x Agora escrevemos a propor¸ c˜ ao, invertendo uma raz˜ ao de qualquer uma das grandezas. Escolhemos inverter a grandeza da velocidade. Segue: 480 3 = 400 x 480 x = 1200 1200 5 x = = = 2 , 5 h 480 2 Com velocidade de 480 km/h o trem faria o percurso em 2,5 h ou 2 horas e 30 minutos. |
| chunk-54 | block-80 | EXAMPLE | - | 36-37 | 0 | 296 | EMBEDDING_PENDING | Exemplo Na bula de um determinado rem´ edio pedi´ atrico, recomenda-se a seguinte dosagem: 5 gotas para cada 2kg do “peso” da crian¸ ca. Se uma crian¸ ca tem 12 kg, qual ser´ a a dosagem correta? Solu¸ c˜ ao: As grandezas do problema s˜ ao o n´ umero de gotas e o peso da crian¸ ca. Essas grandezas s˜ ao diretamente ou inversamente proporcionais? Se dobrar o peso da crian¸ ca, a quantidade de medicamente a ser ministrada tamb´ em dobrar´ a, sendo, portanto, diretamente proporcional. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino Continua¸ c˜ ao... Note as setas de orienta¸ c˜ ao no mesmo sentido. Isso significa que mantemos a propor¸ c˜ ao, sem inverter nenhuma raz˜ ao. Gotas ↑ Peso ↑ 5 2 x 12 Agora escrevemos a propor¸ c˜ ao, mantendo a ordem das grandezas: 5 2 = x 12 2 x = 60 x = = 30 Portanto, para uma crian¸ ca de 12 kg, dever´ a ser ministrada 30 gotas do rem´ edio. |
| chunk-55 | block-82 | THEORY | - | 37-37 | 0 | 126 | EMBEDDING_PENDING | Enquanto a regra de trˆ es simples trabalha sempre com duas grandezas, na regra de trˆ es composta ´ e poss´ ıvel que se tenha 3 ou mais grandezas ao mesmo tempo. Na verdade, pode- mos resolver um problema de regra de trˆ es composta aplicando sucessivamente a regra de trˆ es simples (IMENES und JAKUBOVIC, 1983). Entretanto, julgamos ser mais pr´ atico adotarmos um procedimento que descreveremos a seguir. Para resolver um problema utilizando regra de trˆ es composta, podemos seguir os seguintes |
| chunk-56 | block-83 | LIST | - | 37-38 | 0 | 455 | EMBEDDING_PENDING | passos: I. Identificar as grandezas do problema; II. Organizar as grandezas e os dados em um tipo de tabela; III. O passo II auxilia no terceiro passo, em que devemos reconhecer se as grandezas s˜ ao diretamente ou inversamente proporcionais; Para realizar a avalia¸ c˜ ao do passo III, analisamos a coluna em que est´ a a inc´ ognita x com cada uma das outras colunas das grandezas envolvidas e deixamos fixos os valores das colunas que n˜ ao est˜ ao sendo analisadas. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino Parece complicado? Por exemplo, Suponha que vocˆ e tem 3 gran- dezas, ent˜ ao ter´ a 3 colunas de dados. Suponha, ainda, que a inc´ ognita x esteja na primeira coluna. Como dito, vocˆ e deve executar o passo II, ou seja, analisar as grandezas. Vocˆ e deve estudar as grandezas da coluna 1 e 2, enquanto isso, os valores da coluna 3 ficam fixos. A se- guir, vocˆ e dever´ a analisar as grandezas das colunas 1 e 3 e, enquanto isso, a coluna 2 fica fixa. A coluna que possui x deve ser estudada com cada uma das outras colunas. No exemplo a seguir ficar´ a mais f´ acil compreender o processo. IV. Sendo as grandezas diretamente proporcionais, mantemos a raz˜ ao da grandeza analisada e sendo inversamente proporcional, fazemos a invers˜ ao da raz˜ ao para, a seguir, escrevermos a propor¸ c˜ ao entre os as trˆ es grandezas. Fazemos a raz˜ ao em que est´ a o x igual ao produto das outras raz˜ oes. V. Resolvemos a propor¸ c˜ ao estabelecida. Vejamos um exemplo e tudo ficar´ a mais f´ acil! Exemplos |
| chunk-57 | block-84 | QUESTION | 1 | 38-40 | 0 | 1109 | EMBEDDING_PENDING | 1. Um ciclista percorre 150 km em 4 dias, pedalando 3 horas por dia. Em quantos dias faria uma viagem de 400 km, pedalando 4 horas por dia? Solu¸ c˜ ao Iniciamos identificando as grandezas. S˜ ao elas: distˆ ancia, dias e horas por dia. Sendo 3 grandezas envolvidas no problemas, ent˜ ao temos uma regra de trˆ es composta. Vamos agora ao segundo passo, que ´ e organizar os dados. Acreditamos que ´ e mais f´ acil colocar a grandeza que possui a inc´ ognita na primeira coluna, pois ela ser´ a analisada com as demais grandezas. Mas isso n˜ ao ´ e uma regra, vocˆ e pode utilizar a ordem que achar melhor! Dias Distˆ ancia Horas 4 150 3 x 400 4 Vamos agora classificar em diretamente ou inversamente proporcionais as grandezas distˆ ancia e horas. Observe que faremos uma de cada vez e elas ser˜ ao classificadas em diretamente ou inversamente proporcionais quando analisadas em rela¸ c˜ ao ` a grandeza que cont´ em a inc´ ognita, dias. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino Continua¸ c˜ ao... Iremos classificar primeiro a distˆ ancia. Para isso, fixamos a grandeza horas. Uma pessoa pedala um determinado tempo por dia (vˆ e como n˜ ao estamos variando o valor dessa grandeza? Ela ´ e fixada!). Se em 4 dias ela anda uma distˆ ancia de 150 km, para andar 400 km levar´ a mais ou menos dias? Bom, mantendo o ritmo, ela levar´ a mais dias, ent˜ ao aumentando a distˆ ancia, a quantidade de dias aumentar´ a, na mesma propor¸ c˜ ao . Logo, distˆ ancia ´ e diretamente proporcional ( ↑ setinha de orienta¸ c˜ ao) a dias. Da mesma forma faremos com a grandeza horas, s´ o que agora fixaremos a grandeza distˆ ancia. Uma pessoa, pedalando 3 horas por dia, percorre uma certa distˆ ancia em 4 dias. Se ela pedalar 4 horas por dias, percorrer´ a a mesma distˆ ancia (que est´ a fixada!), em mais dias ou menos dias? Como a distˆ ancia ´ e fixa, ela pedalando mais tempo por dia, percorrer´ a a distˆ ancia em menos dias, na propor¸ c˜ ao inversa . Assim, as grandezas s˜ ao inversamente proporcionais ( ↓ setinha de orienta¸ c˜ ao), pois aumentando as horas pedaladas por dia, os dias pedalando diminuem. Vamos colocar os dados novamente na tabela, mas agora com as setas das an´ alises que fizemos. Dias Distˆ ancia ↑ Horas ↓ 4 150 3 x 400 4 Vamos agora seguir ao passo IV e escrever a propor¸ c˜ ao, lembrando que, sendo direta- mente proporcional, mantemos a raz˜ ao da grandeza e sendo inversamente proporcional, fazemos a invers˜ ao da raz˜ ao. Ent˜ ao: 4 150 4 = · x 400 3 Note como a raz˜ ao da grandeza, hora, foi invertida. Agora ´ e s´ o resolver! 4 15 0  4 = · x 40 0  3 4 1 = x 2 x = 8 Assim, o ciclista, pedalando 4 horas por dia, levar´ a 8 dias para percorrer 400km. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino Curiosidade Vocˆ e sabe quem foi Leonardo de Pisa ? E a palavra Fibonacci ? Lhe parece mais conhecida? Sim! E da- ´ quela famosa sequˆ encia 1 , 1 , 2 , 3 , 5 , 8 , 13 , 21 , · · · Acontece que Leonardo de Pisa foi quem enunciou essa famosa sequˆ encia e, por isso, tamb´ em ´ e conhecido por Leonardo Fibonacci. Mas porque estamos falando sobre isso? Acontece que Leonardo de Pisa fez muito mais do que enunciar a sequˆ encia de Fibonacci. Foi ele quem difundiu os princ´ ıpios do m´ etodo de regra de trˆ es, atrav´ es do seu livro Liber Abaci (Livro dos C´ alculos). Nesse livro h´ a o seguinte problema: Se um le˜ ao come uma ovelha em 4 horas, um leopardo, em 5 horas e um urso, em 6 horas, quanto tempo levar˜ ao para comˆ e-la juntos? Legal, n˜ ao ´ e mesmo? |
| chunk-58 | block-86 | QUESTION | 33 | 40-40 | 0 | 68 | EMBEDDING_PENDING | 33. Duas piscinas tˆ em a mesma largura e a mesma profundidade e comprimentos diferentes. Na piscina que tem 8 m de comprimento, a quantidade de ´ agua que cabe na piscina ´ e de 45000 litros. Quantos litros de ´ agua cabem na piscina que tem 10 m de comprimento? |
| chunk-59 | block-87 | QUESTION | 34 | 40-40 | 0 | 71 | EMBEDDING_PENDING | 34. Para transportar material bruto para uma constru¸ c˜ ao, foram usados 16 caminh˜ oes com capacidade de 5 cm 3 cada um. Se a capacidade de cada caminh˜ ao fosse de 4 cm 3 , quantos caminh˜ oes seriam necess´ arios para fazer o mesmo servi¸ co? |
| chunk-60 | block-88 | QUESTION | 35 | 40-40 | 0 | 56 | EMBEDDING_PENDING | 35. Numa f´ abrica, 12 oper´ arios trabalhando 8 horas por dia conseguem fazer 864 caixas de papel˜ ao. Quantas caixas ser˜ ao feitas por 15 oper´ arios que trabalhem 10 horas por dia? |
| chunk-61 | block-89 | QUESTION | 36 | 40-40 | 0 | 60 | EMBEDDING_PENDING | 36. Vinte m´ aquinas, trabalhando 16 horas por dia, levam 6 dias para fazer um trabalho. Quantas m´ aquinas ser˜ ao necess´ arias para executar o mesmo servi¸ co, se trabalharem 20 horas por dia durante 12 dias? |
| chunk-62 | block-90 | QUESTION | 37 | 40-40 | 0 | 34 | EMBEDDING_PENDING | 37. Trˆ es torneiras enchem uma piscina em 10 horas. Quantas horas levar˜ ao 10 torneiras para encher 2 piscinas? |
| chunk-63 | block-91 | QUESTION | 38 | 40-41 | 0 | 130 | EMBEDDING_PENDING | 38. (SM) Para construir um pr´ edio em 12 meses, foram contratados 100 oper´ arios. Por causa da urgˆ encia do propriet´ ario, ficou estabelecido que o prazo seria reduzido para 10 me- ses. Quantos oper´ arios a construtora precisar´ a contratar a mais para conseguir cumprir o prazo? Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino a) 17 b) 20 c) 83 d) 120 e) nenhum |
| chunk-64 | block-92 | QUESTION | 39 | 41-41 | 0 | 156 | EMBEDDING_PENDING | 39. (SM) Em um ´ unico dia, um trabalhador chega a cortar 10 toneladas de cana-de-a¸ c´ ucar. Sabendo que um hectare corresponde a 10000 m 2 e que, em m´ edia, s˜ ao produzidas cerca de 80 toneladas de cana-de-a¸ c´ ucar por hectare, a ´ area que um trabalhador consegue cortar por dia corresponde a um retˆ angulo de base e altura iguais, respectivamente, a: a) 20 m e 40 m b) 35 m e 35 m c) 100 m e 40 m d) 25 m e 100 m e) 25 m e 50 m |
| chunk-65 | block-93 | QUESTION | 40 | 41-41 | 0 | 184 | EMBEDDING_PENDING | 40. (UFMG) No ano passado, uma equipe de 13 professores, com um ritmo de trabalho supostamente constante, corrigiu 3.000 provas em 6 dias. Este ano, o n´ umero de provas aumen- tou para 5.500 e a equipe foi ampliada para 15 professores. Para se obter uma estimativa do n´ umero n de dias necess´ arios para totalizar a corre¸ c˜ ao, suponha que, durante todo o per´ ıodo de corre¸ c˜ ao, o ritmo de trabalho da equipe deste ano ser´ a o mesmo da equipe do ano passado. O n´ umero n satisfaz a condi¸ c˜ ao: a) n ≤ 8 b) 8 < n ≤ 10 c) 10 < n ≤ 12 d) n > 12 |
| chunk-66 | block-94 | QUESTION | 41 | 41-41 | 0 | 117 | EMBEDDING_PENDING | 41. (PUC-Campinas) Sabe-se que 5 m´ aquinas, todas de igual eficiˆ encia, s˜ ao capazes de produzir 500 pe¸ cas em 5 dias, se operarem 5 horas por dia. Se 10 m´ aquinas iguais as primeiras operassem 10 horas por dia durante 10 dias, o n´ umero de pe¸ cas produzidas seria: a) 1000 b) 2000 c) 4000 d) 5000 e) 8000 |
| chunk-67 | block-95 | QUESTION | 42 | 41-41 | 0 | 65 | EMBEDDING_PENDING | 42. (UFMG) Uma empresa tem 750 empregados e comprou marmitas individuais congela- das suficientes para o almo¸ co deles durante 25 dias se essa empresa tivesse mais 500 empregados qual seria o n´ umero de dias em que as marmitas iriam atender a esta demanda? |
| chunk-68 | block-96 | QUESTION | 43 | 41-42 | 0 | 103 | EMBEDDING_PENDING | 43. (UERJ) Na imagem da etiqueta, informa-se o valor a ser pago por 0,256 kg de peito de peru. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino O valor, em reais, de um quilograma desse produto ´ e igual a: a) 25,60 b) 32,76 c) 40,00 d) 50,00 |
| chunk-69 | block-98 | QUESTION | 44 | 42-42 | 0 | 71 | EMBEDDING_PENDING | 44. (ENEM 2004) Em quase todo o Brasil existem restaurantes em que o cliente, ap´ os se servir, pesa o prato de comida e paga o valor correspondente, registrado na nota pela balan¸ ca. Em um restaurante desse tipo, o pre¸ co do quilo era R$ 12, |
| chunk-70 | block-99 | QUESTION | 80 | 42-42 | 0 | 122 | EMBEDDING_PENDING | 80. Certa vez a funcion´ aria digi- tou por engano na balan¸ ca eletrˆ onica o valor R$ 18,20 e s´ o percebeu o erro algum tempo depois, quando v´ arios clientes j´ a estavam almo¸ cando. Ela fez alguns c´ alculos e verificou que o erro seria corrigido se o valor incorreto indicado na nota dos clientes fosse multiplicado por: a) 0,54 b) 0,65 c) 0,70 d) 1,28 e) 1,42 |
| chunk-71 | block-100 | QUESTION | 45 | 42-42 | 0 | 166 | EMBEDDING_PENDING | 45. (ENEM 2015) Um pesquisador, ao explorar uma floresta, fotografou uma caneta de 16,8 cm de comprimento ao lado de uma pegada. O comprimento da caneta ( c ), a largura ( L ) e o comprimento ( C ) da pegada, na fotografia, est˜ ao indicados no esquema. A largura e o comprimento re- ais da pegada, em cent´ ımetros, s˜ ao, respectivamente, iguais a: a) 4,9 e 7,6 b) 8,6 e 9,8 c) 14,2 e 15,4 d) 26,4 e 40,8 e) 27,5 e 42,5 |
| chunk-72 | block-101 | QUESTION | 46 | 42-42 | 0 | 158 | EMBEDDING_PENDING | 46. (ENEM 2009) Os calend´ arios usados pelos diferentes povos da Terra s˜ ao muito varia- dos. O calend´ ario islˆ amico, por exemplo, ´ e lunar, e nele cada mˆ es tem sincronia com a fase da lua. O calend´ ario maia segue o ciclo de Vˆ enus, com cerca de 584 dias, e cada 5 ciclos de Vˆ enus corresponde a 8 anos de 365 dias da Terra. Quantos ciclos teria, em Vˆ enus, um per´ ıodo terrestre de 48 anos? a) 30 ciclos b) 40 ciclos c) 73 ciclos d) 240 ciclos e) 384 ciclos |
| chunk-73 | block-102 | QUESTION | 47 | 42-43 | 0 | 171 | EMBEDDING_PENDING | 47. (ENEM 2015) Uma confec¸ c˜ ao possu´ ıa 36 funcion´ arios, alcan¸ cando uma produtividade de 5400 camisetas por dia, com uma jornada de trabalho di´ aria dos funcion´ arios de 6 horas. En- Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino tretanto, com o lan¸ camento da nova cole¸ c˜ ao e de uma nova campanha de marketing, o n´ umero de encomendas cresceu de forma acentuada, aumentando a demanda di´ aria para 21600 camise- tas. Buscando atender essa nova demanda, a empresa aumentou o quadro de funcion´ arios para |
| chunk-74 | block-103 | QUESTION | 96 | 43-43 | 0 | 77 | EMBEDDING_PENDING | 96. Ainda assim, a carga hor´ aria de trabalho necessita ser ajustada. Qual deve ser a nova jornada de trabalho di´ aria dos funcion´ arios para que a empresa consiga atender a demanda? a) 1 hora e 30 minutos b) 2 horas e 15 minutos c) 9 horas d) 16 horas e) 24 horas |
| chunk-75 | block-104 | QUESTION | 48 | 43-43 | 0 | 187 | EMBEDDING_PENDING | 48. (ENEM 2009) Uma escola lan¸ cou uma campanha para seus alunos arrecadarem, du- rante 30 dias, alimentos n˜ ao perec´ ıveis para doar a uma comunidade carente da regi˜ ao. Vinte alunos aceitaram a tarefa e nos primeiros 10 dias trabalharam 3 horas di´ arias, arrecadando 12 kg de alimentos por dia. Animados com os resultados, 30 novos alunos somaram-se ao grupo, e passaram a trabalhar 4 horas por dia nos dias seguintes at´ e o t´ ermino da campanha. Admitindo-se que o ritmo de coleta tenha se mantido constante, a quantidade de alimentos arrecadados ao final do prazo estipulado seria de: a) 920 kg b) 800 kg c) 720 kg d) 600 kg e) 570 kg |
| chunk-76 | block-105 | QUESTION | 49 | 43-43 | 0 | 210 | EMBEDDING_PENDING | 49. (ENEM 2013) Uma ind´ ustria tem um reservat´ orio de ´ agua com capacidade para 900 m 3 . Quando h´ a necessidade de limpeza do reservat´ orio, toda a ´ agua precisa ser escoada. O escoamento da ´ agua ´ e feito por seis ralos, e dura 6 horas quando o reservat´ orio est´ a cheio. Esta ind´ ustria construir´ a um novo reservat´ orio, com capacidade de 500 m 3 , cujo escoamento da agua dever´ ´ a ser realizado em 4 horas, quando o reservat´ orio estiver cheio. Os ralos utilizados no novo reservat´ orio dever˜ ao ser idˆ enticos aos do j´ a existente. A quantidade de ralos do novo reservat´ orio dever´ a ser igual a: a) 2 b) 4 c) 5 d) 8 e) 9 |
| chunk-77 | block-106 | QUESTION | 50 | 43-43 | 0 | 178 | EMBEDDING_PENDING | 50. (ENEM PPL 2017) Uma ind´ ustria tem um setor totalmente automatizado. S˜ ao quatro m´ aquinas iguais, que trabalham simultˆ anea e ininterruptamente durante uma jornada de 6 horas. Ap´ os esse per´ ıodo, as m´ aquinas s˜ ao desligadas por 30 minutos para manuten¸ c˜ ao. Se alguma m´ aquina precisar de mais manuten¸ c˜ ao, ficar´ a parada at´ e a pr´ oxima manuten¸ c˜ ao. Certo dia, era necess´ ario que as quatro m´ aquinas produzissem um total de 9000 itens. O trabalho come¸ cou a ser feito ` as 8 horas. Durante uma jornada de 6 horas, produziram 6000 |
| chunk-78 | block-107 | LIST | - | 43-44 | 0 | 166 | EMBEDDING_PENDING | itens, mas na manuten¸ c˜ ao observou-se que uma m´ aquina precisava ficar parada. Quando o servi¸ co foi finalizado, as trˆ es m´ aquinas que continuaram operando passaram por uma nova ma- Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino nuten¸ c˜ ao, chamada manuten¸ c˜ ao de esgotamento. Em que hor´ ario come¸ cou a manuten¸ c˜ ao de esgotamento? a) 16h 45min b) 18h 30min c) 19h 50min d) 21h 15min e) 22h 30min |
| chunk-79 | block-108 | QUESTION | 51 | 44-44 | 0 | 131 | EMBEDDING_PENDING | 51. (ENEM 2012) Uma m˜ ae recorreu ` a bula para verificar a dosagem de um rem´ edio que precisava dar a seu filho. Na bula, recomendava-se a seguinte dosagem: 5 gotas para cada 2 kg de massa corporal a cada 8 horas. Se a m˜ ae ministrou corretamente 30 gotas do rem´ edio a seu filho a cada 8 horas, ent˜ ao a massa corporal dele ´ e de: a) 12kg b) 16 kg c) 24 kg d) 36 kg e) 75 kg |
| chunk-80 | block-109 | QUESTION | 52 | 44-44 | 0 | 162 | EMBEDDING_PENDING | 52. (ENEM 2001) Um engenheiro, para calcular a ´ area de uma ci- dade, copiou sua planta numa folha de papel de boa qualidade, recortou e pesou numa balan¸ ca de precis˜ ao, obtendo 40 g. Em seguida, recor- tou, do mesmo desenho, uma pra¸ ca de dimens˜ oes reais 100 m × 100 m , pesou o recorte na mesma balan¸ ca e obteve 0,08 g. Com esses dados foi poss´ ıvel dizer que a ´ area da cidade, em metros quadrados, ´ e de, aproximadamente, a) 800 b) 10000 c) 320000 d) 400000 e) 5000000 |
| chunk-81 | block-110 | QUESTION | 53 | 44-44 | 0 | 149 | EMBEDDING_PENDING | 53. (ENEM 2001) Muitas medidas podem ser tomadas em nossas casas visando ` a uti- liza¸ c˜ ao racional de energia el´ etrica. Isso deve ser uma atitude di´ aria de cidadania. Uma delas pode ser a redu¸ c˜ ao do tempo no banho. Um chuveiro com potˆ encia de 4800 W consome 4,8 kW por hora. Uma pessoa que toma dois banhos diariamente, de 10 minutos cada, consumir´ a, em sete dias, quantos kW ? a) 0,8 b) 1,6 c) 5,6 d) 11,2 e) 33,6 |
| chunk-82 | block-111 | QUESTION | 54 | 44-45 | 0 | 295 | EMBEDDING_PENDING | 54. (ENEM 2009) Uma cooperativa de colheita propˆ os a um fazendeiro um contrato de trabalho nos seguintes termos: a cooperativa forneceria 12 trabalhadores e 4 m´ aquinas, em um regime de trabalho de 6 horas di´ arias, capazes de colher 20 hectares de milho por dia, ao custo de R$ 10,00 por trabalhador por dia de trabalho, e R$ 1.000,00 pelo aluguel di´ ario de cada m´ aquina. O fazendeiro argumentou que fecharia contrato se a cooperativa colhesse 180 hectares de milho em 6 dias, com gasto inferior a R$ 25.000,00. Para atender ` as exigˆ encias do fazendeiro e supondo que o ritmo dos trabalhadores e das Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino m´ aquinas seja constante, a cooperativa deveria a) manter sua proposta. b) oferecer 4 m´ aquinas a mais. c) oferecer 6 trabalhadores a mais. d) aumentar a jornada de trabalho para 9 horas di´ arias. e) reduzir em R$ 400,00 o valor do aluguel di´ ario de uma m´ aquina. |
| chunk-83 | block-112 | QUESTION | 55 | 45-45 | 0 | 194 | EMBEDDING_PENDING | 55. (ENEM 2012) Em 20 de fevereiro de 2011, ocorreu a grande erup¸ c˜ ao do vulc˜ ao Bulusan nas Filipinas. A sua localiza¸ c˜ ao geogr´ afica no globo terrestre ´ e dada pelo GPS (sigla em inglˆ es para Sistema de Posicionamento Global) com longitude de 124 o 3’ 0” a leste do Meridiano de Greenwich. Dado: 1 o equivale a 60’ e 1’ equivale a 60”. A representa¸ c˜ ao angular da localiza¸ c˜ ao do vulc˜ ao com rela¸ c˜ ao a sua longitude da forma decimal ´ e a) 124,02 o b) 124,05 o c) 124,20 o d) 124,30 o e) 124,50 o |
| chunk-84 | block-114 | QUESTION | 56 | 45-45 | 0 | 133 | EMBEDDING_PENDING | 56. ( EPCAR 2017) Certa m´ aquina, funcionando normalmente 5 horas por dia, gasta 3 dias para produzir 1200 embalagens. Atualmente est´ a com esse tempo de funcionamento di´ ario reduzido em 20%, trabalhando, as- sim, apenas T horas por dia. Para atender uma encomenda de 1840 embalagens, aproveitando ao m´ aximo em todos os dias o seu tempo T de funcionamento, ela gastar´ a no ´ ultimo dia a) 120 minutos b) 150 minutos c) 180 minutos d) 200 minutos |
| chunk-85 | block-115 | QUESTION | 57 | 45-46 | 0 | 306 | EMBEDDING_PENDING | 57. (EPCAR 2013) Uma empresa foi contratada para executar servi¸ co de pintura no alojamento dos alunos do 1 ◦ o ano CPCAR. O prazo estabelecido no contrato para a conclus˜ ao do servi¸ co foi de 10 dias. O servi¸ co come¸ cou a ser executado por uma equipe de 6 funcion´ arios da empresa, cada um trabalhando 6 horas por dia. Ao final do 8 ◦ o dia de servi¸ co somente 3 do servi¸ co de pintura havia sido executado. Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino Para terminar o servi¸ co dentro do prazo, a equipe de servi¸ co recebeu mais 2 funcion´ arios e todos passaram a trabalhar 9 horas por dia. Com isso a produtividade da equipe duplicou. A nova equipe, para concluir o trabalho, gastou mais de 1 dia, por´ em menos de 2 dias. Se h representa o n´ umero de horas que cada funcion´ ario da nova equipe trabalhou no 10 ◦ o dia de trabalho, ent˜ ao h ´ e um n´ umero compreendido entre a) 0 e 2 b) 2 e 4 c) 4 e 6 d) 6 e 8 |
| chunk-86 | block-116 | QUESTION | 58 | 46-46 | 0 | 86 | EMBEDDING_PENDING | 58. Um fazendeiro tem ra¸ c˜ ao suficiente para alimentar 60 galinhas durante 80 dias. No fim de 8 dias compra outras 12 galinhas; 16 dias ap´ os essa compra, uma raposa mata 28 delas. Durante quantos dias poder´ a alimentar as que restaram, se a quantidade de ra¸ c˜ ao de cada galinha continua a mesma? |
| chunk-87 | block-117 | QUESTION | 59 | 46-46 | 0 | 84 | EMBEDDING_PENDING | 59. (M´ exico) Um barco recolhe 30 n´ aufragos numa ilha. Como resultado, os alimentos do barco que eram suficiente para 60 dias, agora ser˜ ao suficiente para 50 dias. Quantas pessoas havia no barco antes dele chegar ` a ilha? a) 15 b) 40 c) 110 d) 140 e) 150 |
| chunk-88 | block-118 | QUESTION | 60 | 46-47 | 0 | 162 | EMBEDDING_PENDING | 60. (Col´ egio Naval 1995) Se k abelhas, trabalhando k meses do ano, durante k dias no mˆ es e durante k horas por dia, produzem k litros de mel; ent˜ ao o n´ umero de litros de mel produzidos por W abelhas, trabalhando W horas por dia, em W dias e em W meses do ano ser´ a: K 3 W 5 K 4 W 3 W 4 a) 2 b) 3 c) 3 d) 4 e) 3 W K W K K Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es Prof. Leonardo Muniz Prof. Thiago Jacomino |
| chunk-89 | block-120 | ANSWER_KEY | - | 47-48 | 0 | 1027 | EMBEDDING_PENDING | √ 1 20 3 25 15 3 1. a) b) 3 c) d) e) 10 f) g) h) 4 9 7 7 22 2 19 7 13 2 101 2. N˜ ao 3. a) b) 4. a) x = − 3 b) x = c) x = − d) x = 12 19 15 7 2 5.[C] 6. [C] 7. [B] 8. a) 57 b) 37 9. 10.[D] 11.[E] 12.[C] 13.[E] 13.[B] 14.[B] 15.[E] 16.[D] 17.[C] 18.[D] 19.[A] 20.[A] 2400 1600 960 21. a) 125, 75 e 50 b) , e 31 31 31 22. A=12000, B=8000 e C=10000 23. a) Tempo e altura b) Tempo (min) Altura(cm) 15 50 30 100 45 150 60 200 75 250 90 300 c) As grandezas aumentam na mesma propor¸ c˜ ao d) Tempo (min) Altura(cm) 15 100 30 200 45 300 As grandezas continuam sendo diretamente proporcionais 24.[B] 25. a) R$ 512,00, R$ 320,00, R$ 448,00 b) R$ 320,00, R$ 800,00, R$ 160,00 26.[E] 27.[D] 28.[A] 29.[B] 30.[C] 31.[A] 32.[D] 33. 56250 litros 34. 20 caminh˜ oes 35. 1350 caixas 36. 8 m´ aquinas 37. 6 horas 38.[B] 39.[E] 40.[B] 41.[C] 42. 15 dias 43.[D] 44.[C] 45.[D] 46.[A] 47.[C] 48.[C] 49.[A] 50.[B] 51.[A] 52.[E] 53.[D] 54.[D] 55.[B] 56.[C] 57.[B] 58. 72 dias 59.[E] 60.[E] Referˆ encias Bibliogr´ aficas [COLETIVA 2014] COLETIVA , Obra: Ser protagonista: competˆ encias ENEM: ensino m´ edio . S˜ ao Paulo : Edi¸ c˜ oes SM, 2014 [COLEC ¸ OES 2011] ˜ COLEC ¸ OES ˜ , Abril: Matem´ atica IV . S˜ ao Paulo : Abril, 2011 [DANTE 2013] DANTE , Luiz R.: Matem´ atica: Contexto e Aplica¸ c˜ oes . S˜ ao Paulo : Atica, ´ 2013 [FLOOD und WILSON 2013] FLOOD , Raymond ; WILSON , Robin: A Hist´ oria dos Grandes Matem´ aticos: as Descobertas e a Propaga¸ c˜ ao do Conhecimento atrav´ es das vidas dos Grandes Matem´ aticos . S˜ ao Paulo : M.Books do Brasil, 2013 [(Gandhi) 2006] (Gandhi) , Antonio Luiz S.: Problemas Selecionados De Matem´ atica . Rio de Janeiro : Editora Ciˆ encia Moderna, 2006 [IMENES und JAKUBOVIC 1983] IMENES , Luiz M´ arcio P. ; JAKUBOVIC , Jos´ e: Con- sidera¸ c˜ oes Sobre o Ensino da Regra de trˆ es composta . S˜ ao Paulo, n. 2,p. 2-5 : Revista do Professor de Matem´ atica (SBM), 1983 [LACERDA 2009] LACERDA , Jos´ e Carlos A.: Praticando a Aritm´ etica . Rio de Janeiro : Dissonarte Editora, 2009 [ AVILA 1986] ´ AVILA ´ , Geraldo: Raz˜ oes, propor¸ c˜ oes e regra de trˆ es . S˜ ao Paulo, n. 8,p. 1-8 : Revista do Professor de Matem´ atica (SBM), 1986 |

## Contexto preparado para a IA

Cada chunk abaixo contém o texto original em `content` e o texto enriquecido que seria enviado para embedding/recuperação em `embeddingContent`.

### chunk-1

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Introdu¸ c˜ ao
Tipo: THEORY
Paginas: 3

De forma a entender o conceito de raz˜ ao, vamos ilustrar a seguir uma situa¸ c˜ ao bem interes-
sante.
Suponha que trˆ es amigos, Pedro, Jo˜ ao e M´ arcio, juntaram dinheiro e jogaram, juntos, na
loteria. Como a contribui¸ c˜ ao realizada por cada um dos amigos foi diferente, logo, eles teriam
direito a diferentes partes de um poss´ ıvel prˆ emio. Suponha que Pedro contribuiu com 9 reais,
Jo˜ ao contribuiu com 16 reais e M´ arcio contribuiu com 15 reais.
Quem dever´ a receber a maior quantia?
Claramente vocˆ e ter´ a a resposta correta em mente, pois, como Jo˜ ao contribuiu com mais
dinheiro para a aposta, de certo teria direito a maior parte do prˆ emio. Vamos supor ent˜ ao que
os amigos ganharam um prˆ emio de R$ 100.000,
```

### chunk-2

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Introdu¸ c˜ ao
Tipo: QUESTION
Paginas: 3
Questao: 00

00. Que parte caber´ a a cada um deles, sendo
levado em considera¸ c˜ ao para a divis˜ ao a contribui¸ c˜ ao dada por cada um para a aposta?
Note que o total da aposta feita pelos amigos foi de 9 + 16 + 15 =
40. Logo, cada amigo
dever´ a receber um valor de acordo com sua contribui¸ c˜ ao e em rela¸ c˜ ao ao todo apostado. Dessa
maneira, receber˜ ao as seguintes fra¸ c˜ oes do prˆ emio:
9 16 15
Pedro: ; Jo˜ ao: ; M´ arcio:
40 40 40
Cada uma dessas fra¸ c˜ oes ´ e uma raz˜ ao , pois trata-se de uma rela¸ c˜ ao existente entre dois
valores de mesma grandeza. A palavra raz˜ ao vem do latim ratio e significa “divis˜ ao”. Utili-
zamos desse conceito quando queremos comparar duas quantidades em uma mesma categoria.
Sendo assim, podemos agora definir o conceito de raz˜ ao.
```

### chunk-3

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Raz˜ ao e Propor¸ c˜ ao
Tipo: THEORY
Paginas: 3-4

a
Defini¸ c˜ ao 1 (Raz˜ ao) A raz˜ ao entre dois n´ umeros a e b , sendo b 6 = 0 , ´ e o quociente ou a : b .
b
a
Observa¸ c˜ ao: Lemos a raz˜ ao como, “ a est´ a para b ”.
b
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-4

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Raz˜ ao e Propor¸ c˜ ao
Tipo: EXAMPLE
Paginas: 4

Exemplo
A raz˜ ao entre as idades das irm˜ as Beatriz e Fernanda ´ e . Isso significa que, para
cada 2 anos de Beatriz, Fernanda tem 3 anos. Ent˜ ao, por exemplo, se Beatriz tiver 6
anos, logo Fernanda ter´ a 9 anos.
```

### chunk-5

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Raz˜ ao e Propor¸ c˜ ao
Tipo: THEORY
Paginas: 4

Importante! Quando se trata de raz˜ ao, ´ e muito importante a ordem em que as informa¸ c˜ oes
aparecem. Como assim? No exemplo anterior, em que a raz˜ ao entre as idades das irm˜ as Beatriz
e Fernanda ´ e , dissemos que Beatriz tem 2 e Fernanda tem 3 anos. Mas se diss´ essemos a raz˜ ao
entre as idades de Fernanda e Beatriz, ent˜ ao ter´ ıamos a raz˜ ao inversa .
Existem in´ umeras aplica¸ c˜ oes de raz˜ ao e, a seguir, vamos exemplificar algumas importantes,
como a escala , a densidade demogr´ afica , velocidade m´ edia e vaz˜ ao .
```

### chunk-6

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Raz˜ ao e Propor¸ c˜ ao
Tipo: DEFINITION
Paginas: 4

Escala: ´ e a raz˜ ao entre a dimens˜ ao do desenho ( d ) e a dimens˜ ao real do objeto por ele re-
presentado ( r ). E comumente utilizado em mapas para representar distˆ ´ ancias. Assim, podemos
escrever:
d
E =
r
```

### chunk-7

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Raz˜ ao e Propor¸ c˜ ao
Tipo: EXAMPLE
Paginas: 4-5

Exemplo
Quando vemos, por exemplo, uma miniatura que foi fabricada com uma escala de 1 : 200,
isso quer dizer que a cada 1 cm da miniatura corresponde a 200 cm ou 2 m do objeto
real. Ent˜ ao, suponhamos que a miniatura possua 7 cm de comprimento, ent˜ ao o objeto
ter´ a 1400 cm ou 14 m de comprimento real.
Densidade Demogr´ afica: tamb´ em chamada de densidade populacional, ´ e a raz˜ ao entre
o n´ umero de habitantes ou popula¸ c˜ ao ( h ) e a superf´ ıcie do territ´ orio por eles habitada ( a ).
Assim, podemos escrever:
h
Dd =
a
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-8

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Raz˜ ao e Propor¸ c˜ ao
Tipo: EXAMPLE
Paginas: 5-6

Exemplo
Segundo o Instituto Brasileiro de Geografia e Estat´ ıstica (IBGE, 2016), o Estado
do Rio de Janeiro apresenta uma densidade demogr´ afica de 365,23 hab/km 2 , sendo o
segundo Estado com a maior densidade populacional do Brasil, superando S˜ ao Paulo com
166,23 hab/km 2 e ficando atr´ as do Distrito Federal, com uma densidade populacional de
444,66 hab/km 2 .
Sabendo que o Estado do Rio de Janeiro apresenta uma densidade demogr´ afica de
365,23 hab/km 2 e possui um territ´ orio de 43.696.000.000 m 2 , Determine o n´ umero de
habitantes do Estado do Rio de Janeiro.
Solu¸ c˜ ao:
Sabemos que, 43 . 696 . 000 . 000 m 2 = 43 . 696 km 2 , assim:
h
Dd =
a
h
65 , 23 =
43696
h = 365 , 23 · 43696
h ≈ 15 . 959 . 090
Dessa maneira, o Estado do Rio de Janeiro possui, aproximadamente, uma popula¸ c˜ ao
de 15.959.090 habitantes.
Vocˆ e sabe por que foi necess´ ario converter a unidade de medida? D´ uvidas sobre
Velocidade M´ edia: ´ e a raz˜ ao entre a distˆ ancia percorrida e o tempo gasto para percorrer
tal distˆ ancia. Assim, podemos escrever:
d
V m =
t
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-9

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Raz˜ ao e Propor¸ c˜ ao
Tipo: EXAMPLE
Paginas: 6-7

Exemplo
H´ a mais de 10 anos, Usain Bolt bateu o recorde dos 100 metros em Berlim, em uma
prova que lhe deu o t´ ıtulo mundial, com a impressionante marca de 9,58 segundos, que
ainda hoje perdura como m´ aximo absoluto. Sabendo disso, qual foi a velocidade m´ edia
de Bolt durante a prova?
Solu¸ c˜ ao:
Sabemos que:
d
V m =
t
V m =
9 , 58
V m ≈ 10 , 44 m/s
Dessa forma, Usain Bolt completou a prova com a incr´ ıvel marca de 10,44 m/s. Vocˆ e
sabe quanto ´ e essa velocidade em km/h?
Vocˆ e n˜ ao se lembra como fazer a convers˜ ao de medidas de velocidade? A gente te
conceitos.
Vaz˜ ao: de forma sint´ etica, vaz˜ ao ´ e a raz˜ ao entre a quantidade de flu´ ıdo que passa por uma
se¸ c˜ ao transversal de um duto por unidade de tempo.
Assim, se afirmamos que uma torneira tem vaz˜ ao igual a 15 litros por minuto, ent˜ ao entende-
se que a cada minuto passam por essa torneira 15 litros de ´ agua. Para medir a vaz˜ ao de uma
torneira, poder´ ıamos encher, por exemplo, um balde de 12 litros e marcar o tempo que essa tor-
neira levou para enchˆ e-lo. Suponha que esse tempo seja igual a 30 minutos. Qual a vaz˜ ao? Ora,
12 1
basta fazer a conta = 0 , 4 L/min . Se preferir, vocˆ e pode observar que 30 min = hora ,
30 2
12 2
portanto, a vaz˜ ao pode ser calculada da seguinte maneira: = 12 · = 24 L/hora .
1 1
Dessa forma, podemos escrever:
c
V z =
t
Onde V z ´ e a vaz˜ ao, c a capacidade ou volume e t o tempo.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-10

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Raz˜ ao e Propor¸ c˜ ao
Tipo: EXAMPLE
Paginas: 7-8

Exemplo
Uma torneira sozinha enche um tanque em 6 horas enquanto outra torneira,
tamb´ em sozinha, enche o mesmo tanque em 30 horas. Em quanto tempo as duas tornei-
ras juntas enchem o tanque? (Tente fazer primeiro antes de ler a solu¸ c˜ ao desse problema.)
Solu¸ c˜ ao:
Uma forma de resolver esse problema ´ e usando o conceito de Vaz˜ ao .
Seja t nossa inc´ ognita, ou seja, o tempo necess´ ario para que as duas torneira, juntas,
encham o tangue.
Vamos chamar de V 1 a vaz˜ ao da primeira torneira e V 2 a vaz˜ ao da segunda. Suponha
que volume do tangue seja igual a c .
c c
Portanto, V 1 = e V 2 = .
6 30
Podemos imaginar que as duas torneiras juntas formem uma s´ o quando acionadas
simultaneamente para encher o tanque e a vaz˜ ao dessa ´ unica torneira pode ser calculada
de duas formas:
• somando as duas vaz˜ oes;
• dividindo o volume do tanque pelo tempo que as duas torneiras, juntas, levam para
encher o tanque.
Igualando as duas formas, temos:
c  c  c 
+ = (Dividimos por c 6 = 0)
6 30 t
1 1 1
+ = (Note que o MMC entre 6 e 30 ´ e 30.)
6 30 t
5 + 1 1
=
30 t
6 1
=
30 t
6 t = 30
t = = 5
Portanto, as duas torneiras, juntas, enchem o tanque em 5 horas. Concorda com a
resposta? Pense um pouco.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-11

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Raz˜ ao e Propor¸ c˜ ao
Tipo: EXAMPLE
Paginas: 8-9

Exemplo
(UERJ 2017)
No mapa, o trajeto total da tocha ol´ ımpica em territ´ orio brasileiro mede cerca de 72
cm, considerando os trechos por via a´ erea e por terra. A distˆ ancia real, em quilˆ ometros,
percorrida pela tocha em seu trajeto completo ´ e de, aproximadamente:
a) 3600 b) 7000 c) 36000 d)70000
Solu¸ c˜ ao:
A escala dada pela figura, 1:50.000.
000. De acordo com a defini¸ c˜ ao de escala, significa
que, para cada 1 cm no desenho, tˆ em-se 50.000.000 cm no real. Como no mapa, o percurso
da tocha foi de 72 cm ent˜ ao no real temos:
72 · 50 . 000 . 000 = 3 . 600 . 000 . 000 cm = 36 . 000 km
Assim, a distˆ ancia real percorrida pela tocha foi de 36.000 km.
disponibilizado acima e assistindo ao v´ ıdeo.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-12

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Raz˜ ao e Propor¸ c˜ ao
Tipo: EXAMPLE
Paginas: 9-10

Exemplo
(ENEM 2010)
Um professor dividiu a lousa da sala de aula em quatro partes iguais. Em seguida,
preencheu 75% dela com conceitos e explica¸ c˜ oes, conforme a figura seguinte.
Algum tempo depois, o professor apagou a lousa por completo e, adotando um
procedimento semelhante ao anterior, voltou a preenchˆ e-la, mas, dessa vez, utilizando
40% do espa¸ co dela.
Uma representa¸ c˜ ao poss´ ıvel para essa segunda situa¸ c˜ ao ´ e:
Solu¸ c˜ ao:
Diversos conceitos que utilizamos podem
ser representados por raz˜ oes. Nesse exem-
plo em quest˜ ao, o conceito de porcenta-
gem tem o mesmo significado de raz˜ ao,
pois porcentagem significa por cento , logo,
expressa uma fra¸ c˜ ao de um n´ umero sobre
100. Quando o professor apagou a lousa
e voltou a preenchˆ e-la,+ utilizando 40%,
40 2
nos podemos escrever: 40% = =
100 5
Dessa forma, a raz˜ ao , significado que
o professor dividiu a lousa em 5 partes e
utilizou apenas duas, logo, a representa¸ c˜ ao
correta ´ e a letra C.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
a c
Defini¸ c˜ ao 2 (Propor¸ c˜ ao) Sendo as raz˜ oes e , com b, d 6 = 0 , a igualdade entre duas raz˜ oes,
b d
a c
ou seja, = , ´ e chamada Propor¸ c˜ ao .
b d
a c
Observa¸ c˜ ao : Lemos a propor¸ c˜ ao = como, “ a est´ a para b , assim como, c est´ a para d .
b d
```

### chunk-13

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes
Tipo: FORMULA
Paginas: 10

Propriedade Fundamental das Propor¸ c˜ oes (PFP): = se, e somente se, a · d = b · c .
b d
Essa propriedade ´ e comumente chamada de “produto dos meios ´ e igual ao produto dos
extremos”. Os alunos e alunas, costumam chamar de “multiplicar cruzado”.
De qualquer formar, sempre valer´ a que:
a c
= ⇔ a · d = b · c
b d
onde,
M eios
︷ ︸︸ ︷
a ÷ b = c ÷ d
︸ ︷︷ ︸
Extremos
```

### chunk-14

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes
Tipo: EXAMPLE
Paginas: 10-11

Exemplo
5 x
Determine o valor de x na propor¸ c˜ ao = .
3 27
Solu¸ c˜ ao:
3 · x = 5 · 27
x =
x = 45
Coment´ ario: Consideramos importante que o estudante reflita o porquˆ e a PFP ´ e verda-
deira. Em outras palavras, o que justifica “multiplicar cruzado”?
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
Vocˆ e lembra de fra¸ c˜ oes equivalentes? Ent˜ ao, considere, por
2 8
```

### chunk-15

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes
Tipo: EXAMPLE
Paginas: 11-12

exemplo, as fra¸ c˜ oes e . Essas fra¸ c˜ oes s˜ ao equivalentes,
5 20
pois ambas representam o mesmo n´ umero, no caso, o n´ umero
2 8
0 ,
4. Portanto, podemos escrever = e ao “multiplicar cru-
5 20
zado”teremos 2 · 20 = 8 · 5, que, obviamente, ´ e verdade.
a c
1 a propriedade: Considere a propor¸ c˜ ao = . A soma do numerador com o respectivo
b d
denominador da primeira raz˜ ao est´ a para seu denominador, assim como, a soma do numerador
com o respectivo denominador da segunda raz˜ ao est´ a para seu denominador, ou seja,
a + b c + d
=
b d
Prova
a c
=
b d
a c
+ 1 = + 1 (Somamos 1 em cada membro da equa¸ c˜ ao)
b d
a b c d
+ = + (Substitu´ ımos o 1 de cada membro por uma fra¸ c˜ ao.)
b b d d
a + b c + d
=
b d
Da mesma forma, vocˆ e pode mostrar que,
a + b c + d
=
a c
bastando para isso utilizar o inverso das raz˜ oes. Deixamos como exerc´ ıcio para vocˆ e.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-16

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes
Tipo: EXAMPLE
Paginas: 12-14

Sabendo que x + y = 16, determine o valor de x e y na propor¸ c˜ ao = .
y 4
Solu¸ c˜ ao:
Aplicando a 1 a propriedade temos,
︷ ︸︸ ︷
x + y 3 + 4
=
y 4
16 7
=
y 4
Usando a propriedade fundamental das propor¸ c˜ oes:
7 y = 16 · 4
y =
Agora devemos estabelecer o valor de x . Sabemos que x + y = 16 e que y = , ent˜ ao:
x + y = 16
x + = 16
x = 16 −
x =
Observa¸ c˜ ao: Poder´ ıamos, para determinar o valor de x , ter invertido as raz˜ oes e
x 3 y 4
em seguida aplicado a 1 a propriedade. = ⇔ =
y 4 x 3
︷ ︸︸ ︷
y + x 4 + 3
=
x 3
16 7
=
x 3
7 x = 16 · 3
x =
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
2 a propriedade: Essa propriedade ´ e bastante similar ` a propriedade anterior. Ao inv´ es de
a c
adi¸ c˜ ao, teremos a subtra¸ c˜ ao. Considere a propor¸ c˜ ao = .
```

### chunk-17

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes
Tipo: EXAMPLE
Paginas: 12-14

c˜ ao, teremos a subtra¸ c˜ ao. Considere a propor¸ c˜ ao = . A aplicabilidade ´ e similar ao exemplo dado na propriedade anterior.
Aten¸ c˜ ao: Cuidado para n˜ ao “cortar” o que n˜ ao deve!
a − b  c − S d
 S
N˜ ao fa¸ ca: = .
b  S d
 S
12 − 4 
Por exemplo, ´ e errado fazer .
4 
12 − 4 8
Proceda normalmente: = = 2.
4 4
Conta-se que todas as vezes que um estudante comete um erro assim, um urso Panda morre.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
3 a Propriedade: A soma dos numeradores est´ a para a soma dos numeradores, assim como
cada numerador est´ a para seu respectivo denominador, ou seja,
a + c a c
= =
b + d b d
Prova
a c
Iniciamos permutando os extremos da propor¸ c˜ ao = . Essa opera¸ c˜ ao ´ e v´ alida, conforme
b d
d c
a propriedade fundamental das propor¸ c˜ oes, vista anteriormente. Assim teremos: = .
b a
Aplicamos agora a primeira propriedade:
b + d a + c
=
b a
Novamente trocamos os extremos:
a a + c
=
b b + d
c
Permutando os meios ao inv´ es dos extremos, vocˆ e obter´ a a igualdade com .
d
Observa¸ c˜ ao: E comum vermos em outros materiais, sendo livros ou apostilas, as palavras ´
antecedente , para representar o numerador, e consequente , para representar o denominador de
uma raz˜ ao.
4 a Propriedade: A diferen¸ ca dos numeradores est´ a para a diferen¸ ca dos denominadores,
assim como, cada numerador est´ a para seu respectivo denominador, ou seja,
a − c a c
= =
b − d b d
Deixaremos a prova dessa propriedade para vocˆ e, uma vez que ela ´ e an´ aloga ` a prova da
```

### chunk-18

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes
Tipo: FORMULA
Paginas: 14-15

propriedade anterior. Ao inv´ es de usar a primeira propriedade vocˆ e dever´ a utilizar a segunda.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-19

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes
Tipo: EXAMPLE
Paginas: 15-16

Exemplo
a b
Sabendo que a − b = 3, determine o valor de a e b na seguinte propor¸ c˜ ao: = .
3 5
Solu¸ c˜ ao:
a − b a
Utilizando a 4 a propriedade, temos: = . Logo,
3 − 5 3
3 a
=
− 2 3
− 2 a = 9
a = −
Para descobrir o valor de b , voltamos em a − b = 3 e substitu´ ımos a = − . Assim:
− − b = 3
b = − 3 −
b = −
Observa¸ c˜ ao: Se vocˆ e quiser verificar a solu¸ c˜ ao, basta substituir os valores encontrados na
equa¸ c˜ ao a − b =
3. Se tivermos uma igualdade verdadeira, ent˜ ao nossa solu¸ c˜ ao para o problema
est´ a correta. Caso contr´ ario, erramos em algum ponto e ser´ a necess´ ario refazer os c´ alculos.
a b
Essa substitui¸ c˜ ao tamb´ em pode ser feita na propor¸ c˜ ao dada = .
3 5
5 a Propriedade: O produto dos numeradores est´ a para o produto dos denominadores,
assim como o quadrado de cada numerador est´ a para quadrado do seu respectivo denominador,
ou seja,
a · c a 2 c 2
= =
b · d b 2 d 2
Prova
a c a
Vamos tomar a propor¸ c˜ ao = e multiplicar ambos os membros por , assim:
b d b
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
a a c a
· = ·
b b d b
a · c a 2
=
b · d b 2
c 2 c
Da mesma forma vocˆ e obt´ em o resultado para a igualdade , apenas utilizando a raz˜ ao
d 2 d
como fator multiplicativo na prova acima.
```

### chunk-20

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > Exerc´ ıcios de fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 18
Questao: 2

2. Verifique se a raz˜ ao ´ e igual ` a raz˜ ao .
35 100
```

### chunk-21

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > Exerc´ ıcios de fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 18
Questao: 3

3. Um produto que custa R$ 24,00 para ser fabricado ´ e vendido por R$ 38,
```

### chunk-22

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > Exerc´ ıcios de fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 18
Questao: 00

00. Determine
a raz˜ ao entre:
a) o pre¸ co de venda e o pre¸ co de custo.
b) o lucro e o pre¸ co de venda.
```

### chunk-23

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > Exerc´ ıcios de fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 18
Questao: 5

5. Uma loja vendeu de uma pe¸ ca de tecido e depois do restante. O que sobrou foi
5 12
vendido por R$ 1.400,
```

### chunk-24

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > Exerc´ ıcios de fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 18
Questao: 00

00. Sabendo-se que o tecido foi vendido a R$ 5,00 o metro, o comprimento
inicial da pe¸ ca era de:
a) 200m b) 400m c) 800m d) 1.200m e) 1.600m
1 5
6. Um estudante gastou do seu sal´ ario com alimenta¸ c˜ ao. do que sobrou com educa¸ c˜ ao
7 6
e outras despesas. Restaram, ainda, R$ 286,
34. O seu sal´ ario ´ e de:
```

### chunk-25

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > Exerc´ ıcios de fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 18-19
Questao: 7
Instituicao: UERJ 2017
Ano: 2017

7. (UERJ 2017) Um anel cont´ em 15 gramas de ouro 16 quilates. Isso significa que o anel
cont´ em 10 g de ouro puro e 5 g de uma liga met´ alica. Sabe-se que o ouro ´ e considerado 18
quilates se h´ a a propor¸ c˜ ao de 3 g de ouro puro para 1 g de liga met´ alica. Para transformar esse
anel de ouro 16 quilates em outro de 18 quilates, ´ e preciso acrescentar a seguinte quantidade,
em gramas, de ouro puro:
a) 6 b) 5 c) 4 d) 3
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-26

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > Exerc´ ıcios de fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 19
Questao: 8
Instituicao: UFF 2004
Ano: 2004

8. (UFF 2004) Dos 135 funcion´ arios de uma empresa localizada em Niter´ oi, moram na
cidade do Rio de Janeiro. Dos funcion´ arios que moram na cidade do Rio de Janeiro, usam
onibus at´ ˆ e a esta¸ c˜ ao das barcas e, em seguida, pegam uma barca para chegar ao trabalho.
Sabe-se que 24 funcion´ arios da empresa usam exclusivamente seus pr´ oprios autom´ oveis para
chegar ao trabalho, sendo que destes n˜ ao mora na cidade do Rio de Janeiro. Os demais
funcion´ arios da empresa usam somente ˆ onibus para chegar ao trabalho.
Determine:
a) o n´ umero de funcion´ arios da empresa que usam somente ˆ onibus para chegar ao trabalho;
b) o n´ umero de funcion´ arios da empresa que usam somente ˆ onibus para chegar ao trabalho
e que n˜ ao moram na cidade do Rio de Janeiro.
```

### chunk-27

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > Exerc´ ıcios de fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 19
Questao: 9
Instituicao: Vunesp

9. (Vunesp) Um t´ ecnico de laborat´ orio manipula dois recipientes que contˆ em mistura das
substˆ ancias A e B. Embora os volumes das substˆ ancias sejam iguais, num dos recipientes a
1 3
propor¸ c˜ ao de A para B ´ e (uma parte de A para duas de B) e no outro ´ e . Se ele juntar os
2 4
dois conte´ udos num ´ unico recipiente, qual passar´ a a ser a propor¸ c˜ ao de A para B?
```

### chunk-28

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > Exerc´ ıcios de fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 19
Questao: 10
Instituicao: OBMEP 2006
Ano: 2006

10. (OBMEP 2006) Em uma caixa quadrada h´ a 4 bolas brancas
e 2 bolas pretas, e numa caixa redonda h´ a 6 bolas, todas pretas. Paula
quer que tanto na caixa quadrada quanto na redonda a raz˜ ao entre a
quantidade de bolas brancas e o total de bolas em cada caixa seja a
mesma. Quantas bolas brancas Paula precisa tirar da caixa quadrada
e passar para a caixa redonda?
a) Nenhuma b) 1 c) 2 d) 3 e) 4
```

### chunk-29

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > Exerc´ ıcios de fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 19-20
Questao: 10
Instituicao: OBMEP 2017
Ano: 2017

10. (OBMEP 2017) Para obter tinta de cor laranja, devem-se misturar 3 partes de tinta
vermelha com 2 partes de tinta amarela. Para obter tinta de cor verde, devem-se misturar 2
partes de tinta azul com 1 parte de tinta amarela. Para obter tinta de cor marrom, deve-se
misturar a mesma quantidade de tintas laranja e verde. Quantos litros de tinta amarela s˜ ao
necess´ arios para obter 30 litros de tinta marrom?
a) 7 b) 8 c) 9 d) 10 e) 11
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-30

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > De olho no ENEM
Tipo: QUESTION
Paginas: 20
Questao: 11
Instituicao: ENEM 2011
Ano: 2011

11. (ENEM 2011) Uma empresa possui um sistema de controle
de qualidade que classifica o seu desempenho financeiro anual, tendo
como base o do ano anterior. Os conceitos s˜ ao: insuficiente, quando
o crescimento ´ e menor que 1%; regular, quando o crescimento ´ e maior
ou igual a 1% e menor que 5%; bom, quando o crescimento ´ e maior ou
igual a 5% e menor que 10%; ´ otimo, quando ´ e maior ou igual a 10% e
menor que 20%; e excelente, quando ´ e maior ou igual a 20%. Essa empresa apresentou lucro
de R$ 132.000,00 em 2008 e de R$ 145.000,00 em 2009.
De acordo com esse sistema de controle de qualidade, o desempenho financeiro dessa em-
presa no ano de 2009 deve ser considerado:
a) insuficiente b) regular c) bom d) ´ otimo e) excelente
```

### chunk-31

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > De olho no ENEM
Tipo: QUESTION
Paginas: 20
Questao: 12
Instituicao: ENEM 2010
Ano: 2010

12. (ENEM 2010) No monte de Cerro Armazones, no deserto de Atacama, no Chile,
ficar´ a o maior telesc´ opio da superf´ ıcie terrestre, o Telesc´ opio Europeu Extremamente Grande
(E-ELT). O E-ELT ter´ a um espelho prim´ ario de 42 m de diˆ ametro, “o maior olho do mundo
voltado para o c´ eu”.
Dispon´ ıvel em: http://www.estadao.com.br. Acesso em: 27 abr. 2010 (adaptado).
Ao ler esse texto em uma sala de aula, uma professora fez uma suposi¸ c˜ ao de que o diˆ ametro
do olho humano mede aproximadamente 2,1 cm. Qual a raz˜ ao entre o diˆ ametro aproximado
do olho humano, suposto pela professora, e o diˆ ametro do espelho prim´ ario do telesc´ opio citado?
a) 1 : 20 b) 1 : 100 c) 1 : 200 d) 1 : 1 000 e) 1 : 2 000
```

### chunk-32

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > De olho no ENEM
Tipo: QUESTION
Paginas: 21-22
Questao: 15
Instituicao: ENEM 2011
Ano: 2011

15. (ENEM 2011) Sabe-se que a distˆ ancia real, em linha reta, de uma cidade A, localizada
no estado de S˜ ao Paulo, a uma cidade B, localizada no estado de Alagoas, ´ e igual a 2000 km.
Um estudante, ao analisar um mapa, verificou com sua r´ egua que a distˆ ancia entre essas duas
cidades, A e B, era 8 cm. Os dados nos indicam que o mapa observado pelo estudante est´ a na
escala de:
a) 1 : 250 b) 1 : 2 500 c) 1 : 25 000 d) 1 : 250 000 e) 1 : 25 000 000
16. (ENEM 2012) O esporte de alta competi¸ c˜ ao da atualidade produziu uma quest˜ ao
ainda sem resposta: Qual ´ e o limite do corpo humano? O maratonista original, o grego da
lenda, morreu de fadiga por ter corrido 42 quilˆ ometros. O americano Dean Karnazes, cruzando
sozinho as plan´ ıcies da Calif´ ornia, conseguiu correr dez vezes mais em 75 horas.
Um professor de Educa¸ c˜ ao F´ ısica, ao discutir com a turma o texto sobre a capacidade do
maratonista americano, desenhou na lousa uma pista reta de 60 cent´ ımetros, que representaria
o percurso referido.
Dispon´ ıvel em: http://veja.abril.com.br. Acesso em: 25 jun. 2011 (adaptado).
Se o percurso de Dean Karnazes fosse tamb´ em em uma pista reta, qual seria a escala entre
a pista feita pelo professor e percorrida pelo atleta?
a) 1:700 b) 1:7.000 c) 1:70.000 d) 1:700.000 e) 1:7.000.000
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-33

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > De olho no ENEM
Tipo: QUESTION
Paginas: 22
Questao: 17
Instituicao: ENEM 2010
Ano: 2010

17. (ENEM 2010) As Olimp´ ıadas de 2016 ser˜ ao realizadas no RJ. Uma das modalidades
que trazem esperan¸ cas de medalhas para o Brasil ´ e a nata¸ c˜ ao. Ali´ as, a piscina ol´ ımpica merece
uma aten¸ c˜ ao devido suas dimens˜ oes. Piscinas ol´ ımpicas tem 50 m de comprimento e 25 m
de largura. Se a piscina Ol´ ımpica fosse representada em uma escala de 1:100, ela ficaria com
medidas de:
a) 0,5 cent´ ımetro de comprimento e 0,25 cent´ ımetro de largura.
b) 5 cent´ ımetros de comprimento e 2,5 cent´ ımetros de largura.
c) 50 cent´ ımetros de comprimento e 25 cent´ ımetros de largura.
d) 500 cent´ ımetros de comprimento e 250 cent´ ımetros de largura.
e) 200 cent´ ımetros de comprimento e 400 cent´ ımetros de largura.
```

### chunk-34

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Raz˜ ao e Propor¸ c˜ ao > Propriedades das Propor¸ c˜ oes > De olho no ENEM
Tipo: QUESTION
Paginas: 22
Questao: 18
Instituicao: ENEM 2017
Ano: 2017

18. (ENEM 2017) Uma televis˜ ao pode ser posicionada de modo que se consiga enxergar
os detalhes de uma imagem em alta defini¸ c˜ ao. Considere que a distˆ ancia ideal, com conforto vi-
sual, para se assistir ` a televis˜ ao de 32 polegadas ´ e de 1,8 metro. Suponha que haja uma rela¸ c˜ ao
de proporcionalidade direta entre o tamanho da tela (medido em polegada) e a distˆ ancia ideal.
Considere que um espectador disp˜ oe de uma televis˜ ao de 60 polegadas e que ele deseja se po-
sicionar em frente a ela, com conforto visual.
A distˆ ancia da televis˜ ao, em metro, em que o espectador deve se posicionar para que tenha
conforto visual ´ e mais pr´ oxima de
a) 0,33 b) 0,96 c) 1,57 d) 3,37 e) 3,60
```

### chunk-35

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Grandezas
Tipo: THEORY
Paginas: 23-24

Na vida e na sociedade, as grandezas e as medidas est˜ ao presentes em quase todas as ati-
vidades realizadas, por isso ´ e de fundamental importˆ ancia entender como aplicar os racioc´ ınios
que envolvem medidas e grandezas associando-os aos fenˆ omenos quantitativos do mundo em
que vivemos.
Mas afinal de contas, o que ´ e grandeza?
Grandeza ´ e tudo que pode ser medido e, dessa forma, seu valor
pode variar, aumentando ou diminuindo. Temos como exemplos de
grandezas: o comprimento, a massa, o volume, o tempo, a tempera-
tura, a distˆ ancia, a velocidade, entre outras.
Estaremos interessados em estudar dois tipos de comportamentos que ocorrem quando as
grandezas sofrem varia¸ c˜ oes mas apresentam um padr˜ ao de regularidade. Nesse sentido, chama-
remos as grandezas de diretamente proporcionais ou inversamente proporcionais .
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-36

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Grandezas Diretamente Proporcionais
Tipo: THEORY
Paginas: 24

Dizemos que duas grandezas s˜ ao diretamente proporcionais quando est˜ ao relacionadas
de forma que, a raz˜ ao entre elas ´ e uma constante real e positiva. O professor Geraldo Avila ´
( AVILA, 1986) melhor apresenta essa defini¸ ´ c˜ ao:
Defini¸ c˜ ao 3 (Grandezas Diretamente Proporcionais) Diz-se que duas vari´ aveis (ou gran-
dezas) x e y s˜ ao proporcionais – mais especificamente, diretamente proporcionais – se estiverem
assim relacionadas: y = k · x ou y = k , onde k ´ e uma constante positiva, chamada constante
x
de proporcionalidade.
De acordo com a defini¸ c˜ ao acima, temos que duas sucess˜ oes biun´ ıvocas, A = ( a 1 , a 2 , a 3 , ... )
e B = ( b 1 , b 2 , b 3 , ... ), de n´ umeros, reais e positivos, s˜ ao diretamente proporcionais se:
a 1 a 2 a 3
= = = ... = k
b 1 b 2 b 3
em que k ´ e chamada de constante de proporcionalidade .
```

### chunk-37

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Grandezas Diretamente Proporcionais
Tipo: EXAMPLE
Paginas: 24-25

Exemplo
Vamos tomar como exemplo, o pre¸ co a ser pago por determinada quantidade de
gasolina em um Posto de combust´ ıvel.
Pre¸ co (reais) 4 8 12 ... 40 ... ?
Note que quando compramos apenas 1 litro de gasolina, pagamos o valor de R$ 4,00.
Logo, se comprarmos o dobro de gasolina, pagaremos o dobro do pre¸ co, se compramos
o triplo de gasolina, pagaremos o triplo do pre¸ co, assim por diante, sempre na mesma
propor¸ c˜ ao . E aqui est´ a o significado de propor¸ c˜ ao direta, pois se comprarmos x litros
de gasolina, devemos pagar um valor y que, necessariamente, dever´ a ser um m´ ultiplo de
4, ou seja, 4 x reais e, dessa maneira, as grandezas est˜ ao relacionadas pela equa¸ c˜ ao y = 4 · x .
Se vocˆ e foi observador, na tabela n˜ ao temos o pre¸ co a ser pago por 17 litros do
combust´ ıvel. Mas agora j´ a sabemos que o valor a ser pago ser´ a:
y = 4 x = 4 · 17 = 68 reais
Como gasolina ( x ) e pre¸ co ( y ) se relacionam como y = 4 x . Podemos escrever tamb´ em
y
= 4, assim os n´ umeros que expressam as grandezas variam na mesma raz˜ ao ( k ),
x
chamada de constante de proporcionalidade . Podemos escrever:
y
y = kx ou = k
x
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-38

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Grandezas Inversamente Proporcionais
Tipo: THEORY
Paginas: 25

Dizemos que duas grandezas s˜ ao inversamente proporcionais quando est˜ ao relacionadas
de forma que, o produto entre elas ´ e uma constante real e positiva. Novamente recorremos a
defini¸ c˜ ao dada por ( AVILA, 1986): ´
Defini¸ c˜ ao 4 (Grandezas Inversamente Proporcionais) Diz-se que as vari´ aveis x e y s˜ ao
inversamente proporcionais se y = k ou x · y = k , onde k ´ e uma constante positiva (constante
x
de proporcionalidade).
Portanto, temos que duas sucess˜ oes biun´ ıvocas, A = ( a 1 , a 2 , a 3 , ... ) e B = ( b 1 , b 2 , b 3 , ... ), de
n´ umeros, reais e positivos, s˜ ao inversamente proporcionais se:
a 1 · b 1 = a 2 · b 2 = a 3 · b 3 = ... = k
```

### chunk-39

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Grandezas Inversamente Proporcionais
Tipo: EXAMPLE
Paginas: 25-26

Exemplo
Vamos usar o conceito de vaz˜ ao para ilustrar uma situa¸ c˜ ao com duas grandezas
inversamente proporcionais.
Imagine uma piscina cuja capacidade seja de 12.000 litros de ´ agua. Uma mangueira
´ e posta para encher a piscina. Quanto tempo levar´ a para essa piscina ser totalmente
preenchida com ´ agua? Depende da vaz˜ ao da mangueira! Concorda? A tabela a seguir
apresenta algumas possibilidades para a vaz˜ ao de uma mangueira e o tempo que levaria
para encher a piscina.
Vaz˜ ao ( L/h ) Tempo (Hora) A primeira linha da tabela ao lado indica
100 120 que para uma mangueira com vaz˜ ao igual a
150 80 100 litros por hora, precisamos de 120 ho-
200 60 ras para encher a piscina. De fato, se em 1
300 40 hora 100 litros s˜ ao “despejados”, ent˜ ao em
400 30 120 horas teremos 120 × 100 = 12000 litros
de ´ agua.
Observe na tabela acima que quando a vaz˜ ao dobra ou triplica o tempo fica reduzido
para metade ou ter¸ ca parte, respectivamente.
c
O conceito de vaz˜ ao, definido anteriormente, ´ e: V z = ⇒ V z · t = c . Sendo c uma
t
constante, nesse caso, c = 12000, temos que vaz˜ ao e tempo s˜ ao grandezas inversamente
proporcionais.
Note que o produto entre os termos de cada linha ´ e sempre igual a 12000.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-40

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Grandezas Inversamente Proporcionais
Tipo: EXAMPLE
Paginas: 26-28

percurso levando-se em conta a velocidade m´ edia ( km/h ) do ve´ ıculo.
Velocidade (km/h) 40 50 ... 80 100 120
Tempo (hora) 10 8 ... 5 4 ?
Note que quando a velocidade m´ edia ´ e de 40 km/h, o tempo gasto em viagem ´ e de 10
h. Se o condutor aumenta a velocidade, fazendo com que a velocidade m´ edia atinja 80
km/h, ou seja, dobre, o tempo de viagem reduz para 4h, isto ´ e, metade. Se compararmos
com o triplo da velocidade m´ edia, o tempo reduz a ter¸ ca parte, assim por diante, sempre
na propor¸ c˜ ao inversa . E aqui vemos, mais um vez, o significado de propor¸ c˜ oes, onde
velocidade e tempo se relacionam de maneira inversa.
Se vocˆ e foi um bom observador viu que na tabela n˜ ao temos o tempo de viagem para
uma velocidade m´ edia de 120 km/h. Mas, pelo que vimos, 120 km/h ´ e o triplo de 40
km/h, como a propor¸ c˜ ao ´ e inversa, o tempo gasto dever´ a ser a ter¸ ca parte de 10h. Temos:
10 h 10 · 60 min 600 min
= = = 200 min = 3 h 20 min
3 3 3
Observa¸ c˜ ao: Poder´ ıamos sim, ter dividido a fra¸ c˜ ao inicial, mas ter´ ıamos uma
d´ ızima peri´ odica como resposta ou ter´ ıamos que fazer uma aproxima¸ c˜ ao. Veja:
= 3 , 33 ... ≈ 3 , 3h.
Cuidado! 0,3h n˜ ao s˜ ao 3 minutos ou 30 minutos. Note que, se compararmos com o
Temos que a velocidade m´ edia ( y ) para percorrer k quilˆ ometros em determinado tempo
k
( x ) ´ e: y = .
```

### chunk-41

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Grandezas Inversamente Proporcionais
Tipo: EXAMPLE
Paginas: 26-28

y ) para percorrer k quilˆ ometros em determinado tempo
k
( x ) ´ e: y = . diminui e vice-versa, sempre na constante de proporcionalidade k . Podemos escrever:
k
y = ou y · x = k
x
Observa¸ c˜ ao: Vocˆ e pode verificar ainda que se multiplicarmos os n´ umeros das colunas
na tabela, sempre teremos a mesma constante.
E importante destacar que nem sempre duas grandezas s˜ ´ ao diretamente ou inversamente
proporcionais. Tomemos, como exemplo, o caso da rela¸ c˜ ao entre o lado de um quadrado e sua
area. A figura, a seguir, mostra claramente que, se dobrarmos o lado do quadrado, sua ´ ´ area n˜ ao
fica multiplicada por 2 e sim, quadruplicada. N˜ ao sendo, portanto, grandezas proporcionais.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
N˜ ao h´ a propor¸ c˜ ao entre lado e ´ area de um quadrado. Observe a tabela a seguir:
Lado 1 2 3 4 ...
Area ´ 1 4 9 16 ...
Raz˜ ao entre Lado e Area ´ 1 1 1 1 ...
2 3 4
Quando estudamos grandezas proporcionais, em muitos casos, recorremos a simplifica¸ c˜ oes
para entender os conceitos envolvidos no conte´ udo. Nos exemplos a seguir, vamos pensar mais
um pouco sobre isso e ver alguns casos de quando isso acontece.
Vamos pensar mais um pouco...
Por exemplo, podemos supor que o gasto de energia el´ etrica e o
valor a ser pago s˜ ao diretamente proporcionais, uma vez que dobrando
o consumo de energia, teremos de pagar o dobro do pre¸ co. Mas, se
trouxermos o exemplo para a realidade, faz sentido pensarmos nas
bandeiras de consumo (verde, amarela e vermelha) e nas tarifas por
faixa de consumo que podem modificar, de um mˆ es para o outro, e
alteram o valor do kW, podendo fazer com que as grandezas deixem
de ser proporcionais.
Vamos pensar agora em uma outra situa¸ c˜ ao.
```

### chunk-42

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Grandezas Inversamente Proporcionais
Tipo: EXAMPLE
Paginas: 26-28

que podem modificar, de um mˆ es para o outro, e
alteram o valor do kW, podendo fazer com que as grandezas deixem
de ser proporcionais.
Vamos pensar agora em uma outra situa¸ c˜ ao. mercado, dever´ a pagar o pre¸ co x , se compra 3 caixas, pagar´ a 3 x . Nesse racioc´ ınio,
dizemos que as grandezas s˜ ao diretamente proporcionais. Mas, vamos supor que
vocˆ e precise de um n´ umero elevado de caixas de leite, ´ e sensato supor que vocˆ e poder´ a
negociar um desconto com o gerente e, assim, as grandezas deixariam de ser proporcionais.
Outa situa¸ c˜ ao ´ e: se vocˆ e tem uma determinada quantidade de oper´ arios trabalhando
em uma obra, o servi¸ co terminar´ a em x dias. Mas, se vocˆ e tem urgˆ encia e contrata o
dobro de oper´ arios, somos levados a pensar que a obra terminar´ a na metade do tempo, o
que n˜ ao necessariamente acontece de fato, pois simplificamos o problema afirmando que
todas as pessoas trabalhariam com o mesmo empenho. O mais curioso ´ e que, se vocˆ e
possui um grande poder de contrata¸ c˜ ao, nos levaria a crer que a obra possa ser terminada
em um tempo bastante pequeno, digamos at´ e, imposs´ ıvel. Interessante, n˜ ao ´ e?
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-43

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Divis˜ ao Proporcional
Tipo: THEORY
Paginas: 28

Defini¸ c˜ ao 5 Se quisermos dividir um n´ umero N em partes diretamente proporcionais aos
n´ umeros a , b , e c , significa determinar os n´ umeros x , y , e z , de tal modo que:
(I) as sequˆ encias ( x, y, z ) e ( a, b, c ) sejam diretamente proporcionais;
(II) x + y + z = N
Pela 3 a propriedade das propor¸ c˜ oes, temos, ent˜ ao:
x y z x + y + z N
= = = =
y b c a + b + c a + b + c
Defini¸ c˜ ao 6 Se quisermos dividir um n´ umero N em partes inversamente proporcionais ,
aos n´ umeros a , b , e c , significa determinar os n´ umeros x , y , e z , de tal modo que:
(I) as sequˆ encias ( x, y, z ) e ( a, b, c ) sejam inversamente proporcionais;
(II) x + y + z = N
Assim, tamb´ em pela 3 a propriedade das propor¸ c˜ oes, temos, ent˜ ao:
x y z x + y + z N
ax = by = cz = = = = =
1 1 1 1 + 1 + 1 1 + 1 + 1
a b c a b c a b c
Exemplos
```

### chunk-44

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Divis˜ ao Proporcional
Tipo: QUESTION
Paginas: 28-29
Questao: 1

1. Jo˜ ao ganhou 120 bombons em uma rifa e quer distribu´ ı-los em partes diretamente
proporcionais ` as idades de seus filhos, que s˜ ao 3, 4 e 5 anos. Cada filho ganhar´ a quantos
bombons?
Solu¸ c˜ ao:
Vamos supor A , B , C para identificar os filhos. Queremos que: ( A, B, C ) e (3 , 4 , 5)
sejam diretamente proporcionais e que A + B + C =
120. Logo,
A B C
= = = k
3 4 5
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
Continua¸ c˜ ao...
Pela 3 a propriedade das propor¸ c˜ oes, temos:
A + B + C 120
= = k
3 + 4 + 5 12
k = 10
Da´ ı temos que:
A
• = 10, ent˜ ao A = 30
B
• = 10, ent˜ ao B = 40
C
• = 10, ent˜ ao C = 50.
Note que: 30 + 40 + 50 = 120 bombons.
```

### chunk-45

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Divis˜ ao Proporcional
Tipo: QUESTION
Paginas: 29-30
Questao: 2

2. Vamos agora dividir 188 em partes inversamente proporcionais a 3, 4 e 5.
Solu¸ c˜ ao:
Queremos que ( A, B, C ) e (3 , 4 ,
5) sejam diretamente proporcionais e que A + B + C =
188. Logo,
3 A = 4 B = 5 C = k
k k k
Da´ ı temos: A = , B = e C = . Substituindo essas informa¸ c˜ oes em
3 4 5
A + B + C = 188.
k k k
+ + = 188
3 4 5
20 k + 15 k + 12 k
= 188
47 k
= 7188
188 · 60
k =
k = 240
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
Continua¸ c˜ ao...
Assim,
k 240
• A = = = 80
3 3
k 240
• B = = = 60
4 4
k 240
• C = = = 48
5 5
Note que 80 + 60 + 48 = 188.
Nesse exemplo, tivemos que somar fra¸ c˜ oes e, para isso, precisamos calcular o MMC,
Antes de vocˆ e praticar com a lista de exerc´ ıcios que preparamos para vocˆ e, temos um desa-
fio! Topa?
```

### chunk-46

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Divis˜ ao Proporcional
Tipo: QUESTION
Paginas: 30
Questao: 00

00. Essa gratifica¸ c˜ ao foi dividida entre eles em partes que eram
diretamente proporcionais aos respectivos n´ umeros de horas de plant˜ oes que cumpriram
no mˆ es e, ao mesmo tempo, inversamente proporcional ` a suas respectivas idades. Se um
dos funcion´ arios tem 36 anos e cumpriu 24h de plant˜ oes e o outro, de 45 anos cumpriu
18h, coube ao mais jovem receber:
a) R$ 302,50 b) R$ 310,00 c) R$ 312,5 d) R$ 325,00 e) R$ 342,50
```

### chunk-47

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Divis˜ ao Proporcional > Exerc´ ıcios de Fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 30-31
Questao: 21

21. Fa¸ ca o que se pede:
a) Divida o n´ umero 250 em partes diretamente proporcionais a 15, 9 e 6.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
b) Dividir o n´ umero 160 em partes inversamente proporcionais aos n´ umeros 2, 3 e 5.
```

### chunk-48

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Divis˜ ao Proporcional > Exerc´ ıcios de Fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 31
Questao: 23

23. Uma torneira, de vaz˜ ao constante, foi aberta para encher uma caixa, de 3m de altura,
com ´ agua. A cada 15 minutos, o n´ ıvel da ´ agua ´ e medido e varia 50cm a cada medida.
a) Quais s˜ ao as grandezas envolvidas?
b) Construa uma tabela que permita acompanhar a evolu¸ c˜ ao do n´ ıvel da ´ agua na caixa.
c) Identifique o comportamento das grandezas na tabela constru´ ıda no item (b) e constate
que as grandezas tempo e altura s˜ ao diretamente proporcionais.
d) Se ao inv´ es de uma, fossem utilizadas duas torneiras iguais a primeira, fa¸ ca a mesma
coisa que se pede no item (b) e (c). para essa situa¸ c˜ ao. As grandezas ainda s˜ ao diretamente
proporcionais?
```

### chunk-49

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Divis˜ ao Proporcional > Exerc´ ıcios de Fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 31-32
Questao: 24
Instituicao: UFV

24. (UFV) As prefeituras das cidades A, B e C constru´ ıram uma ponte sobre o rio pr´ oximo
a estas cidades. A ponte dista 10 km de A, 12 km de B e 18 km de C. O custo da constru¸ c˜ ao,
R$ 8.600.000,00, foi dividido em partes inversamente proporcionais ` as distˆ ancias das cidades ` a
ponte. Com a constru¸ c˜ ao, a prefeitura da cidade A teve um gasto de:
a) R$ 3.200.000,00
b) R$ 3.600.000,00
c) R$ 3.000.000,00
d) R$ 3.800.000,00
e) R$ 3.400.000,00
25. (UNICAMP) A quantia de R$1.280,00 dever´ a ser dividida entre 3 pessoas. Quanto
receber´ a cada uma, se:
a) A divis˜ ao for feita em partes diretamente proporcionais a 8, 5 e 7?
b) A divis˜ ao for feita em partes inversamente proporcionais a 5, 2 e 10?
26. (ESAF) O TJ do Cear´ a verificou, em pesquisa de opini˜ ao p´ ublica, que, em cada 13
eleitores, 5 votam no PFL, 4 no PMDB, 3 no PT e 1 no PDS. Ent˜ ao, para 6.539.000 eleitores,
a distribui¸ c˜ ao dos votos seria, respectivamente, para o PFL, PT, PDS e PMDB de:
a) 2.650.000; 1.590.000; 530.000; 2.120.000
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
b) 2.515.000; 2.012.000; 1.509.000; 503.000
c) 265.000; 159.000; 53.000; 212.000
d) 2.650.000; 2.120.000; 1.239.000; 530.000
e) 2.515.000; 1.509.000; 503.000; 2.012.000
```

### chunk-50

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Divis˜ ao Proporcional > De olho no ENEM
Tipo: QUESTION
Paginas: 32
Questao: 27
Instituicao: ENEM 2014
Ano: 2014

27. (ENEM 2014) Boliche ´ e um jogo em que se arremessa uma
bola sobre uma pista para atingir dez pinos, dispostos em uma forma¸ c˜ ao
de base triangular, buscando derrubar o maior n´ umero de pinos. A
raz˜ ao entre o total de vezes em que o jogador derruba todos os pinos
e o n´ umero de jogadas determina seu desempenho. Em uma disputa
entre cinco jogadores, foram obtidos os seguintes resultados:
Jogador I: Derrubou todos os pinos 50 vezes em 85 jogadas.
Jogador II: Derrubou todos os pinos 40 vezes em 65 jogadas.
Jogador III: Derrubou todos os pinos 20 vezes em 65 jogadas.
Jogador IV: Derrubou todos os pinos 30 vezes em 40 jogadas.
Jogador V: Derrubou todos os pinos 48 vezes em 90 jogadas.
Qual desses jogadores apresentou maior desempenho?
a) I b) II c) III d) IV e) V
```

### chunk-51

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Grandezas Proporcionais > Divis˜ ao Proporcional > De olho no ENEM
Tipo: QUESTION
Paginas: 34-35
Questao: 32
Instituicao: ENEM 2013
Ano: 2013

32. (ENEM 2013) Muitos processos fisiol´ ogicos e bioqu´ ımicos, tais como batimentos
card´ ıacos e taxa de respira¸ c˜ ao, apresentam escalas constru´ ıdas a partir da rela¸ c˜ ao entre su-
perf´ ıcie e massa (ou volume) do animal. Uma dessas escalas, por exemplo, considera que o
“cubo da ´ area S da superf´ ıcie de um mam´ ıfero ´ e proporcional ao quadrado de sua massa M ”.
HUGHES-HALLETT, et al. C´ alculo e aplica¸ c˜ oes. S˜ ao Paulo: Edgard B¨ ucher, 1999 (adaptado).
Isso ´ e equivalente a dizer que, para uma constante k > 0, a ´ area S pode ser escrita em
fun¸ c˜ ao de M por meio da express˜ ao:
1 1 1 1 2 1 2
a) S = k · M b) S = k · M 3 c) S = k 3 · M 3 d) S = k 3 · M 3 e) S = k 3 · M
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-52

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Simples
Tipo: THEORY
Paginas: 35

Nesta se¸ c˜ ao, estudaremos um conceito muito importante, pois ele
pode ser aplicado aos mais diversos problemas e poder´ a salvar sua
pele em uma quest˜ ao! Mas, cuidado, os alunos e alunas tendem a
achar que ´ e poss´ ıvel usar regra de trˆ es em tudo e n˜ ao ´ e bem as-
sim. Para se utilizar desse conceito, as grandezas envolvidas nos pro-
blemas devem ser proporcionais, sejam elas diretamente ou inversa-
mente.
Os problemas que envolvem grandezas diretamente ou inversamente proporcionais podem
ser resolvidos atrav´ es de um m´ etodo pr´ atico, chamado de regra de trˆ es , podendo ser simples
ou composta, dependendo do n´ umero de grandezas envolvidas no problema.
No caso da regra de trˆ es simples, calculamos as propor¸ c˜ oes entre as grandezas envolvidas e o
nome se d´ a, uma vez que possu´ ımos 3 valores conhecidos e estamos em busca de uma inc´ ognita,
chamada de quarta proporcional.
Para resolver um problema utilizando regra de trˆ es simples, podemos seguir os seguintes
```

### chunk-53

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Simples
Tipo: LIST
Paginas: 35-36

passos:
I. Identificar as grandezas do problema;
II. Reconhecer se as grandezas s˜ ao diretamente ou inversamente proporcionais;
III. Sendo diretamente proporcional, escrevemos a propor¸ c˜ ao entre os 4 valores envolvidos,
sendo 3 conhecidos e uma inc´ ognita;
IV. Sendo inversamente proporcional, fazemos a invers˜ ao de uma das raz˜ oes das grandezas
e, a seguir, escrevemos a propor¸ c˜ ao entre os 4 valores envolvidos, sendo 3 conhecidos e uma
inc´ ognita;
V. Resolvemos a propor¸ c˜ ao estabelecida.
Vejamos alguns exemplos.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
Exemplos
Um trem, deslocando-se a uma velocidade m´ edia de 400 km/h, faz um determinado
percurso em 3 horas. Em quanto tempo faria esse mesmo percurso se a velocidade m´ edia
fosse de 480 km/h?
Solu¸ c˜ ao:
As grandezas do problema s˜ ao velocidade e tempo. Essas grandezas s˜ ao diretamente
ou inversamente proporcionais? Se vocˆ e dobrar a velocidade, o tempo cai pela metade,
sendo, portanto, inversamente proporcional. As setas servem para orienta¸ c˜ ao e lembrar
que, nesse caso, devemos inverter uma das raz˜ oes, pois tem sentido contr´ ario, ou seja,
variam na propor¸ c˜ ao inversa.
Velocidade ↑ Tempo ↓
400 3
480 x
Agora escrevemos a propor¸ c˜ ao, invertendo uma raz˜ ao de qualquer uma das grandezas.
Escolhemos inverter a grandeza da velocidade. Segue:
480 3
=
400 x
480 x = 1200
1200 5
x = = = 2 , 5 h
480 2
Com velocidade de 480 km/h o trem faria o percurso em 2,5 h ou 2 horas e 30 minutos.
```

### chunk-54

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Simples
Tipo: EXAMPLE
Paginas: 36-37

Exemplo
Na bula de um determinado rem´ edio pedi´ atrico, recomenda-se a seguinte dosagem:
5 gotas para cada 2kg do “peso” da crian¸ ca. Se uma crian¸ ca tem 12 kg, qual ser´ a a
dosagem correta?
Solu¸ c˜ ao:
As grandezas do problema s˜ ao o n´ umero de gotas e o peso da crian¸ ca. Essas
grandezas s˜ ao diretamente ou inversamente proporcionais? Se dobrar o peso da crian¸ ca,
a quantidade de medicamente a ser ministrada tamb´ em dobrar´ a, sendo, portanto,
diretamente proporcional.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
Continua¸ c˜ ao...
Note as setas de orienta¸ c˜ ao no mesmo sentido. Isso significa que mantemos a
propor¸ c˜ ao, sem inverter nenhuma raz˜ ao.
Gotas ↑ Peso ↑
5 2
x 12
Agora escrevemos a propor¸ c˜ ao, mantendo a ordem das grandezas:
5 2
=
x 12
2 x = 60
x = = 30
Portanto, para uma crian¸ ca de 12 kg, dever´ a ser ministrada 30 gotas do rem´ edio.
```

### chunk-55

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta
Tipo: THEORY
Paginas: 37

Enquanto a regra de trˆ es simples trabalha sempre com duas grandezas, na regra de trˆ es
composta ´ e poss´ ıvel que se tenha 3 ou mais grandezas ao mesmo tempo. Na verdade, pode-
mos resolver um problema de regra de trˆ es composta aplicando sucessivamente a regra de trˆ es
simples (IMENES und JAKUBOVIC, 1983). Entretanto, julgamos ser mais pr´ atico adotarmos
um procedimento que descreveremos a seguir.
Para resolver um problema utilizando regra de trˆ es composta, podemos seguir os seguintes
```

### chunk-56

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta
Tipo: LIST
Paginas: 37-38

passos:
I. Identificar as grandezas do problema;
II. Organizar as grandezas e os dados em um tipo de tabela;
III. O passo II auxilia no terceiro passo, em que devemos reconhecer se as grandezas s˜ ao
diretamente ou inversamente proporcionais;
Para realizar a avalia¸ c˜ ao do passo III, analisamos a coluna em que est´ a a inc´ ognita x com
cada uma das outras colunas das grandezas envolvidas e deixamos fixos os valores das colunas
que n˜ ao est˜ ao sendo analisadas.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
Parece complicado? Por exemplo, Suponha que vocˆ e tem 3 gran-
dezas, ent˜ ao ter´ a 3 colunas de dados. Suponha, ainda, que a inc´ ognita
x esteja na primeira coluna. Como dito, vocˆ e deve executar o passo
II, ou seja, analisar as grandezas. Vocˆ e deve estudar as grandezas da
coluna 1 e 2, enquanto isso, os valores da coluna 3 ficam fixos. A se-
guir, vocˆ e dever´ a analisar as grandezas das colunas 1 e 3 e, enquanto
isso, a coluna 2 fica fixa. A coluna que possui x deve ser estudada com
cada uma das outras colunas. No exemplo a seguir ficar´ a mais f´ acil
compreender o processo.
IV. Sendo as grandezas diretamente proporcionais, mantemos a raz˜ ao da grandeza analisada
e sendo inversamente proporcional, fazemos a invers˜ ao da raz˜ ao para, a seguir, escrevermos a
propor¸ c˜ ao entre os as trˆ es grandezas. Fazemos a raz˜ ao em que est´ a o x igual ao produto das
outras raz˜ oes.
V. Resolvemos a propor¸ c˜ ao estabelecida.
Vejamos um exemplo e tudo ficar´ a mais f´ acil!
Exemplos
```

### chunk-57

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta
Tipo: QUESTION
Paginas: 38-40
Questao: 1

1. Um ciclista percorre 150 km em 4 dias, pedalando 3 horas por dia. Em quantos
dias faria uma viagem de 400 km, pedalando 4 horas por dia?
Solu¸ c˜ ao
Iniciamos identificando as grandezas. S˜ ao elas: distˆ ancia, dias e horas por dia.
Sendo 3 grandezas envolvidas no problemas, ent˜ ao temos uma regra de trˆ es composta.
Vamos agora ao segundo passo, que ´ e organizar os dados. Acreditamos que ´ e mais
f´ acil colocar a grandeza que possui a inc´ ognita na primeira coluna, pois ela ser´ a analisada
com as demais grandezas. Mas isso n˜ ao ´ e uma regra, vocˆ e pode utilizar a ordem que achar
melhor!
Dias Distˆ ancia Horas
4 150 3
x 400 4
Vamos agora classificar em diretamente ou inversamente proporcionais as grandezas
distˆ ancia e horas. Observe que faremos uma de cada vez e elas ser˜ ao classificadas em
diretamente ou inversamente proporcionais quando analisadas em rela¸ c˜ ao ` a grandeza
que cont´ em a inc´ ognita, dias.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
Continua¸ c˜ ao...
Iremos classificar primeiro a distˆ ancia. Para isso, fixamos a grandeza horas. Uma
pessoa pedala um determinado tempo por dia (vˆ e como n˜ ao estamos variando o valor
dessa grandeza? Ela ´ e fixada!). Se em 4 dias ela anda uma distˆ ancia de 150 km, para
andar 400 km levar´ a mais ou menos dias? Bom, mantendo o ritmo, ela levar´ a mais dias,
ent˜ ao aumentando a distˆ ancia, a quantidade de dias aumentar´ a, na mesma propor¸ c˜ ao .
Logo, distˆ ancia ´ e diretamente proporcional ( ↑ setinha de orienta¸ c˜ ao) a dias.
Da mesma forma faremos com a grandeza horas, s´ o que agora fixaremos a grandeza
distˆ ancia. Uma pessoa, pedalando 3 horas por dia, percorre uma certa distˆ ancia em 4
dias. Se ela pedalar 4 horas por dias, percorrer´ a a mesma distˆ ancia (que est´ a fixada!),
em mais dias ou menos dias? Como a distˆ ancia ´ e fixa, ela pedalando mais tempo por
dia, percorrer´ a a distˆ ancia em menos dias, na propor¸ c˜ ao inversa . Assim, as grandezas
s˜ ao inversamente proporcionais ( ↓ setinha de orienta¸ c˜ ao), pois aumentando as horas
pedaladas por dia, os dias pedalando diminuem.
Vamos colocar os dados novamente na tabela, mas agora com as setas das an´ alises
que fizemos.
Dias Distˆ ancia ↑ Horas ↓
4 150 3
x 400 4
Vamos agora seguir ao passo IV e escrever a propor¸ c˜ ao, lembrando que, sendo direta-
mente proporcional, mantemos a raz˜ ao da grandeza e sendo inversamente proporcional,
fazemos a invers˜ ao da raz˜ ao. Ent˜ ao:
4 150 4
= ·
x 400 3
Note como a raz˜ ao da grandeza, hora, foi invertida. Agora ´ e s´ o resolver!
4 15 0  4
= ·
x 40 0  3
4 1
=
x 2
x = 8
Assim, o ciclista, pedalando 4 horas por dia, levar´ a 8 dias para percorrer 400km.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
Curiosidade
Vocˆ e sabe quem foi Leonardo de Pisa ?
E a palavra Fibonacci ? Lhe parece mais conhecida? Sim! E da- ´
quela famosa sequˆ encia 1 , 1 , 2 , 3 , 5 , 8 , 13 , 21 , · · · Acontece que Leonardo
de Pisa foi quem enunciou essa famosa sequˆ encia e, por isso, tamb´ em ´ e
conhecido por Leonardo Fibonacci. Mas porque estamos falando sobre
isso? Acontece que Leonardo de Pisa fez muito mais do que enunciar a
sequˆ encia de Fibonacci. Foi ele quem difundiu os princ´ ıpios do m´ etodo
de regra de trˆ es, atrav´ es do seu livro Liber Abaci (Livro dos C´ alculos).
Nesse livro h´ a o seguinte problema:
Se um le˜ ao come uma ovelha em 4 horas, um leopardo, em 5 horas
e um urso, em 6 horas, quanto tempo levar˜ ao para comˆ e-la juntos?
Legal, n˜ ao ´ e mesmo?
```

### chunk-58

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Exerc´ ıcios de Fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 40
Questao: 33

33. Duas piscinas tˆ em a mesma largura e a mesma profundidade e comprimentos diferentes.
Na piscina que tem 8 m de comprimento, a quantidade de ´ agua que cabe na piscina ´ e de 45000
litros. Quantos litros de ´ agua cabem na piscina que tem 10 m de comprimento?
```

### chunk-59

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Exerc´ ıcios de Fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 40
Questao: 34

34. Para transportar material bruto para uma constru¸ c˜ ao, foram usados 16 caminh˜ oes com
capacidade de 5 cm 3 cada um. Se a capacidade de cada caminh˜ ao fosse de 4 cm 3 , quantos
caminh˜ oes seriam necess´ arios para fazer o mesmo servi¸ co?
```

### chunk-60

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Exerc´ ıcios de Fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 40
Questao: 35

35. Numa f´ abrica, 12 oper´ arios trabalhando 8 horas por dia conseguem fazer 864 caixas de
papel˜ ao. Quantas caixas ser˜ ao feitas por 15 oper´ arios que trabalhem 10 horas por dia?
```

### chunk-61

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Exerc´ ıcios de Fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 40
Questao: 36

36. Vinte m´ aquinas, trabalhando 16 horas por dia, levam 6 dias para fazer um trabalho.
Quantas m´ aquinas ser˜ ao necess´ arias para executar o mesmo servi¸ co, se trabalharem 20 horas
por dia durante 12 dias?
```

### chunk-62

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Exerc´ ıcios de Fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 40
Questao: 37

37. Trˆ es torneiras enchem uma piscina em 10 horas. Quantas horas levar˜ ao 10 torneiras
para encher 2 piscinas?
```

### chunk-63

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Exerc´ ıcios de Fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 40-41
Questao: 38
Instituicao: SM

38. (SM) Para construir um pr´ edio em 12 meses, foram contratados 100 oper´ arios. Por
causa da urgˆ encia do propriet´ ario, ficou estabelecido que o prazo seria reduzido para 10 me-
ses. Quantos oper´ arios a construtora precisar´ a contratar a mais para conseguir cumprir o prazo?
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
a) 17 b) 20 c) 83 d) 120 e) nenhum
```

### chunk-64

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Exerc´ ıcios de Fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 41
Questao: 39
Instituicao: SM

39. (SM) Em um ´ unico dia, um trabalhador chega a cortar 10
toneladas de cana-de-a¸ c´ ucar. Sabendo que um hectare corresponde
a 10000 m 2 e que, em m´ edia, s˜ ao produzidas cerca de 80 toneladas
de cana-de-a¸ c´ ucar por hectare, a ´ area que um trabalhador consegue
cortar por dia corresponde a um retˆ angulo de base e altura iguais,
respectivamente, a:
a) 20 m e 40 m b) 35 m e 35 m c) 100 m e 40 m d) 25 m
e 100 m e) 25 m e 50 m
```

### chunk-65

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Exerc´ ıcios de Fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 41
Questao: 40
Instituicao: UFMG

40. (UFMG) No ano passado, uma equipe de 13 professores, com um ritmo de trabalho
supostamente constante, corrigiu 3.000 provas em 6 dias. Este ano, o n´ umero de provas aumen-
tou para 5.500 e a equipe foi ampliada para 15 professores. Para se obter uma estimativa do
n´ umero n de dias necess´ arios para totalizar a corre¸ c˜ ao, suponha que, durante todo o per´ ıodo
de corre¸ c˜ ao, o ritmo de trabalho da equipe deste ano ser´ a o mesmo da equipe do ano passado.
O n´ umero n satisfaz a condi¸ c˜ ao:
a) n ≤ 8 b) 8 < n ≤ 10 c) 10 < n ≤ 12 d) n > 12
```

### chunk-66

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Exerc´ ıcios de Fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 41
Questao: 41
Instituicao: PUC-Campinas

41. (PUC-Campinas) Sabe-se que 5 m´ aquinas, todas de igual eficiˆ encia, s˜ ao capazes de
produzir 500 pe¸ cas em 5 dias, se operarem 5 horas por dia. Se 10 m´ aquinas iguais as primeiras
operassem 10 horas por dia durante 10 dias, o n´ umero de pe¸ cas produzidas seria:
a) 1000 b) 2000 c) 4000 d) 5000 e) 8000
```

### chunk-67

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Exerc´ ıcios de Fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 41
Questao: 42
Instituicao: UFMG

42. (UFMG) Uma empresa tem 750 empregados e comprou marmitas individuais congela-
das suficientes para o almo¸ co deles durante 25 dias se essa empresa tivesse mais 500 empregados
qual seria o n´ umero de dias em que as marmitas iriam atender a esta demanda?
```

### chunk-68

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Exerc´ ıcios de Fixa¸ c˜ ao
Tipo: QUESTION
Paginas: 41-42
Questao: 43
Instituicao: UERJ

43. (UERJ) Na imagem da etiqueta, informa-se o valor a ser pago por 0,256 kg de peito
de peru.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
O valor, em reais, de um quilograma desse produto ´ e igual a:
a) 25,60 b) 32,76 c) 40,00 d) 50,00
```

### chunk-69

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: QUESTION
Paginas: 42
Questao: 44
Instituicao: ENEM 2004
Ano: 2004

44. (ENEM 2004) Em quase todo o Brasil existem restaurantes
em que o cliente, ap´ os se servir, pesa o prato de comida e paga o valor
correspondente, registrado na nota pela balan¸ ca. Em um restaurante
desse tipo, o pre¸ co do quilo era R$ 12,
```

### chunk-70

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: QUESTION
Paginas: 42
Questao: 80

80. Certa vez a funcion´ aria digi-
tou por engano na balan¸ ca eletrˆ onica o valor R$ 18,20 e s´ o percebeu o
erro algum tempo depois, quando v´ arios clientes j´ a estavam almo¸ cando.
Ela fez alguns c´ alculos e verificou que o erro seria corrigido se o valor
incorreto indicado na nota dos clientes fosse multiplicado por:
a) 0,54 b) 0,65 c) 0,70 d) 1,28 e) 1,42
```

### chunk-71

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: QUESTION
Paginas: 42
Questao: 45
Instituicao: ENEM 2015
Ano: 2015

45. (ENEM 2015) Um pesquisador, ao explorar uma
floresta, fotografou uma caneta de 16,8 cm de comprimento
ao lado de uma pegada. O comprimento da caneta ( c ), a
largura ( L ) e o comprimento ( C ) da pegada, na fotografia,
est˜ ao indicados no esquema. A largura e o comprimento re-
ais da pegada, em cent´ ımetros, s˜ ao, respectivamente, iguais
a:
a) 4,9 e 7,6
b) 8,6 e 9,8
c) 14,2 e 15,4
d) 26,4 e 40,8
e) 27,5 e 42,5
```

### chunk-72

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: QUESTION
Paginas: 42
Questao: 46
Instituicao: ENEM 2009
Ano: 2009

46. (ENEM 2009) Os calend´ arios usados pelos diferentes povos da Terra s˜ ao muito varia-
dos. O calend´ ario islˆ amico, por exemplo, ´ e lunar, e nele cada mˆ es tem sincronia com a fase da
lua. O calend´ ario maia segue o ciclo de Vˆ enus, com cerca de 584 dias, e cada 5 ciclos de Vˆ enus
corresponde a 8 anos de 365 dias da Terra.
Quantos ciclos teria, em Vˆ enus, um per´ ıodo terrestre de 48 anos?
a) 30 ciclos b) 40 ciclos c) 73 ciclos d) 240 ciclos e) 384 ciclos
```

### chunk-73

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: QUESTION
Paginas: 42-43
Questao: 47
Instituicao: ENEM 2015
Ano: 2015

47. (ENEM 2015) Uma confec¸ c˜ ao possu´ ıa 36 funcion´ arios, alcan¸ cando uma produtividade
de 5400 camisetas por dia, com uma jornada de trabalho di´ aria dos funcion´ arios de 6 horas. En-
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
tretanto, com o lan¸ camento da nova cole¸ c˜ ao e de uma nova campanha de marketing, o n´ umero
de encomendas cresceu de forma acentuada, aumentando a demanda di´ aria para 21600 camise-
tas. Buscando atender essa nova demanda, a empresa aumentou o quadro de funcion´ arios para
```

### chunk-74

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: QUESTION
Paginas: 43
Questao: 96

96. Ainda assim, a carga hor´ aria de trabalho necessita ser ajustada.
Qual deve ser a nova jornada de trabalho di´ aria dos funcion´ arios para que a empresa consiga
atender a demanda?
a) 1 hora e 30 minutos b) 2 horas e 15 minutos c) 9 horas d) 16 horas e) 24 horas
```

### chunk-75

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: QUESTION
Paginas: 43
Questao: 48
Instituicao: ENEM 2009
Ano: 2009

48. (ENEM 2009) Uma escola lan¸ cou uma campanha para seus alunos arrecadarem, du-
rante 30 dias, alimentos n˜ ao perec´ ıveis para doar a uma comunidade carente da regi˜ ao. Vinte
alunos aceitaram a tarefa e nos primeiros 10 dias trabalharam 3 horas di´ arias, arrecadando 12
kg de alimentos por dia. Animados com os resultados, 30 novos alunos somaram-se ao grupo,
e passaram a trabalhar 4 horas por dia nos dias seguintes at´ e o t´ ermino da campanha.
Admitindo-se que o ritmo de coleta tenha se mantido constante, a quantidade de alimentos
arrecadados ao final do prazo estipulado seria de:
a) 920 kg b) 800 kg c) 720 kg d) 600 kg e) 570 kg
```

### chunk-76

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: QUESTION
Paginas: 43
Questao: 49
Instituicao: ENEM 2013
Ano: 2013

49. (ENEM 2013) Uma ind´ ustria tem um reservat´ orio de ´ agua com capacidade para
900 m 3 . Quando h´ a necessidade de limpeza do reservat´ orio, toda a ´ agua precisa ser escoada.
O escoamento da ´ agua ´ e feito por seis ralos, e dura 6 horas quando o reservat´ orio est´ a cheio.
Esta ind´ ustria construir´ a um novo reservat´ orio, com capacidade de 500 m 3 , cujo escoamento da
agua dever´ ´ a ser realizado em 4 horas, quando o reservat´ orio estiver cheio. Os ralos utilizados
no novo reservat´ orio dever˜ ao ser idˆ enticos aos do j´ a existente.
A quantidade de ralos do novo reservat´ orio dever´ a ser igual a:
a) 2 b) 4 c) 5 d) 8 e) 9
```

### chunk-77

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: QUESTION
Paginas: 43
Questao: 50
Instituicao: ENEM PPL 2017
Ano: 2017

50. (ENEM PPL 2017) Uma ind´ ustria tem um setor totalmente automatizado. S˜ ao
quatro m´ aquinas iguais, que trabalham simultˆ anea e ininterruptamente durante uma jornada
de 6 horas. Ap´ os esse per´ ıodo, as m´ aquinas s˜ ao desligadas por 30 minutos para manuten¸ c˜ ao.
Se alguma m´ aquina precisar de mais manuten¸ c˜ ao, ficar´ a parada at´ e a pr´ oxima manuten¸ c˜ ao.
Certo dia, era necess´ ario que as quatro m´ aquinas produzissem um total de 9000 itens. O
trabalho come¸ cou a ser feito ` as 8 horas. Durante uma jornada de 6 horas, produziram 6000
```

### chunk-78

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: LIST
Paginas: 43-44

itens, mas na manuten¸ c˜ ao observou-se que uma m´ aquina precisava ficar parada. Quando o
servi¸ co foi finalizado, as trˆ es m´ aquinas que continuaram operando passaram por uma nova ma-
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
nuten¸ c˜ ao, chamada manuten¸ c˜ ao de esgotamento.
Em que hor´ ario come¸ cou a manuten¸ c˜ ao de esgotamento?
a) 16h 45min b) 18h 30min c) 19h 50min d) 21h 15min e) 22h 30min
```

### chunk-79

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: QUESTION
Paginas: 44
Questao: 51
Instituicao: ENEM 2012
Ano: 2012

51. (ENEM 2012) Uma m˜ ae recorreu ` a bula para verificar a dosagem de um rem´ edio que
precisava dar a seu filho. Na bula, recomendava-se a seguinte dosagem: 5 gotas para cada 2 kg
de massa corporal a cada 8 horas.
Se a m˜ ae ministrou corretamente 30 gotas do rem´ edio a seu filho a cada 8 horas, ent˜ ao a
massa corporal dele ´ e de:
a) 12kg b) 16 kg c) 24 kg d) 36 kg e) 75 kg
```

### chunk-80

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: QUESTION
Paginas: 44
Questao: 52
Instituicao: ENEM 2001
Ano: 2001

52. (ENEM 2001) Um engenheiro, para calcular a ´ area de uma ci-
dade, copiou sua planta numa folha de papel de boa qualidade, recortou
e pesou numa balan¸ ca de precis˜ ao, obtendo 40 g. Em seguida, recor-
tou, do mesmo desenho, uma pra¸ ca de dimens˜ oes reais 100 m × 100 m ,
pesou o recorte na mesma balan¸ ca e obteve 0,08 g. Com esses dados
foi poss´ ıvel dizer que a ´ area da cidade, em metros quadrados, ´ e de,
aproximadamente,
a) 800 b) 10000 c) 320000 d) 400000 e) 5000000
```

### chunk-81

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: QUESTION
Paginas: 44
Questao: 53
Instituicao: ENEM 2001
Ano: 2001

53. (ENEM 2001) Muitas medidas podem ser tomadas em nossas casas visando ` a uti-
liza¸ c˜ ao racional de energia el´ etrica. Isso deve ser uma atitude di´ aria de cidadania. Uma delas
pode ser a redu¸ c˜ ao do tempo no banho. Um chuveiro com potˆ encia de 4800 W consome 4,8
kW por hora. Uma pessoa que toma dois banhos diariamente, de 10 minutos cada, consumir´ a,
em sete dias, quantos kW ?
a) 0,8 b) 1,6 c) 5,6 d) 11,2 e) 33,6
```

### chunk-82

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: QUESTION
Paginas: 44-45
Questao: 54
Instituicao: ENEM 2009
Ano: 2009

54. (ENEM 2009) Uma cooperativa de colheita propˆ os a um fazendeiro um contrato de
trabalho nos seguintes termos: a cooperativa forneceria 12 trabalhadores e 4 m´ aquinas, em
um regime de trabalho de 6 horas di´ arias, capazes de colher 20 hectares de milho por dia, ao
custo de R$ 10,00 por trabalhador por dia de trabalho, e R$ 1.000,00 pelo aluguel di´ ario de
cada m´ aquina. O fazendeiro argumentou que fecharia contrato se a cooperativa colhesse 180
hectares de milho em 6 dias, com gasto inferior a R$ 25.000,00.
Para atender ` as exigˆ encias do fazendeiro e supondo que o ritmo dos trabalhadores e das
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
m´ aquinas seja constante, a cooperativa deveria
a) manter sua proposta.
b) oferecer 4 m´ aquinas a mais.
c) oferecer 6 trabalhadores a mais.
d) aumentar a jornada de trabalho para 9 horas di´ arias.
e) reduzir em R$ 400,00 o valor do aluguel di´ ario de uma m´ aquina.
```

### chunk-83

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > De olho no ENEM
Tipo: QUESTION
Paginas: 45
Questao: 55
Instituicao: ENEM 2012
Ano: 2012

55. (ENEM 2012) Em 20 de fevereiro de 2011, ocorreu a grande erup¸ c˜ ao do vulc˜ ao Bulusan
nas Filipinas. A sua localiza¸ c˜ ao geogr´ afica no globo terrestre ´ e dada pelo GPS (sigla em inglˆ es
para Sistema de Posicionamento Global) com longitude de 124 o 3’ 0” a leste do Meridiano de
Greenwich.
Dado: 1 o equivale a 60’ e 1’ equivale a 60”.
A representa¸ c˜ ao angular da localiza¸ c˜ ao do vulc˜ ao com rela¸ c˜ ao a sua longitude da forma
decimal ´ e
a) 124,02 o b) 124,05 o c) 124,20 o d) 124,30 o e) 124,50 o
```

### chunk-84

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Desafios
Tipo: QUESTION
Paginas: 45
Questao: 56
Instituicao: EPCAR 2017
Ano: 2017

56. ( EPCAR 2017) Certa m´ aquina, funcionando normalmente 5 horas por dia, gasta 3 dias
para produzir 1200 embalagens.
Atualmente est´ a com esse tempo de funcionamento di´ ario reduzido em 20%, trabalhando, as-
sim, apenas T horas por dia.
Para atender uma encomenda de 1840 embalagens, aproveitando ao m´ aximo em todos os
dias o seu tempo T de funcionamento, ela gastar´ a no ´ ultimo dia
a) 120 minutos
b) 150 minutos
c) 180 minutos
d) 200 minutos
```

### chunk-85

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Desafios
Tipo: QUESTION
Paginas: 45-46
Questao: 57
Instituicao: EPCAR 2013
Ano: 2013

57. (EPCAR 2013) Uma empresa foi contratada para executar servi¸ co de pintura no
alojamento dos alunos do 1 ◦ o ano CPCAR. O prazo estabelecido no contrato para a conclus˜ ao
do servi¸ co foi de 10 dias.
O servi¸ co come¸ cou a ser executado por uma equipe de 6 funcion´ arios da empresa, cada um
trabalhando 6 horas por dia.
Ao final do 8 ◦ o dia de servi¸ co somente 3 do servi¸ co de pintura havia sido executado.
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
Para terminar o servi¸ co dentro do prazo, a equipe de servi¸ co recebeu mais 2 funcion´ arios e
todos passaram a trabalhar 9 horas por dia. Com isso a produtividade da equipe duplicou. A
nova equipe, para concluir o trabalho, gastou mais de 1 dia, por´ em menos de 2 dias. Se h
representa o n´ umero de horas que cada funcion´ ario da nova equipe trabalhou no 10 ◦ o dia de
trabalho, ent˜ ao h ´ e um n´ umero compreendido entre
a) 0 e 2 b) 2 e 4 c) 4 e 6 d) 6 e 8
```

### chunk-86

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Desafios
Tipo: QUESTION
Paginas: 46
Questao: 58

58. Um fazendeiro tem ra¸ c˜ ao suficiente para alimentar 60 galinhas durante 80 dias. No fim
de 8 dias compra outras 12 galinhas; 16 dias ap´ os essa compra, uma raposa mata 28 delas.
Durante quantos dias poder´ a alimentar as que restaram, se a quantidade de ra¸ c˜ ao de cada
galinha continua a mesma?
```

### chunk-87

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Desafios
Tipo: QUESTION
Paginas: 46
Questao: 59
Instituicao: M´ exico

59. (M´ exico) Um barco recolhe 30 n´ aufragos numa ilha. Como resultado, os alimentos do
barco que eram suficiente para 60 dias, agora ser˜ ao suficiente para 50 dias. Quantas pessoas
havia no barco antes dele chegar ` a ilha?
a) 15 b) 40 c) 110 d) 140 e) 150
```

### chunk-88

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Regra de Trˆ es > Regra de Trˆ es Composta > Desafios
Tipo: QUESTION
Paginas: 46-47
Questao: 60
Instituicao: Col´ egio Naval 1995
Ano: 1995

60. (Col´ egio Naval 1995) Se k abelhas, trabalhando k meses do ano, durante k dias no
mˆ es e durante k horas por dia, produzem k litros de mel; ent˜ ao o n´ umero de litros de mel
produzidos por W abelhas, trabalhando W horas por dia, em W dias e em W meses do ano
ser´ a:
K 3 W 5 K 4 W 3 W 4
a) 2 b) 3 c) 3 d) 4 e) 3
W K W K K
Raz˜ ao, Propor¸ c˜ ao e Regra de trˆ es
Prof. Leonardo Muniz
Prof. Thiago Jacomino
```

### chunk-89

```text
Documento: razao-proporcao-e-regra-de-tres.pdf
Secao: Gabarito
Tipo: ANSWER_KEY
Paginas: 47-48

√
1 20 3 25 15 3
1. a) b) 3 c) d) e) 10 f) g) h)
4 9 7 7 22 2
19 7 13 2 101
2. N˜ ao
3. a) b)
4. a) x = − 3 b) x = c) x = − d) x =
12 19 15 7 2
5.[C]
6. [C]
7. [B]
8. a) 57 b) 37 9.
10.[D] 11.[E] 12.[C] 13.[E] 13.[B] 14.[B] 15.[E] 16.[D] 17.[C] 18.[D] 19.[A] 20.[A]
2400 1600 960
21. a) 125, 75 e 50 b) , e
31 31 31
22. A=12000, B=8000 e C=10000
23. a) Tempo e altura
b)
Tempo (min) Altura(cm)
15 50
30 100
45 150
60 200
75 250
90 300
c) As grandezas aumentam na mesma propor¸ c˜ ao
d)
Tempo (min) Altura(cm)
15 100
30 200
45 300
As grandezas continuam sendo diretamente proporcionais
24.[B]
25. a) R$ 512,00, R$ 320,00, R$ 448,00 b) R$ 320,00, R$ 800,00, R$ 160,00
26.[E] 27.[D] 28.[A] 29.[B] 30.[C] 31.[A] 32.[D] 33. 56250 litros 34. 20 caminh˜ oes
35. 1350 caixas 36. 8 m´ aquinas 37. 6 horas 38.[B] 39.[E] 40.[B] 41.[C] 42. 15 dias
43.[D] 44.[C] 45.[D] 46.[A] 47.[C] 48.[C] 49.[A] 50.[B] 51.[A] 52.[E] 53.[D] 54.[D] 55.[B] 56.[C]
57.[B] 58. 72 dias 59.[E] 60.[E]
Referˆ encias Bibliogr´ aficas
[COLETIVA 2014] COLETIVA , Obra: Ser protagonista: competˆ encias ENEM: ensino
m´ edio . S˜ ao Paulo : Edi¸ c˜ oes SM, 2014
[COLEC ¸ OES 2011] ˜ COLEC ¸ OES ˜ , Abril: Matem´ atica IV . S˜ ao Paulo : Abril, 2011
[DANTE 2013] DANTE , Luiz R.: Matem´ atica: Contexto e Aplica¸ c˜ oes . S˜ ao Paulo : Atica, ´
2013
[FLOOD und WILSON 2013] FLOOD , Raymond ; WILSON , Robin: A Hist´ oria dos
Grandes Matem´ aticos: as Descobertas e a Propaga¸ c˜ ao do Conhecimento atrav´ es das vidas
dos Grandes Matem´ aticos . S˜ ao Paulo : M.Books do Brasil, 2013
[(Gandhi) 2006] (Gandhi) , Antonio Luiz S.: Problemas Selecionados De Matem´ atica . Rio
de Janeiro : Editora Ciˆ encia Moderna, 2006
[IMENES und JAKUBOVIC 1983] IMENES , Luiz M´ arcio P. ; JAKUBOVIC , Jos´ e: Con-
sidera¸ c˜ oes Sobre o Ensino da Regra de trˆ es composta . S˜ ao Paulo, n. 2,p. 2-5 : Revista do
Professor de Matem´ atica (SBM), 1983
[LACERDA 2009] LACERDA , Jos´ e Carlos A.: Praticando a Aritm´ etica . Rio de Janeiro :
Dissonarte Editora, 2009
[ AVILA 1986] ´ AVILA ´ , Geraldo: Raz˜ oes, propor¸ c˜ oes e regra de trˆ es . S˜ ao Paulo, n. 8,p. 1-8 :
Revista do Professor de Matem´ atica (SBM), 1986
```

