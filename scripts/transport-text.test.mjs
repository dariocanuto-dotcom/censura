import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {captureTransport} from '../artifacts/api-server/src/lib/raw-recording.ts';
test('salva texto UTF-8 com tabelas distintas, CC original e contagem de PIDs, sem arquivo TS',async()=>{
 function packet(pid,bytes){const p=Buffer.alloc(188,255);p[0]=71;p[1]=64|(pid>>8);p[2]=pid&255;p[3]=16;Buffer.from(bytes).copy(p,4);return p;}
 const pat=packet(0,[0,0,176,13,0,1,193,0,0,0,1,225,0,0,0,0,0]);
 const cc=packet(278,[0,0,1,189,0,0,1,2,3]);
 const root=await mkdtemp(join(resolve('.runtime'),'text-test-')),files=[];
 await captureTransport(Readable.from([Buffer.concat([pat,pat,pat,pat,cc])]),root,1,()=>{},async file=>files.push(file),'TV_dados_',()=>Date.parse('2026-10-15T15:00:00Z'),'txt');
 assert.equal(files.length,1);assert(files[0].path.endsWith('.txt'));
 const content=await readFile(files[0].path,'utf8'),rows=content.trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(rows[0].tipo,'inicio');assert.equal(rows.filter(r=>r.tabela==='PAT').length,1);
 assert.equal(rows.find(r=>r.pid===278).pacoteHex,cc.toString('hex'));
 assert.deepEqual(rows.at(-1).pids,[{pid:0,pacotes:4},{pid:278,pacotes:1}]);
 assert.equal(files[0].bytes,Buffer.byteLength(content));
});
