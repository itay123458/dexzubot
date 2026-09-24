// World English Bible (public domain), verified against eBible.org, 2026-09-24.
// Text is unchanged; poetry line breaks are represented as spaces.
// https://ebible.org/engwebp/copyright.htm
const chapters = [
  ['Psalms', 23, 'PSA023', [
    [1, 'The LORD is my shepherd; I shall lack nothing.'],
    [2, 'He makes me lie down in green pastures. He leads me beside still waters.'],
    [3, 'He restores my soul. He guides me in the paths of righteousness for his name’s sake.'],
    [4, 'Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me. Your rod and your staff, they comfort me.'],
    [5, 'You prepare a table before me in the presence of my enemies. You anoint my head with oil. My cup runs over.'],
    [6, 'Surely goodness and loving kindness shall follow me all the days of my life, and I will dwell in the LORD’s house forever.'],
  ]],
  ['Psalms', 121, 'PSA121', [
    [1, 'I will lift up my eyes to the hills. Where does my help come from?'],
    [2, 'My help comes from the LORD, who made heaven and earth.'],
    [3, 'He will not allow your foot to be moved. He who keeps you will not slumber.'],
    [4, 'Behold, he who keeps Israel will neither slumber nor sleep.'],
    [5, 'The LORD is your keeper. The LORD is your shade on your right hand.'],
    [6, 'The sun will not harm you by day, nor the moon by night.'],
    [7, 'The LORD will keep you from all evil. He will keep your soul.'],
    [8, 'The LORD will keep your going out and your coming in, from this time forward, and forever more.'],
  ]],
  ['1 Corinthians', 13, '1CO13', [
    [4, 'Love is patient and is kind. Love doesn’t envy. Love doesn’t brag, is not proud,'],
    [11, 'When I was a child, I spoke as a child, I felt as a child, I thought as a child. Now that I have become a man, I have put away childish things.'],
    [12, 'For now we see in a mirror, dimly, but then face to face. Now I know in part, but then I will know fully, even as I was also fully known.'],
    [13, 'But now faith, hope, and love remain—these three. The greatest of these is love.'],
  ]],
  ['Philippians', 4, 'PHP04', [
    [4, 'Rejoice in the Lord always! Again I will say, “Rejoice!”'],
    [5, 'Let your gentleness be known to all men. The Lord is at hand.'],
    [6, 'In nothing be anxious, but in everything, by prayer and petition with thanksgiving, let your requests be made known to God.'],
    [7, 'And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.'],
    [8, 'Finally, brothers, whatever things are true, whatever things are honorable, whatever things are just, whatever things are pure, whatever things are lovely, whatever things are of good report: if there is any virtue and if there is anything worthy of praise, think about these things.'],
    [9, 'Do the things which you learned, received, heard, and saw in me, and the God of peace will be with you.'],
    [13, 'I can do all things through Christ who strengthens me.'],
    [19, 'My God will supply every need of yours according to his riches in glory in Christ Jesus.'],
  ]],
];
export const FAITH_VERSES = Object.freeze(chapters.flatMap(([book, chapter, page, verses]) =>
  verses.map(([verse, text]) => Object.freeze({ reference: `${book} ${chapter}:${verse}`, text,
    source: `https://ebible.org/engwebp/${page}.htm`, translation: 'World English Bible' }))));
