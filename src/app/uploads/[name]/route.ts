import { readFile } from "node:fs/promises";
import path from "node:path";

// Serve uploaded Question images from data/uploads, which sits outside public/
// (it's gitignored runtime data, backed up with the data folder). The custom
// server routes every non-socket request through Next, so this handler answers
// the /uploads/<file> URLs saved on Questions.
const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  // Only ever read a plain filename from the uploads dir — no slashes, no `..`,
  // so the URL can't escape data/uploads.
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    return new Response("Not found", { status: 404 });
  }
  const contentType = CONTENT_TYPE_BY_EXT[path.extname(name).toLowerCase()];
  if (!contentType) return new Response("Not found", { status: 404 });

  try {
    const data = await readFile(path.join(UPLOADS_DIR, name));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        // Filenames are UUIDs, so a given URL's bytes never change: cache hard.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
