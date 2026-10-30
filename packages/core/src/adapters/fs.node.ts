import { constants } from "node:fs";
import {
  access,
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FileStat, FsPort } from "../ports.js";

export class NodeFs implements FsPort {
  async readFile(path: string): Promise<string> {
    return readFile(path, "utf8");
  }

  async writeFile(path: string, content: string): Promise<void> {
    await writeFile(path, content, "utf8");
  }

  async appendFile(path: string, content: string): Promise<void> {
    await appendFile(path, content, "utf8");
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  async readdir(path: string): Promise<string[]> {
    return readdir(path);
  }

  async rm(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void> {
    await rm(path, { recursive: opts?.recursive ?? false, force: opts?.force ?? false });
  }

  async copyFile(from: string, to: string): Promise<void> {
    await copyFile(from, to);
  }

  async symlink(from: string, to: string): Promise<void> {
    await symlink(from, to, "junction");
  }

  async stat(path: string): Promise<FileStat> {
    const s = await stat(path);
    return { size: s.size, isFile: s.isFile(), isDirectory: s.isDirectory(), mtimeMs: s.mtimeMs };
  }

  async realpath(path: string): Promise<string> {
    return realpath(path);
  }

  async mkdtemp(prefix: string): Promise<string> {
    return mkdtemp(join(tmpdir(), prefix));
  }

  tmpdir(): string {
    return tmpdir();
  }
}