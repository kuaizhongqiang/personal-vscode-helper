import * as vscode from 'vscode';
import { CliWrapper, RepoStatus, StatusItem, STATUS_LABELS } from '../types';

/**
 * 抽象树节点
 */
export class VcsTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly description?: string,
		public readonly contextValue?: string,
	) {
		super(label, collapsibleState);
	}
}

/**
 * 文件变更节点
 */
export class VcsFileItem extends vscode.TreeItem {
	constructor(
		public readonly item: StatusItem,
	) {
		const labelInfo = STATUS_LABELS[item.status];
		super(`${labelInfo.icon} ${item.path}`, vscode.TreeItemCollapsibleState.None);
		this.tooltip = `${item.path} — ${labelInfo.tooltip}`;
		this.description = labelInfo.tooltip;
		this.resourceUri = item.uri;
		this.command = {
			command: 'vscode.open',
			title: '打开文件',
			arguments: [item.uri],
		};
		this.contextValue = 'vcsFile';
	}
}

/**
 * 抽象 VCS View Provider 基类
 *
 * 子类只需实现 cli、viewId、name 三个属性。
 */
export abstract class AbstractVcsProvider implements vscode.TreeDataProvider<VcsTreeItem | VcsFileItem> {
	protected abstract cli: CliWrapper;
	protected abstract name: string;

	private _onDidChangeTreeData = new vscode.EventEmitter<VcsTreeItem | VcsFileItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private _status: RepoStatus | null = null;
	private _error: string | null = null;

	/** 强制刷新 */
	async refresh(): Promise<void> {
		this._error = null;
		await this.loadStatus();
		this._onDidChangeTreeData.fire(undefined);
	}

	/** 提交 */
	async commit(): Promise<void> {
		const message = await vscode.window.showInputBox({
			prompt: `输入 ${this.name} 提交信息`,
			placeHolder: '提交信息...',
			ignoreFocusOut: true,
		});
		if (message === undefined) return; // 用户取消

		try {
			const workspacePath = this.getWorkspacePath();
			if (!workspacePath) return;

			const result = await this.cli.commit(workspacePath, message);
			vscode.window.showInformationMessage(`✅ ${this.name} 提交成功`);
			await this.refresh();
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
		}
	}

	/** 更新/拉取 */
	async update(): Promise<void> {
		try {
			const workspacePath = this.getWorkspacePath();
			if (!workspacePath) return;

			const result = await this.cli.update(workspacePath);
			vscode.window.showInformationMessage(`✅ ${this.name} 更新成功`);
			await this.refresh();
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
		}
	}

	getTreeItem(element: VcsTreeItem | VcsFileItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: VcsTreeItem | VcsFileItem): Promise<(VcsTreeItem | VcsFileItem)[]> {
		if (element) {
			return []; // 当前无子级展开节点
		}

		// 初次加载
		if (!this._status && !this._error) {
			await this.loadStatus();
		}

		if (this._error) {
			return [new VcsTreeItem(`⚠️ ${this._error}`, vscode.TreeItemCollapsibleState.None)];
		}

		if (!this._status) {
			return [new VcsTreeItem('正在加载...', vscode.TreeItemCollapsibleState.None)];
		}

		const items: (VcsTreeItem | VcsFileItem)[] = [];

		// 第一行：分支信息
		items.push(new VcsTreeItem(
			`🌿 ${this._status.branch}`,
			vscode.TreeItemCollapsibleState.None,
			'当前分支',
			'branch',
		));

		// 变更文件
		if (this._status.changes.length === 0) {
			items.push(new VcsTreeItem(
				'$(check) 工作区干净',
				vscode.TreeItemCollapsibleState.None,
			));
		} else {
			for (const change of this._status.changes) {
				items.push(new VcsFileItem(change));
			}
		}

		return items;
	}

	private async loadStatus(): Promise<void> {
		const workspacePath = this.getWorkspacePath();
		if (!workspacePath) {
			this._error = `未打开工作区，无法使用 ${this.name}`;
			return;
		}

		try {
			this._status = await this.cli.getStatus(workspacePath);
			this._error = null;
		} catch (err: any) {
			this._status = null;
			this._error = err.message || `无法获取 ${this.name} 状态`;
		}
	}

	protected getWorkspacePath(): string | undefined {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders || folders.length === 0) return undefined;
		return folders[0].uri.fsPath;
	}
}
