// Serviço para processar CSV
exports.processCSV = async (csvData) => {
  // Simulação de processamento de CSV
  if (!csvData || !csvData.rows) {
    throw new Error('Dados CSV inválidos');
  }
  // Aqui você pode adicionar lógica para salvar no banco, etc.
  return { message: 'CSV processado com sucesso', rows: csvData.rows.length };
};
