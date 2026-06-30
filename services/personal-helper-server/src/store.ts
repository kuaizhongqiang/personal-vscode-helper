import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/* ─── Encoding Fix ─── */

/**
 * Fix a single string that contains U+FFFD (replacement character) due to
 * Windows CLI encoding mismatch (CP936/GBK bytes incorrectly decoded as Latin-1).
 *
 * Strategy: treat the string as Latin-1 to recover original bytes, then re-decode as GBK.
 */
function fixEncoding(str: string): string {
  if (!str.includes('�')) return str;
  try {
    const buf = Buffer.from(str, 'latin1');
    const decoded = new TextDecoder('gbk').decode(buf);
    if (!decoded.includes('�')) return decoded;
  } catch { /* fall through */ }
  return str;
}

/**
 * Deep-walk an object/array and fix any strings containing U+FFFD.
 * Acts as a safety net for all write paths (CLI, API, etc.).
 */
export function normalizeEncoding<T>(obj: T): T {
  if (typeof obj === 'string') return fixEncoding(obj) as unknown as T;
  if (Array.isArray(obj)) return obj.map(normalizeEncoding) as unknown as T;
  if (obj && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj as Record<string, any>)) {
      result[key] = normalizeEncoding(value);
    }
    return result as T;
  }
  return obj;
}

/* ─── Data Types ─── */

export interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface TodoItem {
  id: string;
  content: string;
  group: string;
  done: boolean;
  created_at: string;
  done_at: string | null;
}

export interface StoreData {
  notes: Note[];
  todos: TodoItem[];
  groups: string[];
}

/* ─── Store ─── */

const DATA_DIR = process.env.HELPER_DATA_DIR || join(homedir(), '.helper');
const DATA_FILE = join(DATA_DIR, 'data.json');

const DEFAULT_DATA: StoreData = {
  notes: [],
  todos: [],
  groups: ['工作', '个人', '其他'],
};

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function load(): StoreData {
  ensureDir();
  if (!existsSync(DATA_FILE)) {
    writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
    return { ...DEFAULT_DATA, groups: [...DEFAULT_DATA.groups] };
  }
  const raw = readFileSync(DATA_FILE, 'utf-8');
  const data = normalizeEncoding(JSON.parse(raw)) as StoreData;
  if (!data.groups) data.groups = [...DEFAULT_DATA.groups];
  if (!data.notes) data.notes = [];
  if (!data.todos) data.todos = [];
  for (const g of DEFAULT_DATA.groups) {
    if (!data.groups.includes(g)) data.groups.push(g);
  }
  return data;
}

export function save(data: StoreData): void {
  ensureDir();
  // Apply encoding safety net before writing to disk
  const cleaned = normalizeEncoding(data);
  writeFileSync(DATA_FILE, JSON.stringify(cleaned, null, 2), 'utf-8');
}

/* ─── ID Generator ─── */

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
