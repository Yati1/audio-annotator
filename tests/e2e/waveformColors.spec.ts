import { test, expect } from './fixtures/base';
import { makeWavFile } from './fixtures/wav';
import { makeFullProject, buildValidBundle } from './fixtures/bundle';
import { newId } from '../../src/lib/id';
import { SCHEMA_VERSION } from '../../src/features/types';

test.describe('waveform annotation colors', () => {
  test("renders each author's region/point in their own assigned color", async ({ app }) => {
    await app.ensureSession('Ava');

    const projectId = newId();
    const audioId = newId();
    const now = new Date().toISOString();
    const audioBytes = makeWavFile({ durationSec: 6 }).buffer;
    const otherRegionId = newId();
    const otherPointId = newId();
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
        durationSec: 6,
        byteSize: audioBytes.length,
      },
      annotations: [
        {
          id: otherRegionId,
          projectId,
          kind: 'region',
          startSec: 1,
          endSec: 2,
          note: "Ben's region",
          authorName: 'Ben',
          authorColor: '#d95926',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: otherPointId,
          projectId,
          kind: 'point',
          startSec: 4,
          endSec: null,
          note: "Ben's point",
          authorName: 'Ben',
          authorColor: '#d95926',
          createdAt: now,
          updatedAt: now,
        },
      ],
      replies: [],
    });
    const bundle = await buildValidBundle(project, audioBytes);
    await app.importExport.importBundle({
      name: 'other.aaz',
      mimeType: 'application/zip',
      buffer: bundle,
    });
    await expect(app.annotations.itemByNote("Ben's region").locator()).toBeVisible();

    await app.transport.startRegion();
    await app.draftDialog.createWithNote('My own region');
    const mine = app.annotations.itemByNote('My own region');
    const myId = await mine.id();

    const canvas = app.page.getByTestId('waveform-canvas');
    // First author on this device is always assigned the first palette slot.
    await expect(canvas.locator(`[part~="anno-${myId}"]`)).toHaveCSS(
      'background-color',
      'rgba(57, 135, 229, 0.25)',
    );
    await expect(canvas.locator(`[part~="anno-${otherRegionId}"]`)).toHaveCSS(
      'background-color',
      'rgba(217, 89, 38, 0.25)',
    );
    await expect(canvas.locator(`[part~="anno-${otherPointId}"]`)).toHaveCSS(
      'border-left-color',
      'rgb(217, 89, 38)',
    );
    await expect(
      canvas.locator(`[part~="anno-${otherPointId}"] [part="region-content"]`),
    ).toHaveCSS('color', 'rgb(217, 89, 38)');
  });
});
