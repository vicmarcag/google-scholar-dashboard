import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StaggeredQueue } from './queue.js';

describe('StaggeredQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('procesa los IDs uno a uno con espaciado, nunca en paralelo', async () => {
    const order = [];
    let inFlight = 0;
    const queue = new StaggeredQueue({
      spacingMs: 1000,
      processItem: async (id) => {
        inFlight += 1;
        expect(inFlight).toBe(1);
        order.push(id);
        await Promise.resolve();
        inFlight -= 1;
      },
    });

    queue.enqueueAll(['a', 'b', 'c']);
    await vi.runAllTimersAsync();

    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('enqueueFront prioriza el refresco manual sin duplicar', async () => {
    const order = [];
    const queue = new StaggeredQueue({
      spacingMs: 1000,
      processItem: async (id) => {
        order.push(id);
      },
    });

    queue.enqueue('a');
    queue.enqueue('b');
    queue.enqueueFront('b');

    await vi.runAllTimersAsync();

    expect(order).toEqual(['b', 'a']);
  });
});
