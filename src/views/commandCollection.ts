import * as vscode from 'vscode';

/* ─── M7-5: 终端命令收藏 ─── */

interface SavedCommand {
  id: string;
  label: string;
  command: string;
  cwd: string;
  tag: string;
}

const KEY = 'personal-helper.savedCommands';

const DEFAULTS: SavedCommand[] = [
  { id: 'builtin-install', label: '安装依赖', command: 'npm install', cwd: '${workspaceFolder}', tag: 'npm' },
  { id: 'builtin-dev', label: '启动开发', command: 'npm run dev', cwd: '${workspaceFolder}', tag: 'npm' },
  { id: 'builtin-build', label: '编译构建', command: 'npm run build', cwd: '${workspaceFolder}', tag: 'npm' },
  { id: 'builtin-pull', label: '拉取代码', command: 'git pull --rebase', cwd: '${workspaceFolder}', tag: 'git' },
  { id: 'builtin-status', label: '查看状态', command: 'git status', cwd: '${workspaceFolder}', tag: 'git' },
  { id: 'builtin-log', label: '查看日志', command: 'git log --oneline -10', cwd: '${workspaceFolder}', tag: 'git' },
];

/* ─── TreeItem ─── */

class CommandTreeItem extends vscode.TreeItem {
  constructor(
    public readonly cmd: SavedCommand,
  ) {
    super(cmd.label, vscode.TreeItemCollapsibleState.None);
    this.description = cmd.command;
    this.tooltip = `${cmd.command}\n目录: ${cmd.cwd}`;
    this.contextValue = 'savedCommand';
    this.iconPath = new vscode.ThemeIcon(
      cmd.tag === 'npm' ? 'package' :
      cmd.tag === 'git' ? 'git-commit' :
      cmd.tag === 'docker' ? 'container' : 'terminal',
    );
    this.command = {
      command: 'personal-vscode-helper.runCommand',
      title: '执行',
      arguments: [cmd],
    };
  }
}

class CommandTagItem extends vscode.TreeItem {
  constructor(
    public readonly tag: string,
    public readonly count: number,
  ) {
    super(tag, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${count} 个命令`;
    this.contextValue = 'commandTag';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

/* ─── TreeDataProvider ─── */

class CommandProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element) {
      if (element instanceof CommandTagItem) {
        const commands = this._load();
        return commands
          .filter(c => c.tag === element.tag)
          .map(c => new CommandTreeItem(c));
      }
      return [];
    }

    const commands = this._load();
    const tags = [...new Set(commands.map(c => c.tag))].sort();
    return tags.map(t => {
      const count = commands.filter(c => c.tag === t).length;
      return new CommandTagItem(t, count);
    });
  }

  private _load(): SavedCommand[] {
    return this._context.globalState.get<SavedCommand[]>(KEY, DEFAULTS);
  }
}

let commandContext: vscode.ExtensionContext | null = null;

/* ─── Public API ─── */

export function initCommandCollection(context: vscode.ExtensionContext): CommandProvider {
  commandContext = context;
  const provider = new CommandProvider(context);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('commandCollectionView', provider),
  );

  // Save command command
  context.subscriptions.push(
    vscode.commands.registerCommand('personal-vscode-helper.saveCommand', async () => {
      const commands = loadCommands();
      const label = await vscode.window.showInputBox({
        prompt: '命令名称',
        placeHolder: '例如: 启动所有服务',
        ignoreFocusOut: true,
      });
      if (!label) return;

      const command = await vscode.window.showInputBox({
        prompt: '终端命令',
        placeHolder: '例如: docker-compose up -d',
        ignoreFocusOut: true,
      });
      if (!command) return;

      const tag = await vscode.window.showInputBox({
        prompt: '标签（用于分组）',
        placeHolder: 'npm / git / docker / 自定义',
        value: '自定义',
        ignoreFocusOut: true,
      });
      if (!tag) return;

      const cwd = await vscode.window.showInputBox({
        prompt: '执行目录（可选）',
        value: '${workspaceFolder}',
        ignoreFocusOut: true,
      });

      commands.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        label,
        command,
        cwd: cwd || '${workspaceFolder}',
        tag,
      });
      saveCommands(commands);
      provider.refresh();
      vscode.window.showInformationMessage(`命令已保存: ${label}`);
    }),
  );

  // Run command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.runCommand',
      (cmd: SavedCommand) => {
        let cwd = cmd.cwd;
        if (cwd.includes('${workspaceFolder}')) {
          const wf = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
          cwd = cwd.replace(/\$\{workspaceFolder\}/g, wf);
        }
        const terminal = vscode.window.createTerminal({
          name: cmd.label,
          cwd,
        });
        terminal.sendText(cmd.command);
        terminal.show();
      },
    ),
  );

  // Delete command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.deleteCommand',
      async (item: CommandTreeItem) => {
        if (!item) return;
        const commands = loadCommands();
        const idx = commands.findIndex(c => c.id === item.cmd.id);
        if (idx !== -1) {
          commands.splice(idx, 1);
          saveCommands(commands);
          provider.refresh();
          vscode.window.showInformationMessage('命令已删除');
        }
      },
    ),
  );

  return provider;
}

function loadCommands(): SavedCommand[] {
  if (!commandContext) return DEFAULTS;
  return commandContext.globalState.get<SavedCommand[]>(KEY, DEFAULTS);
}

function saveCommands(commands: SavedCommand[]): void {
  if (!commandContext) return;
  commandContext.globalState.update(KEY, commands);
}
