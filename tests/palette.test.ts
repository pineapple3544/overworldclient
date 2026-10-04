import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
function tokens(source: string) {
  return Object.fromEntries(
    [...source.matchAll(/--([a-z-]+):\s*(#[\da-f]{6});/gi)].map((match) => [match[1], match[2]]),
  );
}
const dark = tokens(css.match(/:root \{([\s\S]*?)\n\}/)![1]);
const light = { ...dark, ...tokens(css.match(/:root\[data-theme='light'\] \{([\s\S]*?)\n\}/)![1]) };
function luminance(hex: string) {
  const rgb = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = rgb.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(colors: Record<string, string>, foreground: string, background: string) {
  assert.ok(colors[foreground], `Missing foreground token ${foreground}`);
  assert.ok(colors[background], `Missing background token ${background}`);
  const values = [luminance(colors[foreground]), luminance(colors[background])].sort(
    (a, b) => a - b,
  );
  return (values[1] + 0.05) / (values[0] + 0.05);
}

for (const [mode, colors] of Object.entries({ dark, light })) {
  test(`${mode} palette keeps text and interactive indicators legible across solid surfaces and states`, () => {
    for (const background of ['dark', 'surface', 'panel', 'raised', 'inset', 'accent-soft']) {
      for (const foreground of ['text', 'text-secondary', 'muted']) {
        const ratio = contrast(colors, foreground, background);
        assert.ok(ratio >= 4.5, `${foreground}/${background}: ${ratio}`);
      }
    }
    for (const [foreground, background] of [
      ['quiet', 'raised'],
      ['accent-ink', 'accent'],
      ['accent-ink', 'accent-hover'],
      ['error', 'error-surface'],
      ['brand-ink', 'brand-paper'],
      ['brand-muted', 'brand-paper'],
    ])
      assert.ok(contrast(colors, foreground, background) >= 4.5, `${foreground}/${background}`);

    // Track-to-panel and thumb-to-track contrast are separate visual requirements.
    for (const [foreground, background] of [
      ['switch-off', 'panel'],
      ['switch-thumb', 'switch-off'],
      ['accent', 'panel'],
      ['accent-ink', 'accent'],
      ['control-line', 'panel'],
    ])
      assert.ok(contrast(colors, foreground, background) >= 3, `${foreground}/${background}`);
    console.log(
      `Contrast: body ${contrast(colors, 'text', 'dark').toFixed(2)}:1, secondary ${contrast(colors, 'muted', 'panel').toFixed(2)}:1, CTA ${contrast(colors, 'accent-ink', 'accent').toFixed(2)}:1.`,
    );
  });
}
