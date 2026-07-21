const TTL_MS = 30 * 60 * 1000;

type ThreadBrand = {
  brandId: string;
  name: string;
  createdAt: number;
};

const brands = new Map<string, ThreadBrand>();

function key(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}

export function setThreadBrand(input: {
  channelId: string;
  threadTs: string;
  brandId: string;
  name: string;
}): void {
  brands.set(key(input.channelId, input.threadTs), {
    brandId: input.brandId,
    name: input.name,
    createdAt: Date.now(),
  });
}

export function getThreadBrand(channelId: string, threadTs: string): ThreadBrand | undefined {
  const entry = brands.get(key(channelId, threadTs));
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > TTL_MS) {
    brands.delete(key(channelId, threadTs));
    return undefined;
  }
  return entry;
}

export function clearThreadBrand(channelId: string, threadTs: string): void {
  brands.delete(key(channelId, threadTs));
}
