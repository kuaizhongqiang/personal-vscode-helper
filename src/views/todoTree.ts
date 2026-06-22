import * as vscode from 'vscode';
import { TodoStore, TodoItem } from '../store/todoStore';

/* ─── Tree Item ─── */

class TodoTreeItem extends vscode.TreeItem {
  constructor(public readonly todo: TodoItem) {
    const prefix = todo.done ? '☑ ' : '☐ ';
    super(`${prefix}${todo.content}`, vscode.TreeItemCollapsibleState.None);
    this.description = todo.group;
    this.tooltip = `${todo.done ? '已完成' : '未完成'} | 分组: ${todo.group}`;
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
