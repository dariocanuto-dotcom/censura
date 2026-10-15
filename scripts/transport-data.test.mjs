import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {TransportData} from '../artifacts/api-server/src/lib/transport-data.ts';
function packet(pid,payload,start=false,cc=0){const b=Buffer.alloc(188,255);b[0]=71;b[1]=(pid>>8)|(start?64:0);b[2]=pid&255;b[3]=16|cc;payload.copy(b,4);return b;}
const pat=packet(0,Buffer.from([0,0,176,13,0,1,193,0,0,0,1,225,0,0,0,0,0]),true);
function pmt(){const entries=[27,225,1,240,0,17,225,2,240,0,6,225,22,240,0];const section=Buffer.from([2,176,13+entries.length,0,1,193,0,0,225,1,240,0,...entries,0,0,0,0]);return packet(256,Buffer.concat([Buffer.from([0]),section]),true);}
async function filter(chunks){const stream=Readable.from(chunks).pipe(new TransportData()),out=[];for await(const chunk of stream)out.push(chunk);return Buffer.concat(out);}
test('preserva PAT PMT NIT SDT EIT e CC byte por byte e remove vídeo áudio e nulos',async()=>{
 const keep=[pat,pmt(),...[16,17,18,278].map(pid=>packet(pid,Buffer.from([0,1,2,3]),true))];
 const input=Buffer.concat([...keep,packet(257,Buffer.from([1,2,3])),packet(258,Buffer.from([4,5])),packet(8191,Buffer.alloc(184))]);
 assert.deepEqual(await filter([input]),Buffer.concat(keep));
});
test('mantém dados com entrada dividida em qualquer ponto dos pacotes 188 192 e 204',async()=>{
 const keep=[pat,pmt(),...[16,17,18,278].map(pid=>packet(pid,Buffer.from([0,1,2,3]),true))];
 for(const width of [188,192,204]){const input=Buffer.concat([...keep,packet(257,Buffer.alloc(184)),packet(258,Buffer.alloc(184))].map(p=>width===192?Buffer.concat([Buffer.alloc(4),p]):width===204?Buffer.concat([p,Buffer.alloc(16)]):p));const chunks=[];for(let i=0;i<input.length;i+=67)chunks.push(input.subarray(i,i+67));assert.deepEqual(await filter(chunks),Buffer.concat(keep));}
});
test('remonta PMT entre pacotes antes de decidir quais PIDs excluir',async()=>{
 const whole=pmt().subarray(5,5+31);const first=Buffer.alloc(188,255);first[0]=71;first[1]=65;first[2]=0;first[3]=48;first[4]=171;first[5]=0;first[176]=0;whole.subarray(0,11).copy(first,177);
 const second=packet(256,whole.subarray(11),false,1);const captions=packet(278,Buffer.alloc(184));
 assert.deepEqual(await filter([Buffer.concat([pat,first,second,captions,packet(257,Buffer.alloc(184)),packet(258,Buffer.alloc(184))])]),Buffer.concat([pat,first,second,captions]));
});
