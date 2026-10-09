import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.cwd();
const codec=process.env.TEST_CODEC || 'copy'; const format=codec==='copy'?'ts':'mp4';
const root = resolve('.runtime', `recordings-test-${Date.now()}`);
await mkdir(root, {recursive:true});
process.chdir(root);
const service = await import(pathToFileURL(join(workspace,'artifacts/api-server/src/lib/recordings.ts')));
const senders=[]; const portBase=30000+Math.floor(Math.random()*15000);
try {
  for (const id of ['1']) {
    const port=portBase+Number(id);
    const sender=spawn('ffmpeg',['-hide_banner','-loglevel','error','-re','-f','lavfi','-i','testsrc2=size=320x180:rate=10','-f','lavfi','-i','sine=frequency=1000:sample_rate=48000','-c:v','libx264','-preset','ultrafast','-g','10','-c:a','aac','-f','mpegts',`udp://127.0.0.1:${port}?pkt_size=1316`],{windowsHide:true,stdio:['pipe','ignore','pipe']});
    sender.stderr.on('data',chunk=>console.error('sender',id,chunk.toString())); sender.on('error',error=>console.error(error)); senders.push(sender);
    await service.configureChannel({id,name:`Teste_${id}`,url:`udp://127.0.0.1:${port}?fifo_size=100000&overrun_nonfatal=1`,directory:root,enabled:true,codec,format,videoKbps:300,audioKbps:64,retentionDays:30,width:320,height:180});
  }
  await new Promise(ok=>setTimeout(ok,20000));
  assert.equal(service.status().channels.filter(c=>c.running).length,1,'gravador TS ativo');
  for(const channel of service.status().channels) {
    assert.ok(channel.activeBlock,`bloco em andamento do canal ${channel.id}`);
    assert.ok(Date.parse(channel.activeBlock.end)>Date.parse(channel.activeBlock.start));
    assert.ok(channel.activeBlock.bytes>0);
  }
  console.log(JSON.stringify(service.status().channels)); await service.shutdownRecordings();
  const status=service.status();
  for(const id of ['1']) {
    const block=status.files.find(f=>f.channelId===id); assert.ok(block,`bloco finalizado do canal ${id}`);
    const file=service.getRecording(block.id);assert.ok((await stat(file.path)).size>0);
    assert.ok(file.path.includes(`Teste_${id}_${service.dayName(new Date(file.start))}`));
    assert.ok(Math.abs(Date.now()-Date.parse(file.start))<60000,'horário brasileiro correto');
    console.log(`OK canal ${id}: ${file.codec}/${file.format}, ${file.bytes} bytes, ${file.path}`);
  }
  console.log('OK gravação TS integral, encerramento, índice e pastas por data');
} finally {
  await service.shutdownRecordings();
  for(const sender of senders) sender.kill();
}
