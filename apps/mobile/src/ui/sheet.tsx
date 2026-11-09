import { Modal, Pressable, View } from 'react-native';
import { AppText } from './kit';
import { radius, useColors } from './theme';

/** A bottom sheet for a short list of choices (Alert allows only three buttons on Android). */
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const c = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel={title} accessibilityRole="button" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 16, paddingBottom: 32, gap: 10 }}>
          <AppText variant="heading">{title}</AppText>
          <View style={{ gap: 8 }}>{children}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
