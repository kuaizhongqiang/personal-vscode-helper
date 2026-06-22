import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as vscode from 'vscode';
import { CliWrapper, RepoStatus, StatusItem } from '../types';

const exec = promisify(execFile);

/**
 * SVN CLI 封装 (svn 命令)
 *
 * 使用 svn status --xml 获取状态
 * 使用 svn commit -m 提交
 * 使用 svn update 更新
 */
export class SvnCli implements CliWrapper {
	private readonly cmd = 'svn';

	async getStatus(workspacePath: string): Promise<RepoStatus> {
		const branch = await this.getBranch(workspacePath);
		const changes = await this.getChanges(workspacePath);
		return { branch, changes };
	}

	async commit(workspacePath: string, message: string): Promise<string> {
		try {
			const { stdout } = await exec(this.cmd, ['commit', '-m', message], { cwd: workspacePath });
			return stdout.trim();
		} catch (err: any) {
			throw new Error(`SVN 提交失败: ${err.stderr || err.message}`);
		}
	}

	async update(workspacePath: string): Promise<string> {
		try {
			const { stdout } = await exec(this.cmd, ['update'], { cwd: workspacePath });
			return stdout.trim();
		} catch (err: any) {
			throw new Error(`SVN 更新失败: ${err.stderr || err.message}`);
		}
	}

	/** 检查当前目录是否是 SVN 工作副本 */
	async isRepo(workspacePath: string): Promise<boolean> {
		try {
			const fs = await import('fs');
			return fs.existsSync(path.join(workspacePath, '.svn'));
		} catch {
			return false;
		}
	}

	private async getBranch(workspacePath: string): Promise<string> {
		try {
			// svn info 获取当前 URL
			const { stdout } = await exec(this.cmd, ['info', '--xml'], { cwd: workspacePath });
			const urlMatch = /<url>([^<]+)<\/url>/.exec(stdout);
			if (urlMatch) {
				const url = urlMatch[1];
				// 取 URL 最后一段作为 branch 名
				return url.split('/').filter(Boolean).pop() || 'trunk';
			}
			return 'trunk';
		} catch {
			return 'unknown';
		}
	}

	private async getChanges(workspacePath: string): Promise<StatusItem[]> {
		try {
			const { stdout } = await exec(this.cmd, ['status', '--xml'], { cwd: workspacePath });
			return this.parseXmlStatus(stdout, workspacePath);
		} catch {
			return [];
		}
	}

	private parseXmlStatus(xml: string, workspacePath: string): StatusItem[] {
		const items: StatusItem[] = [];
		const uri = (relativePath: string) => vscode.Uri.file(path.join(workspacePath, relativePath));

		// SVN status --xml 输出格式:
		// <entry path="src/file.ts">
		//   <wc-status item="modified" props="none"></wc-status>
		// </entry>
		const entryRegex = /<entry\s+path="([^"]+)"\s*>[\s\S]*?<wc-status\s+item="([^"]+)"/g;
		let match: RegExpExecArray | null;
		while ((match = entryRegex.exec(xml)) !== null) {
			const filePath = match[1];
			const svnStatus = match[2];
			items.push({
				path: filePath,
				status: this.mapStatus(svnStatus),
				uri: uri(filePath),
			});
		}

		return items;
	}

	private mapStatus(svnStatus: string): StatusItem['status'] {
		switch (svnStatus) {
			case 'added': return 'added';
			case 'deleted': return 'deleted';
			case 'modified': return 'modified';
			case 'conflicted': return 'conflict';
			case 'unversioned': return 'untracked';
			default: return 'modified';
		}
	}
}
