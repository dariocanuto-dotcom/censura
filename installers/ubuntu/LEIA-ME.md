# SERVER DTV+ CENSURA PRO — teste Ubuntu

Pacote para **Ubuntu 24.04 LTS amd64**, com systemd e conexão à internet. Execute em uma instalação de teste. O instalador instala dependências, cria um banco PostgreSQL novo e um serviço próprio, sem importar senhas, gravações ou banco do Windows.

## Instalar

Extraia o ZIP, abra o terminal na pasta extraída e execute:

```bash
sudo bash instalar.sh
```

Abra **http://localhost:8090/monitor**. Na rede local, substitua `localhost` pelo IP do Ubuntu. Caso o firewall já esteja ativo, permita a porta 8090 apenas para sua rede de teste. O instalador não altera o firewall.

Em **Gravar**, selecione `/var/lib/server-dtv/gravacoes`. No relatório, use `/var/lib/server-dtv/relatorios`. Para usar outro HD, monte-o em uma pasta Linux e conceda permissão de escrita ao usuário `server-dtv`. Não use caminhos como `D:\` no Ubuntu.

Configure as entradas SRT novamente no navegador do Ubuntu. O modo PVW com CC requer que o monitor permaneça aberto e o overlay de legenda esteja ativado.

## Operação

```bash
sudo systemctl status server-dtv
sudo systemctl restart server-dtv
sudo systemctl stop server-dtv
sudo journalctl -u server-dtv -f
```

Aplicação: `/opt/server-dtv/app`. Estado e gravações: `/var/lib/server-dtv`. Configuração: `/etc/server-dtv/server-dtv.env`. O serviço web usa diretamente a porta 8090 e não instala Nginx. A instalação não sobrescreve uma instalação anterior. Se houver erro, confira a mensagem antes de repetir; não apague o banco ou as gravações.

O pacote baixa Node.js 24 LTS do [site oficial](https://nodejs.org/dist/latest-v24.x/) com verificação SHA-256 e FFmpeg GPL 8.1 dos [builds BtbN](https://github.com/BtbN/FFmpeg-Builds/releases/tag/latest). Antes de prosseguir, verifica os recursos SRT, libaribcaption, libx264, libx265 e drawtext.

## Validação deste pacote

Código e builds verificados no Windows. A instalação completa em Ubuntu ainda precisa ser validada na máquina de teste. A detecção automática de placas BDA e HDs da versão Windows não se aplica ao Linux; configure pastas montadas manualmente e use entradas de rede SRT/UDP/RTP.
