import * as vscode from 'vscode';
import { getHelperClient } from './endpoints';
import { NoteStore, Note } from '../store/noteStore';
import { TodoStore, TodoItem } from '../store/todoStore';

/* ─── Status Bar ─── */

let statusBarItem: vscode.StatusBarItem | null = null;

function getStatusBar(): vscode.StatusBarItem {
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    statusBarItem.tooltip = '助手服务状态';
    statusBarItem.command = 'personal-vscode-helper.syncNow';
    statusBarItem.show();
  }
  return statusBarItem;
}

export function updateStatusBar(online: boolean, syncing = false): void {
  const item = getStatusBar();
  if (syncing) {
    item.text = '$(sync~spin) 同步中...';
    return;
  }
  item.text = online
    ? '$(cloud) 服务在线'
    : '$(cloud-offline) 离线';
  item.backgroundColor = online ? undefined : new vscode.ThemeColor('statusBarItem.warningBackground');
}

/* ─── Type Converters ─── */

// Server note shape (snake_case ISO strings) ↔ local Note shape (camelCase timestamps)
function serverNoteToLocal(sn: any): Note {
  return {
    id: sn.id,
    title: sn.title,
    content: sn.content,
    createdAt: new Date(sn.created_at).getTime(),
    updatedAt: new Date(sn.updated_at).getTime(),
  };
}

function localNoteToServer(n: Note): any {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    created_at: new Date(n.createdAt).toISOString(),
    updated_at: new Date(n.updatedAt).toISOString(),
  };
}

// Server todo shape ↔ local TodoItem shape
function serverTodoToLocal(st: any): TodoItem {
  return {
    id: st.id,
    content: st.content,
    group: st.group,
    done: st.done,
    createdAt: new Date(st.created_at).getTime(),
    doneAt: st.done_at ? new Date(st.done_at).getTime() : null,
  };
}

function localTodoToServer(t: TodoItem): any {
  return {
    id: t.id,
    content: t.content,
    group: t.group,
    done: t.done,
    created_at: new Date(t.createdAt).toISOString(),
    done_at: t.doneAt ? new Date(t.doneAt).toISOString() : null,
  };
}

/* ─── Merge Logic ─── */

/**
 * Merge server notes into local store.
 * For conflicting IDs, the one with newer updatedAt wins.
 * Returns count of changes applied.
 */
function mergeNotes(serverNotes: any[], localStore: NoteStore): number {
  const localNotes = localStore.list();
  const localMap = new Map(localNotes.map(n => [n.id, n]));
  const merged = [...localNotes];
  let changes = 0;

  for (const sn of serverNotes) {
    const serverNote = serverNoteToLocal(sn);
    const localIdx = merged.findIndex(n => n.id === serverNote.id);

    if (localIdx === -1) {
      // New from server
      merged.push(serverNote);
      changes++;
    } else if (serverNote.updatedAt > merged[localIdx].updatedAt) {
      // Server has newer version
      merged[localIdx] = serverNote;
      changes++;
    }
    // Local wins if newer or same
  }

  if (changes > 0) {
    localStore.importAll(merged);
  }
  return changes;
}

/**
 * Merge server todos into local store.
 * Same strategy: newer wins (by doneAt or createdAt).
 */
function mergeTodos(serverTodos: any[], localStore: TodoStore): number {
  const localTodos = localStore.list();
  const localMap = new Map(localTodos.map(t => [t.id, t]));
  const merged = [...localTodos];
  let changes = 0;

  for (const st of serverTodos) {
    const serverTodo = serverTodoToLocal(st);
    const localIdx = merged.findIndex(t => t.id === serverTodo.id);

    if (localIdx === -1) {
      merged.push(serverTodo);
      changes++;
    } else {
      const serverTime = serverTodo.doneAt || serverTodo.createdAt;
      const localTime = merged[localIdx].doneAt || merged[localIdx].createdAt;
      if (serverTime > localTime) {
        merged[localIdx] = serverTodo;
        changes++;
      }
    }
  }

  if (changes > 0) {
    localStore.importAll(merged);
  }
  return changes;
}


/* ─── Sync Manager ─── */

export class SyncManager {
  private noteStore: NoteStore;
  private todoStore: TodoStore;
  private _online = false;
  private _syncing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.noteStore = NoteStore.getInstance();
    this.todoStore = TodoStore.getInstance();
  }

  get online(): boolean { return this._online; }

  /** 全量同步：拉取服务端数据 → 合并到本地 */
  async syncAll(): Promise<{ notes: number; todos: number }> {
    if (this._syncing) return { notes: 0, todos: 0 };
    this._syncing = true;
    updateStatusBar(this._online, true);

    let notesChanged = 0;
    let todosChanged = 0;

    try {
      const client = getHelperClient();
      const [serverNotes, serverTodos] = await Promise.all([
        client.get<any[]>('/api/notes').catch(() => null),
        client.get<any[]>('/api/todos').catch(() => null),
      ]);

      if (serverNotes) {
        notesChanged = mergeNotes(serverNotes, this.noteStore);
      }
      if (serverTodos) {
        todosChanged = mergeTodos(serverTodos, this.todoStore);
      }

      this._online = true;
      this._cancelRetry();
    } catch {
      this._online = false;
      this._scheduleRetry();
    }

    this._syncing = false;
    updateStatusBar(this._online);

    if (notesChanged > 0 || todosChanged > 0) {
      vscode.window.showInformationMessage(
        `同步完成: ${notesChanged} 条笔记, ${todosChanged} 条待办更新`,
      );
    }

    return { notes: notesChanged, todos: todosChanged };
  }

  /** 推送单条笔记变更到服务端（fire-and-forget） */
  async pushNote(note: Note, action: 'create' | 'update' | 'delete'): Promise<void> {
    if (!this._online) return;
    try {
      const client = getHelperClient();
      switch (action) {
        case 'create':
          await client.post('/api/notes', { title: note.title, content: note.content });
          break;
        case 'update':
          await client.put(`/api/notes/${note.id}`, { title: note.title, content: note.content });
          break;
        case 'delete':
          await client.delete(`/api/notes/${note.id}`);
          break;
      }
    } catch {
      // Silent fail — next full sync will catch up
    }
  }

  /** 推送单条待办变更到服务端（fire-and-forget） */
  async pushTodo(todo: TodoItem, action: 'create' | 'update' | 'delete'): Promise<void> {
    if (!this._online) return;
    try {
      const client = getHelperClient();
      switch (action) {
        case 'create':
          await client.post('/api/todos', { content: todo.content, group: todo.group });
          break;
        case 'update':
          await client.patch(`/api/todos/${todo.id}`, {
            done: todo.done,
            content: todo.content,
            group: todo.group,
          });
          break;
        case 'delete':
          await client.delete(`/api/todos/${todo.id}`);
          break;
      }
    } catch {
      // Silent fail
    }
  }

  /** 手动触发同步按钮 */
  triggerSync(): void {
    this.syncAll();
  }

  private _scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.syncAll();
    }, 60000); // 每分钟重试一次
  }

  private _cancelRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
