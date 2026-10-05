/** Press Start 2P for OG images. Falls back to the default font if Google Fonts is unreachable. */
let cached: Promise<ArrayBuffer | null> | null = null;

export function pixelFont(): Promise<ArrayBuffer | null> {
  if (!cached)
    cached = (async () => {
      try {
        const css = await (await fetch('https://fonts.googleapis.com/css2?family=Press+Start+2P')).text();
        const url = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype)'\)/)?.[1];
        if (!url) return null;
        return await (await fetch(url)).arrayBuffer();
      } catch {
        return null;
      }
    })();
  return cached;
}
