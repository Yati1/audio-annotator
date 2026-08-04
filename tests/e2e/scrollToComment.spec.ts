import { test, expect } from './fixtures/base';
import { makeWavFile } from './fixtures/wav';
import { makeFullProject, buildValidBundle } from './fixtures/bundle';
import { newId } from '../../src/lib/id';
import { SCHEMA_VERSION } from '../../src/features/types';

test.describe('scroll to selected comment', () => {
  test('selecting a waveform region scrolls the comments panel to the matching annotation', async ({
    app,
  }) => {
    await app.ensureSession('Ava');

    const projectId = newId();
    const audioId = newId();
    const now = new Date().toISOString();
    const durationSec = 30;
    const audioBytes = makeWavFile({ durationSec }).buffer;

    // Enough regions, spread across the clip, to overflow the side panel's viewport.
    // One point annotation (mid-list, zero-width region) is mixed in deliberately: points
    // render as zero-width regions, so this checks the scroll works for that kind too.
    const annotationIds = Array.from({ length: 14 }, () => newId());
    const pointIndex = 7;
    const project = makeFullProject({
      project: {
        id: projectId,
        title: 'Fixture project',
        audioId,
        schemaVersion: SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
      },
      audio: {
        id: audioId,
        fileName: 'clip-a.wav',
        mimeType: 'audio/wav',
        durationSec,
        byteSize: audioBytes.length,
      },
      annotations: annotationIds.map((id, i) => ({
        id,
        projectId,
        kind: i === pointIndex ? ('point' as const) : ('region' as const),
        startSec: i * 2,
        endSec: i === pointIndex ? null : i * 2 + 1,
        note: `Comment ${i}`,
        authorName: 'Ben',
        authorColor: '#d95926',
        createdAt: now,
        updatedAt: now,
      })),
      replies: [],
    });
    const bundle = await buildValidBundle(project, audioBytes);
    await app.importExport.importBundle({
      name: 'many.aannz',
      mimeType: 'application/zip',
      buffer: bundle,
    });
    await app.waveform.waitUntilReady();

    const lastIndex = annotationIds.length - 1;
    const lastId = annotationIds[lastIndex];
    const lastItem = app.annotations.itemByNote(`Comment ${lastIndex}`).locator();

    // The last comment starts off-screen: the list overflows the panel's scroll area.
    await expect(lastItem).not.toBeInViewport();

    await app.waveform.clickRegion(lastId);

    await expect(lastItem).toBeInViewport();
  });

  test('selecting a point annotation on the waveform scrolls the comments panel to it', async ({
    app,
  }) => {
    await app.ensureSession('Ava');

    const projectId = newId();
    const audioId = newId();
    const now = new Date().toISOString();
    const durationSec = 30;
    const audioBytes = makeWavFile({ durationSec }).buffer;

    const annotationIds = Array.from({ length: 14 }, () => newId());
    const pointIndex = 7;
    const project = makeFullProject({
      project: {
        id: projectId,
        title: 'Fixture project',
        audioId,
        schemaVersion: SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
      },
      audio: {
        id: audioId,
        fileName: 'clip-a.wav',
        mimeType: 'audio/wav',
        durationSec,
        byteSize: audioBytes.length,
      },
      annotations: annotationIds.map((id, i) => ({
        id,
        projectId,
        kind: i === pointIndex ? ('point' as const) : ('region' as const),
        startSec: i * 2,
        endSec: i === pointIndex ? null : i * 2 + 1,
        note: `Comment ${i}`,
        authorName: 'Ben',
        authorColor: '#d95926',
        createdAt: now,
        updatedAt: now,
      })),
      replies: [],
    });
    const bundle = await buildValidBundle(project, audioBytes);
    await app.importExport.importBundle({
      name: 'many-with-point.aannz',
      mimeType: 'application/zip',
      buffer: bundle,
    });
    await app.waveform.waitUntilReady();

    const pointId = annotationIds[pointIndex];
    const pointItem = app.annotations.itemByNote(`Comment ${pointIndex}`).locator();

    // Scroll the panel to the bottom first so the mid-list point item starts off-screen.
    const sidePanel = app.page.getByRole('complementary', { name: 'Annotations panel' });
    await sidePanel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(pointItem).not.toBeInViewport();

    await app.waveform.clickRegion(pointId);

    await expect(pointItem).toBeInViewport();
  });
});
