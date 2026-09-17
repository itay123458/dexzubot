// Offline asset build. Requires Playwright/Chrome and ffmpeg; no runtime dependency.
import { readFile, writeFile, mkdir, mkdtemp, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
const out = resolve('src/web/public/assets/embed-motion');
await mkdir(out, { recursive: true });
try {
  for (const [kind, source, width, height] of [
    ['avatar', 'dexzu-beta-avatar.png', 256, 256],
    ['avatar-main', 'dexzu-avatar.png', 256, 256],
    ['giveaway', 'dexzu-giveaway-banner-slim.png', 720, 166],
  ].filter(([kind])=>!process.argv.includes('--main-only')||kind==='avatar-main')) {
    const temp = await mkdtemp(join(tmpdir(), 'dexzu-motion-'));
    const data = (await readFile(resolve('src/assets', source))).toString('base64');
    const page = await browser.newPage();
    await page.setContent('<canvas></canvas>');
    await page.evaluate(async ({ data, width, height }) => {
      window.art = new Image(); art.src = `data:image/png;base64,${data}`; await art.decode();
      const canvas = document.querySelector('canvas'); canvas.width = width; canvas.height = height;
    }, { data, width, height });
    for (let frame = 0; frame < 60; frame++) {
      const png = await page.evaluate(({ frame, width: w, height: h, kind }) => {
        const canvas = document.querySelector('canvas'), c = canvas.getContext('2d'), phase = frame / 60 * Math.PI * 2;
        c.clearRect(0, 0, w, h); c.drawImage(art, 0, 0, w, h);
        c.save();
        // Only the perimeter moves. Mascot and lettering remain pixel-stationary.
        c.strokeStyle = '#8eeeff'; c.lineWidth = 1.5; c.shadowColor = '#17baff'; c.shadowBlur = 8;
        if (kind.startsWith('avatar')) {
          for (let i = 0; i < 2; i++) {
            c.beginPath(); c.ellipse(w / 2, h / 2, w * .46, h * .46, 0, phase + i * Math.PI, phase + i * Math.PI + .45); c.stroke();
          }
        } else {
          for (let i = 0; i < 12; i++) {
            const x = ((i * 67 + Math.sin(phase) * 18 + w) % w), y = i % 2 ? h - 10 + Math.sin(phase + i) * 3 : 10 + Math.sin(phase + i) * 3;
            c.globalAlpha = .35 + .3 * Math.sin(phase + i); c.fillStyle = '#b9f4ff';
            c.beginPath(); c.arc(x, y, 1.2, 0, Math.PI * 2); c.fill();
          }
          c.globalAlpha = .55; const x = (Math.sin(phase) + 1) / 2 * (w - 120);
          const light = c.createLinearGradient(x, 0, x + 120, 0);
          light.addColorStop(0, 'transparent'); light.addColorStop(.5, '#b7f4ff'); light.addColorStop(1, 'transparent');
          c.fillStyle = light; c.fillRect(x, h - 2, 120, 2);
        }
        c.restore(); return canvas.toDataURL('image/png').split(',')[1];
      }, { frame, width, height, kind });
      await writeFile(join(temp, `${String(frame).padStart(3, '0')}.png`), Buffer.from(png, 'base64'));
    }
    await copyFile(join(temp, '000.png'), join(out, `dexzu-motion-${kind}.png`));
    const result = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '15', '-i', join(temp, '%03d.png'), '-filter_complex', '[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', join(out, `dexzu-motion-${kind}.gif`)], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
    await page.close(); console.log(`Built ${kind}: ${width} × ${height}, 4 seconds.`);
  }
} finally { await browser.close(); }
