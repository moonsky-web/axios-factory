import {ajaxFactory} from './ajax';
import {errorDefaultsKey as errsDftKey, errorMatchersKey as errsMchKey} from '../vars';

function defaultConfig(extraSettings) {
  return {
    // 配置里应该有一个 beforeDoRequest 函数，这个是默认的
    // 接受三个参数：requestConfig，request，plugins
    // plugins 是一些预定义的 beforeDoRequest 方法，
    beforeDoRequest: (config, request, plugins) => {
      return plugins.contentFormatter(config, request);
    },
    ...extraSettings,
  };
}

export function defaultsAjaxFactory(config, extraSettings) {
  const {
    [errsDftKey]: errorDefaults,
    [errsMchKey]: errorMatchers,
    ...defaults
  } = defaultConfig(extraSettings);
  const ajax = ajaxFactory({...defaults, ...config}, errsDftKey, errsMchKey);
  ajax[errsDftKey] = errorDefaults || {};
  ajax[errsMchKey] = errorMatchers || [];
  return ajax;
}

export default defaultsAjaxFactory;
