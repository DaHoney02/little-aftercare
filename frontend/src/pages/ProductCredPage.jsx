import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getProductCredentials,
  uploadProductCredential,
  deleteProductCredential,
  getProductCredentialFile
} from '../api/productCred.js'
import { getProductList } from '../api/product.js'
import '../styles/product-cred.css'

// 文件大小格式化
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// 日期格式化
function formatDate(value) {
  if (!value) return '未知时间'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

// 根据 MIME 类型判断文件展示类型
function getFileType(contentType) {
  if (contentType?.startsWith('image/')) return '图片'
  if (contentType === 'application/pdf') return 'PDF'
  return '文件'
}

export default function ProductCredentialsPage() {
  const [credentials, setCredentials] = useState([])
  const [products, setProducts] = useState([])
  const [filterProductId, setFilterProductId] = useState('')

  // 当前正在编辑名称的凭证 ID
  const [editingId, setEditingId] = useState(null)

  // 编辑框中的临时名称
  const [editingName, setEditingName] = useState('')

  // 仅保存在本机的自定义名称，不提交到数据库
  const [localNames, setLocalNames] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem('credential-display-names') || '{}'
      )
    } catch {
      return {}
    }
  })

  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadProductId, setUploadProductId] = useState('')

  const [previewCredential, setPreviewCredential] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  const [deletingCredential, setDeletingCredential] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fileInputRef = useRef(null)
  const previewUrlRef = useRef('')
  const credentialRequestRef = useRef(0)

  function persistLocalNames(next) {
    setLocalNames(next)
    localStorage.setItem(
        'credential-display-names',
        JSON.stringify(next))
  }

  function resetUploadForm() {
    setShowUploadModal(false)
    setSelectedFile(null)
    setUploadProductId('')

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function closeUploadModal() {
    if (uploading) return
    setError('')
    resetUploadForm()
  }

  // 统一释放 Blob URL，避免预览文件长期占用内存
  const clearPreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = ''
    }
    setPreviewUrl('')
  }, [])

  // 加载凭证列表。后返回的旧请求不能覆盖当前筛选结果
  const loadCredentials = useCallback(async () => {
    const requestId = credentialRequestRef.current + 1
    credentialRequestRef.current = requestId
    setLoading(true)
    setError('')

    try {
      const productId = filterProductId
        ? Number(filterProductId)
        : null

      const data = await getProductCredentials(productId)
      if (requestId !== credentialRequestRef.current) return
      setCredentials(data)
    } catch (err) {
      if (requestId !== credentialRequestRef.current) return
      setError(err.message || '凭证列表加载失败')
    } finally {
      if (requestId === credentialRequestRef.current) {
        setLoading(false)
      }
    }
  }, [filterProductId])

  // 加载商品选项，供筛选和上传关联使用
  const loadProducts = useCallback(async () => {
    try {
      const pageSize = 100
      let page = 1
      let allProducts = []

      while (page <= 20) {
        const data = await getProductList({
          page,
          page_size: pageSize,
          sort_by: 'created_at',
          sort_order: 'desc',
        })
        const items = data.items || []
        allProducts = allProducts.concat(items)
        if (items.length < pageSize) break
        page += 1
      }

      setProducts(allProducts)
    } catch (err) {
      setError(err.message || '商品列表加载失败')
    }
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  useEffect(() => {
    loadCredentials()
  }, [loadCredentials])

  // 组件卸载时释放预览文件 URL
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  // 选择文件
  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]

    if (!allowedTypes.includes(file.type)) {
      setError('仅支持 JPG、PNG、WEBP 图片和 PDF 文件')
      event.target.value = ''
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('文件大小不能超过 10MB')
      event.target.value = ''
      return
    }

    setError('')
    setSelectedFile(file)
  }

  // 上传凭证
  async function handleUpload() {
    if (!selectedFile || uploading) return

    setUploading(true)
    setError('')
    setNotice('')

    try {
      await uploadProductCredential(
        selectedFile,
        uploadProductId ? Number(uploadProductId) : null
      )

      setNotice('购物凭证上传成功')
      resetUploadForm()
      await loadCredentials()
    } catch (err) {
      setError(err.message || '购物凭证上传失败')
    } finally {
      setUploading(false)
    }
  }

  // 开始编辑：优先带出本机自定义名称
  const handleStartEdit = (credential) => {
    setEditingId(credential.id)
    setEditingName(
      localNames[credential.id]
        || credential.file_name
    )
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  // 保存自定义名称：只写入本机，数据库中的原名称保持不变
  const handleSaveName = (credential) => {
    const newName = editingName.trim()

    if (!newName) {
      setError('凭证名称不能为空')
      return
    }

    if (newName.length > 200) {
      setError('凭证名称不能超过200个字符')
      return
    }

    const originalName =credential.file_name
    setError('')
// 若恢复为原始文件名，就删除本地自定义名称
    if (newName === originalName) {
      const next = { ...localNames }
      delete next[credential.id]
      persistLocalNames(next)
    } else {
      persistLocalNames({
        ...localNames,
        [credential.id]: newName,
      })
    }

    handleCancelEdit()
    setNotice('凭证名称已在本页更新')
  }

  // 打开预览：通过携带 JWT 的请求获取 Blob
  async function handlePreview(credential) {
    clearPreviewUrl()
    setPreviewCredential(credential)
    setPreviewLoading(true)
    setError('')

    try {
      const blob = await getProductCredentialFile(
        credential.id,
        'inline'
      )

      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url
      setPreviewUrl(url)
    } catch (err) {
      setPreviewCredential(null)
      setNotice('')
      setError(err.message || '文件预览失败')
    } finally {
      setPreviewLoading(false)
    }
  }

  // 关闭预览
  function closePreview() {
    clearPreviewUrl()
    setPreviewCredential(null)
  }

  // 下载文件
  async function handleDownload(credential) {
    setError('')

    try {
      const blob = await getProductCredentialFile(
        credential.id,
        'attachment'
      )

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = credential.file_name
      document.body.appendChild(link)
      link.click()
      link.remove()

      // 给浏览器留出下载启动时间，再释放临时 URL
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setNotice('')
      setError(err.message || '文件下载失败')
    }
  }

  // 删除凭证
  async function handleDelete() {
    if (!deletingCredential || deleting) return

    setDeleting(true)
    setError('')

    try {
      await deleteProductCredential(deletingCredential.id)
      const next = { ...localNames }
      delete next[deletingCredential.id]
      persistLocalNames(next)
      setDeletingCredential(null)
      setNotice('购物凭证已删除')
      await loadCredentials()
    } catch (err) {
      setNotice('')
      setError(err.message || '凭证删除失败')
    } finally {
      setDeleting(false)
    }
  }

  // 通过商品 ID 查找商品名称
  function getProductName(productId) {
    if (productId === null || productId === undefined) {
      return '未关联商品'
    }

    const product = products.find(
      (item) => item.id === productId
    )

    return product?.name || `商品 #${productId}`
  }

  const imageCount = credentials.filter(
    (item) => item.content_type?.startsWith('image/')
  ).length

  const pdfCount = credentials.filter(
    (item) => item.content_type === 'application/pdf'
  ).length

  return (
    <section className="credentials-page">
      <header className="credentials-heading">
        <div>
          <h1>购物凭证</h1>
          <p>集中管理购物小票、订单截图和电子凭证</p>
        </div>

        <button
          type="button"
          className="credentials-primary-button"
          onClick={() => {
            setError('')
            setShowUploadModal(true)
          }}
        >
          + 上传凭证
        </button>
      </header>

      {error && (
        <div className="credentials-alert credentials-alert-error">
          {error}
        </div>
      )}

      {notice && (
        <div className="credentials-alert credentials-alert-success">
          {notice}
        </div>
      )}

      <div className="credentials-summary">
        <div>
          <span>凭证总数</span>
          <strong>{credentials.length}</strong>
        </div>
        <div>
          <span>图片凭证</span>
          <strong>{imageCount}</strong>
        </div>
        <div>
          <span>PDF 凭证</span>
          <strong>{pdfCount}</strong>
        </div>
      </div>

      <div className="credentials-toolbar">
        <div>
          <h2>凭证记录</h2>
          <p>支持图片和 PDF 文件预览、下载与删除</p>
        </div>

        <select
          value={filterProductId}
          onChange={(event) => setFilterProductId(event.target.value)}
          aria-label="按商品筛选凭证"
        >
          <option value="">全部商品</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="credentials-empty">正在加载凭证...</div>
      ) : credentials.length === 0 ? (
        <div className="credentials-empty">
          <div className="credentials-empty-icon">▧</div>
          <h3>还没有购物凭证</h3>
          <p>上传小票、订单截图或 PDF，方便日后查找和售后维权。</p>
          <button
            type="button"
            className="credentials-primary-button"
            onClick={() => {
              setError('')
              setShowUploadModal(true)
            }}
          >
            上传第一份凭证
          </button>
        </div>
      ) : (
        <div className="credentials-list">
          {credentials.map((credential) => {
            const isImage = credential.content_type?.startsWith('image/')
            const isPdf = credential.content_type === 'application/pdf'
            const shownName =
              localNames[credential.id]
              || credential.file_name

            return (
              <article
                className="credential-card"
                key={credential.id}
              >
                <div className={`credential-file-icon ${isImage ? 'image' : isPdf ? 'pdf' : ''}`}>
                  {isImage ? 'IMG' : isPdf ? 'PDF' : 'FILE'}
                </div>

                <div className="credential-main">
                  {editingId === credential.id ? (
                    <div className="credential-name-editor">
                      <input
                        type="text"
                        value={editingName}
                        maxLength={200}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveName(credential)
                          }

                          if (e.key === 'Escape') {
                            handleCancelEdit()
                          }
                        }}
                        autoFocus
                        aria-label="编辑凭证名称"
                      />

                      <button
                        type="button"
                        onClick={() => handleSaveName(credential)}
                      >
                        保存
                      </button>

                      <button
                        type="button"
                        onClick={handleCancelEdit}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="credential-name-button"
                      onClick={() => handleStartEdit(credential)}
                      title="点击修改凭证名称"
                    >
                      {shownName}
                    </button>
                  )}

                  <div className="credential-product">
                    原凭证名：{credential.file_name}
                  </div>

                  <div className="credential-meta">
                    <span>{getFileType(credential.content_type)}</span>
                    <span>{formatFileSize(credential.file_size)}</span>
                    <span>{formatDate(credential.created_at)}</span>
                  </div>
                  <div className="credential-product">
                    关联商品：{getProductName(credential.product_id)}
                  </div>
                </div>

                <div className="credential-actions">
                  {(isImage || isPdf) && (
                    <button
                      type="button"
                      onClick={() => handlePreview(credential)}
                    >
                      预览
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDownload(credential)}
                  >
                    下载
                  </button>
                  <button
                    type="button"
                    className="credential-delete-button"
                    onClick={() => setDeletingCredential(credential)}
                  >
                    删除
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* 上传弹窗 */}
      {showUploadModal && (
        <div
          className="credentials-modal-backdrop"
          onClick={closeUploadModal}
        >
          <div
            className="credentials-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="credentials-modal-heading">
              <div>
                <h2>上传购物凭证</h2>
                <p>支持 JPG、PNG、WEBP 和 PDF，最大 10MB</p>
              </div>
              <button
                type="button"
                className="credentials-close-button"
                disabled={uploading}
                onClick={closeUploadModal}
              >
                ×
              </button>
            </div>

            {error && (
              <div className="credentials-alert credentials-alert-error">
                {error}
              </div>
            )}

            <label className="credentials-field-label">
              选择凭证文件
            </label>

            <div
              className="credentials-upload-area"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="credentials-upload-icon">↑</span>
              <strong>
                {selectedFile ? selectedFile.name : '点击选择文件'}
              </strong>
              <span>
                {selectedFile
                  ? formatFileSize(selectedFile.size)
                  : '支持图片或 PDF 文件'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                hidden
                onChange={handleFileChange}
              />
            </div>

            <label className="credentials-field-label" htmlFor="credential-product">
              关联商品（可选）
            </label>

            <select
              id="credential-product"
              className="credentials-product-select"
              value={uploadProductId}
              onChange={(event) => setUploadProductId(event.target.value)}
            >
              <option value="">暂不关联商品</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>

            <div className="credentials-modal-actions">
              <button
                type="button"
                className="credentials-secondary-button"
                disabled={uploading}
                onClick={closeUploadModal}
              >
                取消
              </button>
              <button
                type="button"
                className="credentials-primary-button"
                disabled={!selectedFile || uploading}
                onClick={handleUpload}
              >
                {uploading ? '上传中...' : '确认上传'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 图片/PDF 预览弹窗 */}
      {previewCredential && (
        <div
          className="credentials-modal-backdrop credentials-preview-backdrop"
          onClick={closePreview}
        >
          <div
            className="credentials-preview-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="credentials-preview-header">
              <strong>{previewCredential.file_name}</strong>
              <button
                type="button"
                className="credentials-close-button"
                onClick={closePreview}
              >
                ×
              </button>
            </div>

            <div className="credentials-preview-content">
              {previewLoading ? (
                <p>正在加载预览...</p>
              ) : previewUrl ? (
                previewCredential.content_type?.startsWith('image/') ? (
                  <img src={previewUrl} alt={previewCredential.file_name} />
                ) : (
                  <iframe
                    src={previewUrl}
                    title={previewCredential.file_name}
                  />
                )
              ) : (
                <p>无法加载文件预览</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deletingCredential && (
        <div
          className="credentials-modal-backdrop"
          onClick={() => {
            if (!deleting) setDeletingCredential(null)
          }}
        >
          <div
            className="credentials-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>确认删除凭证？</h3>
            <p>
              确定删除「{deletingCredential.file_name}」吗？
              删除后无法恢复。
            </p>
            <div className="credentials-modal-actions">
              <button
                type="button"
                className="credentials-secondary-button"
                disabled={deleting}
                onClick={() => setDeletingCredential(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="credentials-danger-button"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
