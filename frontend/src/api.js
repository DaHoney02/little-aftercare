
/**
 * 后端 API 基础地址
 */
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

const TOKEN_KEY = 'little-aftercare-token'

/* =========================
   1. Token 管理
========================= */

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAccessToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/* =========================
   2. 通用参数处理
========================= */

/**
 * 将对象转换为 URL 查询字符串。
 *
 * 自动过滤：
 * - undefined
 * - null
 * - 空字符串
 *
 * 注意：false 和 0 是有效参数，不能过滤。
 */
function buildQuery(params = {}) {
  const validParams = Object.entries(params).filter(
    ([, value]) =>
      value !== undefined &&
      value !== null &&
      value !== ''
  )

  return new URLSearchParams(
    Object.fromEntries(validParams)
  ).toString()
}

/**
 * 拼接查询字符串。
 * 没有有效参数时不添加问号。
 */
function withQuery(path, params) {
  const search = buildQuery(params)
  return search ? `${path}?${search}` : path
}

/* =========================
   3. 统一 HTTP 请求入口
========================= */

/**
 * 统一处理：
 * 1. API 地址
 * 2. JWT 身份认证
 * 3. JSON 请求体
 * 4. HTTP 错误
 * 5. JSON 响应
 */

export async function request(path, options = {}) {
  const token = getAccessToken()
    // responseType 是我们自己的参数，不传给 fetch。
  const { responseType = 'json', ...fetchOptions } = options

  const headers = { ...fetchOptions.headers }

  // FormData 由浏览器自动设置 multipart/form-data 和 boundary。
  // 普通 JSON 请求才手动设置 Content-Type。
  const isFormData = fetchOptions.body instanceof FormData

  if (fetchOptions.body && !isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
//登录后自动携带JWT
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
  })
//统一处理错误响应
  if (!response.ok) {
    let message = `请求失败 (${response.status})`

    try {
      const body = await response.json()

      if (typeof body.detail === 'string') {
        message = body.detail
      } else if (Array.isArray(body.detail)) {
        message = body.detail
          .map((item) => {
            const field = item.loc?.at(-1) || '字段'
            return `${field}：${item.msg}`
          })
          .join('；')
      } else {
        message = body.message || message
      }
    } catch {
      // 非 JSON 错误响应使用默认提示
    }
    throw new Error(message)
  }

//DELETE等接口可能返回204 NO Content
  if (response.status === 204 || response.status === 205) {
    return null
  }
//  图片、PDF等文件响应使用Blob
  if (responseType==='blob'){
     return response.blob()
  }
  return response.json()
}

/**
 * 文件请求入口。
 * 复用 request()，因此不需要重新处理 Token 和 API 地址。
 */
export function requestBlob(path, options = {}) {
  return request(path, {
    ...options,
    responseType: 'blob',
  })
}

/**
 * 统一 JSON 请求方法
 */
function sendJson(path, method, data) {
  return request(path, {
    method,
    body: JSON.stringify(data),
  })
}

/* =========================
   4. 用户认证 API
========================= */

export const authApi = {
  register: (data) =>
    sendJson('/auth/register', 'POST', data),

  login: (data) =>
    sendJson('/auth/login', 'POST', data),

  me: () =>
    request('/auth/me'),
}

/* =========================
   5. 售后记录 API
========================= */

export const aftercareApi = {
  /**
   * 售后记录分页查询
   */
  list: (params = {}, options = {}) => {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value)
    }
  })

  return request(`/aftercare?${query.toString()}`, options)
 },

  /**
   * 截止日期总览
   * SESSION_ID 参数暂时保留兼容旧调用，不再发送给后端。
   */
  overview: (_sessionId) =>
    request(
      withQuery('/aftercare/deadlines/overview', {
        days: 7,
      })
    ),

  /**
   * 查询站内通知
   */
  notifications: (_sessionId, unreadOnly = false) =>
    request(
      withQuery('/aftercare/notifications', {
        unread_only: unreadOnly,
        limit: 50,
        offset: 0,
      })
    ),

  /**
   * 将通知标记为已读
   */
  markNotificationRead: (id, _sessionId) =>
    request(`/aftercare/notifications/${id}/read`, {
      method: 'PATCH',
    }),

  /**
   * AI 提取售后信息
   */
  extract: (text) =>
    sendJson('/aftercare/extract', 'POST', { text }),

  /**
   * 创建售后记录
   */
  create: (data) =>
    sendJson('/aftercare/', 'POST', data),

  /**
   * 更新售后记录
   *
   * 保留旧参数形式：
   * update(id, sessionId, data)
   */
  update: (id, _sessionId, data) =>
    sendJson(`/aftercare/${id}`, 'PUT', data),

  /**
   * 删除售后记录
   *
   * 保留旧参数形式：
   * remove(id, sessionId)
   */
  remove: (id, _sessionId) =>
    request(`/aftercare/${id}`, {
      method: 'DELETE',
    }),
}

//任务通知提醒
export const taskNotificationApi = {
  // 查询任务提醒
  list: (unreadOnly = false) =>
    request(
      withQuery('/task-notifications', {
        unread_only: unreadOnly,
        limit: 50,
        offset: 0,
      })
    ),

  // 标记任务提醒为已读
  markRead: (id) =>
    request(`/task-notifications/${id}/read`, {
      method: 'PATCH',
    }),
}
/* =========================
   6. 个人中心 API
========================= */

export const userApi = {
  // 获取当前用户资料
  me: () => request('/auth/me'),

  // 更新昵称、邮箱等个人资料
  updateProfile: (data) =>
    sendJson('/auth/me', 'PATCH', data),

  // 上传头像
  uploadAvatar: (file) => {
    const formData = new FormData()
    formData.append('file', file)

    return request('/auth/me/avatar', {
      method: 'POST',
      body: formData,
    })
  },

  // 修改密码
  changePassword: (data) =>
    sendJson('/auth/change-password', 'POST', data),
}
