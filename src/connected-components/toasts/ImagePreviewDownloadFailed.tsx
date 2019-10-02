import React from 'react'
import { downloadPreviewImage } from 'store/images/actions'

type PayloadType = Parameters<typeof downloadPreviewImage.failure>[0]

export default function ImagePreviewDownloadFailed({
  resource: image,
}: PayloadType) {
  return <>An image could not be downloaded.</>
}