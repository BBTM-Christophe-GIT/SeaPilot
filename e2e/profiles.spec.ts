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
