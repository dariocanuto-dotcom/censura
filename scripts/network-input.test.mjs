import test from 'node:test';
import assert from 'node:assert/strict';
import {networkInputUrl} from '../artifacts/api-server/src/lib/network-input.ts';
test('UDP com IP antigo passa a usar a rota multicast automática',()=>{
 const u=new URL(networkInputUrl('udp://224.1.1.122:5004?reuse=1&localaddr=10.10.10.9',['192.168.35.22','192.168.1.249']));assert(!u.searchParams.has('localaddr'));assert.equal(u.searchParams.get('reuse'),'1');assert.equal(u.hostname,'224.1.1.122');
});
test('preserva interface válida e URL SRT',()=>{
 const udp='udp://224.1.1.122:5004?localaddr=192.168.35.22';assert.equal(networkInputUrl(udp,['192.168.35.22']),udp);const srt='srt://example.test:5004?mode=caller';assert.equal(networkInputUrl(srt,[]),srt);
});
