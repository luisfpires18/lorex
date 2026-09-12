import type { ImageCrop } from '../lib/imageCrop'

/**
 * The account's photo, as identifiers and pixels. No URL and no account id: the client composes
 * the address from `assetId` and `thumbnailId`, and the session already says whose photo it is.
 *
 * `crop` is what "Edit photo" reopens the cropper on, so reframing never sends the picture again.
 */
export interface ProfileImageRef {
  assetId: string
  thumbnailId: string
  width: number
  height: number
  contentType: string
  fileName: string | null
  byteSize: number
  uploadedAt: string
  crop: ImageCrop | null
}
