import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FileItem } from '../shared/types.js';

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
