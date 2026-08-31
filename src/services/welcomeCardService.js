import { createCanvas, loadImage } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';

function fitText(context, text, maxWidth) {
  let value = String(text || 'Member');
  while (value.length > 3 && context.measureText(value).width > maxWidth) value = `${value.slice(0, -4)}…`;
  return value;
}

export async function createWelcomeCard(member, type = 'welcome') {
  try {
    const canvas = createCanvas(900, 360);
    const context = canvas.getContext('2d');
    const isWelcome = type === 'welcome';
    const accent = isWelcome ? '#33d6c7' : '#ef6674';

    context.fillStyle = '#3a3e43';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#202528';
    context.roundRect(36, 35, 828, 290, 18);
    context.fill();

    const avatar = await loadImage(member.user.displayAvatarURL({ extension: 'png', size: 256 }));
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
    context.font = 'bold 39px sans-serif';
    const heading = fitText(context, `${isWelcome ? 'Welcome' : 'Goodbye'} @${member.user.username}`, 760);
    context.fillText(heading, 450, 250);
    context.fillStyle = '#d4d7da';
    context.font = '27px sans-serif';
    context.fillText(isWelcome ? `Member #${member.guild.memberCount}` : 'You will be missed :(', 450, 292);

    return new AttachmentBuilder(await canvas.encode('png'), { name: `${type}-${member.id}.png` });
  } catch (error) {
    logger.error(`Failed to generate ${type} card:`, error);
    return null;
  }
}
