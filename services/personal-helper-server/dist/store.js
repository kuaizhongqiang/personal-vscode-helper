import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
/* ─── Store ─── */
const DATA_DIR = process.env.HELPER_DATA_DIR || join(homedir(), '.helper');
const DATA_FILE = join(DATA_DIR, 'data.json');
const DEFAULT_DATA = {
    notes: [],
    todos: [],
    groups: ['工作', '个人', '其他'],
};
function ensureDir() {
    if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
    }
}
export function load() {
    ensureDir();
    if (!existsSync(DATA_FILE)) {
        writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
        return { ...DEFAULT_DATA, groups: [...DEFAULT_DATA.groups] };
    }
    const raw = readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.groups)
        data.groups = [...DEFAULT_DATA.groups];
    if (!data.notes)
        data.notes = [];
    if (!data.todos)
        data.todos = [];
    for (const g of DEFAULT_DATA.groups) {
        if (!data.groups.includes(g))
            data.groups.push(g);
    }
    return data;
}
export function save(data) {
    ensureDir();
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
/* ─── ID Generator ─── */
export function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
