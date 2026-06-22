import * as vscode from 'vscode';

/** 变更文件的状态类型 */
export type FileStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'conflict';

/** 变更文件条目 */
export interface StatusItem {
	/** 文件相对路径 */
	path: string;
	/** 变更状态 */
	status: FileStatus;
	/** 文件 URI（绝对路径） */
	uri: vscode.Uri;
}

/** 仓库状态快照 */
export interface RepoStatus {
	/** 当前分支名（或 revision） */
	branch: string;
	/** 变更文件列表 */
	changes: StatusItem[];
}

/** CLI 封装接口 */
export interface CliWrapper {
	getStatus(workspacePath: string): Promise<RepoStatus>;
	commit(workspacePath: string, message: string): Promise<string>;
	update(workspacePath: string): Promise<string>;
}

/** 状态标识对应的显示字符 */
export const STATUS_LABELS: Record<FileStatus, { icon: string; tooltip: string }> = {
	modified: { icon: '$(pencil)', tooltip: '已修改' },
	added: { icon: '$(plus)', tooltip: '已新增' },
	deleted: { icon: '$(trash)', tooltip: '已删除' },
	untracked: { icon: '$(question)', tooltip: '未跟踪' },
	conflict: { icon: '$(warning)', tooltip: '冲突' },
};
