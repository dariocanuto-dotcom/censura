# NDI nativo — Ubuntu e Windows

O aplicativo usa o SDK NDI 6 para localizar fontes e receber vídeo e áudio. As bibliotecas do SDK são instaladas separadamente, no computador da API. NDI é uma marca da Vizrt NDI AB.

## Arquivos recebidos

- `Install_NDI_SDK_v6_Linux.tar.gz`: SDK Linux, com biblioteca x86_64 6.3.2.
- `Install_NDI_SDK_v6_Android.tar.gz` e `NDI 6 SDK (Android).exe`: pacotes Android; não substituem a DLL Windows.

## Ubuntu

Atualize o aplicativo para a versão que contém `scripts/ndi-receiver.py`. Copie o pacote Linux e `ubuntu/instalar-ndi.sh` para o Ubuntu. Execute:

```bash
sudo bash instalar-ndi.sh /caminho/Install_NDI_SDK_v6_Linux.tar.gz
```

O instalador oficial apresenta os termos do SDK para aceitação pelo operador. Em seguida o script configura a biblioteca, testa a descoberta e reinicia apenas `server-dtv`.

## Windows x64

Instale o SDK/Runtime **NDI para Windows x64** e Python 3.10 ou superior. Não execute o instalador Android para esse propósito. Configure no ambiente da API:

```text
NDI_LIBRARY_PATH=C:/caminho/Processing.NDI.Lib.x64.dll
NDI_PYTHON=C:/caminho/python.exe
```

O aplicativo também procura a DLL em `NDI_RUNTIME_DIR_V6`, no diretório padrão do SDK 6 e no Runtime 6. Reinicie a API depois da instalação. O FFmpeg usado pelo aplicativo deve estar no PATH.

## Operação

Em **Entradas > NDI**, escolha **SDK NDI nativo**, clique em **Localizar fontes NDI**, escolha o nome da fonte e salve. A recepção externa RTSP/SRT continua disponível como alternativa.

O receptor atual requer uma fonte com vídeo e áudio. Ele converte o vídeo para H.264, até Full HD, e o áudio para AAC, até oito canais, para entregar ao monitor. NDI não fornece um BTS original com tabelas MPEG-TS, PIDs, EPG e CC ARIB; esses dados não são inventados. Para gravar NDI, escolha H.264 ou H.265 em MP4/MKV. Mudanças de resolução ou formato do áudio exigem reconexão da entrada.

No Windows, o Runtime oficial 6.3.2 foi instalado e o fluxo completo foi testado com uma fonte NDI temporária: vídeo 320×180 e dois canais de áudio chegaram ao HLS e ao medidor. A descoberta com o SDK real e os testes de buffers também passaram. A instalação e recepção no Ubuntu ainda precisam ser validadas no computador Ubuntu.
