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

  /** Clicks the region/marker belonging to the given annotation id, selecting it. */
  async clickRegion(id: string): Promise<void> {
    await this.canvas().locator(`[part~="anno-${id}"]`).click();
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

  /** wavesurfer's internal scroll container, reached through its open shadow DOM. */
  private scrollContainer() {
    return this.canvas().evaluate((el) => {
      const host = el.firstElementChild as (HTMLElement & { shadowRoot: ShadowRoot }) | null;
      const sc = host?.shadowRoot.querySelector('.scroll') as HTMLElement | undefined;
      if (!sc) throw new Error('wavesurfer scroll container not found');
      return {
        scrollWidth: sc.scrollWidth,
        clientWidth: sc.clientWidth,
        scrollLeft: sc.scrollLeft,
      };
    });
  }

  /** True once zoomed in past fit-to-width, i.e. the waveform has become scrollable. */
  async isZoomedIn(): Promise<boolean> {
    const { scrollWidth, clientWidth } = await this.scrollContainer();
    return scrollWidth > clientWidth;
  }

  async scrollLeft(): Promise<number> {
    return (await this.scrollContainer()).scrollLeft;
  }

  /** Scrolls the mouse wheel, centered on the waveform, to zoom in (or out with a positive deltaY). */
  async wheelZoom(deltaY: number, times = 1): Promise<void> {
    const box = await this.canvas().boundingBox();
    if (!box) throw new Error('waveform canvas not visible');
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < times; i++) {
      await this.page.mouse.wheel(0, deltaY);
    }
  }

  /** Holds both mouse buttons and drags horizontally by `dx` pixels, centered on the waveform. */
  async panBy(dx: number): Promise<void> {
    const box = await this.canvas().boundingBox();
    if (!box) throw new Error('waveform canvas not visible');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await this.page.mouse.move(cx, cy);
    await this.page.mouse.down({ button: 'left' });
    await this.page.mouse.down({ button: 'right' });
    await this.page.mouse.move(cx + dx, cy, { steps: 5 });
    await this.page.mouse.up({ button: 'right' });
    await this.page.mouse.up({ button: 'left' });
  }

  /** Resets zoom and pan to the default fit-to-width view. */
  async resetView(): Promise<void> {
    await this.canvas().dblclick();
  }
}
