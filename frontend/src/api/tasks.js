
import { request } from '../api.js'

// 拼接 URL 查询参数
// 过滤 undefined、null 和空字符串，但保留 0 和 false
const withQuery = (path, params = {}) => {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }
    searchParams.append(key, String(value))
  })
  const queryString = searchParams.toString()

  return queryString ? `${path}?${queryString}` : path
}

// Task 任务工作台 API
export const taskApi = {
  /**
   * 获取任务列表
   * 支持分页、状态、优先级、来源类型和关键词筛选
   */
  list: (params = {}) =>
    request(withQuery('/tasks', params)),

  /**
   * 获取当前用户全部任务的统计数据
   * 不受任务列表分页、搜索和筛选影响
   */
  getStats: () =>
    request('/tasks/stats'),

  /**
   * 获取单条任务详情
   */
  get: (taskId) =>
    request(`/tasks/${taskId}`),

  /**
   * 创建任务
   */
  create: (data) =>
    request('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 更新任务
   * 使用 PATCH，只提交需要修改的字段
   */
  update: (taskId, data) =>
    request(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * 删除任务
   */
  remove: (taskId) =>
    request(`/tasks/${taskId}`, {
      method: 'DELETE',
    }),
}
