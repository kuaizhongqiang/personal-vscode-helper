import { AbstractVcsProvider } from './abstractVcsProvider';
import { SvnCli } from '../cli/svnCli';

/**
 * SVN 侧边栏视图 Provider
 */
export class SvnViewProvider extends AbstractVcsProvider {
	protected name = 'SVN';
	protected cli = new SvnCli();
}
