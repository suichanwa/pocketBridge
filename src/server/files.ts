import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FileItem, FileTextPreview } from '../shared/types.js';

const USER_HOME = os.homedir();
const PROJECT_ROOT = process.cwd();

export function resolveSafePath(inputPath?: string): string {
  if (!inputPath || inputPath.trim() === '' || inputPath === '.') {
    return PROJECT_ROOT;
  }

  let resolved = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(PROJECT_ROOT, inputPath);

  // Security barrier: must not escape the user's home directory
  if (!resolved.startsWith(USER_HOME)) {
    resolved = PROJECT_ROOT;
  }

  return resolved;
}

export async function listDirectoryContents(dirPath?: string): Promise<{
  currentPath: string;
  parentPath: string | null;
  items: FileItem[];
  quickShortcuts: { name: string; path: string }[];
}> {
  const safePath = resolveSafePath(dirPath);

  // Verify path exists and is a directory
  if (!fsSync.existsSync(safePath)) {
    throw new Error(`Directory does not exist: ${safePath}`);
  }

  const stat = await fs.stat(safePath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${safePath}`);
  }

  const parentPath = safePath === USER_HOME ? null : path.dirname(safePath);
  const entries = await fs.readdir(safePath, { withFileTypes: true });
  const items: FileItem[] = [];

  for (const entry of entries) {
    // Hide .DS_Store
    if (entry.name === '.DS_Store') continue;

    const fullPath = path.join(safePath, entry.name);
    try {
      const entryStat = await fs.stat(fullPath);
      const isDir = entry.isDirectory();
      const ext = isDir ? undefined : path.extname(entry.name).replace(/^\./, '').toLowerCase();

      items.push({
        name: entry.name,
        path: fullPath,
        isDirectory: isDir,
        size: isDir ? 0 : entryStat.size,
        mtime: entryStat.mtimeMs,
        extension: ext,
      });
    } catch {
      // Skip broken symlinks or unreadable files
    }
  }

  // Sort: directories first, then files alphabetically
  items.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  const quickShortcuts = [
    { name: 'PocketBridge', path: PROJECT_ROOT },
    { name: 'Downloads', path: path.join(USER_HOME, 'Downloads') },
    { name: 'Desktop', path: path.join(USER_HOME, 'Desktop') },
    { name: 'Home', path: USER_HOME },
  ].filter((s) => fsSync.existsSync(s.path));

  return {
    currentPath: safePath,
    parentPath,
    items,
    quickShortcuts,
  };
}

export async function deleteFileSystemItem(targetPath: string): Promise<boolean> {
  const safePath = resolveSafePath(targetPath);

  // Prevent deleting critical root directories
  if (safePath === USER_HOME || safePath === PROJECT_ROOT) {
    throw new Error('Cannot delete protected root directories');
  }

  if (!fsSync.existsSync(safePath)) {
    return false;
  }

  const stat = await fs.stat(safePath);
  if (stat.isDirectory()) {
    await fs.rm(safePath, { recursive: true, force: true });
  } else {
    await fs.unlink(safePath);
  }

  return true;
}

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
  const mimeMap: Record<string, string> = {
    // Images
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
    tif: 'image/tiff',
    avif: 'image/avif',

    // Audio
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    flac: 'audio/flac',
    webm: 'audio/webm',
    opus: 'audio/opus',
    aiff: 'audio/aiff',
    aif: 'audio/aiff',

    // Video
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    m4v: 'video/mp4',
    ogv: 'video/ogg',

    // Documents & PDFs
    pdf: 'application/pdf',

    // Code & Text
    txt: 'text/plain; charset=utf-8',
    log: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    markdown: 'text/markdown; charset=utf-8',
    json: 'application/json; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    cjs: 'text/javascript; charset=utf-8',
    jsx: 'text/javascript; charset=utf-8',
    ts: 'text/typescript; charset=utf-8',
    tsx: 'text/typescript; charset=utf-8',
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    scss: 'text/x-scss; charset=utf-8',
    sass: 'text/x-sass; charset=utf-8',
    less: 'text/x-less; charset=utf-8',
    py: 'text/x-python; charset=utf-8',
    sh: 'text/x-shellscript; charset=utf-8',
    bash: 'text/x-shellscript; charset=utf-8',
    zsh: 'text/x-shellscript; charset=utf-8',
    xml: 'application/xml; charset=utf-8',
    yaml: 'text/yaml; charset=utf-8',
    yml: 'text/yaml; charset=utf-8',
    toml: 'text/plain; charset=utf-8',
    env: 'text/plain; charset=utf-8',
    sql: 'text/x-sql; charset=utf-8',
    rs: 'text/x-rust; charset=utf-8',
    go: 'text/x-go; charset=utf-8',
    c: 'text/x-c; charset=utf-8',
    cpp: 'text/x-c++; charset=utf-8',
    h: 'text/x-c; charset=utf-8',
    hpp: 'text/x-c++; charset=utf-8',
    cs: 'text/plain; charset=utf-8',
    java: 'text/x-java; charset=utf-8',
    kt: 'text/plain; charset=utf-8',
    swift: 'text/plain; charset=utf-8',
    rb: 'text/x-ruby; charset=utf-8',
    php: 'text/x-php; charset=utf-8',
    ini: 'text/plain; charset=utf-8',
    conf: 'text/plain; charset=utf-8',
    plist: 'application/xml; charset=utf-8',
    lock: 'text/plain; charset=utf-8',
    gitignore: 'text/plain; charset=utf-8',
    dockerfile: 'text/plain; charset=utf-8',

    // APK & Archive
    apk: 'application/vnd.android.package-archive',
    zip: 'application/zip',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    dmg: 'application/x-apple-diskimage',
    '7z': 'application/x-7z-compressed',
    rar: 'application/vnd.rar',
  };

  return mimeMap[ext] || 'application/octet-stream';
}

export async function readTextFilePreview(
  filePath: string,
  maxBytes = 512 * 1024
): Promise<FileTextPreview> {
  const safePath = resolveSafePath(filePath);

  if (!fsSync.existsSync(safePath)) {
    throw new Error(`File does not exist: ${safePath}`);
  }

  const stat = await fs.stat(safePath);
  if (stat.isDirectory()) {
    throw new Error(`Cannot preview directory as text: ${safePath}`);
  }

  const name = path.basename(safePath);
  const ext = path.extname(name).replace(/^\./, '').toLowerCase();

  const readSize = Math.min(stat.size, maxBytes);
  const handle = await fs.open(safePath, 'r');
  const buffer = Buffer.alloc(readSize);
  await handle.read(buffer, 0, readSize, 0);
  await handle.close();

  // Detect binary by scanning for null bytes in initial 4KB
  const checkLen = Math.min(buffer.length, 4096);
  let isBinary = false;
  for (let i = 0; i < checkLen; i++) {
    if (buffer[i] === 0) {
      isBinary = true;
      break;
    }
  }

  if (isBinary) {
    return {
      name,
      path: safePath,
      size: stat.size,
      mtime: stat.mtimeMs,
      extension: ext,
      isBinary: true,
      content: '',
      truncated: false,
      linesCount: 0,
    };
  }

  const content = buffer.toString('utf-8');
  const linesCount = content ? content.split('\n').length : 0;
  const truncated = stat.size > maxBytes;

  return {
    name,
    path: safePath,
    size: stat.size,
    mtime: stat.mtimeMs,
    extension: ext,
    isBinary: false,
    content,
    truncated,
    linesCount,
  };
}
