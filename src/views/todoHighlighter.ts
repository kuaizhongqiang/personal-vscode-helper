import * as vscode from 'vscode';

/* ─── M7-6: 编辑器 TODO 高亮 ─── */

interface MarkItem {
  file: string;
  line: number;
  type: string;
  text: string;
}

const TAG_COLORS: Record<string, vscode.DecorationRenderOptions> = {
  TODO: {
    backgroundColor: 'rgba(255, 200, 0, 0.15)',
    border: '1px solid rgba(255, 200, 0, 0.3)',
    borderRadius: '3px',
    after: {
      contentText: ' ⚠ TODO',
      color: 'rgba(255, 200, 0, 0.7)',
      fontWeight: 'bold',
    },
  },
  FIXME: {
    backgroundColor: 'rgba(255, 0, 0, 0.15)',
    border: '1px solid rgba(255, 0, 0, 0.3)',
    borderRadius: '3px',
    after: {
      contentText: ' 🔴 FIXME',
      color: 'rgba(255, 0, 0, 0.7)',
      fontWeight: 'bold',
    },
  },
  HACK: {
    backgroundColor: 'rgba(170, 0, 255, 0.15)',
    border: '1px solid rgba(170, 0, 255, 0.3)',
    borderRadius: '3px',
    after: {
      contentText: ' 🛠 HACK',
      color: 'rgba(170, 0, 255, 0.7)',
      fontWeight: 'bold',
    },
  },
  NOTE: {
    backgroundColor: 'rgba(0, 120, 255, 0.12)',
    border: '1px solid rgba(0, 120, 255, 0.3)',
    borderRadius: '3px',
    after: {
      contentText: ' 📝 NOTE',
      color: 'rgba(0, 120, 255, 0.7)',
      fontWeight: 'bold',
    },
  },
};

const TAG_PATTERN = /\b(TODO|FIXME|HACK|NOTE):?\s*(.*)$/gm;

let decorationTypes: Record<string, vscode.TextEditorDecorationType> = {};
let highlightDisposables: vscode.Disposable[] = [];
let debounceScan: ReturnType<typeof setTimeout> | null = null;

/* ─── TreeDataProvider for sidebar ─── */

class MarkTreeItem extends vscode.TreeItem {
  constructor(
    public readonly mark: MarkItem,
  ) {
    super(`[${mark.type}] ${mark.text}`, vscode.TreeItemCollapsibleState.None);
    this.description = `${mark.file}:${mark.line}`;
    this.tooltip = `${mark.file}:${mark.line} — ${mark.text}`;
    this.command = {
      command: 'vscode.open',
      title: '跳转到文件',
      arguments: [
        vscode.Uri.file(mark.file),
        { selection: new vscode.Range(mark.line - 1, 0, mark.line - 1, 0) },
      ],
    };
    this.iconPath = new vscode.ThemeIcon(
      mark.type === 'FIXME' ? 'error' :
      mark.type === 'TODO' ? 'warning' :
      mark.type === 'HACK' ? 'debug' : 'info',
    );
    this.contextValue = 'markItem';
  }
}

class MarkDataProvider implements vscode.TreeDataProvider<MarkTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MarkTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _marks: MarkItem[] = [];

  updateMarks(marks: MarkItem[]): void {
    this._marks = marks;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: MarkTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): MarkTreeItem[] {
    return this._marks.map(m => new MarkTreeItem(m));
  }
}

let markProvider: MarkDataProvider | null = null;

export function getMarkProvider(): MarkDataProvider {
  if (!markProvider) {
    markProvider = new MarkDataProvider();
  }
  return markProvider;
}

/* ─── Scanner ─── */

function getMarksFromDoc(doc: vscode.TextDocument): MarkItem[] {
  const marks: MarkItem[] = [];
  const text = doc.getText();
  let match: RegExpExecArray | null;

  TAG_PATTERN.lastIndex = 0;
  while ((match = TAG_PATTERN.exec(text)) !== null) {
    const lineNum = text.slice(0, match.index).split('\n').length;
    marks.push({
      file: doc.uri.fsPath,
      line: lineNum,
      type: match[1],
      text: match[2] || '(无说明)',
    });
  }

  return marks;
}

function scanActiveEditor(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const doc = editor.document;
  const marks = getMarksFromDoc(doc);

  // Apply decorations
  for (const [tag, deco] of Object.entries(decorationTypes)) {
    const lines = marks.filter(m => m.type === tag).map(m => m.line - 1);
    const ranges = lines.map(l => {
      const line = doc.lineAt(l);
      const idx = line.text.indexOf(tag);
      return idx >= 0
        ? new vscode.Range(l, idx, l, line.text.length)
        : new vscode.Range(l, 0, l, 0);
    });
    editor.setDecorations(deco, ranges);
  }

  // Update sidebar provider
  if (markProvider) {
    // Aggregate from all open docs
    const allMarks: MarkItem[] = [];
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.uri.scheme === 'file') {
        allMarks.push(...getMarksFromDoc(doc));
      }
    }
    markProvider.updateMarks(allMarks);
  }
}

/* ─── Init ─── */

export function initHighlighter(context: vscode.ExtensionContext): void {
  // Create decoration types
  for (const [tag, options] of Object.entries(TAG_COLORS)) {
    decorationTypes[tag] = vscode.window.createTextEditorDecorationType(options);
    context.subscriptions.push(decorationTypes[tag]);
  }

  // Register mark provider
  const provider = getMarkProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('todoMarkerView', provider),
  );

  // Scan on active editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      scanActiveEditor();
    }),
  );

  // Scan on document change (debounced)
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.scheme !== 'file') return;
      if (debounceScan) clearTimeout(debounceScan);
      debounceScan = setTimeout(scanActiveEditor, 500);
    }),
  );

  // Scan on open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(() => {
      scanActiveEditor();
    }),
  );

  // Initial scan
  setTimeout(scanActiveEditor, 1000);
}
