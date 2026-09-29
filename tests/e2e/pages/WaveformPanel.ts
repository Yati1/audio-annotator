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
      const sc = host?.shadowRoot?.querySelector('.scroll') as HTMLElement | undefined;
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

  /** Waits until wavesurfer has redrawn the waveform to exactly fill its container, e.g.
   *  after a viewport resize. Its ResizeObserver redraws on a debounce, and until then the
   *  old canvases keep their old pixel width. */
  async waitForFitToWidth(): Promise<void> {
    await expect
      .poll(() =>
        this.canvas().evaluate((el) => {
          const host = el.firstElementChild as (HTMLElement & { shadowRoot: ShadowRoot }) | null;
          const sc = host?.shadowRoot?.querySelector('.scroll') as HTMLElement | undefined;
          const canvases = sc
            ? [...sc.querySelectorAll<HTMLCanvasElement>('.canvases canvas')]
            : [];
          if (!sc || canvases.length === 0) return Infinity;
          const drawnWidth = Math.max(...canvases.map((c) => c.offsetLeft + c.offsetWidth));
          return Math.abs(drawnWidth - sc.clientWidth);
        }),
      )
      .toBeLessThanOrEqual(2);
  }

  async scrollLeft(): Promise<number> {
    return (await this.scrollContainer()).scrollLeft;
  }

  /** Ratio of the zoomed-in content width to the visible container width — i.e. how far
   *  zoomed in the waveform currently is, independent of the container's own size. */
  async zoomRatio(): Promise<number> {
    const { scrollWidth, clientWidth } = await this.scrollContainer();
    return scrollWidth / clientWidth;
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

  /**
   * Holds both mouse buttons and drags horizontally by `dx` pixels, centered on the waveform.
   * `releaseFirst` picks which button comes up first; `moveBetween` moves the mouse that many
   * pixels while only the other button is still held. `dragFirst` moves that many pixels with
   * only the left button down before the right one joins it. `pauseBetween` waits that many
   * ms between the two releases, as a person does; back-to-back releases can reach the page
   * before its pending timers run, which a real hand never manages.
   */
  async panBy(
    dx: number,
    {
      releaseFirst = 'right',
      moveBetween = 0,
      dragFirst = 0,
      pauseBetween = 0,
    }: {
      releaseFirst?: 'left' | 'right';
      moveBetween?: number;
      dragFirst?: number;
      pauseBetween?: number;
    } = {},
  ): Promise<void> {
    const box = await this.canvas().boundingBox();
    if (!box) throw new Error('waveform canvas not visible');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await this.page.mouse.move(cx, cy);
    await this.page.mouse.down({ button: 'left' });
    if (dragFirst) await this.page.mouse.move(cx + dragFirst, cy, { steps: 5 });
    await this.page.mouse.down({ button: 'right' });
    await this.page.mouse.move(cx + dragFirst + dx, cy, { steps: 5 });
    await this.page.mouse.up({ button: releaseFirst });
    if (pauseBetween) await this.page.waitForTimeout(pauseBetween);
    if (moveBetween) {
      await this.page.mouse.move(cx + dragFirst + dx + moveBetween, cy, { steps: 5 });
    }
    await this.page.mouse.up({ button: releaseFirst === 'right' ? 'left' : 'right' });
  }

  /** The region or point marker drawn for the given annotation id. */
  region(id: string): Locator {
    return this.canvas().locator(`[part~="anno-${id}"]`);
  }

  /** A region's right-hand resize handle. Only present while the region can be resized. */
  rightHandle(id: string): Locator {
    return this.region(id).locator('[part~="region-handle-right"]');
  }

  /** Presses the left button on `target` and drags it to a fractional canvas position. */
  async dragTo(target: Locator, toFraction: number): Promise<void> {
    const from = await target.boundingBox();
    const box = await this.canvas().boundingBox();
    if (!from || !box) throw new Error('drag target or waveform canvas not visible');
    const y = from.y + from.height / 2;
    await this.page.mouse.move(from.x + from.width / 2, y);
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + box.width * toFraction, y, { steps: 10 });
    await this.page.mouse.up();
  }

  /** Resets zoom and pan to the default fit-to-width view. */
  async resetView(): Promise<void> {
    await this.canvas().dblclick();
  }
}
