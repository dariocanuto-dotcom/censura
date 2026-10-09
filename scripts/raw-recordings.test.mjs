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
