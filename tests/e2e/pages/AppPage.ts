import type { Page } from '@playwright/test';
import { DisplayNamePrompt } from './DisplayNamePrompt';
import { WaveformPanel } from './WaveformPanel';
import { TransportBar } from './TransportBar';
import { DraftDialog } from './DraftDialog';
import { AnnotationPanel } from './AnnotationPanel';
import { ImportExportPanel } from './ImportExportPanel';
import type { WavFile } from '../fixtures/wav';

/** Root composition object for the single-view app, mirroring src/components/* 1:1. */
export class AppPage {
  readonly displayNamePrompt: DisplayNamePrompt;
  readonly waveform: WaveformPanel;
  readonly transport: TransportBar;
  readonly draftDialog: DraftDialog;
  readonly annotations: AnnotationPanel;
  readonly importExport: ImportExportPanel;

  constructor(readonly page: Page) {
    this.displayNamePrompt = new DisplayNamePrompt(page);
    this.waveform = new WaveformPanel(page);
    this.transport = new TransportBar(page);
    this.draftDialog = new DraftDialog(page);
    this.annotations = new AnnotationPanel(page);
    this.importExport = new ImportExportPanel(page);
  }

  get errorAlert() {
    return this.page.getByRole('alert');
  }

  /** Submits the display-name prompt if it's shown. React hasn't necessarily mounted it
   *  yet right after page.goto(), so this waits briefly rather than checking instantaneously. */
  async ensureSession(displayName = 'Ava'): Promise<void> {
    try {
      await this.displayNamePrompt.locator().waitFor({ timeout: 3000 });
    } catch {
      return;
    }
    await this.displayNamePrompt.submit(displayName);
  }

  async openAudioFixture(file: WavFile): Promise<void> {
    const input = this.page.getByTestId('open-audio-input');
    await input.setInputFiles(file);
    // The app's global keyboard shortcuts (Space/p/r) intentionally no-op while an
    // input/textarea has focus; setInputFiles leaves focus on this hidden file input.
    await input.evaluate((el) => (el as HTMLInputElement).blur());
    await this.waveform.waitUntilReady();
  }

  /** Auto-accepts the next native confirm() dialog (used by delete flows). */
  acceptNextConfirm(): void {
    this.page.once('dialog', (d) => void d.accept());
  }
}
