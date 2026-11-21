
/**
 * 商品档案 API
 *
 * 对应后端路由：/products
 *
 * 所有请求统一使用 api.js 中的 request()：
 * - 自动拼接 API_BASE
 * - 自动携带 JWT
 * - 统一处理 HTTP 错误
 */
import { request } from '../api.js'
/**
 * 获取商品列表
 * 后端支持分页、关键词搜索、分类筛选和排序。
 */
export const getProductList = (params = {}, options = {}) => {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value)
    }
  })

  return request(`/products?${query.toString()}`, options)
}

/**
 * 创建商品
 */
export function createProduct(data) {
  return request('/products', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 获取商品详情
 */
export function getProductDetail(productId) {
  return request(`/products/${productId}`)
}

/**
 * 局部更新商品
 * 注意：后端使用 PATCH，不是 PUT。
 */
export function updateProduct(productId, data) {
  return request(`/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

/**
 * 删除商品
 */
export function deleteProduct(productId) {
  return request(`/products/${productId}`, {
    method: 'DELETE',
  })
}
