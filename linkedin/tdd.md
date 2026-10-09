# TDD na prática: construir com segurança antes de acelerar

TDD, ou Test-Driven Development, é uma forma de desenvolver software em que o teste vem antes da implementação.

O ciclo é simples:

```text
RED → GREEN → REFACTOR
```

- **RED:** escrevemos um teste que falha;
- **GREEN:** implementamos o mínimo necessário para fazê-lo passar;
- **REFACTOR:** melhoramos o código mantendo o comportamento validado.

No nosso desenvolvimento, estamos aplicando esse ciclo principalmente nas partes mais sensíveis do fluxo de documentos e RAG.

Antes de alterar um normalizador, um parser ou a criação de chunks, definimos o comportamento esperado. Por exemplo:

- um documento deve manter a ordem correta de leitura;
- uma fórmula não pode ser separada de forma incorreta;
- um chunk não deve misturar conteúdos de blocos diferentes;
- um contrato de Storage precisa preservar o caminho esperado;
- uma questão incompleta deve ser identificada antes de chegar à IA.

Quando o teste falha, ele mostra exatamente o que ainda não foi implementado. Depois da correção, o teste passa e se torna uma proteção permanente contra regressões.

O objetivo não é escrever testes apenas para aumentar cobertura. É transformar decisões importantes do produto em comportamentos verificáveis.

Essa prática traz benefícios concretos:

- reduz mudanças baseadas em suposições;
- torna os erros mais fáceis de localizar;
- documenta o comportamento esperado;
- aumenta a segurança para evoluir o sistema;
- evita que uma melhoria quebre outra parte do fluxo.

Em projetos que envolvem IA, isso é especialmente importante. O modelo pode ser probabilístico, mas a infraestrutura ao redor dele precisa ter contratos claros e previsíveis.

TDD nos ajuda a manter essa base confiável enquanto o produto evolui.

No fim, desenvolver mais rápido não é apenas escrever código rapidamente. É reduzir o custo de descobrir problemas tarde demais.

#TDD #Testes #EngenhariaDeSoftware #Qualidade #Desenvolvimento #InteligenciaArtificial
