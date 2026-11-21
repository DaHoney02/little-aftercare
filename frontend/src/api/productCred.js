import { request } from '../api.js'

// 上传购物凭证：只上传文件和可选的商品 ID
export function uploadProductCredential(file, productId = null) {
  const formData = new FormData()

  formData.append('file', file)

  if (productId !== null) {
    formData.append('product_id', productId)
  }

  return request('/product-cred', {
    method: 'POST',
    body: formData,
  })
}

// 获取当前用户的凭证列表
export function getProductCredentials(productId = null) {
  const query = productId !== null
    ? `?product_id=${encodeURIComponent(productId)}`
    : ''

  return request(`/product-cred${query}`)
}

// 删除购物凭证
export function deleteProductCredential(credentialId) {
  return request(`/product-cred/${credentialId}`, {
    method: 'DELETE',
  })
}

// 获取凭证文件：预览或下载
export function getProductCredentialFile(credentialId, disposition = 'inline') {
  return request(
    `/product-cred/${credentialId}/file?disposition=${disposition}`,
    { responseType: 'blob' }
  )
}