import * as vscode from 'vscode';
import { NoteStore, Note } from '../store/noteStore';

/* ─── Tree Item ─── */

class NoteTreeItem extends vscode.TreeItem {
  constructor(public readonly note: Note) {
    super(note.title || '(无标题)', vscode.TreeItemCollapsibleState.None);
    this.description = new Date(note.updatedAt).toLocaleString();
    this.tooltip = `${note.title || '(无标题)'}\n${new Date(note.updatedAt).toLocaleString()}`;
    this.command = {
      command: 'personal-vscode-helper.openNotepad',
      title: '打开记事本',
      arguments: [note.id],
    };
    this.contextValue = 'note';
  }
}

/* ─── Data Provider ─── */

export class NoteTreeProvider implements vscode.TreeDataProvider<NoteTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<NoteTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor() {
    // 笔记数据变更时自动刷新侧边栏
    NoteStore.getInstance().onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: NoteTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(_element?: NoteTreeItem): Thenable<NoteTreeItem[]> {
    const notes = NoteStore.getInstance().list();
    return Promise.resolve(notes.map(n => new NoteTreeItem(n)));
  }
}
