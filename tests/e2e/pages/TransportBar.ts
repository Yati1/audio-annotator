import type { Page } from '@playwright/test';

function parseTime(label: string): number {
  const parts = label.trim().split(':').map(Number);
  return parts.reduceRight((acc, v, i, arr) => acc + v * 60 ** (arr.length - 1 - i), 0);
}

export class TransportBar {
  constructor(private readonly page: Page) {}

  private root() {
    return this.page.getByRole('toolbar', { name: 'Playback and annotation controls' });
  }

  async playPause(): Promise<void> {
    await this.root()
      .getByRole('button', { name: /^(Play|Pause) \(Space\)$/ })
      .click();
  }

  async addPoint(): Promise<void> {
    await this.root()
      .getByRole('button', { name: /Add point annotation/ })
      .click();
  }

  async startRegion(): Promise<void> {
    await this.root()
      .getByRole('button', { name: /Add region annotation/ })
      .click();
  }

  async isPlaying(): Promise<boolean> {
    return (
      (await this.root()
        .getByRole('button', { name: /^Pause/ })
        .count()) > 0
    );
  }

  async currentSeconds(): Promise<number> {
    const text = await this.page.getByTestId('transport-time').innerText();
    return parseTime(text.split('/')[0]);
  }

  async durationSeconds(): Promise<number> {
    const text = await this.page.getByTestId('transport-time').innerText();
    return parseTime(text.split('/')[1]);
  }
}
