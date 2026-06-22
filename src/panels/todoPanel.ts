import * as vscode from 'vscode';
import { TodoStore } from '../store/todoStore';

export class TodoPanel {
  public static currentPanel: TodoPanel | undefined;

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
    this._postTodos();
  }

  static createOrShow(context: vscode.ExtensionContext): void {
    if (TodoPanel.currentPanel) {
      TodoPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      TodoPanel.currentPanel._postTodos();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'todo',
      '✅ Todo 列表',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    TodoPanel.currentPanel = new TodoPanel(panel, context);
  }

  private dispose(): void {
    TodoPanel.currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
  }

  private _postTodos(activeGroup?: string): void {
    const store = TodoStore.getInstance();
    const todos = store.list(activeGroup);
    const groups = store.listGroups();
    this._panel.webview.postMessage({
      type: 'todosData',
      data: { todos, groups, activeGroup: activeGroup || '全部' },
    });
  }

  private async _handleMessage(msg: any): Promise<void> {
    const store = TodoStore.getInstance();
    switch (msg.type) {
      case 'getTodos':
        this._postTodos(msg.group);
        break;
      case 'addTodo':
        store.create(msg.content, msg.group);
        this._postTodos(msg.activeGroup);
        break;
      case 'toggleTodo':
        store.toggle(msg.id);
        this._postTodos(msg.activeGroup);
        break;
      case 'updateTodo':
        store.updateContent(msg.id, msg.content);
        this._postTodos(msg.activeGroup);
        break;
      case 'deleteTodo':
        store.delete(msg.id);
        this._postTodos(msg.activeGroup);
        break;
      case 'clearCompleted':
        store.clearCompleted();
        this._postTodos(msg.activeGroup);
        break;
      case 'switchGroup':
        this._postTodos(msg.group);
        break;
    }
  }

  private _getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Todo 列表</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); font-size: 13px; }
  .header { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--vscode-widget-border); gap: 8px; }
  .header h1 { font-size: 16px; flex: 1; }
  .header select { padding: 4px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-size: 13px; }
  .btn { padding: 4px 12px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 4px; cursor: pointer; font-size: 13px; white-space: nowrap; }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn-small { padding: 2px 8px; font-size: 12px; background: transparent; border-color: var(--vscode-widget-border); color: var(--vscode-editor-foreground); }
  .btn-small:hover { background: var(--vscode-list-hoverBackground); }
  .btn-icon { background: none; border: none; color: var(--vscode-editor-foreground); cursor: pointer; padding: 2px 6px; font-size: 14px; opacity: 0.5; }
  .btn-icon:hover { opacity: 1; }
  .add-bar { display: flex; padding: 8px 16px; gap: 6px; border-bottom: 1px solid var(--vscode-widget-border); }
  .add-bar input { flex: 1; padding: 6px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-size: 13px; }
  .add-bar select { padding: 6px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-size: 13px; }
  .group-header { padding: 8px 16px 4px; font-weight: 600; font-size: 12px; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.5px; }
  .todo-item { display: flex; align-items: center; padding: 6px 16px; gap: 8px; border-bottom: 1px solid var(--vscode-widget-border); }
  .todo-item:hover { background: var(--vscode-list-hoverBackground); }
  .todo-item.done .todo-content { text-decoration: line-through; opacity: 0.5; }
  .todo-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: var(--vscode-button-background); flex-shrink: 0; }
  .todo-content { flex: 1; padding: 2px 0; cursor: text; }
  .todo-content[contenteditable="true"] { outline: none; background: var(--vscode-input-background); padding: 2px 4px; border-radius: 2px; }
  .footer { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; color: var(--vscode-descriptionForeground); font-size: 12px; }
  .empty-state { text-align: center; padding: 40px 16px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<div class="header">
  <h1>✅ Todo 列表</h1>
  <select id="groupFilter">
    <option value="全部">全部</option>
  </select>
</div>

<div class="add-bar">
  <input id="newTodoInput" type="text" placeholder="添加待办..." />
  <select id="newTodoGroup">
    <option value="工作">工作</option>
    <option value="个人">个人</option>
    <option value="其他">其他</option>
  </select>
  <button class="btn" id="addBtn">添加</button>
</div>

<div id="todoContainer"></div>

<div class="footer">
  <span id="todoCount"></span>
  <button class="btn-small" id="clearBtn">✕ 清空已完成</button>
</div>

<script>
(function() {
  const vscode = acquireVsCodeApi();
  let activeGroup = '全部';
  let editingId = null;

  const $ = id => document.getElementById(id);
  const todoContainer = $('todoContainer');
  const groupFilter = $('groupFilter');
  const newTodoInput = $('newTodoInput');
  const newTodoGroup = $('newTodoGroup');
  const todoCount = $('todoCount');

  /* ─── 渲染 ─── */
  function render(data) {
    if (!data) return;
    const { todos, groups, activeGroup: ag } = data;
    activeGroup = ag || '全部';

    // Update filter dropdown
    const currentVal = groupFilter.value;
    groupFilter.innerHTML = '<option value="全部">全部</option>' +
      groups.map(g => '<option value="' + g + '">' + g + '</option>').join('');
    groupFilter.value = currentVal === '全部' || groups.includes(currentVal) ? currentVal : '全部';

    // Update new-todo group dropdown
    const curGroup = newTodoGroup.value;
    newTodoGroup.innerHTML = groups.map(g => '<option value="' + g + '">' + g + '</option>').join('');
    newTodoGroup.value = groups.includes(curGroup) ? curGroup : groups[0];

    // Group todos
    const grouped = {};
    for (const t of todos) {
      if (!grouped[t.group]) grouped[t.group] = [];
      grouped[t.group].push(t);
    }

    // Render
    const groupNames = Object.keys(grouped).sort();
    if (groupNames.length === 0) {
      todoContainer.innerHTML = '<div class="empty-state">暂无待办，在上方添加吧 ✨</div>';
      todoCount.textContent = '共 0 项';
      return;
    }

    let html = '';
    for (const g of groupNames) {
      html += '<div class="group-header">── ' + g + ' ──</div>';
      for (const t of grouped[g]) {
        html +=
          '<div class="todo-item' + (t.done ? ' done' : '') + '" data-id="' + t.id + '">' +
            '<input type="checkbox" class="todo-checkbox"' + (t.done ? ' checked' : '') + ' />' +
            '<span class="todo-content" data-id="' + t.id + '">' + escapeHtml(t.content) + '</span>' +
            '<button class="btn-icon delete-btn" data-id="' + t.id + '" title="删除">✕</button><button class="btn-icon save-todo-btn" data-id="' + t.id + '" title="保存" style="display:none">✓</button>' +
          '</div>';
      }
    }
    todoContainer.innerHTML = html;
    todoCount.textContent = '共 ' + todos.length + ' 项';

    // Bind events
    todoContainer.querySelectorAll('.todo-checkbox').forEach(cb => {
      cb.addEventListener('change', function() {
        const id = this.closest('.todo-item').dataset.id;
        vscode.postMessage({ type: 'toggleTodo', id, activeGroup });
      });
    });

    todoContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = this.dataset.id;
        vscode.postMessage({ type: 'deleteTodo', id, activeGroup });
    /* --- save button for inline edit --- */
    todoContainer.querySelectorAll('.save-todo-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const contentSpan = this.parentElement.querySelector('.todo-content');
        if (contentSpan && contentSpan.getAttribute('contenteditable') === 'true') {
          contentSpan.blur();
        }
      });
    });

    // Inline edit: double-click to edit
    todoContainer.querySelectorAll('.todo-content').forEach(span => {
      span.addEventListener('dblclick', function() {
        if (this.getAttribute('contenteditable') === 'true') return;
        this.setAttribute('contenteditable', 'true');
        this.focus();
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(this);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        // Show save button
        const saveBtn = this.parentElement.querySelector('.save-todo-btn');
        if (saveBtn) saveBtn.style.display = 'inline';
      });
      span.addEventListener('blur', function() {
        if (this.getAttribute('contenteditable') !== 'true') return;
        this.removeAttribute('contenteditable');
        // Hide save button
        const saveBtn2 = this.parentElement.querySelector('.save-todo-btn');
        if (saveBtn2) saveBtn2.style.display = 'none';
        const id = this.dataset.id;
        const content = this.textContent.trim();
        if (content) {
          vscode.postMessage({ type: 'updateTodo', id, content, activeGroup });
        }
      });
      span.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.blur();
        }
        if (e.key === 'Escape') {
          // Restore original text
          this.textContent = this.dataset.origText || this.textContent;
          this.blur();
        }
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /* ─── 消息 ─── */
  window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type === 'todosData') {
      render(msg.data);
    }
  });

  /* ─── 事件 ─── */

  // 分组筛选
  groupFilter.addEventListener('change', () => {
    vscode.postMessage({ type: 'switchGroup', group: groupFilter.value });
  });

  // 添加
  function addTodo() {
    const content = newTodoInput.value.trim();
    if (!content) return;
    const group = newTodoGroup.value;
    vscode.postMessage({ type: 'addTodo', content, group, activeGroup });
    newTodoInput.value = '';
    newTodoInput.focus();
  }
  $('addBtn').addEventListener('click', addTodo);
  newTodoInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') addTodo();
  });

  // 清空已完成
  $('clearBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'clearCompleted', activeGroup });
  });
})();
</script>
</body>
</html>`;
  }
}
