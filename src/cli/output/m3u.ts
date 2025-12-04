/**
 * M3U playlist entry
 */
export type PlaylistEntry = {
  duration: number; // -1 for streams/unknown duration
  title: string;
  url: string;
};

/**
 * Generate an M3U playlist from entries
 *
 * M3U format:
 * #EXTM3U
 * #EXTINF:duration,title
 * url
 *
 * @param entries - Array of playlist entries
 * @returns M3U playlist content
 */
export function generateM3U(entries: PlaylistEntry[]): string {
  const lines: string[] = ['#EXTM3U'];

  for (const entry of entries) {
    lines.push(`#EXTINF:${entry.duration},${entry.title}`);
    lines.push(entry.url);
  }

  return lines.join('\n') + '\n';
}

/**
 * Generate a simple URL list (one URL per line)
 *
 * @param entries - Array of playlist entries
 * @returns URL list content
 */
export function generateURLList(entries: PlaylistEntry[]): string {
  return entries.map(entry => entry.url).join('\n') + '\n';
}
