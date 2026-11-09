import { api } from '@/lib/api';

/**
 * Downloads a stored file. The server decides access and returns a 60-second signed link, which is followed
 * immediately and never stored or shown.
 */
export async function openStoredFile(orgId: string, fileId: string): Promise<void> {
  const { url } = await api.org(orgId).files.downloadUrl(fileId);
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener noreferrer';
  document.body.append(a);
  a.click();
  a.remove();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
