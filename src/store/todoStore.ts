import * as vscode from 'vscode';

export interface TodoItem {
  id: string;
  content: string;
  group: string;
  done: boolean;
  createdAt: number;
  doneAt: number | null;
}

const TODOS_KEY = 'personal-helper.todos';
const GROUPS_KEY = 'personal-helper.todoGroups';

const DEFAULT_GROUPS = ['工作', '个人', '其他'];

let _instance: TodoStore | null = null;

export class TodoStore {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  static getInstance(context?: vscode.ExtensionContext): TodoStore {
    if (!_instance) {
      if (!context) throw new Error('TodoStore not initialized');
      _instance = new TodoStore(context);
    }
    return _instance;
  }

  list(group?: string): TodoItem[] {
    let todos = this.load();
    if (group && group !== '全部') {
      todos = todos.filter(t => t.group === group);
    }
    return todos;
  }

  create(content: string, group: string): TodoItem {
    const todos = this.load();
    const now = Date.now();
    const item: TodoItem = {
      id: this._genId(),
      content,
      group,
      done: false,
      createdAt: now,
      doneAt: null,
    };
    todos.unshift(item);
    this.save(todos);
    // Auto-register group
    const groups = this._loadGroups();
    if (!groups.includes(group)) {
      groups.push(group);
      this._saveGroups(groups);
    }
    return item;
  }

  check(id: string): TodoItem {
    const todos = this.load();
    const item = todos.find(t => t.id === id);
    if (!item) throw new Error(`待办不存在: ${id}`);
    item.done = true;
    item.doneAt = Date.now();
    this.save(todos);
    return item;
  }

  uncheck(id: string): TodoItem {
    const todos = this.load();
    const item = todos.find(t => t.id === id);
    if (!item) throw new Error(`待办不存在: ${id}`);
    item.done = false;
    item.doneAt = null;
    this.save(todos);
    return item;
  }

  updateContent(id: string, content: string): TodoItem {
    const todos = this.load();
    const item = todos.find(t => t.id === id);
    if (!item) throw new Error(`待办不存在: ${id}`);
    item.content = content;
    this.save(todos);
    return item;
  }

  delete(id: string): void {
    const todos = this.load();
    const idx = todos.findIndex(t => t.id === id);
    if (idx === -1) throw new Error(`待办不存在: ${id}`);
    todos.splice(idx, 1);
    this.save(todos);
  }

  clearCompleted(): number {
    const todos = this.load();
    const before = todos.length;
    const remaining = todos.filter(t => !t.done);
    this.save(remaining);
    return before - remaining.length;
  }

  listGroups(): string[] {
    return this._loadGroups();
  }

  createGroup(name: string): void {
    const groups = this._loadGroups();
    if (!groups.includes(name)) {
      groups.push(name);
      this._saveGroups(groups);
    }
  }

  /** Toggle done/undone — returns updated item */
  toggle(id: string): TodoItem {
    const todos = this.load();
    const item = todos.find(t => t.id === id);
    if (!item) throw new Error(`待办不存在: ${id}`);
    item.done = !item.done;
    item.doneAt = item.done ? Date.now() : null;
    this.save(todos);
    return item;
  }

  /** 批量导入待办（用于服务端同步合并） */
  importAll(todos: TodoItem[]): void {
    this.save(todos);
  }

  /* ─── private ─── */

  private load(): TodoItem[] {
    return this.context.globalState.get<TodoItem[]>(TODOS_KEY, []);
  }

  private save(todos: TodoItem[]): void {
    this.context.globalState.update(TODOS_KEY, todos);
  }

  private _loadGroups(): string[] {
    return this.context.globalState.get<string[]>(GROUPS_KEY, [...DEFAULT_GROUPS]);
  }

  private _saveGroups(groups: string[]): void {
    this.context.globalState.update(GROUPS_KEY, groups);
  }

  private _genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
}
