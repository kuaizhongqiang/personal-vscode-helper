import * as vscode from 'vscode';
import * as path from 'path';

/**
 * M7-4: 右键菜单增强
 * - 复制相对路径（正斜杠）
 * - 复制为 import 语句
 * - 在外部工具中打开
 */

export function registerContextMenuCommands(context: vscode.ExtensionContext): void {
  // 复制相对路径（正斜杠）
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.copyRelPath',
      (uri: vscode.Uri) => {
        if (!uri) return;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showInformationMessage('没有打开的工作区');
          return;
        }
        const relPath = path.relative(workspaceFolders[0].uri.fsPath, uri.fsPath);
        const normalized = relPath.replace(/\\/g, '/');
        vscode.env.clipboard.writeText(normalized);
        vscode.window.showInformationMessage(`已复制相对路径: ${normalized}`);
      },
    ),
  );

  // 复制为 import 语句
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.copyAsImport',
      (uri: vscode.Uri) => {
        if (!uri) return;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return;

        const relPath = path.relative(workspaceFolders[0].uri.fsPath, uri.fsPath);
        const normalized = relPath.replace(/\\/g, '/').replace(/\.(ts|tsx|js|jsx)$/, '');
        const name = path.basename(uri.fsPath).replace(/\.(ts|tsx|js|jsx)$/, '');

        // Detect current file's module system
        const editor = vscode.window.activeTextEditor;
        let importStmt = '';
        if (editor && isESM(editor.document)) {
          importStmt = `import { ${camelCase(name)} } from '${normalized}';`;
        } else {
          importStmt = `const ${camelCase(name)} = require('${normalized}');`;
        }

        vscode.env.clipboard.writeText(importStmt);
        vscode.window.showInformationMessage(`已复制 import 语句`);
      },
    ),
  );

  // 在外部工具中打开
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.openInExternal',
      (uri: vscode.Uri) => {
        if (!uri) return;
        const config = vscode.workspace.getConfiguration('personal-vscode-helper');
        const command = config.get<string>('externalToolCommand', 'code -r');
        const terminal = vscode.window.createTerminal('外部工具');
        terminal.sendText(`${command} "${uri.fsPath}"`);
        terminal.show();
      },
    ),
  );
}

function isESM(doc: vscode.TextDocument): boolean {
  const text = doc.getText();
  // Check for import/export statements as ESM indicator
  return /import\s|export\s/.test(text);
}

function camelCase(name: string): string {
  return name.replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase());
}
