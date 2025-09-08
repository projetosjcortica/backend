const fs = require('fs');
const path = require('path');

const backupDir = path.resolve(__dirname, '..', 'backups');
const workDir = path.resolve(__dirname, '..', 'work');

// garante diretórios
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

exports.backupFile = async (file) => {
  // file: { fieldname, originalname, encoding, mimetype, buffer }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `${timestamp}-${file.originalname}`;
  const backupPath = path.join(backupDir, baseName);
  const workPath = path.join(workDir, baseName);

  // Se o multer usa buffer (memoryStorage)
  if (file.buffer) {
    fs.writeFileSync(backupPath, file.buffer);
    fs.writeFileSync(workPath, file.buffer);
  } else if (file.path) {
    // se multer salvou em disco (diskStorage), copia
    fs.copyFileSync(file.path, backupPath);
    fs.copyFileSync(file.path, workPath);
  } else {
    throw new Error('Unsupported file object');
  }

  const meta = {
    originalName: file.originalname,
    storedName: baseName,
    mimetype: file.mimetype,
    size: file.size || (file.buffer && file.buffer.length) || null,
    backupPath,
    workPath,
    timestamp: new Date().toISOString(),
  };

  // salvar metadata JSON no diretório de backup
  const metaPath = path.join(backupDir, baseName + '.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  return meta;
};
