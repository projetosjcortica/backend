import { Client, FileType } from 'basic-ftp';
import * as path from 'path';

export default class IHMService {
  IP: string;
  user: string;
  password: string;
  client: Client;
  constructor(IP: string, user: string, password: string) {
    this.IP = IP;
    this.user = user;
    this.password = password;
    this.client = new Client();
    this.client.ftp.verbose = true;
  }

  // Determine if a remote filename should be excluded (system backups)
  // You can override via environment variable IHM_EXCLUDE_REGEX with one or more
  // comma-separated regular expressions (JS syntax, without //).
  static isExcludedFile(name: string) {
    const raw = process.env.IHM_EXCLUDE_REGEX || '';
    const userRegexes = raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        try { return new RegExp(s, 'i'); } catch (e) { return null; }
      })
      .filter(Boolean) as RegExp[];

    const defaults: RegExp[] = [/_sys/i, /^Relatorio_\d{2}_\d{2}(_sys)?\.csv$/i, /^Relatorio_\d{1,2}\.csv$/i];
    const patterns = [...userRegexes, ...defaults];
    for (const r of patterns) {
      if (r.test(name)) return true;
    }
    return false;
  }

  async getArc(localDir: string) {
    const remoteDir = '/InternalStorage/data/';
    try {
      await this.client.access({ host: this.IP, user: this.user, password: this.password });
      console.log(`Navegando para o diretório remoto: ${remoteDir}`);
      await this.client.cd(remoteDir);
      const fileList = await this.client.list();
      console.log('Arquivos encontrados:', fileList.map(f => f.name));
      let csvFiles = fileList.filter(item => item.type === FileType.File && item.name.toLowerCase().endsWith('.csv'));
      // filter out system backups according to patterns
      csvFiles = csvFiles.filter(f => {
        if (IHMService.isExcludedFile(f.name)) {
          console.log('Excluding system/backup file from download:', f.name);
          return false;
        }
        return true;
      });
      if (csvFiles.length === 0) {
        console.error('Nenhum arquivo .csv encontrado no diretório remoto.');
        return null;
      }
      for (const file of csvFiles) {
        try {
          file.modifiedAt = await this.client.lastMod(file.name);
        } catch (err) {
          console.warn(`Não foi possível obter data de modificação para ${file.name}`);
          file.modifiedAt = new Date(0);
        }
      }
        // ensure modifiedAt exists
        const filtered = csvFiles.filter(f => f.modifiedAt instanceof Date);
        filtered.sort((a, b) => (b.modifiedAt!.getTime() - a.modifiedAt!.getTime()));
        const selected = filtered[0];
        if (!selected) {
          console.error('Nenhum arquivo com data disponível');
          return null;
        }
        const selectedFile = selected.name;
      const localPath = path.join(localDir, selectedFile);
      console.log(`Baixando o arquivo mais recente: ${selectedFile}`);
      await this.client.downloadTo(localPath, selectedFile);
      console.log(`Arquivo ${selectedFile} baixado com sucesso!`);
      return { success: true, file: selectedFile, localPath };
    } catch (error: any) {
      if (error.code === 'ETIMEDOUT') {
        console.error('Erro: Conexão com o servidor FTP expirou (timeout).');
        throw new Error('Não foi possível conectar ao servidor FTP: tempo esgotado.');
      } else if (error.code === 'ECONNREFUSED') {
        console.error('Erro: Conexão recusada pelo servidor.');
        throw new Error('Conexão recusada pelo servidor FTP.');
      } else {
        console.error('Erro ao baixar arquivo:', error);
        throw new Error('Erro inesperado ao baixar arquivo.');
      }
    } finally {
      this.client.close();
    }
  }

  async getDir(local: string, remote: string) {
    try {
      await this.client.access({ host: this.IP, user: this.user, password: this.password });
      await this.client.downloadToDir(local, remote);
      return { success: true };
    } catch (error: any) {
      if (error.code === 'ETIMEDOUT') {
        console.error('Erro: Conexão com o servidor FTP expirou (timeout).');
        throw new Error('Timeout de conexão FTP.');
      } else {
        console.error('Erro ao baixar diretório:', error);
        throw new Error('Erro ao baixar diretório.');
      }
    } finally {
      this.client.close();
    }
  }
}
// TODO: Fazer um sistema de auto busca periodica
// TODO 