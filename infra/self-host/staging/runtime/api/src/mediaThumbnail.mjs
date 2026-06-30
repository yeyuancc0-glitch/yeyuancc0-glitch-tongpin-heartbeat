import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const defaultThumbnailSize = 420;
const defaultThumbnailQuality = 72;

export function thumbnailPathForStoragePath(storagePath) {
  const text = String(storagePath || "").trim();
  if (!text) {
    return null;
  }
  const slashIndex = text.lastIndexOf("/");
  const directory = slashIndex >= 0 ? text.slice(0, slashIndex + 1) : "";
  const filename = slashIndex >= 0 ? text.slice(slashIndex + 1) : text;
  const dotIndex = filename.lastIndexOf(".");
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  return `${directory}${base}-thumb.webp`;
}

export async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function createImageThumbnailBuffer(input, options = {}) {
  const width = options.width ?? defaultThumbnailSize;
  const quality = options.quality ?? defaultThumbnailQuality;
  return sharp(input, { animated: false, limitInputPixels: 64_000_000 })
    .rotate()
    .resize(width, width, {
      fit: "cover",
      position: "centre",
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer();
}

export async function createAndUploadImageThumbnail({
  bucket,
  key,
  maxBytes,
  s3,
  thumbnailKey = thumbnailPathForStoragePath(key),
}) {
  if (!bucket || !key || !thumbnailKey) {
    return null;
  }
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const source = object.Body ? await streamToBuffer(object.Body) : null;
  if (!source?.length) {
    throw new Error("source_image_empty");
  }
  const thumbnail = await createImageThumbnailBuffer(source);
  if (!thumbnail.length || thumbnail.length > maxBytes) {
    throw new Error("generated_thumbnail_too_large");
  }
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: thumbnailKey,
    Body: thumbnail,
    ContentType: "image/webp",
    ContentLength: thumbnail.length,
  }));
  return {
    contentType: "image/webp",
    key: thumbnailKey,
    sizeBytes: thumbnail.length,
  };
}
