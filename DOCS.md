 # Documentação do Projeto (inicial)

 Resumo curto

 Este backend automatiza a coleta de arquivos CSV de um IHM via FTP, processa os dados, realiza backups locais e persiste registros na tabela `Relatorio` usando TypeORM. Também fornece uma API Express para consultas e upload manual de arquivos.

 Como executar localmente

 1. Copie `.env.example` para `.env` e preencha as variáveis necessárias (conexão com DB, credenciais do IHM, porta, etc.).
 2. Instale dependências:

	 ```bash
	 npm install
	 ```

 3. Build (opcional):

	 ```bash
	 npm run build
	 ```

 4. Inicie o servidor:

	 ```bash
	 npm start
	 ```

 5. Em desenvolvimento, execute:

	 ```bash
	 npm run dev
	 ```

 Testes

 - Testes unitários: `npm test`
 - Testes de integração com IHM só serão executados quando `RUN_IHM_INTEGRATION=true`.

 Principais arquivos

 - `src/services/parserService.ts` — parser canônico de CSVs
 - `src/services/IHMService.ts` — integração FTP
 - `src/services/backupService.ts` — armazenamento de backups
 - `src/services/fileProcessorService.ts` — mapeamento para `Relatorio` e persistência

 Próximos passos recomendados

 - Extrair e aplicar as interfaces de serviços definidas em `src/types/services.ts` para permitir injeção de dependência completa.
 - Documentar os endpoints do Express com exemplos (ou gerar OpenAPI/Swagger).
 - Adicionar um pipeline de CI que execute build e testes automáticos.
