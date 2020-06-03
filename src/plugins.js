import qs from 'qs';

const typeKey = 'Content-Type', formType = 'application/x-www-form-urlencoded';

export function contentFormatter(settings, request) {
  // 格式化 post data，如果请求头是表单提交，将转为 URLRequestParams
  const {headers = {}} = settings;
  // post data for content type
  const type = headers[typeKey] || headers[typeKey.toLowerCase()];
  if (type && type.toLowerCase().indexOf(formType) >= 0) {
    settings.data = qs.stringify(settings.data);
  } else if (!type && settings.contentType === 'form') {
    headers[typeKey] = formType;
    settings.data = qs.stringify(settings.data);
  }
  settings.headers = headers;
  return settings;
}

export default {contentFormatter};