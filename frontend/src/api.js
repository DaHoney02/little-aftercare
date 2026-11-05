const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    let message = `请求失败 (${response.status})`
    try {
      const body = await response.json()
      message = typeof body.detail === 'string'
        ? body.detail
        : Array.isArray(body.detail)
          ? body.detail.map((item) => `${item.loc?.slice(-1)[0] || '字段'}：${item.msg}`).join('；')
          : body.message || message
    } catch {
      // 保留状态码提示。
    }
    throw new Error(message)
  }

  if (response.status === 204) return null
  return response.json()
}

const query = (params) => new URLSearchParams(params).toString()

export const aftercareApi = {
  list: (sessionId) => request(`/aftercare?${query({ session_id: sessionId, limit: 100, offset: 0 })}`),
  overview: (sessionId) => request(`/aftercare/deadlines/overview?${query({ session_id: sessionId, days: 7 })}`),
  notifications: (sessionId, unreadOnly = false) => request(`/aftercare/notifications?${query({
    session_id: sessionId,
    unread_only: unreadOnly,
    limit: 50,
    offset: 0,
  })}`),
  markNotificationRead: (id, sessionId) => request(`/aftercare/notifications/${id}/read?${query({
    session_id: sessionId,
  })}`, { method: 'PATCH' }),
  extract: (text) => request('/aftercare/extract', {
    method: 'POST',
    body: JSON.stringify({ text }),
  }),
  create: (data) => request('/aftercare/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id, sessionId, data) => request(`/aftercare/${id}?${query({ session_id: sessionId })}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  remove: (id, sessionId) => request(`/aftercare/${id}?${query({ session_id: sessionId })}`, {
    method: 'DELETE',
  }),
}
