import * as vscode from 'vscode';
import { TodoStore, TodoItem } from '../store/todoStore';

/* ─── Tree Item ─── */

class TodoTreeItem extends vscode.TreeItem {
  constructor(public readonly todo: TodoItem) {
    super(todo.content, vscode.TreeItemCollapsibleState.None);

    this.description = todo.group;

    // 完成状态图标 + 颜色
    if (todo.done) {
      this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
      this.tooltip = `✅ 已完成 | 分组: ${todo.group}`;
    } else {
      this.iconPath = new vscode.ThemeIcon('circle-outline');
      this.tooltip = `⏳ 未完成 | 分组: ${todo.group}`;
    }

    this.command = {
      command: 'personal-vscode-helper.todo.toggle',
      title: '切换完成状态',
      arguments: [todo.id],
    };
    this.contextValue = 'todo';
  }
}

/* ─── Data Provider ─── */

export class TodoTreeProvider implements vscode.TreeDataProvider<TodoTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TodoTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TodoTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(_element?: TodoTreeItem): Thenable<TodoTreeItem[]> {
    const todos = TodoStore.getInstance().list();
    return Promise.resolve(todos.map(t => new TodoTreeItem(t)));
  }
}
