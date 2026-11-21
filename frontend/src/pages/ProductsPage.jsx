import { useCallback, useEffect, useState } from 'react'

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
  // 4. 页面提示
  // -----------------------------
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
  function openCreateModal() {
    setForm({ ...EMPTY_FORM })
    setEditingProductId(null)
    setModalType('create')
    setError('')
  }

  /**
   * 打开编辑商品弹窗。
   *
   * 先请求详情，避免只依赖列表中可能不完整的数据。
   */
  async function openEditModal(productId) {
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
    } catch (err) {
      setError(err.message || '商品详情获取失败')
    }
  }

  /**
   * 打开商品详情。
   */
  async function openDetail(productId) {
    setError('')

    try {
      const product = await getProductDetail(productId)
      setDetailProduct(product)
    } catch (err) {
      setError(err.message || '商品详情获取失败')
    }
  }

  /**
   * 关闭表单弹窗。
   */
  function closeModal() {
    setModalType('')
    setEditingProductId(null)
    setForm({ ...EMPTY_FORM })
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
  function openDeleteModel(product) {
    setDeletingProduct(product)
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
      setDeletingProduct(null)

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
                  onClick={() => openDetail(product.id)}
                >
                  详情
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => openEditModal(product.id)}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() => openDeleteModel(product)}
                >
                  删除
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {/* 删除确认弹窗 */}
      {deletingProduct && (
        <div
          className="products-modal-backdrop"
          onClick={() => {
            if (!deleting) {
              setDeletingProduct(null)
            }
          }}
        >
          <div
            className="products-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
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
                onClick={() => setDeletingProduct(null)}
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
        </div>
      )}

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

      {/* 新增 / 编辑弹窗 */}
      {modalType && (
        <div className="products-modal-backdrop">
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

            <form onSubmit={handleSubmit}>
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
        </div>
      )}

      {/* 商品详情弹窗 */}
      {detailProduct && (
        <div className="products-modal-backdrop" onClick={() => setDetailProduct(null)}>
          <div
            className="products-modal products-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="products-modal-heading">
              <div>
                <div className="eyebrow">PRODUCT DETAILS</div>
                <h3>{detailProduct.name}</h3>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={() => setDetailProduct(null)}
              >
                ×
              </button>
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
          </div>
        </div>
      )}
    </section>
  )
}
