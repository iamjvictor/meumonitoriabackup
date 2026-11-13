# Plano

1. Confirmar cadeia de tempo e gargalo no backend e no servidor; reservar interfaces HTTP existentes.
2. Implementar espera segura no cliente e fila/capacidade no parser em arquivos separados, sem travar processo pelo tempo de espera, preservando integridade por request.
3. Revisar e executar testes independentes, incluindo erros, concorrência e exceções. Aplicar processo local atualizado somente após concluir trabalho em andamento; não reiniciar serviços alheios.
4. Reprocessar o documento IFF específico no banco autorizado, acompanhando chunks, embeddings, grafo e persistência. Registrar o que foi efetivamente validado, sem alegar completude a partir apenas de contagens.
