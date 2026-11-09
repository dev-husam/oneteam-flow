import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Image, View } from 'react-native';
import { useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { usePrefs } from '@/stores/prefs';
import { AppText } from './kit';
import { useColors, radius } from './theme';

/**
 * A private image (progress or meal photo). The short-lived signed address is requested when the image is
 * shown: that request is what the server records in the audit log. It is never cached or persisted.
 */
export function SecureImage({ fileId, label, size = 160 }: { fileId: string; label: string; size?: number }) {
  const t = useT();
  const c = useColors();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const q = useQuery({
    queryKey: ['org', orgId, 'file-url', fileId],
    queryFn: () => api.org(orgId).files.downloadUrl(fileId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const box = { width: size, height: size * 1.25, borderRadius: radius.md, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } as const;
  if (q.isPending) return <View style={box}><ActivityIndicator /></View>;
  if (q.isError || !q.data) return <View style={box}><AppText variant="muted">{t('checkin.photoUnavailable')}</AppText></View>;
  return <Image accessibilityLabel={label} source={{ uri: q.data.url }} style={box} resizeMode="cover" />;
}
