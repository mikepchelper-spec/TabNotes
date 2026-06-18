import { test, expect, openPanelWithRealTab } from './fixtures';
import type { Locator, Page } from '@playwright/test';

/**
 * Browser_Verification scenarios (Requirement 9) for the side panel.
 *
 * These run against the built, unpacked extension and establish the
 * Behavior_Baseline before the side-panel-refactor moves state into the store.
 *
 * Environment note: opening the side panel as a standalone page makes it the
 * active tab, so `chrome.tabs.query({active:true})` returns the panel's own
 * (restricted) URL and the editor renders its restricted-URL placeholder.
 * Scenarios that require a real active web page as context are marked
 * `test.fixme` below until the harness drives the `chrome.sidePanel` API to
 * attach the panel to a window with a normal page active. The boot and
 * navigation scenarios do not need that context and run today.
 */

async function expectWithinViewport(locator: Locator) {
  const rect = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(rect.left).toBeGreaterThanOrEqual(-0.5);
  expect(rect.right).toBeLessThanOrEqual(rect.viewportWidth + 0.5);
  expect(rect.top).toBeGreaterThanOrEqual(-0.5);
  expect(rect.bottom).toBeLessThanOrEqual(rect.viewportHeight + 0.5);
}

function formatDateTimeLocal(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function roundUpToMinute(timestamp: number): number {
  const date = new Date(timestamp);
  date.setSeconds(0, 0);
  if (date.getTime() < timestamp) {
    date.setMinutes(date.getMinutes() + 1);
  }
  return date.getTime();
}

async function createSavedNote(panel: Page, text: string): Promise<{ id: string; content: string }> {
  const editor = panel.locator('.sp-rich-editor');
  await expect(editor).toBeVisible();
  await editor.evaluate((el, noteText) => {
    (el as HTMLElement).innerText = noteText;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await panel.waitForTimeout(1300);

  return panel.evaluate<Promise<{ id: string; content: string }>, string>((noteText) => {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chromeApi = (globalThis as any).chrome;
      chromeApi.storage.local.get('tabnotes_data', (r: Record<string, unknown>) => {
        const data = r['tabnotes_data'] as Record<string, Record<string, { id?: string; content?: string }>>;
        const note = ['notes_url', 'notes_domain', 'notes_workspace', 'notes_global']
          .flatMap((key) => Object.values(data?.[key] ?? {}))
          .find((candidate) => candidate.content?.includes(noteText));

        if (!note?.id || !note.content) {
          reject(new Error('Saved note not found'));
          return;
        }

        resolve({ id: note.id, content: note.content });
      });
    });
  }, text);
}

async function seedPendingReminder(panel: Page, note: { id: string; content: string }) {
  await panel.evaluate(({ noteId, content }) => {
    return new Promise<void>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chromeApi = (globalThis as any).chrome;
      const firedAt = Date.now();
      chromeApi.storage.local.set({
        tn_pending_reminders: [
          {
            id: `${noteId}:${firedAt}`,
            noteId,
            title: 'Reminder test note',
            preview: content,
            firedAt,
            reminderAt: firedAt - 1000,
          },
        ],
      }, () => resolve());
    });
  }, { noteId: note.id, content: note.content });
}

test.describe('TabNotes side panel — baseline', () => {
  test('boots and renders the root shell with persistent chrome', async ({
    context,
    sidePanelUrl,
  }) => {
    const page = await context.newPage();
    await page.goto(sidePanelUrl);
    await expect(page.locator('.sp-root')).toBeVisible();
    await expect(page.locator('.sp-bottom-nav')).toBeVisible();
  });

  test('bottom nav switches to the All Notes view', async ({ context, sidePanelUrl }) => {
    const page = await context.newPage();
    await page.goto(sidePanelUrl);
    const navButtons = page.locator('.sp-bottom-nav .sp-nav-btn');
    await expect(navButtons.first()).toBeVisible();
    await navButtons.nth(1).click();
    await expect(page.locator('.sp-all-view')).toBeVisible();
  });

  test('bottom nav switches to Settings and back to Note', async ({ context, sidePanelUrl }) => {
    const page = await context.newPage();
    await page.goto(sidePanelUrl);
    const nav = page.locator('.sp-bottom-nav .sp-nav-btn');
    await nav.last().click();
    await expect(page.locator('.sp-settings-view')).toBeVisible();
    await nav.first().click();
    await expect(page.locator('.sp-note-view')).toBeVisible();
  });

  test('workspace shortcut opens Settings directly at the workspace section', async ({
    context,
    sidePanelUrl,
  }) => {
    const page = await context.newPage();
    await page.goto(sidePanelUrl);

    await page.locator('.sp-workspace-pill').click();
    await page.locator('.sp-ws-option.manage').click();

    await expect(page.locator('.sp-settings-view')).toBeVisible();
    const workspaceSection = page.locator('[data-settings-section="workspace"]');
    const workspaceLabel = workspaceSection.locator('.sp-settings-label').first();
    await expect(workspaceLabel).toContainText(/Active Project|Proyecto activo/);
    await expectWithinViewport(workspaceLabel);

    const scrollTop = await page
      .locator('.sp-settings-view')
      .evaluate((el) => (el as HTMLElement).scrollTop);
    expect(scrollTop).toBeGreaterThan(0);
  });

  test('Settings shows Drive backup in setup-safe state', async ({ context, sidePanelUrl }) => {
    const page = await context.newPage();
    await page.goto(sidePanelUrl);
    await page.locator('.sp-bottom-nav .sp-nav-btn').last().click();
    await expect(page.locator('.sp-drive-sync')).toBeVisible();
    await expect(page.getByText('Google Drive backup')).toBeVisible();
    await expect(page.getByText('Setup required')).toBeVisible();
  });

  test('PIN lock gate: enabling a PIN locks the panel and the correct PIN unlocks it', async ({
    context,
    sidePanelUrl,
  }) => {
    const page = await context.newPage();
    await page.goto(sidePanelUrl);

    // Enable a PIN from Settings.
    await page.locator('.sp-bottom-nav .sp-nav-btn').last().click();
    await expect(page.locator('.sp-settings-view')).toBeVisible();
    const fields = page.locator('.sp-pin-field');
    await fields.nth(0).fill('2468');
    await fields.nth(1).fill('2468');
    await page.getByRole('button', { name: 'Enable PIN lock' }).click();
    await expect(page.locator('.sp-pin-feedback')).toHaveText('PIN saved');

    // Lock now → the lock screen replaces all content.
    await page.getByRole('button', { name: 'Lock now' }).click();
    await expect(page.locator('.sp-pin-lock')).toBeVisible();
    await expect(page.locator('.sp-bottom-nav')).toHaveCount(0);

    // Wrong PIN is rejected.
    await page.locator('.sp-pin-lock-input').fill('0000');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.locator('.sp-pin-lock-error')).toBeVisible();

    // Correct PIN unlocks.
    await page.locator('.sp-pin-lock-input').fill('2468');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.locator('.sp-pin-lock')).toHaveCount(0);
    await expect(page.locator('.sp-root')).toBeVisible();

    // Clean up: remove the PIN so other runs start fresh.
    await page.locator('.sp-bottom-nav .sp-nav-btn').last().click();
    await page.getByRole('button', { name: 'Remove PIN' }).click();
    await expect(page.locator('.sp-pin-feedback')).toHaveText('PIN removed');
  });
});

test.describe('TabNotes side panel — editor (real tab context)', () => {
  test('editor renders when the panel has a real active web page', async ({
    context,
    sidePanelUrl,
  }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    await expect(panel.locator('.sp-rich-editor')).toBeVisible({ timeout: 8000 });
  });

  test('editor autosaves typed content to storage', async ({ context, sidePanelUrl }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    const editor = panel.locator('.sp-rich-editor');
    await expect(editor).toBeVisible();
    await editor.click();
    await panel.keyboard.type('Playwright autosave check');
    // Past the 600ms autosave debounce plus write.
    await panel.waitForTimeout(1500);
    const stored = await panel.evaluate<Promise<string>>(() => {
      return new Promise((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).chrome.storage.local.get(
          'tabnotes_data',
          (r: Record<string, unknown>) => {
            resolve(JSON.stringify(r['tabnotes_data'] ?? {}));
          }
        );
      });
    });
    expect(stored).toContain('Playwright autosave check');
  });

  // Note: command-palette open/run is covered by the baseline suite (single
  // page, reliable focus). In the multi-page real-tab context, OS keyboard
  // focus across pages is flaky in headless Chromium, so it is not duplicated
  // here.

  test('fixed-chrome scrolling: header and bottom nav stay fixed while editor scrolls', async ({
    context,
    sidePanelUrl,
  }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    const editor = panel.locator('.sp-rich-editor');
    await editor.click();
    // Type many lines to make the editor body overflow.
    const lines = Array.from({ length: 60 }, (_, i) => `SCROLL-LINE-${i + 1}`).join('\n');
    await editor.evaluate((el, text) => {
      (el as HTMLElement).innerText = text;
    }, lines);
    // Header and bottom nav remain present (fixed chrome), editor is scrollable.
    await expect(panel.locator('.sp-header')).toBeVisible();
    await expect(panel.locator('.sp-bottom-nav')).toBeVisible();
    const overflow = await editor.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(overflow).toBe(true);
  });

  test('checklist mode toggles into interactive items', async ({ context, sidePanelUrl }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    const editor = panel.locator('.sp-rich-editor');
    await editor.click();
    await editor.evaluate((el) => {
      (el as HTMLElement).innerText = '- [ ] first task\n- [x] done task';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await panel.waitForTimeout(1300);

    await panel.locator('.sp-note-meta-actions').hover();
    const checklistToggle = panel.locator('.sp-note-meta-action-panel .sp-meta-toggle', {
      hasText: /Checklist|Lista/,
    });
    await expect(checklistToggle).toBeVisible();
    await checklistToggle.click();
    await expect(panel.locator('.sp-checklist-container')).toBeVisible();
  });

  test('reminder schedules a future chrome alarm and persists on the note', async ({
    context,
    sidePanelUrl,
  }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    const editor = panel.locator('.sp-rich-editor');
    const noteText = `Reminder scheduling check ${Date.now()}`;
    await editor.evaluate((el, text) => {
      (el as HTMLElement).innerText = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, noteText);
    await panel.waitForTimeout(1300);

    await panel.locator('.sp-note-meta-actions').hover();
    const reminderToggle = panel.locator('.sp-note-meta-action-panel .sp-meta-toggle', {
      hasText: /Reminder|Recordar/,
    });
    await reminderToggle.click();
    await expect(panel.locator('.sp-reminder-picker')).toBeVisible();

    const reminderValue = formatDateTimeLocal(roundUpToMinute(Date.now() + 10 * 60 * 1000));
    const reminderAt = new Date(reminderValue).getTime();
    await panel.locator('.sp-reminder-input').fill(reminderValue);
    await panel.getByRole('button', { name: /Set reminder|Establecer recordatorio/ }).click();
    await expect(panel.locator('.sp-reminder-picker')).toHaveCount(0);

    const stored = await panel.evaluate<Promise<{
      noteId?: string;
      reminderAt?: number;
      alarmNames: string[];
    }>, string>((text) => {
      return new Promise((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chromeApi = (globalThis as any).chrome;
        chromeApi.storage.local.get('tabnotes_data', (r: Record<string, unknown>) => {
          const data = r['tabnotes_data'] as Record<string, Record<string, { id?: string; content?: string; reminderAt?: number }>>;
          const note = ['notes_url', 'notes_domain', 'notes_workspace', 'notes_global']
            .flatMap((key) => Object.values(data?.[key] ?? {}))
            .find((candidate) => candidate.content?.includes(text));

          chromeApi.alarms.getAll((alarms: { name: string }[]) => {
            resolve({
              noteId: note?.id,
              reminderAt: note?.reminderAt,
              alarmNames: alarms.map((alarm) => alarm.name),
            });
          });
        });
      });
    }, noteText);

    expect(stored.reminderAt).toBe(reminderAt);
    expect(stored.alarmNames).toContain(`tn_reminder_${stored.noteId}`);
  });

  test('reminder picker rejects past times before saving', async ({ context, sidePanelUrl }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    const editor = panel.locator('.sp-rich-editor');
    const noteText = `Reminder invalid check ${Date.now()}`;
    await editor.evaluate((el, text) => {
      (el as HTMLElement).innerText = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, noteText);
    await panel.waitForTimeout(1300);

    await panel.locator('.sp-note-meta-actions').hover();
    await panel.locator('.sp-note-meta-action-panel .sp-meta-toggle', {
      hasText: /Reminder|Recordar/,
    }).click();

    await panel.locator('.sp-reminder-input').fill(formatDateTimeLocal(Date.now() - 60 * 60 * 1000));
    await expect(panel.getByRole('button', { name: /Set reminder|Establecer recordatorio/ })).toBeDisabled();
    await expect(panel.locator('.sp-reminder-validation')).toBeVisible();

    const stored = await panel.evaluate<Promise<{ reminderAt?: number; alarmCount: number }>, string>((text) => {
      return new Promise((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chromeApi = (globalThis as any).chrome;
        chromeApi.storage.local.get('tabnotes_data', (r: Record<string, unknown>) => {
          const data = r['tabnotes_data'] as Record<string, Record<string, { content?: string; reminderAt?: number }>>;
          const note = ['notes_url', 'notes_domain', 'notes_workspace', 'notes_global']
            .flatMap((key) => Object.values(data?.[key] ?? {}))
            .find((candidate) => candidate.content?.includes(text));

          chromeApi.alarms.getAll((alarms: { name: string }[]) => {
            resolve({
              reminderAt: note?.reminderAt,
              alarmCount: alarms.filter((alarm) => alarm.name.startsWith('tn_reminder_')).length,
            });
          });
        });
      });
    }, noteText);

    expect(stored.reminderAt).toBeUndefined();
    expect(stored.alarmCount).toBe(0);
  });

  test('pending reminder banner opens the note and clears the pending item', async ({
    context,
    sidePanelUrl,
  }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    const noteText = `Pending reminder open check ${Date.now()}`;
    const note = await createSavedNote(panel, noteText);
    await seedPendingReminder(panel, note);

    const reminderCenter = panel.locator('.sp-pending-reminders');
    await expect(reminderCenter).toBeVisible();
    await expect(reminderCenter).toContainText('Reminder test note');
    await expect(reminderCenter).toContainText(noteText);

    await panel.locator('.sp-bottom-nav .sp-nav-btn').nth(1).click();
    await expect(panel.locator('.sp-all-view')).toBeVisible();

    await panel.locator('.sp-pending-reminder-open').click();
    await expect(panel.locator('.sp-note-view')).toBeVisible();
    await expect(panel.locator('.sp-rich-editor')).toContainText(noteText);
    await expect(reminderCenter).toHaveCount(0);

    const pendingCount = await panel.evaluate<Promise<number>>(() => {
      return new Promise((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).chrome.storage.local.get('tn_pending_reminders', (r: Record<string, unknown>) => {
          resolve(Array.isArray(r['tn_pending_reminders']) ? r['tn_pending_reminders'].length : 0);
        });
      });
    });
    expect(pendingCount).toBe(0);
  });

  test('pending reminder banner can snooze into a new alarm', async ({
    context,
    sidePanelUrl,
  }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    const noteText = `Pending reminder snooze check ${Date.now()}`;
    const note = await createSavedNote(panel, noteText);
    await seedPendingReminder(panel, note);

    await expect(panel.locator('.sp-pending-reminders')).toBeVisible();
    await panel.locator('.sp-pending-reminder-snooze').click();
    await expect(panel.locator('.sp-pending-reminders')).toHaveCount(0);

    const result = await panel.evaluate<Promise<{
      pendingCount: number;
      reminderAt?: number;
      alarmNames: string[];
    }>, string>((noteId) => {
      return new Promise((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chromeApi = (globalThis as any).chrome;
        chromeApi.storage.local.get(['tn_pending_reminders', 'tabnotes_data'], (r: Record<string, unknown>) => {
          const data = r['tabnotes_data'] as Record<string, Record<string, { id?: string; reminderAt?: number }>>;
          const savedNote = ['notes_url', 'notes_domain', 'notes_workspace', 'notes_global']
            .flatMap((key) => Object.values(data?.[key] ?? {}))
            .find((candidate) => candidate.id === noteId);

          chromeApi.alarms.getAll((alarms: { name: string }[]) => {
            resolve({
              pendingCount: Array.isArray(r['tn_pending_reminders']) ? r['tn_pending_reminders'].length : 0,
              reminderAt: savedNote?.reminderAt,
              alarmNames: alarms.map((alarm) => alarm.name),
            });
          });
        });
      });
    }, note.id);

    expect(result.pendingCount).toBe(0);
    expect(result.reminderAt).toBeGreaterThan(Date.now());
    expect(result.alarmNames).toContain(`tn_reminder_${note.id}`);
  });

  test('move note panel relocates a note to Global scope', async ({ context, sidePanelUrl }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    const noteText = `Move note check ${Date.now()}`;
    const note = await createSavedNote(panel, noteText);

    await panel.locator('.sp-note-meta-actions').hover();
    await panel.locator('.sp-note-meta-action-panel .sp-meta-toggle', {
      hasText: /Move note|Mover nota|Folder|Carpeta/,
    }).click();
    await expect(panel.locator('.sp-move-picker')).toBeVisible();

    await panel.locator('#tn-move-workspace').selectOption('__none__');
    await panel.locator('#tn-move-scope').selectOption('global');
    await panel.locator('#tn-move-folder').fill('');
    await panel.getByRole('button', { name: /Move note|Mover nota/ }).click();
    await expect(panel.locator('.sp-move-picker')).toHaveCount(0);

    const stored = await panel.evaluate<Promise<{
      scope?: string;
      workspaceId?: string | null;
      inGlobal: boolean;
      inDomain: boolean;
    }>, string>((noteId) => {
      return new Promise((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chromeApi = (globalThis as any).chrome;
        chromeApi.storage.local.get('tabnotes_data', (r: Record<string, unknown>) => {
          const data = r['tabnotes_data'] as Record<string, Record<string, { id?: string; scope?: string; workspaceId?: string | null }>>;
          const all = ['notes_url', 'notes_domain', 'notes_workspace', 'notes_global']
            .flatMap((key) => Object.values(data?.[key] ?? {}));
          const savedNote = all.find((candidate) => candidate.id === noteId);
          resolve({
            scope: savedNote?.scope,
            workspaceId: savedNote?.workspaceId ?? null,
            inGlobal: Boolean(data?.notes_global?.[noteId]),
            inDomain: Boolean(data?.notes_domain?.[noteId]),
          });
        });
      });
    }, note.id);

    expect(stored.scope).toBe('global');
    expect(stored.workspaceId).toBeNull();
    expect(stored.inGlobal).toBe(true);
    expect(stored.inDomain).toBe(false);
  });

  test('fired reminder starts the active alert and flashes the badge', async ({
    context,
    sidePanelUrl,
  }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    const noteText = `Reminder active alert check ${Date.now()}`;
    const note = await createSavedNote(panel, noteText);

    await panel.evaluate((noteId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chromeApi = (globalThis as any).chrome;
      chromeApi.alarms.create(`tn_reminder_${noteId}`, { when: Date.now() + 500 });
    }, note.id);

    await expect(panel.locator('.sp-pending-reminders')).toBeVisible({ timeout: 5000 });

    const alertState = await panel.evaluate<Promise<{
      activeNoteId?: string;
      offscreenCount: number | null;
    }>>(() => {
      return new Promise((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chromeApi = (globalThis as any).chrome;
        chromeApi.storage.local.get('tn_active_reminder_alert', async (r: Record<string, unknown>) => {
          const active = r['tn_active_reminder_alert'] as { noteId?: string } | undefined;
          const getContexts = chromeApi.runtime.getContexts;
          let offscreenCount: number | null = null;
          if (getContexts) {
            const contexts = await getContexts.call(chromeApi.runtime, {
              contextTypes: ['OFFSCREEN_DOCUMENT'],
              documentUrls: [chromeApi.runtime.getURL('offscreen/index.html')],
            });
            offscreenCount = contexts.length;
          }
          resolve({
            activeNoteId: active?.noteId,
            offscreenCount,
          });
        });
      });
    });

    expect(alertState.activeNoteId).toBe(note.id);
    if (alertState.offscreenCount !== null) {
      expect(alertState.offscreenCount).toBeGreaterThan(0);
    }

    const badgeSamples = await panel.evaluate<Promise<string[]>>(() => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const getBadgeText = () =>
        new Promise<string>((resolve) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (globalThis as any).chrome.action.getBadgeText({}, resolve);
        });

      return (async () => {
        const samples: string[] = [];
        for (let i = 0; i < 5; i += 1) {
          samples.push(await getBadgeText());
          await delay(500);
        }
        return samples;
      })();
    });

    expect(badgeSamples).toContain('!');
    expect(badgeSamples).toContain('1');

    await panel.evaluate<Promise<void>, string>((noteId) => {
      return new Promise((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).chrome.runtime.sendMessage(
          { type: 'DISMISS_REMINDER', noteId },
          () => resolve()
        );
      });
    }, note.id);
  });

  test('template menu inserts a selected template', async ({ context, sidePanelUrl }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    await expect(panel.locator('.sp-rich-editor')).toBeVisible();

    await panel.locator('.sp-notes-tree').hover();
    await panel.getByTitle('Insert template').click();
    await expect(panel.locator('.sp-templates-dropdown')).toBeVisible();

    await panel.getByRole('button', { name: 'Meeting' }).click();
    await expect(panel.locator('.sp-note-title-input')).toHaveValue('Meeting Notes');
    await expect(panel.locator('.sp-rich-editor')).toContainText('Attendees');
  });

  test('template menu inserts localized Spanish template content', async ({
    context,
    sidePanelUrl,
  }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    await expect(panel.locator('.sp-rich-editor')).toBeVisible();

    await panel.getByTitle('Español').click();
    await expect(panel.locator('.sp-bottom-nav .sp-nav-label').first()).toHaveText('Nota');

    await panel.locator('.sp-notes-tree').hover();
    await panel.getByTitle('Insertar plantilla').click();
    await expect(panel.locator('.sp-templates-dropdown')).toBeVisible();

    await panel.getByRole('button', { name: 'Reunión' }).click();
    await expect(panel.locator('.sp-note-title-input')).toHaveValue('Notas de reunión');
    await expect(panel.locator('.sp-rich-editor')).toContainText('Asistentes');
    await expect(panel.locator('.sp-rich-editor')).toContainText('Decisiones');
  });

  test('top formatting toolbar controls editor font size', async ({ context, sidePanelUrl }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    const editor = panel.locator('.sp-rich-editor');
    await expect(editor).toBeVisible();

    const before = await editor.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await panel.locator('.sp-fmt-size-plus').click();
    const after = await editor.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

    expect(after).toBeGreaterThan(before);
    await expect(panel.locator('.sp-meta-toggle', { hasText: 'A+' })).toHaveCount(0);
  });

  test('bottom meta action panel shows the full action set before first save', async ({
    context,
    sidePanelUrl,
  }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    await expect(panel.locator('.sp-rich-editor')).toBeVisible();

    await panel.locator('.sp-note-meta-actions').hover();
    const actionPanel = panel.locator('.sp-note-meta-action-panel');
    await expect(actionPanel).toBeVisible();

    for (const label of [
      /Move note|Mover nota|Folder|Carpeta/,
      /Date|Fecha/,
      /Pin|Fijar/,
      /Color/,
      /Export|Exportar/,
      /PDF/,
      /Typewriter|Máquina/,
      /Encrypt|Encriptar/,
      /Focus|Enfoque/,
      /Reference|Referencia/,
      /Copy|Copiar/,
      /History|Historial/,
      /Reminder|Recordar/,
      /Checklist|Lista/,
    ]) {
      await expect(actionPanel.getByRole('button', { name: label })).toBeVisible();
    }

    await expect(
      actionPanel.getByRole('button', { name: /Move note|Mover nota|Folder|Carpeta/ })
    ).toBeDisabled();
    await expect(actionPanel.getByRole('button', { name: /Export|Exportar/ })).toBeDisabled();
    await expect(actionPanel.getByRole('button', { name: /Checklist|Lista/ })).toBeEnabled();
  });

  test('bottom meta popovers stay within a narrow panel', async ({ context, sidePanelUrl }) => {
    const panel = await openPanelWithRealTab(context, sidePanelUrl);
    await panel.setViewportSize({ width: 390, height: 844 });
    const editor = panel.locator('.sp-rich-editor');
    await expect(editor).toBeVisible();

    await editor.evaluate((el) => {
      (el as HTMLElement).innerText = 'Meta popover layout check v1';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await panel.waitForTimeout(1300);

    await editor.evaluate((el) => {
      (el as HTMLElement).innerText = 'Meta popover layout check v2';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await panel.waitForTimeout(1300);

    const actions = panel.locator('.sp-note-meta-actions');
    const actionPanel = panel.locator('.sp-note-meta-action-panel');
    await expect(panel.locator('.sp-meta-more-trigger')).toContainText(/More options|Más opciones/);
    await expect(actionPanel).toBeHidden();
    await actions.hover();
    await expect(actionPanel).toBeVisible();
    await expectWithinViewport(actionPanel);

    const popoverAnchors = panel.locator('.sp-note-meta-actions .sp-meta-popover-anchor');
    await expect(popoverAnchors).toHaveCount(4);

    await popoverAnchors.nth(0).locator('.sp-meta-toggle').click();
    await expect(panel.locator('.sp-move-picker')).toBeVisible();
    await expectWithinViewport(panel.locator('.sp-move-picker'));

    await popoverAnchors.nth(1).locator('.sp-meta-toggle').click();
    await expect(panel.locator('.sp-color-picker')).toBeVisible();
    await expectWithinViewport(panel.locator('.sp-color-picker'));

    await popoverAnchors.nth(2).locator('.sp-meta-toggle').click();
    await expect(panel.locator('.sp-history-panel')).toBeVisible();
    await expectWithinViewport(panel.locator('.sp-history-panel'));
    await popoverAnchors.nth(2).locator('.sp-meta-toggle').click();

    await popoverAnchors.last().locator('.sp-meta-toggle').click();
    await expect(panel.locator('.sp-reminder-picker')).toBeVisible();
    await expectWithinViewport(panel.locator('.sp-reminder-picker'));
  });
});

test.describe('TabNotes side panel — known headless limitations', () => {
  // HTML5 drag-and-drop is unreliable in headless Chromium; verified manually
  // per the testing skill. Kept as a documented fixme.
  test.fixme('folder drag-and-drop sets the note folder', async () => {
    // Drag a note onto a folder; assert the note's `folder` is set in storage.
  });

  // Per-note encryption correctness is covered by unit tests
  // (packages/shared/src/crypto.test.ts). The in-editor lock/unlock UI path is
  // verified manually; its trigger affordance varies and is left as a fixme.
  test.fixme('encryption lock/unlock hides and restores content in the editor', async () => {
    // Lock with a password; assert content hidden. Unlock; assert restored.
  });
});
