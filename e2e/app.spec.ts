import { expect, test, type Locator, type Page } from '@playwright/test';

const APP_PATH = '/algebraView/';

function cards(page: Page) {
  return page.locator('[data-testid^="function-card-"]');
}

function slot(card: Locator, label: string): Locator {
  return card.getByRole('spinbutton', { name: label, exact: true });
}

function slider(card: Locator, label: string): Locator {
  return card.getByRole('slider', { name: `${label} 滑块`, exact: true });
}

async function gotoApp(page: Page): Promise<void> {
  await page.goto(APP_PATH);
  await expect(page.getByTestId('graph-canvas')).toBeVisible();
}

test.describe('algebraView smoke', () => {
  test('renders the initial quadratic layer and canvas', async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByTestId('layer-count')).toContainText('1 / 8');
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByTestId('card-formula').first()).toContainText('x² − 4');
    await expect(page.getByRole('button', { name: '重置视图' })).toBeVisible();
    await expect(page.getByTestId('graph-canvas')).toHaveAttribute('aria-label', '函数图像画布');
  });

  test('UC-01: dragging the "a" slider flips the parabola and updates the formula', async ({
    page,
  }) => {
    await gotoApp(page);
    const card = cards(page).first();
    const range = slider(card, 'a（二次项系数）');
    await expect(range).toBeVisible();
    // The slider starts at 1 with step 0.5; four ArrowLeft presses reach -1.
    await range.focus();
    for (let index = 0; index < 4; index += 1) {
      await range.press('ArrowLeft');
    }
    await expect(card.getByTestId('card-formula')).toContainText('−x² − 4');
    await expect(slot(card, 'a（二次项系数）')).toHaveValue('-1');
  });

  test('UC-02: adds a second layer and switches it to a linear template', async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId('add-layer').click();
    await expect(cards(page)).toHaveCount(2);
    await expect(page.getByTestId('layer-count')).toContainText('2 / 8');

    const second = cards(page).nth(1);
    await second.getByLabel('函数模板', { exact: true }).selectOption('linear');
    await slot(second, 'a（斜率）').fill('2');
    await slot(second, 'b（y 轴截距）').fill('-1');
    await expect(second.getByTestId('card-formula')).toContainText('2x − 1');

    await page.getByTestId('reset-view').click();
    await expect(page.getByTestId('graph-canvas')).toBeVisible();
  });

  test('LaTeX input validates, shows slot preview and applies to the card', async ({ page }) => {
    await gotoApp(page);
    const card = cards(page).first();
    await card.getByRole('tab', { name: 'LaTeX' }).click();
    const input = card.getByTestId('latex-input');
    await input.fill('y = 2\\sin(x) + 1');
    await expect(card.getByText(/解析为「正弦函数」/)).toBeVisible();

    await card.getByTestId('apply-latex').click();
    await expect(slot(card, 'a（振幅）')).toHaveValue('2');
    await expect(slot(card, 'd（上下平移）')).toHaveValue('1');
    await expect(card.getByTestId('card-formula')).toContainText('2sin(x) + 1');
  });

  test('invalid LaTeX reports a concrete repair suggestion', async ({ page }) => {
    await gotoApp(page);
    const card = cards(page).first();
    await card.getByRole('tab', { name: 'LaTeX' }).click();
    await card.getByTestId('latex-input').fill('y = \\frac{1}{2');
    await expect(card.getByText(/花括号不配对/)).toBeVisible();
    await expect(card.getByText(/补上/)).toBeVisible();
    await expect(card.getByTestId('apply-latex')).toBeDisabled();
  });

  test('raw expression mode accepts an arbitrary expression', async ({ page }) => {
    await gotoApp(page);
    const card = cards(page).first();
    await card.getByRole('tab', { name: '自由表达式' }).click();
    await card.getByTestId('raw-expression').fill('sin(x)/x');
    await expect(card.getByTestId('card-formula')).toContainText('sin(x)/x');
  });

  test('polynomial template supports adding and removing terms', async ({ page }) => {
    await gotoApp(page);
    const card = cards(page).first();
    await card.getByLabel('函数模板', { exact: true }).selectOption('polynomial');
    const exponentInputs = card.getByRole('spinbutton', { name: '次数 n', exact: true });
    const initialRows = await exponentInputs.count();
    await card.getByRole('button', { name: '添加单项式' }).click();
    await expect(exponentInputs).toHaveCount(initialRows + 1);
  });

  test('zoom, grid, feature and snap toggles work', async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId('zoom-in').click();
    await page.getByTestId('zoom-out').click();
    const grid = page.getByTestId('toggle-grid');
    await grid.click();
    await expect(grid).toHaveAttribute('aria-pressed', 'false');
    await grid.click();
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('toggle-features').click();
    await page.getByTestId('toggle-snap').click();
    await expect(page.getByTestId('graph-canvas')).toBeVisible();
  });

  test('enforces the eight-layer limit', async ({ page }) => {
    await gotoApp(page);
    for (let index = 1; index < 8; index += 1) {
      await page.getByTestId('add-layer').click();
    }
    await expect(cards(page)).toHaveCount(8);
    await expect(page.getByTestId('add-layer')).toBeDisabled();
    await expect(page.getByTestId('layer-count')).toContainText('8 / 8');
  });

  test('opens and closes the OCR modal', async ({ page }) => {
    await gotoApp(page);
    const card = cards(page).first();
    await card.getByRole('button', { name: '拍照识别公式' }).click();
    const dialog = page.getByRole('dialog', { name: '拍照识别公式' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/识别引擎：/)).toBeVisible();
    await dialog.getByRole('button', { name: '关闭识别弹窗' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('shows the symbolic derivative and exact roots', async ({ page }) => {
    await gotoApp(page);
    const footer = cards(page).first().getByTestId('symbolic-footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('2 * x');
    await expect(footer).toContainText('精确零点：', { timeout: 10_000 });
  });

  test('deletes a layer and falls back to the remaining one', async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId('add-layer').click();
    await expect(cards(page)).toHaveCount(2);
    await cards(page).nth(1).getByRole('button', { name: '删除图层' }).click();
    await expect(cards(page)).toHaveCount(1);
  });
});
