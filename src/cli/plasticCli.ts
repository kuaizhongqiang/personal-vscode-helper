import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as vscode from 'vscode';
import { CliWrapper, RepoStatus, StatusItem } from '../types';

const exec = promisify(execFile);

/**
 * Plastic SCM CLI 封装 (cm 命令)
 *
 * 使用 cm status --format=xml 获取状态
 * 使用 cm commit 提交
 * 使用 cm update 更新
 */
export class PlasticCli implements CliWrapper {
	private readonly cmd = 'cm';

	async getStatus(workspacePath: string): Promise<RepoStatus> {
		// 获取分支名: cm branch
		const branch = await this.getBranch(workspacePath);

		// 获取变更文件: cm status --format=xml
		const changes = await this.getChanges(workspacePath);

		return { branch, changes };
	}

	async commit(workspacePath: string, message: string): Promise<string> {
		try {
			const { stdout } = await exec(this.cmd, ['commit', '.', '-c', message], { cwd: workspacePath });
			return stdout.trim();
		} catch (err: any) {
			throw new Error(`Plastic SCM 提交失败: ${err.stderr || err.message}`);
		}
	}

	async update(workspacePath: string): Promise<string> {
		try {
			const { stdout } = await exec(this.cmd, ['update', '.'], { cwd: workspacePath });
			return stdout.trim();
		} catch (err: any) {
			throw new Error(`Plastic SCM 更新失败: ${err.stderr || err.message}`);
		}
	}

	/** 检查当前目录是否是 Plastic SCM 仓库 */
	async isRepo(workspacePath: string): Promise<boolean> {
		try {
			// 检查是否存在 .plastic 目录
			const fs = await import('fs');
			return fs.existsSync(path.join(workspacePath, '.plastic'));
		} catch {
			return false;
		}
	}

	private async getBranch(workspacePath: string): Promise<string> {
		try {
			const { stdout } = await exec(this.cmd, ['branch', '--list', '--format={Name}'], { cwd: workspacePath });
			const lines = stdout.trim().split('\n').filter(Boolean);
			// 当前分支用 * 标记
			const current = lines.find(l => l.startsWith('*')) || lines[0];
			return current?.replace(/^\*\s*/, '') || 'unknown';
		} catch {
			return 'unknown';
		}
	}

	private async getChanges(workspacePath: string): Promise<StatusItem[]> {
		try {
			const { stdout } = await exec(this.cmd, ['status', '--format=xml'], { cwd: workspacePath });
			return this.parseXmlStatus(stdout, workspacePath);
		} catch {
			return [];
		}
	}

	private parseXmlStatus(xml: string, workspacePath: string): StatusItem[] {
		const items: StatusItem[] = [];
		const uri = (relativePath: string) => vscode.Uri.file(path.join(workspacePath, relativePath));

		// 简单 XML 解析 —— 按 StatusItem 节点匹配
		let match: RegExpExecArray | null;
		const re = /<StatusItem>[\s\S]*?<\/StatusItem>/g;
		while ((match = re.exec(xml)) !== null) {
			const block = match[0];
			const filePath = this.extractXmlTag(block, 'Path');
			const statusCode = this.extractXmlTag(block, 'Status');
			if (filePath) {
				items.push({
					path: filePath,
					status: this.mapStatus(statusCode || ''),
					uri: uri(filePath),
				});
			}
		}

		return items;
	}

	private extractXmlTag(xml: string, tag: string): string | undefined {
		const re = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`);
		const m = re.exec(xml);
		return m ? m[1].trim() : undefined;
	}

	private mapStatus(code: string): StatusItem['status'] {
		switch (code) {
			case 'Added': return 'added';
			case 'Deleted': return 'deleted';
			case 'Changed': return 'modified';
			case 'Conflicted': return 'conflict';
			case 'Private': return 'untracked';
			default: return 'modified';
		}
	}
}
