import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Disk store for optional Question images. They live under data/uploads —
// alongside the SQLite file, outside public/ — so a plain `cp -r data` backup
// carries both the DB and the images (ADR-0003; data/ is gitignored). The
// /uploads/<file> route serves them back.
const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");
export const UPLOADS_URL_PREFIX = "/uploads/";

// The image types we accept, mapped to the extension we store them under. Kept
// in step with the route handler's Content-Type table.
const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

// Save an uploaded Question image and return its served URL (/uploads/<file>),
// or null if it isn't an accepted image type. The filename is a fresh UUID, so
// two uploads never collide and the URL is safe to cache immutably.
export async function saveUploadedImage(file: File): Promise<string | null> {
  const ext = EXT_BY_MIME[file.type];
  if (!ext) return null;
  await mkdir(UPLOADS_DIR, { recursive: true });
  const name = `${randomUUID()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOADS_DIR, name), bytes);
  return `${UPLOADS_URL_PREFIX}${name}`;
}

// Delete a previously saved upload, given its served URL. Best-effort: a URL
// that isn't ours, or a file already gone, is ignored — orphaning a stray file
// must never fail an edit.
export async function deleteUpload(url: string | null): Promise<void> {
  if (!url || !url.startsWith(UPLOADS_URL_PREFIX)) return;
  const name = url.slice(UPLOADS_URL_PREFIX.length);
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return;
  await unlink(path.join(UPLOADS_DIR, name)).catch(() => {});
}
