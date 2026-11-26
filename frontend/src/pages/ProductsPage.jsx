import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import {
  getProductList,
  createProduct,
  getProductDetail,
  updateProduct,
  deleteProduct,
} from '../api/product.js'

import '../styles/products.css'

// 商品表单初始值。
// 新增商品时使用；编辑时会用已有商品数据覆盖。
const EMPTY_FORM = {
  name: '',
  brand: '',
  model: '',
  category: '',
  purchase_price: '',
  purchase_date: '',
  purchase_channel: '',
  description: '',
}

const PAGE_SIZE = 10

// 形变展开时长，需与 products.css 中的 .5s 保持一致
const MORPH_DURATION = 500

// 将后端返回的日期显示为本地日期。
function formatDate(value, includeTime = false) {
  if (!value) {
    return '未填写'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const options = includeTime
    ? {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }
    : {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }

  return new Intl.DateTimeFormat('zh-CN', options).format(date)
}

function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) {
    return '未知大小'
  }

  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// 金额显示。
function formatPrice(value) {
  if (value === null || value === undefined || value === '') {
    return '未填写'
  }

  return `¥${Number(value).toFixed(2)}`
}

// 商品分类显示。
function getCategoryLabel(category) {
  if (!category) {
    return '未分类'
  }
  return category
}

// 售后记录状态
function getAftercareStatusLabel(status) {
  const labels = {
    pending: '待处理',
    processing: '处理中',
    completed: '已完成',
    cancelled: '已取消',
  }

  return labels[status] || status || '未知状态'
}

// 任务状态
function getTaskStatusLabel(status) {
  const labels = {
    pending: '待开始',
    in_progress: '进行中',
    completed: '已完成',
    cancelled: '已取消',
  }
  return labels[status] || status || '未知状态'
}
// 任务优先级
function getTaskPriorityLabel(priority) {
  const labels = {
    low: '低',
    medium: '普通',
    high: '高',
    urgent: '紧急',
  }
  return labels[priority] || priority || '普通'
}

/**
 * 全窗口形变弹层。
 *
 * 与任务中心保持一致的做法：
 * 1. 通过 Portal 挂到 document.body，彻底摆脱父级 transform / overflow 造成的
 *    包含块囚禁，弹层永远以浏览器视口为参照；
 * 2. 首次渲染时按触发按钮的尺寸与位置落位，两帧后切换 is-expanded，
 *    由 CSS 过渡把这一小块区域形变为全屏遮罩；
 * 3. 内容层尺寸恒定，靠容器裁切逐步露出，收敛过程中不会拉伸变形。
 */
function MorphShell({
  anchorRect,
  expanded,
  onBackdropClose,
  className = '',
  children,
}) {
  const viewportRef = useRef(null)
  const [entered, setEntered] = useState(false)

  // 落位：必须在浏览器绘制前写入，否则会先闪一下全屏再缩回原位
  useLayoutEffect(() => {
    const element = viewportRef.current
    if (!element || !anchorRect) return

    element.style.left = `${anchorRect.left}px`
    element.style.top = `${anchorRect.top}px`
    element.style.width = `${anchorRect.width}px`
    element.style.height = `${anchorRect.height}px`
    element.style.borderRadius = `${Math.max(8, anchorRect.height / 2)}px`
  }, [anchorRect])

  // 双击 rAF：让初始位置先完成一次样式计算，再触发形变过渡
  useEffect(() => {
    if (!expanded) {
      setEntered(false)
      return undefined
    }

    let secondFrame
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setEntered(true))
    })

    return () => {
      cancelAnimationFrame(firstFrame)
      if (secondFrame) cancelAnimationFrame(secondFrame)
    }
  }, [expanded])

  // 形变期间锁住背景滚动
  useEffect(() => {
    if (!expanded) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [expanded])

  // Esc 关闭
  useEffect(() => {
    if (!expanded) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onBackdropClose?.()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [expanded, onBackdropClose])

  return createPortal(
    <div
      ref={viewportRef}
      className={`products-morph-viewport ${entered ? 'is-expanded' : ''} ${className}`}
      onMouseDown={(event) => {
        // 用 mousedown 而非 click：避免在输入框里拖选文本、松手落到浮层上时误关闭
        if (!event.target.closest?.('.products-modal, .products-confirm-modal')) {
          onBackdropClose?.()
        }
      }}
    >
      <div className="products-morph-viewport-content">{children}</div>
    </div>,
    document.body,
  )
}

export default function ProductsPage() {
  // -----------------------------
  // 1. 商品列表数据
  // -----------------------------
  const [products, setProducts] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)

  // -----------------------------
  // 2. 搜索、筛选、排序、分页
  // -----------------------------
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState('desc')
  const [page, setPage] = useState(1)

  // -----------------------------
  // 3. 表单和弹窗状态
  // -----------------------------
  const [modalType, setModalType] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingProductId, setEditingProductId] = useState(null)
  const [detailProduct, setDetailProduct] = useState(null)

  // 删除
  const [deletingProduct, setDeletingProduct] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // -----------------------------
  // 4. 形变弹层状态
  // -----------------------------
  // 每个弹窗各自记录触发按钮的矩形，用于把形变起点对准按钮
  const [modalAnchorRect, setModalAnchorRect] = useState(null)
  const [modalExpanded, setModalExpanded] = useState(false)
  const [detailAnchorRect, setDetailAnchorRect] = useState(null)
  const [detailExpanded, setDetailExpanded] = useState(false)
  const [deleteAnchorRect, setDeleteAnchorRect] = useState(null)
  const [deleteExpanded, setDeleteExpanded] = useState(false)

  // 关闭时先收缩再卸载，退场时表单内容仍然可见，不会突然清空
  const modalCloseTimer = useRef(null)
  const detailCloseTimer = useRef(null)
  const deleteCloseTimer = useRef(null)

  // -----------------------------
  // 5. 页面提示
  // -----------------------------
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(
    () => () => {
      clearTimeout(modalCloseTimer.current)
      clearTimeout(detailCloseTimer.current)
      clearTimeout(deleteCloseTimer.current)
    },
    [],
  )

  /**
   * 获取商品列表。
   *
   * 这里把请求参数统一放在一个对象中，
   * 方便后续增加更多筛选条件。
   */
  const loadProducts = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await getProductList({
        page,
        page_size: PAGE_SIZE,
        keyword,
        category,
        sort_by: sortBy,
        sort_order: sortOrder,
      })

      // 对照 ProductPageResponse：
      // items、total、page、page_size、total_pages。
      setProducts(Array.isArray(result.items) ? result.items : [])
      setTotal(result.total || 0)
      setTotalPages(result.total_pages || 0)
    } catch (err) {
      setError(err.message || '商品列表加载失败')
    } finally {
      setLoading(false)
    }
  }, [page, keyword, category, sortBy, sortOrder])

  /**
   * 页面首次进入，以及查询条件变化时重新请求。
   */
  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  /**
   * 搜索输入防抖。
   *
   * 用户停止输入 300ms 后再真正请求，
   * 避免每输入一个字符就请求一次后端。
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setKeyword(searchInput.trim())
      setPage(1)
    }, 300)

    return () => {
      window.clearTimeout(timer)
    }
  }, [searchInput])

  /**
   * 更新表单字段。
   */
  function handleFormChange(event) {
    const { name, value } = event.target

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }))
  }

  /**
   * 打开新增商品弹窗。
   */
  function openCreateModal(event) {
    const rect = event?.currentTarget?.getBoundingClientRect?.()

    clearTimeout(modalCloseTimer.current)
    if (rect) setModalAnchorRect(rect)

    setForm({ ...EMPTY_FORM })
    setEditingProductId(null)
    setModalType('create')
    setModalExpanded(true)
    setError('')
  }

  /**
   * 打开编辑商品弹窗。
   *
   * 先请求详情，避免只依赖列表中可能不完整的数据。
   * 锚点矩形在请求前先取好，等数据回来再展开。
   */
  async function openEditModal(productId, anchorEl) {
    const rect = anchorEl?.getBoundingClientRect?.()
    if (rect) setModalAnchorRect(rect)
    setError('')

    try {
      const product = await getProductDetail(productId)

      setForm({
        name: product.name || '',
        brand: product.brand || '',
        model: product.model || '',
        category: product.category || '',
        purchase_price:
          product.purchase_price === null ? '' : String(product.purchase_price),
        purchase_date: product.purchase_date || '',
        purchase_channel: product.purchase_channel || '',
        description: product.description || '',
      })

      setEditingProductId(productId)
      setModalType('edit')
      setModalExpanded(true)
    } catch (err) {
      setError(err.message || '商品详情获取失败')
    }
  }

  /**
   * 打开商品详情。
   */
  async function openDetail(productId, anchorEl) {
    const rect = anchorEl?.getBoundingClientRect?.()
    if (rect) setDetailAnchorRect(rect)
    setError('')

    try {
      const product = await getProductDetail(productId)
      setDetailProduct(product)
      setDetailExpanded(true)
    } catch (err) {
      setError(err.message || '商品详情获取失败')
    }
  }

  /**
   * 关闭表单弹窗。
   *
   * 先让形变收回，500ms 后再清理数据：
   * 收缩过程中表单内容仍在，不会出现「弹窗还在、字段已空」的跳变。
   */
  function closeModal() {
    setModalExpanded(false)
    clearTimeout(modalCloseTimer.current)
    modalCloseTimer.current = window.setTimeout(() => {
      setModalType('')
      setEditingProductId(null)
      setForm({ ...EMPTY_FORM })
      setModalAnchorRect(null)
    }, MORPH_DURATION)
  }

  function closeDetail() {
    setDetailExpanded(false)
    clearTimeout(detailCloseTimer.current)
    detailCloseTimer.current = window.setTimeout(() => {
      setDetailProduct(null)
      setDetailAnchorRect(null)
    }, MORPH_DURATION)
  }

  function closeDelete() {
    if (deleting) return
    setDeleteExpanded(false)
    clearTimeout(deleteCloseTimer.current)
    deleteCloseTimer.current = window.setTimeout(() => {
      setDeletingProduct(null)
      setDeleteAnchorRect(null)
    }, MORPH_DURATION)
  }

  /**
   * 提交新增或编辑表单。
   */
  async function handleSubmit(event) {
    event.preventDefault()

    if (!form.name.trim()) {
      setError('请填写商品名称')
      return
    }

    setSubmitting(true)
    setError('')

    // 整理提交数据。
    // 空字符串转为 null，避免把空字符串写入可选字段。
    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      category: form.category.trim() || null,
      purchase_price: form.purchase_price === '' ? null : Number(form.purchase_price),
      purchase_date: form.purchase_date || null,
      purchase_channel: form.purchase_channel.trim() || null,
      description: form.description.trim() || null,
    }

    try {
      if (modalType === 'create') {
        await createProduct(payload)
        setNotice('商品档案创建成功')
      } else if (modalType === 'edit') {
        await updateProduct(editingProductId, payload)
        setNotice('商品档案更新成功')
      }

      closeModal()

      // 保存完成后重新加载列表。
      await loadProducts()
    } catch (err) {
      setError(err.message || '商品保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * 删除商品。
   */
  function openDeleteModel(product, anchorEl) {
    const rect = anchorEl?.getBoundingClientRect?.()
    clearTimeout(deleteCloseTimer.current)
    if (rect) setDeleteAnchorRect(rect)

    setDeletingProduct(product)
    setDeleteExpanded(true)
  }

  async function handleDelete(product) {
    if (!deleteProduct || deleting) {
      return
    }

    setDeleting(true)
    setError('')

    try {
      await deleteProduct(deletingProduct.id)
      setNotice('该商品档案已删除')
      closeDelete()

      // 如果当前页删除后变空，回到上一页。
      if (products.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1)
      } else {
        await loadProducts()
      }
    } catch (err) {
      setError(err.message || '商品删除失败')
    } finally {
      setDeleting(false)
    }
  }

  /**
   * 重置搜索条件。
   */
  function resetFilters() {
    setSearchInput('')
    setKeyword('')
    setCategory('')
    setSortBy('created_at')
    setSortOrder('desc')
    setPage(1)
  }

  return (
    <section className="products-page">
      {/* 页面标题 */}
      <div className="products-heading">
        <div>
          <div className="eyebrow">PRODUCT ARCHIVE</div>
          <h2>商品档案</h2>
          <p>集中管理购买过的商品信息，为售后事项留存依据。</p>
        </div>

        <button type="button" className="primary-button" onClick={openCreateModal}>
          ＋ 新增商品
        </button>
      </div>

      {/* 页面提示 */}
      {error && (
        <div className="products-alert error">
          {error}
          <button type="button" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}

      {notice && (
        <div className="products-alert success">
          {notice}
          <button type="button" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}

      {/* 商品统计 */}
      <div className="products-summary">
        <div>
          <span>商品档案总数</span>
          <strong>{total}</strong>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="products-query-panel">
        <label className="products-search">
          <span>⌕</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="搜索商品名称、品牌、型号..."
          />
          {searchInput && (
            <button type="button" onClick={() => setSearchInput('')}>
              ×
            </button>
          )}
        </label>

        <label className="products-control">
          <span>商品分类</span>
          <input
            type="text"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value)
              setPage(1)
            }}
            placeholder="输入分类名称"
          />
        </label>

        <label className="products-control">
          <span>排序字段</span>
          <select
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value)
              setPage(1)
            }}
          >
            <option value="created_at">创建时间</option>
            <option value="updated_at">更新时间</option>
            <option value="name">商品名称</option>
            <option value="purchase_date">购买日期</option>
            <option value="purchase_price">购买价格</option>
          </select>
        </label>

        <label className="products-control">
          <span>排序方向</span>
          <select
            value={sortOrder}
            onChange={(event) => {
              setSortOrder(event.target.value)
              setPage(1)
            }}
          >
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
        </label>

        <button type="button" className="secondary-button" onClick={resetFilters}>
          重置条件
        </button>
      </div>

      {/* 商品列表 */}
      <div className="products-list">
        {loading ? (
          <div className="products-empty">
            <div className="loader" />
            <p>正在加载商品档案...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="products-empty">
            <div className="products-empty-icon">▤</div>
            <strong>{total > 0 ? '没有找到符合条件的商品' : '还没有商品档案'}</strong>
            <p>
              {total > 0
                ? '可以调整关键词或筛选条件后重试。'
                : '添加商品信息，开始建立你的商品档案。'}
            </p>
            {total === 0 && (
              <button
                type="button"
                className="primary-button compact"
                onClick={openCreateModal}
              >
                ＋ 添加第一件商品
              </button>
            )}
          </div>
        ) : (
          products.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="product-card-icon">{product.name?.slice(0, 1) || '物'}</div>

              <div className="product-card-main">
                <div className="product-card-title">
                  <h3>{product.name}</h3>
                  <span className="product-category">{getCategoryLabel(product.category)}</span>
                </div>

                <p className="product-card-subtitle">
                  {product.brand || '未填写品牌'}
                  {product.model ? ` · ${product.model}` : ''}
                </p>

                <div className="product-card-meta">
                  <span>购买价格：{formatPrice(product.purchase_price)}</span>
                  <span>购买日期：{formatDate(product.purchase_date)}</span>
                  <span>购买渠道：{product.purchase_channel || '未填写'}</span>
                </div>

                {product.description && (
                  <p className="product-description">{product.description}</p>
                )}
              </div>

              <div className="product-card-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={(event) => openDetail(product.id, event.currentTarget)}
                >
                  详情
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={(event) => openEditModal(product.id, event.currentTarget)}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="text-button danger"
                  onClick={(event) => openDeleteModel(product, event.currentTarget)}
                >
                  删除
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {/* 分页 */}
      {!loading && totalPages > 0 && (
        <div className="products-pagination">
          <span>
            共 {total} 件商品，第 {page} / {totalPages} 页
          </span>

          <div>
            <button
              type="button"
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => setPage((currentPage) => currentPage - 1)}
            >
              上一页
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={page >= totalPages}
              onClick={() => setPage((currentPage) => currentPage + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deletingProduct && (
        <MorphShell
          anchorRect={deleteAnchorRect}
          expanded={deleteExpanded}
          className="products-morph--delete"
          onBackdropClose={closeDelete}
        >
          <div className="products-confirm-modal">
            <div className="products-confirm-icon">!</div>
            <h3>确认删除商品？</h3>
            <p>
              确定删除「{deletingProduct.name}」吗？
              删除后将无法恢复，请谨慎操作。
            </p>

            <div className="products-modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={deleting}
                onClick={closeDelete}
              >
                取消
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </MorphShell>
      )}

      {/* 新增 / 编辑弹窗 */}
      {modalType && (
        <MorphShell
          anchorRect={modalAnchorRect}
          expanded={modalExpanded}
          onBackdropClose={closeModal}
        >
          <div className="products-modal">
            <div className="products-modal-heading">
              <div>
                <div className="eyebrow">PRODUCT INFORMATION</div>
                <h3>{modalType === 'create' ? '新增商品' : '编辑商品'}</h3>
              </div>

              <button type="button" className="icon-button" onClick={closeModal}>
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="products-modal-form">
              <div className="products-modal-body">
                <div className="products-form-grid">
                  <label>
                    <span>商品名称 *</span>
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleFormChange}
                      maxLength={200}
                      required
                      placeholder="例如：无线蓝牙耳机"
                    />
                  </label>

                  <label>
                    <span>品牌</span>
                    <input
                      name="brand"
                      value={form.brand}
                      onChange={handleFormChange}
                      maxLength={100}
                      placeholder="例如：Sony"
                    />
                  </label>

                  <label>
                    <span>型号</span>
                    <input
                      name="model"
                      value={form.model}
                      onChange={handleFormChange}
                      maxLength={100}
                      placeholder="商品型号"
                    />
                  </label>

                  <label>
                    <span>分类</span>
                    <input
                      name="category"
                      value={form.category}
                      onChange={handleFormChange}
                      maxLength={100}
                      placeholder="例如：数码产品"
                    />
                  </label>

                  <label>
                    <span>购买价格</span>
                    <input
                      name="purchase_price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.purchase_price}
                      onChange={handleFormChange}
                      placeholder="请输入购买价格"
                    />
                  </label>

                  <label>
                    <span>购买日期</span>
                    <input
                      name="purchase_date"
                      type="date"
                      value={form.purchase_date}
                      onChange={handleFormChange}
                    />
                  </label>

                  <label>
                    <span>购买渠道</span>
                    <input
                      name="purchase_channel"
                      value={form.purchase_channel}
                      onChange={handleFormChange}
                      maxLength={100}
                      placeholder="例如：淘宝、京东、线下门店"
                    />
                  </label>

                  <label className="products-form-full">
                    <span>商品描述 / 备注</span>
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={handleFormChange}
                      rows={4}
                      placeholder="可以填写商品特点、购买说明等信息"
                    />
                  </label>
                </div>
              </div>

              <div className="products-modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeModal}
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="primary-button compact"
                  disabled={submitting}
                >
                  {submitting ? '保存中...' : '保存商品'}
                </button>
              </div>
            </form>
          </div>
        </MorphShell>
      )}

      {/* 商品详情弹窗 */}
      {detailProduct && (
        <MorphShell
          anchorRect={detailAnchorRect}
          expanded={detailExpanded}
          className="products-morph--detail"
          onBackdropClose={closeDetail}
        >
          <div className="products-modal products-detail-modal">
            {/* 弹窗标题 */}
            <div className="products-modal-heading">
              <div>
                <div className="eyebrow">PRODUCT DETAILS</div>
                <h3>{detailProduct.name}</h3>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={closeDetail}
              >
                ×
              </button>
            </div>

            <div className="products-modal-body">
              {/* 商品基础信息 */}
              <section className="products-detail-section">
                <div className="products-section-heading">
                  <h4>商品信息</h4>
                  <span>PRODUCT</span>
                </div>

                <div className="products-detail-grid">
                  <div>
                    <span>品牌</span>
                    <strong>{detailProduct.brand || '未填写'}</strong>
                  </div>

                  <div>
                    <span>型号</span>
                    <strong>{detailProduct.model || '未填写'}</strong>
                  </div>

                  <div>
                    <span>分类</span>
                    <strong>{detailProduct.category || '未分类'}</strong>
                  </div>

                  <div>
                    <span>购买价格</span>
                    <strong>{formatPrice(detailProduct.purchase_price)}</strong>
                  </div>

                  <div>
                    <span>购买日期</span>
                    <strong>{formatDate(detailProduct.purchase_date)}</strong>
                  </div>

                  <div>
                    <span>购买渠道</span>
                    <strong>{detailProduct.purchase_channel || '未填写'}</strong>
                  </div>

                  <div className="products-detail-full">
                    <span>商品描述</span>
                    <p>{detailProduct.description || '暂无描述'}</p>
                  </div>

                  <div>
                    <span>创建时间</span>
                    <strong>{formatDate(detailProduct.created_at, true)}</strong>
                  </div>

                  <div>
                    <span>更新时间</span>
                    <strong>{formatDate(detailProduct.updated_at, true)}</strong>
                  </div>
                </div>
              </section>

              {/* 售后记录 */}
              <section className="products-detail-section">
                <div className="products-section-heading">
                  <h4>售后记录</h4>
                  <span>
                    {(detailProduct.aftercare_records || []).length} 条记录
                  </span>
                </div>

                {(detailProduct.aftercare_records || []).length === 0 ? (
                  <div className="products-related-empty">
                    暂无关联售后记录
                  </div>
                ) : (
                  <div className="products-related-list">
                    {detailProduct.aftercare_records.map((record) => (
                      <article
                        className="products-related-card"
                        key={record.id}
                      >
                        <div className="products-related-main">
                          <strong>{record.title}</strong>

                          <div className="products-related-meta">
                            <span>平台：{record.platform || '未填写'}</span>
                            <span>
                              购买日期：{formatDate(record.purchase_date)}
                            </span>
                            <span>
                              退货截止：{formatDate(record.return_deadline)}
                            </span>
                            <span>
                              保修截止：{formatDate(record.warranty_deadline)}
                            </span>
                          </div>

                          {record.notes && (
                            <p>{record.notes}</p>
                          )}
                        </div>

                        <span className="products-related-status">
                          {getAftercareStatusLabel(record.status)}
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {/* 购物凭证 */}
              <section className="products-detail-section">
                <div className="products-section-heading">
                  <h4>购物凭证</h4>
                  <span>
                    {(detailProduct.credentials || []).length} 份凭证
                  </span>
                </div>

                {(detailProduct.credentials || []).length === 0 ? (
                  <div className="products-related-empty">
                    暂无关联购物凭证
                  </div>
                ) : (
                  <div className="products-related-list">
                    {detailProduct.credentials.map((credential) => (
                      <article
                        className="products-related-card"
                        key={credential.id}
                      >
                        <div className="products-related-main">
                          <strong>{credential.file_name}</strong>

                          <div className="products-related-meta">
                            <span>
                              类型：{credential.content_type || '未知'}
                            </span>
                            <span>
                              大小：{formatFileSize(
                                credential.file_size
                              )}
                            </span>
                            <span>
                              上传时间：{formatDate(credential.created_at, true)}
                            </span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {/* 关联任务 */}
              <section className="products-detail-section">
                <div className="products-section-heading">
                  <h4>关联任务</h4>
                  <span>
                    {(detailProduct.tasks || []).length} 项任务
                  </span>
                </div>

                {(detailProduct.tasks || []).length === 0 ? (
                  <div className="products-related-empty">
                    暂无关联任务
                  </div>
                ) : (
                  <div className="products-related-list">
                    {detailProduct.tasks.map((task) => (
                      <article
                        className="products-related-card"
                        key={task.id}
                      >
                        <div className="products-related-main">
                          <strong>{task.title}</strong>

                          {task.description && (
                            <p>{task.description}</p>
                          )}

                          <div className="products-related-meta">
                            <span>
                              计划时间：{formatDate(task.scheduled_at, true)}
                            </span>
                            <span>
                              提醒时间：{formatDate(task.reminder_at, true)}
                            </span>
                            <span>
                              优先级：{getTaskPriorityLabel(task.priority)}
                            </span>
                          </div>
                        </div>

                        <span className="products-related-status">
                          {getTaskStatusLabel(task.status)}
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </MorphShell>
      )}
    </section>
  )
}
