import PureImage from 'pureimage';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PassThrough, Readable } from 'node:stream';
import { AttachmentBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';

function fitText(context, text, maxWidth) {
  let value = String(text || 'Member');
  while (value.length > 3 && context.measureText(value).width > maxWidth) value = `${value.slice(0, -4)}…`;
  return value;
}

let fontsLoaded = false;
const backgroundPath = fileURLToPath(new URL('../assets/dexzu-card-background.png', import.meta.url));
let backgroundPromise = null;
function loadFonts() {
  if (fontsLoaded) return;
  PureImage.registerFont('/usr/share/fonts/dejavu/DejaVuSans.ttf', 'DejaVu Sans').loadSync();
  PureImage.registerFont('/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf', 'DejaVu Sans Bold').loadSync();
  fontsLoaded = true;
}

async function loadRemoteImage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Avatar download failed (${response.status})`);
  return PureImage.decodePNGFromStream(Readable.from(Buffer.from(await response.arrayBuffer())));
}

function loadCustomBackground() {
  if (!backgroundPromise) backgroundPromise = PureImage.decodePNGFromStream(createReadStream(backgroundPath));
  return backgroundPromise;
}

async function encodePng(image) {
  const stream = new PassThrough();
  const chunks = [];
  stream.on('data', chunk => chunks.push(chunk));
  await PureImage.encodePNGToStream(image, stream);
  return Buffer.concat(chunks);
}

export async function createWelcomeCard(member, type = 'welcome') {
  try {
    loadFonts();
    const canvas = PureImage.make(900, 360);
    const context = canvas.getContext('2d');
    const isWelcome = type === 'welcome';
    const accent = isWelcome ? '#39e6df' : '#a88cff';
    const background = await loadCustomBackground();
    const sourceHeight = Math.round(background.width * canvas.height / canvas.width);
    const sourceY = Math.max(0, Math.floor((background.height - sourceHeight) / 2));
    context.drawImage(background, 0, sourceY, background.width, Math.min(sourceHeight, background.height), 0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(2,8,24,0.32)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(3,12,32,0.70)';
    context.fillRect(36, 35, 828, 290);
    context.fillStyle = isWelcome ? 'rgba(57,230,223,0.28)' : 'rgba(168,140,255,0.28)';
    context.fillRect(36, 35, 828, 7);

    const avatar = await loadRemoteImage(member.user.displayAvatarURL({ extension: 'png', size: 256 }));
    context.save();
    context.beginPath();
    context.arc(450, 130, 76, 0, Math.PI * 2);
    context.clip();
    context.drawImage(avatar, 374, 54, 152, 152);
    context.restore();
    context.strokeStyle = accent;
    context.lineWidth = 5;
    context.beginPath();
    context.arc(450, 130, 78, 0, Math.PI * 2);
    context.stroke();

    context.textAlign = 'center';
    context.fillStyle = '#ffffff';
    context.font = '39pt "DejaVu Sans Bold"';
    const heading = fitText(context, `${isWelcome ? 'Welcome' : 'Goodbye'} @${member.user.username}`, 760);
    context.fillText(heading, 450, 250);
    context.fillStyle = '#d4d7da';
    context.font = '27pt "DejaVu Sans"';
    context.fillText(isWelcome ? `Member #${member.guild.memberCount}` : 'You will be missed :(', 450, 292);

    return new AttachmentBuilder(await encodePng(canvas), { name: `${type}-${member.id}.png` });
  } catch (error) {
    logger.error(`Failed to generate ${type} card:`, error);
    return null;
  }
}
