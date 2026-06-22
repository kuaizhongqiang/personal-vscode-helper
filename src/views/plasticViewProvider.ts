import { AbstractVcsProvider } from './abstractVcsProvider';
import { PlasticCli } from '../cli/plasticCli';

/**
 * Plastic SCM 侧边栏视图 Provider
 */
export class PlasticViewProvider extends AbstractVcsProvider {
	protected name = 'Plastic SCM';
	protected cli = new PlasticCli();
}
