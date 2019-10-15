import { Buffer } from 'buffer'
import { API } from 'typings/types'
import { createAsyncAction, createStandardAction } from 'typesafe-actions'
import Album from 'models/album'
import { FileHandle } from 'models/fileHandle'
import Image from 'models/image'

export const getAlbumImages = createAsyncAction(
  'IMAGES__LIST_REQUEST',
  'IMAGES__LIST_SUCCESS',
  'IMAGES__LIST_FAILURE',
  'IMAGES__LIST_CANCEL',
)<
  Album,
  API.ShowResponse<{
    album: Album
    images: Image[]
  }>,
  API.ErrorResponse<Album>,
  API.ResourceFilter
>()

export const uploadImagesToAlbum = createStandardAction(
  'IMAGES__UPLOAD_IMAGES_TO_ALBUM',
)<{
  album: Album
  imageFiles: File[]
}>()

export const uploadImageToAlbum = createAsyncAction(
  'IMAGES__UPLOAD_IMAGE_TO_ALBUM__REQUEST',
  'IMAGES__UPLOAD_IMAGE_TO_ALBUM__SUCCESS',
  'IMAGES__UPLOAD_IMAGE_TO_ALBUM__FAILURE',
  'IMAGES__UPLOAD_IMAGE_TO_ALBUM__CANCEL',
)<
  {
    album: Album
    fileHandle: FileHandle
  },
  {
    album: Album
    image: Image
  },
  API.ErrorResponse<{
    album: Album
    fileHandle: FileHandle
  }>,
  {
    album: Album
    fileHandle: FileHandle
  }
>()

export const didProcessImage = createStandardAction('IMAGES__PROCESSED_IMAGE')<{
  album: Album
  image: Image
  imageData: ArrayBuffer
  previewData: ArrayBuffer
}>()

interface DownloadImageRequest {
  album: Album
  image: Image
}

interface DownloadImageResult {
  image: Image
  fileContent: Buffer | string
}

export const requestDownloadPreviewImage = createStandardAction(
  'IMAGES__REQUEST_DOWNLOAD_PREVIEW_IMAGE',
)<DownloadImageRequest>()

export const downloadPreviewImage = createAsyncAction(
  'IMAGES__DOWNLOAD_PREVIEW_IMAGE__REQUEST',
  'IMAGES__DOWNLOAD_PREVIEW_IMAGE__SUCCESS',
  'IMAGES__DOWNLOAD_PREVIEW_IMAGE__FAILURE',
  'IMAGES__DOWNLOAD_PREVIEW_IMAGE__CANCEL',
)<
  DownloadImageRequest,
  DownloadImageResult,
  API.ErrorResponse<Image>,
  DownloadImageRequest
>()

export const requestDownloadImage = createStandardAction(
  'IMAGES__REQUEST_DOWNLOAD_IMAGE',
)<DownloadImageRequest>()

export const downloadImage = createAsyncAction(
  'IMAGES__DOWNLOAD_IMAGE__REQUEST',
  'IMAGES__DOWNLOAD_IMAGE__SUCCESS',
  'IMAGES__DOWNLOAD_IMAGE__FAILURE',
  'IMAGES__DOWNLOAD_IMAGE__CANCEL',
)<
  DownloadImageRequest,
  DownloadImageResult,
  API.ErrorResponse<Image>,
  DownloadImageRequest
>()

interface SaveImageResult {
  image: Image
  objectURL: string
}

export const saveImage = createAsyncAction(
  'IMAGES__SAVE_IMAGE__REQUEST',
  'IMAGES__SAVE_IMAGE__SUCCESS',
  'IMAGES__SAVE_IMAGE__FAILURE',
  'IMAGES__SAVE_IMAGE__CANCEL',
)<
  DownloadImageRequest,
  SaveImageResult,
  API.ErrorResponse<Image>,
  DownloadImageRequest
>()

export const deleteImage = createAsyncAction(
  'IMAGES__DELETE_IMAGE__REQUEST',
  'IMAGES__DELETE_IMAGE__SUCCESS',
  'IMAGES__DELETE_IMAGE__FAILURE',
  'IMAGES__DELETE_IMAGE__CANCEL',
)<Image, Image, API.ErrorResponse<Image>, Image>()
