import { expect, test, type Locator, type Page } from '@playwright/test';

const profiles = [
  { role: 'marin', label: 'Marin', name: 'CI MARIN' },
  { role: 'capitaine', label: 'Capitaine', name: 'CI CAPITAINE' },
] as const;
type Profile = typeof profiles[number];

async function signIn(page: Page, profile: Profile, destination: string) {
  // Acknowledge the real first-login dialog through the UI if it blocks an action.
  await page.addLocatorHandler(page.getByRole('dialog', { name: 'Note de mise à jour', exact: true }), async (dialog) => {
    await dialog.getByRole('button', { name: 'Lire plus tard', exact: true }).click();
  });
  await page.goto(destination);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle(/SeaPilot/i);
  await page.getByLabel('Email', { exact: true }).fill(`${profile.role}@seapilot-ci.example.invalid`);
  await page.getByLabel('Mot de passe', { exact: true }).fill('SeaPilot-CI-only-2026!');
  const authentication = page.waitForResponse((response) => new URL(response.url()).pathname === '/auth/v1/token'
    && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  const response = await authentication;
  expect(response.ok(), response.ok() ? 'Local Auth login' : await response.text()).toBe(true);
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  await expect(page.getByRole('button', { name: `${profile.name} ${profile.label}`, exact: true })).toBeVisible();
  await expect(page.getByText('Préversion · données de démonstration', { exact: true })).toHaveCount(0);
}

async function openNavigation(page: Page) {
  const mobileMenu = page.getByRole('button', { name: 'Ouvrir la navigation', exact: true });
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  const navigation = page.getByRole('navigation', { name: 'Navigation principale', exact: true });
  await expect(navigation).toBeVisible();
  return navigation;
}

async function openDailyDprStep(dialog: Locator) {
  // On mobile the existing UI displays numbered steps and hides their captions.
  await dialog.getByRole('navigation', { name: 'Étapes du DPR', exact: true })
    .getByRole('button', { name: /^2(?:\s|$)/ }).click();
  await expect(dialog.getByRole('heading', { name: 'Informations Journalière', exact: true })).toBeVisible();
}

async function inlinePercent(locator: Locator, property: 'left' | 'width') {
  const style = await locator.getAttribute('style');
  return Number(style?.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([\\d.]+)%`))?.[1]);
}

async function openWorkingTimeDay(page: Page, daysAgo: number) {
  const board = page.getByRole('region', { name: 'Journée de travail', exact: true });
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const selectedDate = new Date(`${today}T12:00:00Z`);
  selectedDate.setUTCDate(selectedDate.getUTCDate() - daysAgo);
  const day = selectedDate.toISOString().slice(0, 10);
  if (daysAgo > 0) {
    if (day.slice(0, 7) !== today.slice(0, 7)) await page.getByRole('button', { name: 'Mois précédent', exact: true }).click();
    await board.getByRole('tablist', { name: 'Jours du registre' }).getByRole('tab').nth(Number(day.slice(8)) - 1).click();
  }
  const grid = board.getByRole('grid', { name: `Grille horaire du ${day}`, exact: true });
  await expect(grid).toBeVisible();
  return { board, grid };
}

const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  // No mocked API responses or injected sessions: local Auth/RPC/RLS handles every request.
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  // Also guard the URL baked into dist: a stale production build must never receive CI logins.
  const allowedOrigins = new Set(['http://127.0.0.1:4173', 'http://127.0.0.1:55321']);
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (['fetch', 'xhr'].includes(request.resourceType()) && !allowedOrigins.has(new URL(request.url()).origin)) {
      errors.push(`Blocked non-local API request: ${request.method()} ${new URL(request.url()).origin}`);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  test.info().annotations.push({ type: 'accounts', description: 'Real isolated Supabase Auth accounts; no role simulator.' });
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), 'Browser errors and non-local API requests').toEqual([]);
});

for (const profile of profiles) {
  test.describe(profile.label, () => {
    test('radar : filtre limité aux unités autorisées et retour au périmètre global du profil', async ({ page }) => {
      await signIn(page, profile, '/');
      const radar = page.getByRole('region', { name: 'Où agir en priorité ?', exact: true });
      await expect(radar).toBeVisible();
      const scope = radar.getByRole('button', { name: /^Périmètre du radar/ });
      await expect(scope).toContainText('Votre périmètre');
      await scope.click();
      const menu = page.getByRole('menu', { name: 'Périmètres du radar', exact: true });
      await expect(menu.getByRole('menuitem', { name: 'CI VESSEL ASSIGNED', exact: true })).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: 'CI VESSEL UNASSIGNED', exact: true })).toHaveCount(0);
      await expect(menu.getByRole('menuitem', { name: 'CI VESSEL FOREIGN', exact: true })).toHaveCount(0);
      await expect(menu.getByRole('menuitem', { name: 'Périmètre compagnie', exact: true })).toHaveCount(0);
      await menu.getByRole('menuitem', { name: 'CI VESSEL ASSIGNED', exact: true }).click();
      await expect(scope).toContainText('CI VESSEL ASSIGNED');
      const rh = radar.getByRole('group', { name: 'Sélectionner un processus', exact: true }).getByRole('button', { name: /Ressources humaines/ });
      await rh.click();
      await expect(rh).toHaveAttribute('aria-pressed', 'true');
      await expect(radar.getByText('Composantes · Ressources humaines', { exact: true })).toBeVisible();
      await expect(radar.locator('.process-criterion-bars')).toBeVisible();
      await expect(radar.locator('.performance-radar-canvas')).toHaveCount(0);
      await rh.click();
      await expect(rh).toHaveAttribute('aria-pressed', 'false');
      await expect(radar.getByText('Vue globale des processus', { exact: true })).toBeVisible();
      const exercises = radar.getByRole('group', { name: 'Sélectionner un processus', exact: true }).getByRole('button', { name: /Exercices d’urgence/ });
      await exercises.click();
      const presence = radar.getByRole('region', { name: 'Présence au planning', exact: true });
      await expect(presence).toBeVisible();
      await expect(presence.getByLabel('Date de présence')).toHaveValue(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }));
      await expect(presence).toContainText('CI VESSEL ASSIGNED');
      await expect(presence).not.toContainText('CI VESSEL UNASSIGNED');
      await expect(presence).not.toContainText('CI VESSEL FOREIGN');
      await expect(presence).toContainText('hors score obligatoire');
      await exercises.click();
      await expect(radar.getByText('Vue globale des processus', { exact: true })).toBeVisible();
      await scope.click();
      await menu.getByRole('menuitem', { name: /^Votre périmètre/ }).click();
      await expect(scope).toContainText('Votre périmètre');
      await expect.poll(() => radar.getByRole('group', { name: 'Sélectionner un processus', exact: true })
        .evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
      await expect(radar.getByRole('button', { name: /Registre médical/ })).toHaveCount(0);
      await radar.getByRole('button', { name: 'Comparer les unités', exact: true }).click();
      await expect(radar.getByRole('img', { name: /Performance globale des unités/ })).toBeVisible();
      await radar.getByRole('group', { name: 'Sélectionner une unité', exact: true }).getByRole('button', { name: /CI VESSEL ASSIGNED/ }).click();
      await expect(radar.getByRole('img', { name: /Performance des processus/ })).toBeVisible();
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    });

    test('navigation autorisée, contrôle des outils et refus des routes administrateur', async ({ page }) => {
      await signIn(page, profile, '/modules/workingTime');
      await expect(page.getByRole('heading', { name: 'Suivi du Temps de Travail', exact: true })).toBeAttached();
      await expect(page.getByRole('navigation', { name: 'Registres accessibles', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Import', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Rapport de conformité', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Exposition HSE / IMCA', exact: true })).toHaveCount(profile.role === 'capitaine' ? 1 : 0);

      const navigation = await openNavigation(page);
      await expect(navigation.getByRole('link', { name: 'Administration', exact: true })).toHaveCount(0);
      await expect(navigation.getByRole('link', { name: 'Projets', exact: true })).toHaveCount(0);
      await expect(navigation.getByRole('link', { name: 'Registre médical', exact: true })).toHaveCount(profile.role === 'capitaine' ? 1 : 0);
      await navigation.getByRole('link', { name: 'Daily Progress Report', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Daily Progress Report', exact: true })).toBeVisible();

      for (const forbidden of ['admin', 'projects', 'disciplinary']) {
        await page.goto(`/modules/${forbidden}`);
        await expect(page.getByText('Acces refuse pour ce module.', { exact: true })).toBeVisible();
      }
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    });

    test('registre du travail : amplitude calée sur les heures enregistrées et actualisée pendant la saisie', async ({ page, isMobile }) => {
      await signIn(page, profile, '/modules/workingTime');
      // Desktop and mobile exercise independent days for each real account.
      const { board } = await openWorkingTimeDay(page, isMobile ? 1 : 0);
      const timelinePanel = board.locator('.working-time-timeline-panel');
      const timeline = board.locator('.working-time-timeline-track');
      const guide = timeline.getByRole('group', { name: 'Amplitude de travail', exact: true });
      const savedMeter = guide.getByRole('meter', { name: 'Amplitude enregistrée', exact: true });
      const liveMeter = guide.getByRole('meter', { name: 'Amplitude prévue', exact: true });
      await expect(guide).toContainText('Amplitude normale 12h00');
      await expect(guide).toContainText('Amplitude maximale 14h00');
      await expect(board.getByRole('gridcell', { name: /^08:00, travail enregistré/ })).toBeVisible();
      await expect(board.getByRole('gridcell', { name: /^19:00, travail enregistré/ })).toBeVisible();
      await expect(savedMeter).toHaveAttribute('aria-valuetext', '11 h 30');
      const savedBand = savedMeter.locator('.working-time-amplitude-band');
      expect(await inlinePercent(savedBand, 'left')).toBeCloseTo(8 / 24 * 100);
      expect(await inlinePercent(savedBand, 'width')).toBeCloseTo(11.5 / 24 * 100);
      const markerPosition = (kind: 'normal' | 'maximum') => inlinePercent(guide.locator(`.working-time-amplitude-marker.is-${kind}`), 'left');
      expect(await markerPosition('normal')).toBeCloseTo(20 / 24 * 100);
      expect(await markerPosition('maximum')).toBeCloseTo(22 / 24 * 100);

      await board.getByRole('gridcell', { name: /^19:30, repos/ }).press('Shift+ArrowRight');
      await expect(liveMeter).toHaveAttribute('aria-valuetext', '12 h 30');
      await expect(guide).toContainText('Renseignez un commentaire pour justifier le dépassement de 12h00.');

      await board.getByRole('gridcell', { name: /^20:00, repos, sélectionné/ }).press('Enter');
      const comment = board.getByRole('textbox', { name: 'Commentaire obligatoire', exact: true });
      await expect(comment).toHaveAttribute('aria-required', 'true');
      await comment.fill('Intervention de sécurité');
      const [panelBounds, readingBounds] = await Promise.all([
        timelinePanel.boundingBox(),
        guide.locator('.working-time-amplitude-reading').boundingBox(),
      ]);
      expect(panelBounds && readingBounds && readingBounds.x >= panelBounds.x
        && readingBounds.x + readingBounds.width <= panelBounds.x + panelBounds.width + 1).toBe(true);
      await test.info().attach('jauge-amplitude', { body: await timelinePanel.screenshot(), contentType: 'image/png' });

      const saved = page.waitForResponse((response) => new URL(response.url()).pathname === '/rest/v1/rpc/save_working_time_phases'
        && response.request().method() === 'POST');
      await board.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }).click();
      const response = await saved;
      expect(response.ok(), await response.text()).toBe(true);
      expect(response.request().postDataJSON()).toMatchObject({ p_comment: 'Intervention de sécurité' });
      await expect(board.getByRole('gridcell', { name: /^20:00, travail enregistré/ })).toBeVisible();
      await expect(savedMeter).toHaveAttribute('aria-valuetext', '12 h 30');
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    });

    if (profile.role === 'capitaine') {
      test('registre d’un marin affecté : corriger et retirer un créneau sans commentaire', async ({ page, isMobile }) => {
        await signIn(page, profile, '/modules/workingTime');
        const catalog = page.getByRole('navigation', { name: 'Registres accessibles', exact: true });
        await catalog.getByRole('button', { name: /^Matelot\b/ }).click();
        await catalog.getByRole('button', { name: /^CI MARIN\b/ }).click();
        // These dates are separate from the owner's amplitude entry test.
        const { board, grid } = await openWorkingTimeDay(page, isMobile ? 3 : 2);
        await expect(grid).toHaveAttribute('aria-readonly', 'false');
        const recordedPeriod = grid.getByRole('gridcell', { name: /^16:00, travail enregistré/ });

        if (!isMobile) {
          await recordedPeriod.click({ button: 'right' });
          const menu = page.getByRole('menu', { name: 'Actions de la plage enregistrée', exact: true });
          const edit = menu.getByRole('menuitem', { name: 'Corriger', exact: true });
          await expect(edit).toBeVisible();
          await expect(menu.getByRole('menuitem', { name: 'Retirer', exact: true })).toBeVisible();
          await edit.press('Escape');
          await expect(menu).toHaveCount(0);
        }

        if (isMobile) await recordedPeriod.tap();
        else await recordedPeriod.click();
        const comment = board.getByRole('textbox', { name: 'Commentaire', exact: true });
        await expect(comment).toHaveValue('');
        await grid.getByRole('gridcell', { name: /^19:30, repos/ }).press('Shift+ArrowRight');
        await expect(board.getByRole('meter', { name: 'Amplitude prévue', exact: true })).toHaveAttribute('aria-valuetext', '12 h 30');
        await expect(comment).not.toHaveAttribute('aria-required', 'true');

        const corrected = page.waitForResponse((response) => new URL(response.url()).pathname === '/rest/v1/rpc/save_working_time_interval'
          && response.request().method() === 'POST');
        await board.getByRole('button', { name: 'Enregistrer la correction', exact: true }).click();
        const correction = await corrected;
        expect(correction.ok(), await correction.text()).toBe(true);
        expect(correction.request().postDataJSON()).toMatchObject({ p_comment: null });
        const correctedSlot = grid.getByRole('gridcell', { name: /^20:00, travail enregistré/ });
        await expect(correctedSlot).toBeVisible();

        if (isMobile) await correctedSlot.tap();
        else await correctedSlot.click();
        await board.getByRole('button', { name: 'Retirer la période sélectionnée', exact: true }).click();
        const confirmation = page.getByRole('dialog', { name: 'Retirer le créneau', exact: true });
        await expect(confirmation.getByRole('textbox')).toHaveCount(0);
        const removed = page.waitForResponse((response) => new URL(response.url()).pathname === '/rest/v1/rpc/void_working_time_interval'
          && response.request().method() === 'POST');
        await confirmation.getByRole('button', { name: 'Retirer', exact: true }).click();
        const removal = await removed;
        expect(removal.ok(), await removal.text()).toBe(true);
        expect(removal.request().postDataJSON()).toMatchObject({ p_reason: null });
        await expect(grid.getByRole('gridcell', { name: /^20:00, repos/ })).toBeVisible();
        await expect(grid.getByRole('gridcell', { name: /^08:00, travail enregistré/ })).toBeVisible();
        await expect(board.getByRole('meter', { name: 'Amplitude enregistrée', exact: true })).toHaveAttribute('aria-valuetext', '4 h 00');
      });
    }

    test('DPR : périmètre réel du profil et brouillon conservé après rechargement', async ({ page, isMobile }) => {
      await signIn(page, profile, '/modules/dpr');
      await expect(page.getByText('CI VISIBLE REPORT', { exact: true })).toBeVisible();
      // Current RPC/RLS rules grant Capitaine the company's DPR history;
      // the pure Marin is limited to their own reports and assigned vessels.
      await expect(page.getByText('CI UNASSIGNED REPORT', { exact: true })).toHaveCount(profile.role === 'capitaine' ? 1 : 0);
      await expect(page.getByText('CI HIDDEN FOREIGN REPORT', { exact: true })).toHaveCount(0);

      await page.getByRole('button', { name: 'Saisir un DPR', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Saisie Daily Progress Report', exact: true });
      await expect(dialog).toBeVisible();
      const vessel = dialog.getByRole('combobox', { name: 'NAVIRE', exact: true });
      await expect(vessel).toHaveValue(/\d+/);
      await expect(vessel.locator('option:checked')).toHaveText('CI VESSEL ASSIGNED');
      await dialog.getByRole('combobox', { name: 'PROJET', exact: true }).selectOption({ label: 'Navire à quai' });
      await openDailyDprStep(dialog);
      const description = `CI ${profile.role} ${test.info().project.name} ${Date.now()}`;
      await dialog.getByRole('textbox', { name: 'DESCRIPTION DE LA JOURNÉE', exact: true }).fill(description);
      const saved = page.waitForResponse((response) => response.url().endsWith('/rest/v1/rpc/dpr_save_payload') && response.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }).click();
      const response = await saved;
      expect(response.ok(), await response.text()).toBe(true);
      const result = await response.json();
      const savedId = Number((Array.isArray(result) ? result[0] : result).id);
      expect(savedId).toBeGreaterThan(0);
      await expect(dialog.getByRole('status')).toHaveText('Brouillon enregistré.');
      await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();

      const refreshedReports = page.waitForResponse((reportResponse) => {
        const url = new URL(reportResponse.url());
        return url.pathname === '/rest/v1/dpr_reports' && reportResponse.request().method() === 'GET'
          && Boolean(url.searchParams.get('select')?.includes('description'));
      });
      await page.reload();
      const refreshed = await refreshedReports;
      expect(refreshed.ok()).toBe(true);
      const reports = await refreshed.json() as Array<{ id: number; description: string; issuer_name_snapshot: string }>;
      expect(reports.find((item) => Number(item.id) === savedId)).toMatchObject({ description, issuer_name_snapshot: profile.name });
      const savedReport = page.locator('.dpr-row').filter({ has: page.getByText(`Brouillon #${savedId}`, { exact: true }) });
      await expect(savedReport).toBeVisible();
      await expect(savedReport).toContainText(profile.name);
      // Existing mobile rows hide the edit action. Verify their real RLS-backed
      // reload response above; desktop additionally reopens the persisted form.
      if (!isMobile) {
        await savedReport.getByRole('button', { name: 'Modifier', exact: true }).click();
        await openDailyDprStep(dialog);
        await expect(dialog.getByRole('textbox', { name: 'DESCRIPTION DE LA JOURNÉE', exact: true })).toHaveValue(description);
      }
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    });
  });
}
