import { test, expect } from './fixtures/base';
import { makeWavFile } from './fixtures/wav';
import { makeFullProject, buildValidBundle } from './fixtures/bundle';
import { newId } from '../../src/lib/id';
import { SCHEMA_VERSION } from '../../src/features/types';

test.describe('only the author can edit or delete (FR-015)', () => {
  test.beforeEach(async ({ app }) => {
    await app.ensureSession('Ava');

    const projectId = newId();
    const audioId = newId();
    const annotationId = newId();
    const now = new Date().toISOString();
    const audioBytes = makeWavFile({ durationSec: 6 }).buffer;
    const project = makeFullProject({
      project: {
        id: projectId,
        title: 'Shared project',
        audioId,
        schemaVersion: SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
      },
      audio: {
        id: audioId,
        fileName: 'clip-a.wav',
        mimeType: 'audio/wav',
        durationSec: 6,
        byteSize: audioBytes.length,
      },
      annotations: [
        {
          id: annotationId,
          projectId,
          kind: 'point',
          startSec: 1,
          endSec: null,
          note: "Ben's point",
          authorName: 'Ben',
          authorId: 'device-ben',
          authorColor: '#d95926',
          createdAt: now,
          updatedAt: now,
        },
      ],
      replies: [
        {
          id: newId(),
          annotationId,
          text: "Ben's reply",
          authorName: 'Ben',
          authorId: 'device-ben',
          authorColor: '#d95926',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await app.importExport.importBundle({
      name: 'from-ben.aaz',
      mimeType: 'application/zip',
      buffer: await buildValidBundle(project, audioBytes),
    });
    await app.waveform.waitUntilReady();
  });

  test("hides edit and delete on someone else's annotation and reply", async ({ app }) => {
    const bens = app.annotations.itemByNote("Ben's point");
    await expect(bens.locator()).toBeVisible();

    await expect(bens.editButton()).toHaveCount(0);
    await expect(bens.deleteButton()).toHaveCount(0);
    await expect(bens.reply(0).getByRole('button', { name: 'Edit reply' })).toHaveCount(0);
    await expect(bens.reply(0).getByRole('button', { name: 'Delete reply' })).toHaveCount(0);

    // Anyone can still reply and play.
    await expect(bens.playButton()).toBeVisible();
    await bens.addReply('Ava answers');
    await expect(bens.replies()).toHaveCount(2);
  });

  test('keeps edit and delete on my own annotation and my reply to theirs', async ({ app }) => {
    await app.transport.addPoint();
    await app.draftDialog.createWithNote("Ava's point");
    const mine = app.annotations.itemByNote("Ava's point");
    await expect(mine.editButton()).toBeVisible();
    await expect(mine.deleteButton()).toBeVisible();

    const bens = app.annotations.itemByNote("Ben's point");
    await bens.addReply('Ava answers');
    const myReply = bens.replies().filter({ hasText: 'Ava answers' });
    await expect(myReply.getByRole('button', { name: 'Edit reply' })).toBeVisible();
    await expect(myReply.getByRole('button', { name: 'Delete reply' })).toBeVisible();
  });
});
