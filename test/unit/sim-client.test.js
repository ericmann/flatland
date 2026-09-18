import { describe, it, expect } from 'vitest';
import { SimClient } from '../../src/ui/sim-client.js';

/** A fake transport recording every postMessage call, with a settable onmessage. */
function fakeTransport() {
  return {
    posted: /** @type {{ msg: *, transfer: * }[]} */ ([]),
    onmessage: null,
    postMessage(msg, transfer = []) {
      this.posted.push({ msg, transfer });
    },
  };
}

describe('SimClient', () => {
  it('send forwards {type, ...payload} and the transfer list', () => {
    const transport = fakeTransport();
    const client = new SimClient(transport);

    client.send('load', { seed: 1 });
    expect(transport.posted[0].msg).toEqual({ type: 'load', seed: 1 });
    expect(transport.posted[0].transfer).toEqual([]);

    const buf = new ArrayBuffer(8);
    client.send('releaseSnapshot', { buffer: buf }, [buf]);
    expect(transport.posted[1].msg).toEqual({ type: 'releaseSnapshot', buffer: buf });
    expect(transport.posted[1].transfer).toEqual([buf]);
  });

  it('on routes events by type and unsubscribes', () => {
    const transport = fakeTransport();
    const client = new SimClient(transport);

    const loadedCalls = [];
    const statusCalls = [];
    const unsubscribeLoaded = client.on('loaded', (msg) => loadedCalls.push(msg));
    client.on('status', (msg) => statusCalls.push(msg));

    transport.onmessage({ data: { type: 'loaded', tick: 0 } });
    transport.onmessage({ data: { type: 'status', tick: 1 } });
    expect(loadedCalls).toEqual([{ type: 'loaded', tick: 0 }]);
    expect(statusCalls).toEqual([{ type: 'status', tick: 1 }]);

    unsubscribeLoaded();
    transport.onmessage({ data: { type: 'loaded', tick: 2 } });
    expect(loadedCalls).toHaveLength(1); // no longer receiving

    transport.onmessage({ data: { type: 'status', tick: 3 } });
    expect(statusCalls).toHaveLength(2); // still receiving, unaffected by the other unsubscribe
  });
});
