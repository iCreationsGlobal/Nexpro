import { createScanQueue } from '@/utils/scanQueue';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('scan queue', () => {
  it('handles fast scans one at a time, in scan order, without dropping any', async () => {
    const delays: Record<string, number> = { first: 30, second: 0, third: 10, fourth: 5 };
    const started: string[] = [];
    const finished: string[] = [];
    let running = 0;
    let mostAtOnce = 0;
    const queue = createScanQueue(async (code) => {
      started.push(code);
      running += 1;
      mostAtOnce = Math.max(mostAtOnce, running);
      await wait(delays[code]);
      running -= 1;
      finished.push(code);
    });

    // Four scans arrive while the first lookup is still in flight.
    ['first', 'second', 'third', 'fourth'].forEach((code) => queue.push(code));
    expect(queue.busy).toBe(true);
    await queue.whenIdle();

    expect(started).toEqual(['first', 'second', 'third', 'fourth']);
    expect(finished).toEqual(['first', 'second', 'third', 'fourth']);
    expect(mostAtOnce).toBe(1);
    expect(queue.busy).toBe(false);
  });

  it('keeps going after a scan fails', async () => {
    const handled: string[] = [];
    const onError = jest.fn();
    const queue = createScanQueue(async (code) => {
      if (code === 'bad') throw new Error('lookup failed');
      handled.push(code);
    }, onError);
    queue.push('a');
    queue.push('bad');
    queue.push('b');
    await queue.whenIdle();
    expect(handled).toEqual(['a', 'b']);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'bad');
  });

  it('takes new scans after it has gone idle', async () => {
    const handled: string[] = [];
    const queue = createScanQueue((code) => { handled.push(code); });
    queue.push('a');
    await queue.whenIdle();
    queue.push('b');
    await queue.whenIdle();
    expect(handled).toEqual(['a', 'b']);
  });

  it('clear drops scans not started yet; the one in flight finishes', async () => {
    const handled: string[] = [];
    const queue = createScanQueue(async (code) => {
      await wait(10);
      handled.push(code);
    });
    queue.push('a');
    queue.push('b');
    queue.push('c');
    queue.clear();
    await queue.whenIdle();
    expect(handled).toEqual(['a']);
  });
});
