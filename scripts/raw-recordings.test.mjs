import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {captureTransport,packetSize} from '../artifacts/api-server/src/lib/raw-recording.ts';
test('rotação no relógio preserva sequência integral entre dois blocos',async()=>{
  let now=Date.parse('2026-10-09T02:00:59Z');
  const packet=Buffer.alloc(188,0xff);packet[0]=0x47;packet[1]=0;packet[2]=18;packet[3]=0x10;
  const first=Buffer.concat(Array(5).fill(packet)),second=Buffer.from(first);second[10]=42;
  let advance;const active=new Promise(done=>advance=done);async function* input(){yield first;await active;now+=2000;yield second;}
  const root=await mkdtemp(join(resolve('.runtime'),'rotation-test-'));const files=[];
  await captureTransport(Readable.from(input()),root,1,block=>{if(block)advance();},async file=>files.push(file),'TV_',()=>now);
  assert.equal(files.length,2);assert.deepEqual(Buffer.concat(await Promise.all(files.map(f=>readFile(f.path)))),Buffer.concat([first,second]));
});
for(const width of [188,192,204])test(`preserva todos os bytes e PIDs BTS de ${width} bytes, incluindo EPG e CC`,async()=>{
  const packets=[0,4096,273,274,275,278,18,17,8191].map(pid=>{
    const packet=Buffer.alloc(width,0xaa);const offset=width===192?4:0;packet[offset]=0x47;packet[offset+1]=0x40|(pid>>8);packet[offset+2]=pid&255;packet[offset+3]=0x10;return packet;
  });
  const input=Buffer.concat(packets);assert.equal(packetSize(input),width);
  const chunks=[];for(let offset=0;offset<input.length;offset+=127)chunks.push(input.subarray(offset,offset+127));
  const root=await mkdtemp(join(resolve('.runtime'),'raw-test-'));const files=[];
  await captureTransport(Readable.from(chunks),root,10,()=>{},async file=>files.push(file),'TV_');
  assert.equal(files.length,1);assert.deepEqual(await readFile(files[0].path),input);assert.equal(files[0].bytes,input.length);
});

test('BTS troca pasta mensal na virada do mês em Brasília',async()=>{
  let now=Date.parse('2026-11-01T02:59:59Z');
  const packet=Buffer.alloc(188,0xff);packet[0]=0x47;const data=Buffer.concat(Array(5).fill(packet));
  let advance;const active=new Promise(done=>advance=done);
  async function* input(){yield data;await active;now+=2000;yield data;}
  const root=await mkdtemp(join(resolve('.runtime'),'month-test-'));const files=[];
  const monthly=date=>join(root,new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',month:'2-digit',year:'numeric'}).format(date).replace('/',''));
  await captureTransport(Readable.from(input()),monthly,1,block=>{if(block)advance();},async file=>files.push(file),'TV_',()=>now);
  assert.equal(files.length,2);
  assert.ok(files[0].path.startsWith(join(root,'102026','TV_31102026')));
  assert.ok(files[1].path.startsWith(join(root,'112026','TV_01112026')));
  assert.deepEqual(Buffer.concat(await Promise.all(files.map(file=>readFile(file.path)))),Buffer.concat([data,data]));
});

import {recordingFileName,finalizeRecording} from '../artifacts/api-server/src/lib/recording-file.ts';
import {writeFile} from 'node:fs/promises';
test('nome do bloco usa data e hora, sem substituir bloco existente',async()=>{
  assert.equal(recordingFileName(new Date('2026-10-09T19:40:00Z'),'mp4'),'09102026_16h40.mp4');
  const root=await mkdtemp(join(resolve('.runtime'),'file-name-test-'));
  const target=join(root,'09102026_16h40.mp4');
  await writeFile(target,'primeiro');await writeFile(join(root,'pending.mp4'),'segundo');
  const result=await finalizeRecording(join(root,'pending.mp4'),target);
  assert.equal(result,join(root,'09102026_16h40_02.mp4'));
  assert.equal(await readFile(target,'utf8'),'primeiro');assert.equal(await readFile(result,'utf8'),'segundo');
});
