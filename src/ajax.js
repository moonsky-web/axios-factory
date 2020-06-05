import axios from 'axios';
import beforeRequestPlugins from './plugins';

// 定义一些基础处理器
// ~ Predefine handlers
// ============================================================================

function concatUrls(...urls) {
  let resultUrl = urls[0], {length} = urls;
  for (let i = 1; i < length; i++) {
    const url = urls[i];
    if (resultUrl.slice(-1) === '/') {
      resultUrl = url.charAt(0) === '/' ? `${resultUrl}${url.slice(1)}` : resultUrl + url;
    } else {
      resultUrl = url.charAt(0) === '/' ? (resultUrl + url) : `${resultUrl}/${url}`;
    }
  }
  return resultUrl;
}

function typeOf(value) {
  return Object.prototype.toString.call(value).slice(8, -1);
}

export function ajaxFactory(config, responseErrorChain/* Object|Array */) {
  const dftObj = {};
  const {beforeDoRequest = opts => opts, ...settings} = config;
  let $instance = axios.create(settings);

  function doReject(errorDetail) {
    return Promise.reject(errorDetail);
  }

  function isFn(value) {
    return value instanceof Function;
  }

  function mergeErrorDefaults(options) {
    const {[errorDefaultsKey]: optionsDefaults} = options;
    const {[errorDefaultsKey]: predefinedDefaults} = api;
    return {...predefinedDefaults, ...optionsDefaults};
  }

  function getContentByKey(error, key) {
    const {response} = error;
    if (response) {
      const {[key]: content} = response;
      return content || null;
    }
    return null;
  }

  function findByHttpStatusCode(error, defaults) {
    const value = getContentByKey(error, 'status');
    return value ? (defaults[value] || null) : null;
  }

  function findByHttpStatusText(error, defaults) {
    const value = getContentByKey(error, 'statusText');
    return value ? (defaults[value] || null) : null;
  }

  function findFromMatchers(error, options) {
    const {[errorMatchersKey]: apiMatchers} = api;
    const {[errorMatchersKey]: optionMatchers} = options;
    const matchers = {...apiMatchers, ...optionMatchers};
    for (let key in matchers) {
      const {test, handler} = matchers[key];
      if (isFn(test) && isFn(handler) && test(error)) {
        return handler;
      }
    }
  }

  function afterResponded(requested, options) {
    const defaults = mergeErrorDefaults(options);
    return requested.then(({data, status}) => data, error => {
      let handler = findByHttpStatusCode(error, defaults)
        || findByHttpStatusText(error, defaults)
        || findFromMatchers(error, options);
      if (handler) {
        return doReject(handler(error));
      } else {
        return doReject(error);
      }
    });
  }

  function doRequest(options) {
    const {instance = $instance, ...rest} = options;
    const requestOptions = {...settings, ...rest};
    const opts = beforeDoRequest(requestOptions, instance.request, beforeRequestPlugins);
    return afterResponded(opts instanceof Promise
      ? opts.then(instance.request)
      : instance.request(opts), options);
  }

  function transformDataAsUrl(data, outConfig, preParams = dftObj, preData = dftObj) {
    const {
      params = {}, data: innerData = dftObj, ...restCfg
    } = outConfig || dftObj;
    restCfg.params = (data instanceof FormData) ? data : {
      ...preParams,
      ...params,
      ...preData,
      ...data,
      ...innerData,
    };
    return restCfg;
  }

  function transformDataAsBody(data, paramsConfig, preParams = dftObj, preData = dftObj) {
    const {data: innerData = {}, params, ...cfg} = paramsConfig || dftObj;
    return (data instanceof FormData) ? {...cfg, data} : {
      ...cfg,
      params: {
        ...preParams,
        ...params,
      },
      data: {
        ...preData,
        ...data,
        ...innerData,
      },
    };
  }

  function hasBody(method) {
    return 'GET,HEAD,DELETE'.indexOf(method ) < 0;
  }

  function registry(remoteUrl, method = 'GET', options = {}) {
    method = method.toUpperCase();
    const {data: preData, params: preParams, ...elseOpts} = options;
    const handler = hasBody(method) ? transformDataAsBody : transformDataAsUrl;
    if (typeof (remoteUrl) === 'function') {
      const {length} = remoteUrl;
      return (...args) => {
        // eslint-disable-next-line
        const url = remoteUrl.apply(null, args.slice(0, length));
        const [data, doRequestConfig] = args.slice(length);
        return doRequest({
          url,
          method,
          ...elseOpts,
          ...handler(data, doRequestConfig, preParams, preData),
        });
      };
    }
    return (data, doRequestConfig) => doRequest({
      method,
      url: remoteUrl,
      ...elseOpts,
      ...handler(data, doRequestConfig, preParams, preData),
    });
  }

  function fastRegistry(method) {
    return (url, opts) => registry(url, method, opts);
  }

  function mergeUrlParams(targetUrl, params) {
    return params ? [
      targetUrl, Object.keys(params || {}).reduce((all, key) => {
        all.push(`${key}=${params[key]}`);
        return all;
      }, []).join('&'),
    ].join('?') : targetUrl;
  }

  const api = {
    // 完全自定义请求对象
    setInstance(instance) {
      $instance = instance;
      return api;
    },
    // 自定义配置请求对象，如设置拦截器等
    config(handler) {
      if (typeof handler === 'function') {
        $instance = handler($instance) || $instance;
      } else {
        // eslint-disable-next-line
        console.warn(new Error('应传入一个函数，接受默认 axios 实例作为参数'));
      }
      return api;
    },
    // 无任何副作用的请求方法
    get ajax() {
      return $instance.request;
    },
    // 只包含基本处理 {beforeDoRequest} 的请求方法
    request: doRequest,
    /*
     一下两个函数是为了某些特殊转换：
     如，页面存在需要下载的链接地址，url 确定，但 baseURL 随着不同部署环境变化
     需要利用一致的 baseURL “构造”并返回这个链接

     transform 提供其他可能的自定义转换
     */
    // 自定义处理返回转换后的值
    transform(handler) {
      return handler(api, config);
    },
    // 仅利用配置信息的 baseURL 返回一个完整 url，支持简单参数
    urlFactory(url) {
      const type = typeOf(url);
      if (type === 'String') {
        const targetUrl = concatUrls(config.baseURL, url);
        return params => mergeUrlParams(targetUrl, params);
      } else if (type === 'Function') {
        const {length} = url;
        return (...args) => {
          const remoteUrl = url.apply(null, args.slice(0, length));
          const targetUrl = concatUrls(config.baseURL, remoteUrl);
          return mergeUrlParams(targetUrl, args[length]);
        };
      } else if (!url) {
        return () => config.baseURL;
      } else {
        // eslint-disable-next-line
        throw new Error('未知 url 类型：' + url);
      }
    },
    /**
     * 指定命名空间的 Factory，如：
     *
     * const Ajax = ajaxFactory({
     *   bashURL: 'http://localhost:8080/context-path'
     *   // other config
     * });
     * const subAjax = Ajax.subFactory('/user');
     *
     * subAjax 等价于：
     *
     * const subAjax = ajaxFactory({
     *   bashURL: 'http://localhost:8080/context-path/user'
     *   // other config
     * });
     *
     * 但是 subAjax 和 Ajax 是两个不同的 axios 对象；
     *
     * @param subUrl
     * @returns {any}
     */
    subFactory(subUrl) {
      return ajaxFactory({
        ...config, baseURL: concatUrls(config.baseURL, subUrl),
      }, errorDefaultsKey, errorMatchersKey);
    },
    /**
     * 批量注册,
     * 如：
     * const Ajax = ajaxFactory({
     *   baseURL: 'http://localhost:8080/context-path'
     *   // configurations
     * });
     *
     * const http = Ajax.registryAll('/user', 'get', {
     *   // 查询所有用户
     *   findAll: '/findAllUser',
     *   // 指定 url 的同时还指定其他参数，其他参数被视为默认参数(当然一般 update 不一定用 get 方法)
     *   update: {url: '/updateUser', headers: {}},
     *   // 单独指定 url 和 method
     *   save: {url: '/saveUser', method: 'post'}
     * });
     *
     * 等价于：
     *
     * const Ajax = ajaxFactory({
     *   baseURL: 'http://localhost:8080/context-path/user'
     *   // configurations
     * });
     *
     * const http = {
     *   findAll: Ajax.get('/findAllUser'),
     *   update: Ajax.get('/updateUser', {headers: {}}),
     *   save: Ajax.post('/saveUser'),
     *   // 或者 Ajax.registry('/saveUser', 'post')
     * }
     *
     * @param subUrl 批量注册 api 的统一前缀
     * @param method 请求方法
     * @param targetApis Object，目标 api
     * @param defaultOptions 所有 api 的默认配置
     */
    registryAll(subUrl, method, targetApis, defaultOptions = {}) {
      return Object.keys(targetApis || {}).reduce((apis, nameKey) => {
        const apiConfig = targetApis[nameKey], type = typeOf(apiConfig);
        let url, httpMethod, options = null;
        if (type === 'Object') {
          const {url: innerUrl, method: m, ...opts} = apiConfig;
          options = {...defaultOptions, ...opts};
          httpMethod = m;
          url = innerUrl;
        } else if (type === 'String') {
          url = apiConfig;
          options = defaultOptions;
        } else {
          // eslint-disable-next-line
          throw new Error('registryAll 参数错误，targetApis 应该是表示 url 的字符串，或者包含 url 字段的简单对象');
        }
        apis[nameKey] = registry(concatUrls(subUrl, url || ''), httpMethod || method, options);
        return apis;
      }, {});
    },

    /*
     * 以上是对各种请求的配置和进一步封装
     *
     * 以下是基本注册方法，返回请求函数
     */

    // 注册，返回请求函数
    registry,
    // 获取数据
    get: fastRegistry('GET'),
    // 提交数据：表单提交, 文件上传等
    post: fastRegistry('POST'),
    // 更新数据（替换原数据：所有数据推送到后端）
    put: fastRegistry('PUT'),
    // 更新数据（部分修改：只更新修改的数据）
    patch: fastRegistry('PATCH'),
    // 删除数据
    delete: fastRegistry('DELETE'),
    // 删除数据
    del: fastRegistry('DELETE'),
  };
  return api;
}

export default ajaxFactory;
