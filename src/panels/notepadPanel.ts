import * as vscode from 'vscode';
import { NoteStore } from '../store/noteStore';

export class NotepadPanel {
  public static currentPanel: NotepadPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, _context: vscode.ExtensionContext) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getWebviewContent();
    this._panel.webview.onDidReceiveMessage(
      msg => this._handleMessage(msg),
      null,
      this._disposables,
    );
    this._postNotesList();
  }

  static createOrShow(context: vscode.ExtensionContext, noteId?: string): void {
    if (NotepadPanel.currentPanel) {
      NotepadPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      if (noteId) {
        NotepadPanel.currentPanel._postNoteById(noteId);
      } else {
        NotepadPanel.currentPanel._postNotesList();
      }
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'notepad',
      '📒 我的笔记',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    NotepadPanel.currentPanel = new NotepadPanel(panel, context);
    // If noteId provided, wait for panel initialization then open
    if (noteId) {
      setTimeout(() => NotepadPanel.currentPanel?._postNoteById(noteId), 100);
    }
  }

  private dispose(): void {
    NotepadPanel.currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
  }

  private _postNotesList(keyword?: string): void {
    const store = NoteStore.getInstance();
    const notes = keyword ? store.search(keyword) : store.list();
    this._panel.webview.postMessage({ type: 'notesList', data: notes });
  }

  private _postNote(note: any): void {
    this._panel.webview.postMessage({ type: 'openNote', data: note });
  }

  private _postNoteById(id: string): void {
    const store = NoteStore.getInstance();
    const note = store.get(id);
    if (note) {
      this._postNote(note);
    }
  }

  private async _handleMessage(msg: any): Promise<void> {
    const store = NoteStore.getInstance();
    switch (msg.type) {
      case 'getNotes':
        this._postNotesList(msg.keyword);
        break;
      case 'getNote':
        this._postNote(store.get(msg.id));
        break;
      case 'createNote': {
        const created = store.create(msg.title, msg.content);
        this._panel.webview.postMessage({ type: 'noteCreated', data: created });
        this._postNotesList();
        break;
      }
      case 'updateNote':
        store.update(msg.id, msg.title, msg.content);
        this._postNotesList();
        break;
      case 'deleteNote': {
        const confirm = await vscode.window.showWarningMessage('确定删除这条笔记吗？', { modal: true }, '删除');
        if (confirm) {
          try {
            store.delete(msg.id);
          } catch (e: any) {
            console.error('Delete failed:', e.message);
          }
          this._postNotesList();
        }
        break;
      }
      case 'searchNotes':
        this._postNotesList(msg.keyword);
        break;
    }
  }

  private _getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>我的笔记</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); font-size: 13px; }
  .header { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--vscode-widget-border); gap: 8px; }
  .header h1 { font-size: 16px; flex: 1; }
  .btn { padding: 4px 12px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 4px; cursor: pointer; font-size: 13px; }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary { background: transparent; border-color: var(--vscode-widget-border); color: var(--vscode-editor-foreground); }
  .btn-secondary:hover { background: var(--vscode-list-hoverBackground); }
  .btn-icon { background: none; border: none; color: var(--vscode-editor-foreground); cursor: pointer; padding: 4px; font-size: 16px; }
  .btn-icon:hover { opacity: 0.7; }
  .search-box { margin: 8px 16px; padding: 6px 8px; width: calc(100% - 32px); border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-size: 13px; }
  .note-item { padding: 10px 16px; cursor: pointer; border-bottom: 1px solid var(--vscode-widget-border); }
  .note-item:hover { background: var(--vscode-list-hoverBackground); }
  .note-title { font-weight: 600; margin-bottom: 2px; display: block; }
  .note-date { font-size: 11px; color: var(--vscode-descriptionForeground); display: block; }
  #editView { display: none; }
  #listView { display: block; }
  .edit-header { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--vscode-widget-border); gap: 8px; }
  .edit-header h2 { font-size: 14px; flex: 1; }
  .edit-body { padding: 16px; }
  .edit-body input[type="text"] { width: 100%; padding: 8px; margin-bottom: 12px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-size: 14px; font-weight: 600; }
  .edit-body textarea { width: 100%; min-height: 300px; padding: 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-size: 13px; resize: vertical; font-family: inherit; line-height: 1.5; }
  .edit-meta { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 8px; }
  .save-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; white-space: nowrap; }
  .save-btn:hover { background: var(--vscode-button-hoverBackground); }
  .save-btn.saved { background: var(--vscode-inputValidation-infoBackground); }
  .empty-state { text-align: center; padding: 40px 16px; color: var(--vscode-descriptionForeground); }
  .empty-state p { margin-bottom: 12px; }
</style>
</head>
<body>

<!-- ===== 列表视图 ===== -->
<div id="listView">
  <div class="header">
    <h1>📒 我的笔记</h1>
    <button class="btn" id="newBtn">+ 新建</button>
  </div>
  <input class="search-box" id="searchInput" type="text" placeholder="🔍 搜索笔记..." />
  <div id="notesContainer"></div>
</div>

<!-- ===== 编辑视图 ===== -->
<div id="editView">
  <div class="edit-header">
    <button class="btn-icon" id="backBtn">←</button>
    <h2 id="editTitle">编辑笔记</h2>
    <button class="save-btn" id="saveBtn">保存</button>
    <button class="btn-icon" id="deleteBtn" title="删除">🗑</button>
  </div>
  <div class="edit-body">
    <input type="text" id="noteTitleInput" placeholder="笔记标题" />
    <textarea id="noteContentInput" placeholder="开始写笔记..."></textarea>
    <div class="edit-meta" id="noteMeta"></div>
  </div>
</div>

<script>
(function() {
  const vscode = acquireVsCodeApi();
  let currentNoteId = null;
  let debounceSave = null;
  let debounceSearch = null;

  const $ = id => document.getElementById(id);
  const listView = $('listView');
  const editView = $('editView');
  const notesContainer = $('notesContainer');
  const searchInput = $('searchInput');
  const noteTitleInput = $('noteTitleInput');
  const noteContentInput = $('noteContentInput');
  const noteMeta = $('noteMeta');
  const editTitleLabel = $('editTitle');

  /* ─── 切换视图 ─── */
  function showList() {
    listView.style.display = 'block';
    editView.style.display = 'none';
    currentNoteId = null;
    vscode.postMessage({ type: 'getNotes' });
  }

  function showEdit(note) {
    listView.style.display = 'none';
    editView.style.display = 'block';
    currentNoteId = note.id;
    noteTitleInput.value = note.title;
    noteContentInput.value = note.content;
    editTitleLabel.textContent = note.id ? '编辑笔记' : '新建笔记';
    noteMeta.textContent = note.updatedAt
      ? '最后修改：' + new Date(note.updatedAt).toLocaleString()
      : '';
  }

  /* ─── 渲染列表 ─── */
  function renderNotes(notes) {
    if (!notes || notes.length === 0) {
      notesContainer.innerHTML = '<div class="empty-state"><p>暂无笔记</p><button class="btn" id="emptyNewBtn">+ 创建第一条笔记</button></div>';
      const btn = document.getElementById('emptyNewBtn');
      if (btn) btn.addEventListener('click', () => {
        showEdit({ id: null, title: '', content: '', updatedAt: null });
      });
      return;
    }
    notesContainer.innerHTML = notes.map(n =>
      '<div class="note-item" data-id="' + n.id + '">' +
        '<div class="note-title">' + escapeHtml(n.title) + '</div>' +
        '<div class="note-date">' + new Date(n.updatedAt).toLocaleString() + '</div>' +
      '</div>'
    ).join('');
    notesContainer.querySelectorAll('.note-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        vscode.postMessage({ type: 'getNote', id: id });
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /* ─── 消息通道 ─── */
  window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.type) {
      case 'notesList':
        renderNotes(msg.data);
        break;
      case 'openNote':
        showEdit(msg.data);
        break;
      case 'noteCreated':
        currentNoteId = msg.data.id;
        break;
        showEdit(msg.data);
        break;
    }
  });

  /* ─── 事件绑定 ─── */

  // 新建
  $('newBtn').addEventListener('click', () => {
    showEdit({ id: null, title: '', content: '', updatedAt: null });
  });

  // 返回列表
  $('backBtn').addEventListener('click', showList);


  // 删除
  $('deleteBtn').addEventListener('click', () => {
    if (!currentNoteId) return;
    vscode.postMessage({ type: 'deleteNote', id: currentNoteId });
  });

  // 搜索（debounce）
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceSearch);
    debounceSearch = setTimeout(() => {
      vscode.postMessage({ type: 'searchNotes', keyword: searchInput.value });
    }, 300);
  });

  // 自动保存（debounce 2s）
  function autoSave() {
    if (!currentNoteId) {
      // 新建模式
      const title = noteTitleInput.value.trim();
      const content = noteContentInput.value.trim();
      if (!title || !content) return;
      vscode.postMessage({ type: 'createNote', title, content });
      currentNoteId = '__saving__';
      return;
    }
    if (currentNoteId === '__saving__') return;
    clearTimeout(debounceSave);
    debounceSave = setTimeout(() => {
      const title = noteTitleInput.value.trim();
      const content = noteContentInput.value.trim();
      if (!title && !content) return;
      vscode.postMessage({ type: 'updateNote', id: currentNoteId, title, content });
    }, 2000);
  }

  noteTitleInput.addEventListener('input', autoSave);
  noteContentInput.addEventListener('input', autoSave);
  /* --- save button --- */
  $('saveBtn').addEventListener('click', () => {
    if (!currentNoteId) return;
    if (currentNoteId === '__saving__') return;
    clearTimeout(debounceSave);
    const title = noteTitleInput.value.trim();
    const content = noteContentInput.value.trim();
    if (!title && !content) return;
    vscode.postMessage({ type: 'updateNote', id: currentNoteId, title, content });
    const btn = $('saveBtn');
    btn.textContent = '✓ 已保存';
    btn.classList.add('saved');
    setTimeout(() => { btn.textContent = '保存'; btn.classList.remove('saved'); }, 2000);
  });
})();
</script>
</body>
</html>`;
  }
}
