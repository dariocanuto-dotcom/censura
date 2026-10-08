---
name: Transporte SRT e ARIB
description: Restrições observadas no stream SRT real e na captura de Closed Caption ARIB B24.
---

Uma emissora SRT pode recusar ou interromper uma segunda conexão simultânea. A ponte de vídeo deve concentrar a leitura do transporte e os metadados no mesmo processo FFmpeg; capturas auxiliares precisam pausar a ponte antes de abrir outra conexão.

**Por que:** testes com vídeo HLS e sondagem/captura ARIB concorrentes produziram falhas de conexão e códigos de saída variáveis, embora o transporte continuasse válido.

**Como aplicar:** ao adicionar qualquer leitor SRT, compartilhar a sessão existente ou pausar e restaurar a ponte de vídeo. No FFmpeg, `arib_caption` é um codec de legenda com `libaribcaption` como decoder; selecione-o por codec e use ASS como formato de saída.

Para salvar relatórios no computador do operador, a seleção de pasta depende do File System Access API e precisa ocorrer em uma ação explícita do usuário; o fallback correto é baixar os arquivos. A leitura de loudness no player web é RMS aproximada, não substitui um medidor ITU-R BS.1770-4 para conformidade legal.

**Por que:** o navegador não pode gravar silenciosamente em um caminho arbitrário do HD, e a API Web Audio não fornece medição LUFS integrada com ponderação K e janela de programa.

**Como aplicar:** sempre oferecer seleção de diretório com permissão `readwrite` e download alternativo; rotular a medição web como aproximada e reservar a validação normativa final para análise dedicada.

Os alertas de broadcast devem ser deduplicados por incidente e só liberar novo envio depois da recuperação do sinal; Telegram e WhatsApp usam o mesmo endpoint interno de notificações.

**Por que:** VU, HLS e sondagem atualizam o estado várias vezes por segundo, e enviar cada transição para o celular gera uma enxurrada de mensagens.

**Como aplicar:** guardar a chave do incidente em memória, enviar uma vez na entrada da falha e limpar a chave somente quando o item monitorado voltar ao estado normal.

Na captura ARIB, o stream deve ser selecionado por tipo de legenda (`0:s?`) ou pelo índice exato do stream cujo codec é `arib_caption`; seletor de metadata `0:m:codec:arib_caption` não funciona.

**Por que:** nesta versão do FFmpeg, `arib_caption` é um codec de subtitle e o TS pode aparecer como `data` na sondagem, então o tipo textual e o codec reportado podem divergir.

**Como aplicar:** preferir o índice descoberto na sondagem do mesmo programa; usar `libaribcaption` com saída ASS e enviar o `programId` quando houver seleção de HD/1Seg.

O overlay do PWV deve exibir somente linhas ARIB decodificadas em SRT/UDP; texto de demonstração não pode aparecer como se fosse Closed Caption da emissora.

**Por que:** uma legenda simulada mascara falha de ingestão e pode levar o operador a acreditar que o CC real está sendo monitorado.

**Como aplicar:** manter a camada sobre o elemento de vídeo com prioridade visual, alternar as linhas capturadas e deixar a tela sem legenda real até uma captura ARIB válida.

Para ler EIT, não remuxe o TS para outro MPEG-TS: o FFmpeg descarta o PID 0x12 nessa saída. Mapeie o stream `epg` como dados e analise as seções binárias emitidas.

**Por que:** o remux de teste removeu todos os pacotes EIT, enquanto `-map 0:d -c copy -f data` preservou as seções e permitiu decodificar os eventos.

**Como aplicar:** na leitura EPG de MPEG-TS, use a saída de dados do stream reconhecido como `epg`; teste com uma tabela EIT sintética antes de alterar muxers ou seletores.