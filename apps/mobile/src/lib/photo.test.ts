import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator } from 'expo-image-manipulator';
import { MAX_EDGE, PhotoPermissionError, pickPhoto, resizeFor, uploadPhoto } from './photo';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg' },
}));
jest.mock('./api', () => ({ api: { org: jest.fn() } }));
const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const manipulate = ImageManipulator.manipulate as jest.Mock;
const mockApi = jest.requireMock('./api').api;

function manipulator() {
  const saveAsync = jest.fn().mockResolvedValue({ uri: 'file:///cache/out.jpg' });
  const resize = jest.fn();
  manipulate.mockReturnValue({ resize, renderAsync: jest.fn().mockResolvedValue({ saveAsync }) });
  return { saveAsync, resize };
}

beforeEach(() => jest.clearAllMocks());

describe('resizeFor', () => {
  it('shrinks only the longer edge and never enlarges', () => {
    expect(resizeFor(3000, 4000)).toEqual({ height: MAX_EDGE });
    expect(resizeFor(4000, 3000)).toEqual({ width: MAX_EDGE });
    expect(resizeFor(1200, 1600)).toBeNull();
    expect(resizeFor(800, 600)).toBeNull();
  });
});

describe('pickPhoto', () => {
  it('stops with a permission error when the camera is refused, without opening it', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false } as never);
    await expect(pickPhoto('camera')).rejects.toBeInstanceOf(PhotoPermissionError);
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('returns null when the person backs out', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null } as never);
    expect(await pickPhoto('library')).toBeNull();
    expect(manipulate).not.toHaveBeenCalled();
  });

  it('re-encodes a large HEIC picture as a smaller JPEG without asking location data', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as never);
    picker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x.heic', width: 3024, height: 4032 }] } as never);
    const m = manipulator();
    const out = await pickPhoto('camera');
    expect(picker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ exif: false, mediaTypes: ['images'] }));
    expect(m.resize).toHaveBeenCalledWith({ height: MAX_EDGE });
    expect(m.saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.85 });
    expect(out).toEqual({ uri: 'file:///cache/out.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' });
  });

  it('does not resize a picture that is already small, and the library needs no permission prompt', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///s.jpg', width: 800, height: 600 }] } as never);
    const m = manipulator();
    await pickPhoto('library');
    expect(m.resize).not.toHaveBeenCalled();
    expect(picker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('uploadPhoto', () => {
  it('sends the bytes through the signed upload, private for body photos', async () => {
    const blob = new Blob(['x']);
    globalThis.fetch = jest.fn().mockResolvedValue({ blob: () => Promise.resolve(blob) }) as never;
    const upload = jest.fn().mockResolvedValue({ id: 'f1' });
    mockApi.org.mockReturnValue({ files: { upload } });
    await uploadPhoto('org-1', { uri: 'file:///p.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' }, { sensitive: true });
    expect(upload).toHaveBeenCalledWith({ fileName: 'photo.jpg', mimeType: 'image/jpeg', body: blob, sensitivity: 'SENSITIVE' });
  });
});
