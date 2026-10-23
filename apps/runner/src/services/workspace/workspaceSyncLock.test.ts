import { describe, expect, it } from 'vitest';
import { withWorkspaceSyncLock } from './workspaceSyncLock.js';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 2));

describe('workspace sync lock', () => {
  it('serializes replace and snapshot for the same workspace', async () => {
    const events: string[] = [];
    await Promise.all([
      withWorkspaceSyncLock('/tmp/a', async () => {
        events.push('first-start');
        await tick();
        events.push('first-end');
      }),
      withWorkspaceSyncLock('/tmp/a', async () => {
        events.push('second-start');
        events.push('second-end');
      }),
    ]);
    expect(events).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
  });

  it('releases lock after failure', async () => {
    await expect(withWorkspaceSyncLock('/tmp/b', async () => { throw new Error('failure'); })).rejects.toThrow('failure');
    await expect(withWorkspaceSyncLock('/tmp/b', async () => 'ok')).resolves.toBe('ok');
  });
});
