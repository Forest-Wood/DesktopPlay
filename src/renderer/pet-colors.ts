export async function samplePetColors(url: string): Promise<string[]> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  const scale = 48 / Math.max(image.naturalWidth, image.naturalHeight);
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法读取角色颜色。');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const bins = new Map<number, { total: [number, number, number]; count: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 5) * 8 + (g >> 5)) * 8 + (b >> 5);
    const entry = bins.get(key) ?? { total: [0, 0, 0], count: 0 };
    entry.total[0] += r;
    entry.total[1] += g;
    entry.total[2] += b;
    entry.count++;
    bins.set(key, entry);
  }
  const ranked = [...bins.values()].map(({ total, count }) => {
    const rgb = total.map(channel => Math.round(channel / count));
    const saturation = (Math.max(...rgb) - Math.min(...rgb)) / 255;
    return { rgb, score: count * (.22 + saturation) };
  }).sort((a, b) => b.score - a.score);
  const selected: number[][] = [];
  for (const { rgb } of ranked) {
    if (selected.every(color => color.reduce((distance, channel, i) => distance + (channel - rgb[i]) ** 2, 0) >= 45 ** 2)) selected.push(rgb);
    if (selected.length === 5) break;
  }
  return selected.map(rgb => '#' + rgb.map(channel => channel.toString(16).padStart(2, '0')).join(''));
}
