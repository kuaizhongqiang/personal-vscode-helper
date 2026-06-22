import * as vscode from 'vscode';

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

const NOTES_KEY = 'personal-helper.notes';

let _instance: NoteStore | null = null;

export class NoteStore {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  static getInstance(context?: vscode.ExtensionContext): NoteStore {
    if (!_instance) {
      if (!context) throw new Error('NoteStore not initialized — call init() first');
      _instance = new NoteStore(context);
    }
    return _instance;
  }

  list(): Note[] {
    return this.load();
  }

  get(id: string): Note | undefined {
    return this.load().find(n => n.id === id);
  }

  create(title: string, content: string): Note {
    const notes = this.load();
    const now = Date.now();
    const note: Note = {
      id: this._genId(),
      title,
      content,
      createdAt: now,
      updatedAt: now,
    };
    notes.unshift(note);
    this.save(notes);
    return note;
  }

  update(id: string, title: string, content: string): Note {
    const notes = this.load();
    const idx = notes.findIndex(n => n.id === id);
    if (idx === -1) throw new Error(`笔记不存在: ${id}`);
    notes[idx].title = title;
    notes[idx].content = content;
    notes[idx].updatedAt = Date.now();
    this.save(notes);
    return notes[idx];
  }

  delete(id: string): void {
    const notes = this.load();
    const idx = notes.findIndex(n => n.id === id);
    if (idx === -1) throw new Error(`笔记不存在: ${id}`);
    notes.splice(idx, 1);
    this.save(notes);
  }

  search(keyword: string): Note[] {
    const kw = keyword.toLowerCase();
    return this.load().filter(
      n => n.title.toLowerCase().includes(kw) || n.content.toLowerCase().includes(kw),
    );
  }

  /** 批量导入笔记（用于服务端同步合并） */
  importAll(notes: Note[]): void {
    this.save(notes);
  }

  /* ─── private ─── */

  private load(): Note[] {
    return this.context.globalState.get<Note[]>(NOTES_KEY, []);
  }

  private save(notes: Note[]): void {
    this.context.globalState.update(NOTES_KEY, notes);
  }

  private _genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
}
