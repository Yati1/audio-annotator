import { expect, type Locator, type Page } from '@playwright/test';

/** wavesurfer.js host: canvas rendered inside an open shadow DOM. Page-absolute mouse
 *  coordinates work regardless of the shadow boundary, so drag-select uses raw
 *  mouse.down/move/up (not dragTo(), which wavesurfer's pointer-event drag handling ignores). */
export class WaveformPanel {
  constructor(private readonly page: Page) {}

  canvas(): Locator {
    return this.page.getByTestId('waveform-canvas');
  }

  async waitUntilReady(): Promise<void> {
    await expect(this.page.getByText('Rendering waveform…')).toBeHidden();
  }

  /** Clicks the waveform at a fractional position (0=start, 1=end) to seek. */
  async seekToFraction(fraction: number): Promise<void> {
    const box = await this.canvas().boundingBox();
    if (!box) throw new Error('waveform canvas not visible');
    const x = box.x + box.width * Math.min(Math.max(fraction, 0), 1);
    await this.page.mouse.click(x, box.y + box.height / 2);
  }

  /** Drags to create a region between two fractional positions along the canvas width. */
  async dragSelectRegion(startFraction: number, endFraction: number): Promise<void> {
    const box = await this.canvas().boundingBox();
    if (!box) throw new Error('waveform canvas not visible');
    const y = box.y + box.height / 2;
    const x1 = box.x + box.width * startFraction;
    const x2 = box.x + box.width * endFraction;
    await this.page.mouse.move(x1, y);
    await this.page.mouse.down();
    await this.page.mouse.move((x1 + x2) / 2, y, { steps: 5 });
    await this.page.mouse.move(x2, y, { steps: 5 });
    await this.page.mouse.up();
  }
}
