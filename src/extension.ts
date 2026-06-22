import * as vscode from 'vscode';
import { PlasticViewProvider } from './views/plasticViewProvider';
import { SvnViewProvider } from './views/svnViewProvider';

/**
 * 插件激活入口
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('插件 "personal-vscode-helper" 已激活！');

	// 注册 Plastic SCM 视图
	const plasticProvider = new PlasticViewProvider();
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('plasticView', plasticProvider),
	);

	// 注册 SVN 视图
	const svnProvider = new SvnViewProvider();
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('svnView', svnProvider),
	);

	// 注册 Plastic SCM 命令
	context.subscriptions.push(
		vscode.commands.registerCommand('vcs-manager.plastic.refresh', () => plasticProvider.refresh()),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('vcs-manager.plastic.commit', () => plasticProvider.commit()),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('vcs-manager.plastic.update', () => plasticProvider.update()),
	);

	// 注册 SVN 命令
	context.subscriptions.push(
		vscode.commands.registerCommand('vcs-manager.svn.refresh', () => svnProvider.refresh()),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('vcs-manager.svn.commit', () => svnProvider.commit()),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('vcs-manager.svn.update', () => svnProvider.update()),
	);

	// 保留原 helloWorld 命令（兼容）
	context.subscriptions.push(
		vscode.commands.registerCommand('personal-vscode-helper.helloWorld', () => {
			vscode.window.showInformationMessage('🎉 你好，我的第一个 VSCode 插件！');
		}),
	);
}

export function deactivate() {}
