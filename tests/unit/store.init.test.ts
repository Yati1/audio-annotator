import { describe, it, expect } from 'vitest';
import { openDB } from 'idb';
import { _resetDbForTests, DB_BLOCKED_MESSAGE } from '../../src/features/storage/storage';
import { useStore } from '../../src/state/store';

describe('store: starting up', () => {
  it('shows why it cannot start while another tab blocks the upgrade', async () => {
    const name = _resetDbForTests();
    // An older tab holding version 1 open, with no handler to step aside.
    const oldTab = await openDB(name, 1, {
      upgrade(db) {
        for (const store of ['projects', 'audio', 'annotations', 'replies', 'sessionMeta']) {
          db.createObjectStore(store);
        }
      },
    });
    useStore.setState({ status: 'idle', error: null });

    await useStore.getState().init();

    expect(useStore.getState().status).toBe('idle');
    expect(useStore.getState().error).toBe(DB_BLOCKED_MESSAGE);
    oldTab.close();
  });
});
