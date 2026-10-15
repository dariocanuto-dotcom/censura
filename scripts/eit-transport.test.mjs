import test from 'node:test';
import assert from 'node:assert/strict';
import {eitTransport} from '../artifacts/api-server/src/lib/eit-transport.ts';
test('extrai EIT original de TS 188, M2TS 192 e BTS 204 em fragmentos',()=>{
 const section=Buffer.from([0x4e,0xb0,15,0x5c,0x20,0xc1,0,0,0,1,0,1,0,0,0,0,0,0]);
 for(const width of [188,192,204]){const frames=Array.from({length:5},(_,cc)=>{const ts=Buffer.alloc(188,255);ts[0]=71;ts[1]=64;ts[2]=18;ts[3]=16|cc;ts[4]=0;section.copy(ts,5);return width===192?Buffer.concat([Buffer.alloc(4),ts]):width===204?Buffer.concat([ts,Buffer.alloc(16)]):ts;});const data=Buffer.concat(frames),received=[];const consume=eitTransport(s=>received.push(Buffer.from(s)));for(let i=0;i<data.length;i+=73)consume(data.subarray(i,i+73));assert.equal(received.length,5);for(const s of received)assert.deepEqual(s,section);}
});
