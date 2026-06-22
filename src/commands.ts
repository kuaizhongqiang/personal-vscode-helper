import * as vscode from 'vscode';
import { ConfigPanel } from './panels/configPanel';
import { NotepadPanel } from './panels/notepadPanel';
import { TodoPanel } from './panels/todoPanel';
import { StockDetailPanel } from './views/stockDetailPanel';
import { PoolStock } from './views/stockTree';
import { TodoStore } from './store/todoStore';
import { registerNoteCommands } from './cli/noteCli';
import { registerTodoCommands } from './cli/todoCli';
import { SyncManager } from './server/sync';

let stockPollerRef: { refresh: () => void } | null = null;
let syncManagerRef: SyncManager | null = null;

/** Set stock poller reference (called from extension.ts after init) */
export function setStockPoller(poller: { refresh: () => void }): void {
  stockPollerRef = poller;
}

/** Set sync manager reference (called from extension.ts after init) */
export function setSyncManager(sm: SyncManager): void {
  syncManagerRef = sm;
}

/**
 * 集中注册所有命令
 */
export function registerCommands(context: vscode.ExtensionContext): void {
  // ── Panel 命令 ──
  context.subscriptions.push(
    vscode.commands.registerCommand('personal-vscode-helper.openConfig', () => {
      ConfigPanel.createOrShow(context);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('personal-vscode-helper.openNotepad', (noteId?: string) => {
      NotepadPanel.createOrShow(context, noteId);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('personal-vscode-helper.openTodo', () => {
      TodoPanel.createOrShow(context);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('personal-vscode-helper.openStockDetail', (stock: PoolStock) => {
      StockDetailPanel.createOrShow(stock);
    }),
  );

  // ── Stock 刷新 ──
  context.subscriptions.push(
    vscode.commands.registerCommand('vcs-manager.stock.refresh', () => {
      stockPollerRef?.refresh();
    }),
  );

  // ── Todo 切换命令（供侧边栏使用） ──
  context.subscriptions.push(
    vscode.commands.registerCommand('personal-vscode-helper.todo.toggle', (id: string) => {
      const store = TodoStore.getInstance();
      const todo = store.toggle(id);
      vscode.window.showInformationMessage(
        todo.done ? '☑ 已标记完成' : '☐ 已取消完成',
      );
      return todo;
    }),
  );

  // ── 同步命令 ──
  context.subscriptions.push(
    vscode.commands.registerCommand('personal-vscode-helper.syncNow', () => {
      syncManagerRef?.triggerSync();
    }),
  );

  // ── CLI 命令 ──
  registerNoteCommands(context);
  registerTodoCommands(context);
}
