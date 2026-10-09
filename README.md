# DC Censura Pro

Projeto importado do Replit para desenvolvimento local. Interface React/Vite, API Express e PostgreSQL com Drizzle.

## Preparação

Use Node.js 24 e pnpm. Execute `pnpm install` na raiz.

O banco original e suas credenciais não estão no ZIP. Para usar os dados existentes, exporte o banco no Replit e restaure em PostgreSQL. Para iniciar um banco vazio, configure DATABASE_URL e execute `pnpm --filter @workspace/db push` (revise as alterações propostas antes de confirmar).

## Rodar no PowerShell

Terminal da API:

```powershell
$env:DATABASE_URL = 'postgresql://usuario:senha@localhost:5432/censura'
$env:NODE_ENV = 'development'
pnpm --filter @workspace/api-server dev
```

Terminal da interface:

```powershell
pnpm --filter @workspace/classind dev
```

Abra http://localhost:5173. A interface encaminha /api para a API em http://localhost:3001. PORT e BASE_PATH continuam disponíveis para substituir os padrões.

## Verificação

`pnpm typecheck` e `pnpm build`.

## Vídeo SRT/ARIB

Requer FFmpeg com suporte SRT e libaribcaption/libaribb24. As rotas de vídeo precisam de validação adicional no Windows. Não estão incluídos instaladores do FFmpeg ou dados do banco.

Nunca publique credenciais. O arquivo ZIP original e arquivos .env são ignorados pelo Git.

## Banco local de testes configurado

PostgreSQL em 127.0.0.1:5433; banco censura_teste. Credenciais locais em .env (ignorado pelo Git). Binários e dados em .runtime (ignorados).

Inicie banco e API: powershell -ExecutionPolicy Bypass -File scripts/start-local-api.ps1

Em outro terminal: pnpm --filter @workspace/classind dev

Pare o banco: powershell -ExecutionPolicy Bypass -File scripts/stop-local-db.ps1

Dados fictícios de demonstração em scripts/seed-local.sql. Os dados do Replit não foram importados.

## Gravação de um canal com BTS completo

Configure a fonte e o HD em **Gravação · BTS** ou **Configurações → Gravação Contínua**. **Gravar/Parar** controla um único canal. A API salva a configuração para o próximo reinício. O transporte recebido é copiado byte por byte para `.ts`, sem recodificar vídeo/áudio, filtrar programas ou reconstruir tabelas. Todos os PIDs, tabelas, EPG, ARIB CC e programas presentes na fonte ficam nos arquivos originais; pacotes ausentes na recepção não podem ser recuperados pela gravação.

Blocos de 1, 2, 5 ou 10 minutos, pastas por canal/dia e nomes com horário brasileiro permanecem disponíveis, assim como a barra de progresso. O tamanho depende da taxa original do BTS, sem os limites econômicos de MP4/MKV. A limpeza usa retenção de 1 a 90 dias e reserva de 10% do disco, removendo somente os blocos antigos gerenciados. Downloads em andamento ficam protegidos.

Na busca, **Baixar** exporta o bloco completo e **Informações BTS** gera JSON com programas, codecs, canais de áudio, closed caption identificado, inventário de PIDs/tabelas e eventos EPG encontrados no arquivo. Também é possível exportar os blocos em ZIP. Gravações MP4/MKV anteriores continuam no histórico, mas não ganham dados que não foram gravados originalmente.

Um bloco em andamento usa `.partial` e entra na busca após finalizar. A fonte precisa enviar transporte TS/BTS de 188, 192 ou 204 bytes. O computador/API precisam continuar ligados. Preview e gravador ainda usam conexões independentes; fontes que permitem apenas um cliente SRT precisam de relay/saída adicional.

Testes: `node --experimental-strip-types --test scripts/recordings.test.mjs scripts/raw-recordings.test.mjs`. Com FFmpeg no PATH, `node --experimental-strip-types scripts/recordings-integration.mjs` verifica a captura de um sinal UDP sintético em TS, o progresso e a finalização dos blocos em diretório isolado.

## Entrada selecionada e exportação

A gravação acompanha a entrada SRT/UDP/RTP selecionada no monitor, incluindo sua troca durante a captura. A entrada SDI exige integração real com driver/SDK e não é simulada pelo gravador. O codec de entrada é detectado pelo FFmpeg, com decodificação de H.264/XAVC, H.265 e MPEG-2/XDCAM conforme o sinal recebido.

Na busca, clique **Converter** em um bloco e selecione MXF, MOV, MP4, AVI, MKV, FLV, 3GP, MPEG-PS, MPEG-TS, ASF/WMV, DV ou GXF. São cópias audiovisuais do programa associado ao bloco. O TS/BTS original permanece disponível separadamente, conservando todos os programas e as tabelas/CC/EPG. Os perfis incluem H.264, H.265, MPEG-2, XDCAM HD422 50 Mb/s e XAVC Intra Class 100 em MXF. Combinações incompatíveis não aparecem na seleção.

Há uma conversão por vez, com progresso e download ao terminar. Os arquivos de exportação ficam em `.runtime/export-jobs`; não são gravados por cima dos originais. A API precisa permanecer ligada durante a conversão e o download. DV/3GP/FLV/ASF/GXF/MPEG-PS usam resoluções e layouts de áudio compatíveis com seus formatos; GXF divide o primeiro áudio em duas faixas mono. A exportação pára se o disco temporário alcançar a reserva de 10%. Perfis broadcast foram validados por codificação e leitura com FFmpeg/ffprobe; compatibilidade com equipamentos específicos precisa ser verificada nesse equipamento.

Validação dos formatos: `node scripts/exports-integration.mjs`, com FFmpeg/ffprobe no PATH. O perfil Sony de XAVC usa [o suporte AVC-Intra do libx264 no FFmpeg](https://www.ffmpeg.org/doxygen/8.0/libx264_8c_source.html).

Gravar permite escolher BTS original (TS), H.264 ou H.265 (MP4/MKV), resolução e bitrate. Perfil econômico: H.265 640×360, vídeo 384 kb/s + áudio 64 kb/s, blocos de 2 minutos e retenção de 60 dias (~290 GB, além da reserva de 10%). Compressão grava vídeo e primeiro áudio, sem preservar EPG, tabelas e CC ARIB. A retenção aceita até 90 dias e depende do espaço disponível. Codec e ajustes persistem após reiniciar.
