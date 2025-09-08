// Serviço para operações de banco de dados
exports.cleanDatabase = async () => {
  // Simulação de limpeza de banco
  return { message: 'Banco limpo com sucesso' };
};

exports.getTableData = async () => {
  // Simulação de consulta de tabela
  return { table: 'Exemplo', data: [{ id: 1, nome: 'Linha 1' }, { id: 2, nome: 'Linha 2' }] };
};
