import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import type { StoredFile } from '@pt/api-client';
import type { Translator } from '@/i18n';
import { api } from './api';

export type PhotoSource = 'camera' | 'library';
export interface PreparedPhoto {
  uri: string;
  fileName: string;
  mimeType: 'image/jpeg';
}

/** The person said no to the camera: the screen shows a sentence, never a crash. */
export class PhotoPermissionError extends Error {
  constructor() {
    super('camera_permission_denied');
  }
}

/** Long edge in pixels: plenty for comparing progress, small enough to upload on a phone connection. */
export const MAX_EDGE = 1600;

/** The resize step for a picture of the given size: only ever shrinks, along the longer edge. */
export function resizeFor(width: number, height: number): { width: number } | { height: number } | null {
  if (Math.max(width, height) <= MAX_EDGE) return null;
  return width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE };
}

/**
 * Take or choose a picture and return it as a JPEG. Re-encoding does three jobs at once: HEIC from iPhones becomes JPEG
 * (the only format the server accepts for private photos besides PNG), large pictures shrink, and camera metadata (location)
 * does not leave the phone. The server strips metadata again regardless.
 */
export async function pickPhoto(source: PhotoSource): Promise<PreparedPhoto | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new PhotoPermissionError();
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1, exif: false };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;

  const context = ImageManipulator.manipulate(asset.uri);
  const resize = resizeFor(asset.width, asset.height);
  if (resize) context.resize(resize);
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return { uri: saved.uri, fileName: 'photo.jpg', mimeType: 'image/jpeg' };
}

/** Ask where the picture comes from. Resolves to null when the person closes the sheet. */
export function askPhotoSource(t: Translator): Promise<PhotoSource | null> {
  return new Promise((resolve) => {
    Alert.alert(t('checkin.addPhotoTitle'), undefined, [
      { text: t('checkin.takePhoto'), onPress: () => resolve('camera') },
      { text: t('checkin.chooseFromLibrary'), onPress: () => resolve('library') },
      { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}

/** Send a prepared picture to storage (signed upload, then server verification). `sensitive` for body photos. */
export async function uploadPhoto(orgId: string, photo: PreparedPhoto, opts: { sensitive: boolean }): Promise<StoredFile> {
  const body = await (await fetch(photo.uri)).blob();
  return api.org(orgId).files.upload({ fileName: photo.fileName, mimeType: photo.mimeType, body, sensitivity: opts.sensitive ? 'SENSITIVE' : 'STANDARD' });
}
