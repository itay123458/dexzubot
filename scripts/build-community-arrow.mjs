// Offline deterministic asset build; Python + Pillow are build tools only.
import { spawnSync } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const output = new URL('../src/web/public/assets/embed-motion/dexzu-community-arrow.gif', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
const result = spawnSync(process.env.PYTHON || 'python', ['-c', String.raw`
import math, sys
from PIL import Image, ImageDraw
frames = []
# A fixed transparent palette avoids flashing and GIF disposal trails.
palette = [0,0,0, 42,202,255, 151,239,255, 22,105,154] + [0,0,0]*252
for frame in range(24):
    phase = frame / 24 * math.tau
    x = round(6 * math.sin(phase))
    im = Image.new('P', (128,128), 0)
    im.putpalette(palette)
    d = ImageDraw.Draw(im)
    # Bold chevron remains legible at Discord's inline emoji size.
    d.polygon([(47+x,26),(85+x,64),(47+x,102),(32+x,87),(55+x,64),(32+x,41)], fill=1)
    d.line([(47+x,30),(81+x,64),(47+x,98)], fill=2, width=4)
    # A smaller trailing chevron makes the rightward motion unmistakable.
    d.line([(15+x,48),(31+x,64),(15+x,80)], fill=3 if math.cos(phase)<0 else 1, width=7)
    frames.append(im)
frames[0].save(sys.argv[1], save_all=True, append_images=frames[1:], duration=80, loop=0, transparency=0, disposal=2, optimize=False)
`, fileURLToPath(output)], { encoding: 'utf8' });
if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'Arrow build failed.');
const { size } = await stat(output);
if (size > 256 * 1024) throw new Error('Arrow exceeds Discord emoji size limit.');
console.log(`Built transparent 128 × 128 arrow: 24 frames, ${size} bytes.`);
