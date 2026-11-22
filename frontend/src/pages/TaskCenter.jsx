import { useCallback, useEffect, useMemo, useState, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { taskApi } from '../api/tasks.js'
import '../styles/task-center.css'
import { getProductList } from '../api/product.js'
import { aftercareApi } from '../api.js'

const PAGE_SIZE = 10

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'medium',
  scheduled_at: '',
  reminder_at: '',
  product_id: '',
  aftercare_id: '',
}

const STATUS = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
}

const PRIORITY = {
  low: '低',
  medium: '中',
  high: '高',
}

const formatDate = (value) => {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间格式异常'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const toDateTimeLocal = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

/* =========================================================
   全窗口形变弹层：触发按钮直接扩展为全屏遮罩，内容在视口中央出现
   ========================================================= */
function MorphViewport({ anchorRect, expanded, children, onBackdropMouseDown, className = '' }) {
  const viewportRef = useRef(null)
  const [entered, setEntered] = useState(false)

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el || !anchorRect) return
    el.style.left = `${anchorRect.left}px`
    el.style.top = `${anchorRect.top}px`
    el.style.width = `${anchorRect.width}px`
    el.style.height = `${anchorRect.height}px`
    el.style.borderRadius = `${Math.max(8, anchorRect.height / 2)}px`
  }, [anchorRect])

  useEffect(() => {
    if (!expanded) {
      setEntered(false)
      return undefined
    }
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [expanded])

  // 弹层必须挂载到 body，而不是任务页面内部：
  // 页面祖先节点若存在 transform / filter / overflow，会改变 fixed 的定位基准，
  // 导致“全屏”只覆盖页面局部、或弹窗无法真正处于浏览器视口中心。
  useEffect(() => {
    if (!expanded) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [expanded])

  return createPortal(
    <div
      ref={viewportRef}
      className={`task-morph-viewport ${expanded && entered ? 'is-expanded' : ''} ${className}`}
      onMouseDown={(event) => {
        if (!event.target.closest?.('.task-modal, .task-morph-card')) {
          onBackdropMouseDown?.(event)
        }
      }}
    >
      <div className="task-morph-viewport-content">{children}</div>
    </div>,
    document.body,
  )
}

/* =========================================================
   形变确认卡片组件
   ========================================================= */
function MorphConfirm({
  type,
  title,
  description,
  confirmText,
  cancelText,
  anchorRect,
  onConfirm,
  onClose,
}) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const closeTimer = useRef(null)

  useEffect(() => {
    const firstFrame = requestAnimationFrame(() => {
      const secondFrame = requestAnimationFrame(() => setExpanded(true))
      return () => cancelAnimationFrame(secondFrame)
    })
    return () => cancelAnimationFrame(firstFrame)
  }, [anchorRect])

  const handleClose = useCallback((force = false) => {
    if (busy && !force) return
    setExpanded(false)
    clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => {
      onClose()
    }, 500)
  }, [busy, onClose])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleClose])

  const handleConfirm = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
      handleClose(true)
    } catch (err) {
      setBusy(false)
    }
  }

  const themeClass = `task-morph--${type}`

  return (
    <MorphViewport
      anchorRect={anchorRect}
      expanded={expanded}
      className={`task-morph ${themeClass}`}
      onBackdropMouseDown={handleClose}
    >
      <div className={`task-morph-card ${expanded ? 'is-visible' : ''}`}>
        <button
          type="button"
          className="task-morph-close"
          aria-label="关闭"
          onClick={handleClose}
        >
          ✕
        </button>
        <div className="task-morph-title">{title}</div>
        <p className="task-morph-desc">{description}</p>
        <div className="task-morph-actions">
          <button
            type="button"
            className="task-morph-btn task-morph-btn--keep"
            onClick={handleClose}
            disabled={busy}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className="task-morph-btn task-morph-btn--confirm"
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? '处理中...' : confirmText}
          </button>
        </div>
      </div>
    </MorphViewport>
  )
}

/* =========================================================
   任务中心主组件
   ========================================================= */
function TaskCenter({ targetSourceKey = null }) {
  const [tasks, setTasks] = useState([])
  // 用于定位目标任务卡片
  const targetTaskRef = useRef(null)
  const [total, setTotal] = useState(0)
  const [taskStats, setTaskStats] = useState({
    total: 0,
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    overdue: 0,
    high_priority: 0,
  })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modalError, setModalError] = useState('')
  const [modalAuthError, setModalAuthError] = useState('')
  const [celebratingTaskId, setCelebratingTaskId] = useState(null)

  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [modalAnchorRect, setModalAnchorRect] = useState(null)
  const [modalClosing, setModalClosing] = useState(false)
  const [completionAnchorRect, setCompletionAnchorRect] = useState(null)
  const [completionClosing, setCompletionClosing] = useState(false)
  const modalCloseTimer = useRef(null)
  const completionCloseTimer = useRef(null)
  const [editingTask, setEditingTask] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [products, setProducts] = useState([])
  const [productKeyword, setProductKeyword] = useState('')
  const [productLoading, setProductLoading] = useState(false)

  const [aftercareRecords, setAftercareRecords] = useState([])
  const [aftercareLoading, setAftercareLoading] = useState(false)

  const [missingProductId, setMissingProductId] = useState(null)
  const [missingAftercareId, setMissingAftercareId] = useState(null)

  const [completionTask, setCompletionTask] = useState(null)
  const [completionResult, setCompletionResult] = useState('')

  const productIdRef = useRef('')
  const aftercareIdRef = useRef('')

  // 形变确认卡片状态
  const [morph, setMorph] = useState(null)

  // 当前展开“更多操作”菜单的任务 ID；同一时间只允许展开一个菜单
  const [openActionMenuId, setOpenActionMenuId] = useState(null)

  useEffect(() => () => {
    clearTimeout(modalCloseTimer.current)
    clearTimeout(completionCloseTimer.current)
  }, [])

  useEffect(() => {
    productIdRef.current = form.product_id
  }, [form.product_id])

  useEffect(() => {
    aftercareIdRef.current = form.aftercare_id
  }, [form.aftercare_id])

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await taskApi.list({
        page,
        page_size: PAGE_SIZE,
        keyword: keyword.trim() || undefined,
        status: status || undefined,
        priority: priority || undefined,
        source_key:targetSourceKey || undefined
      })
      setTasks(Array.isArray(result?.items) ? result.items : [])
      setTotal(Number(result?.total ?? 0))
    } catch (err) {
      setError(err.message || '任务加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [page, keyword, status, priority,targetSourceKey])

  const loadTaskStats = useCallback(async () => {
    try {
      const result = await taskApi.getStats()
      setTaskStats({
        total: Number(result?.total ?? 0),
        pending: Number(result?.pending ?? 0),
        in_progress: Number(result?.in_progress ?? 0),
        completed: Number(result?.completed ?? 0),
        cancelled: Number(result?.cancelled ?? 0),
        overdue: Number(result?.overdue ?? 0),
        high_priority: Number(result?.high_priority ?? 0),
      })
    } catch (err) {
      setError(err.message || '任务统计数据加载失败。')
    }
  }, [])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  useEffect(() => {
    loadTaskStats()
  }, [loadTaskStats])

  useEffect(() => {
    if (!modalOpen) return undefined
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setProductLoading(true)
      try {
        const result = await getProductList(
          {
            page: 1,
            page_size: 100,
            keyword: productKeyword.trim() || undefined,
          },
          { signal: controller.signal }
        )
        if (!controller.signal.aborted) {
          const items = Array.isArray(result?.items) ? result.items : []
          setProducts(items)
          if (!productKeyword.trim() && productIdRef.current) {
            const stillExists = items.some(
              (item) => String(item.id) === String(productIdRef.current)
            )
            setMissingProductId(stillExists ? null : Number(productIdRef.current))
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setModalError(err.message || '商品列表加载失败。')
        }
      } finally {
        if (!controller.signal.aborted) {
          setProductLoading(false)
        }
      }
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [modalOpen, productKeyword])

  useEffect(() => {
    if (!modalOpen) return undefined
    const currentProductId = form.product_id
    if (!currentProductId) {
      setAftercareRecords([])
      setMissingAftercareId(null)
      return undefined
    }
    const controller = new AbortController()
    setAftercareLoading(true)
    const loadRecords = async () => {
      try {
        const result = await aftercareApi.list(
          {
            page: 1,
            page_size: 100,
            product_id: Number(currentProductId),
          },
          { signal: controller.signal }
        )
        if (!controller.signal.aborted) {
          const items = Array.isArray(result?.items) ? result.items : []
          setAftercareRecords(items)
          const currentAftercareId = aftercareIdRef.current
          setMissingAftercareId(
            currentAftercareId &&
              !items.some((item) => String(item.id) === String(currentAftercareId))
              ? Number(currentAftercareId)
              : null
          )
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setModalError(err.message || '售后记录加载失败。')
        }
      } finally {
        if (!controller.signal.aborted) {
          setAftercareLoading(false)
        }
      }
    }
    loadRecords()
    return () => controller.abort()
  }, [modalOpen, form.product_id])

  useEffect(() => {
    const closeNativeDatePicker = (event) => {
      const active = document.activeElement
      if (
        active?.matches?.('input[type="datetime-local"]') &&
        !event.target.closest?.('.task-datetime-field')
      ) {
        active.blur()
      }
    }
    document.addEventListener('pointerdown', closeNativeDatePicker, true)
    return () => document.removeEventListener('pointerdown', closeNativeDatePicker, true)
  }, [])

  // 从工作台提醒进入任务中心时，清除旧筛选条件
    useEffect(() => {
      if (!targetSourceKey) return

      setPage(1)
      setKeyword('')
      setStatus('')
      setPriority('')
    }, [targetSourceKey])


  // 更多操作菜单：点击菜单外部或按 ESC 时收起
  useEffect(() => {
    if (openActionMenuId === null) return undefined

    const closeMenuOnOutside = (event) => {
      if (!event.target.closest?.('.task-actions-menu')) {
        setOpenActionMenuId(null)
      }
    }
    const closeMenuOnEscape = (event) => {
      if (event.key === 'Escape') setOpenActionMenuId(null)
    }

    document.addEventListener('pointerdown', closeMenuOnOutside)
    document.addEventListener('keydown', closeMenuOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeMenuOnOutside)
      document.removeEventListener('keydown', closeMenuOnEscape)
    }
  }, [openActionMenuId])

  // 目标任务加载完成后，滚动到对应卡片
    useEffect(() => {
      if (!targetSourceKey || loading) return

      const targetTask = tasks.find(
        (task) => task.source_key === targetSourceKey
      )

      if (targetTask) {
        targetTaskRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }
    }, [targetSourceKey, tasks, loading])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const stats = useMemo(() => {
    const activeTotal = taskStats.total - taskStats.cancelled
    return {
      pending: taskStats.pending,
      progress: taskStats.in_progress,
      completed: taskStats.completed,
      cancelled: taskStats.cancelled,
      overdue: taskStats.overdue,
      highPriority: taskStats.high_priority,
      rate:
        activeTotal > 0
          ? Math.round((taskStats.completed / activeTotal) * 100)
          : 0,
    }
  }, [taskStats])

  const openCreate = (event) => {
    const rect = event?.currentTarget?.getBoundingClientRect?.()
    if (rect) setModalAnchorRect(rect)
    setModalClosing(false)
    setOpenActionMenuId(null)
    setEditingTask(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalError('')
    setModalAuthError('')
    setModalOpen(true)
    setProductKeyword('')
    setProducts([])
    setAftercareRecords([])
    setMissingProductId(null)
    setMissingAftercareId(null)
  }

  const openEdit = (task, anchorEl) => {
    const rect = anchorEl?.getBoundingClientRect?.()
    if (rect) setModalAnchorRect(rect)
    setModalClosing(false)
    setOpenActionMenuId(null)
    setEditingTask(task)
    setForm({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'medium',
      scheduled_at: toDateTimeLocal(task.scheduled_at),
      reminder_at: toDateTimeLocal(task.reminder_at),
      product_id: task.product_id ?? '',
      aftercare_id: task.aftercare_id ?? '',
    })
    setError('')
    setModalError('')
    setModalAuthError('')
    setModalOpen(true)
    setProductKeyword('')
    setProducts([])
    setAftercareRecords([])
    setMissingProductId(null)
    setMissingAftercareId(null)
  }

  const closeTaskModal = () => {
    setModalClosing(true)
    clearTimeout(modalCloseTimer.current)
    modalCloseTimer.current = window.setTimeout(() => {
      setModalOpen(false)
      setModalClosing(false)
      setModalAnchorRect(null)
    }, 500)
  }

  const closeCompletionModal = () => {
    setCompletionClosing(true)
    clearTimeout(completionCloseTimer.current)
    completionCloseTimer.current = window.setTimeout(() => {
      setCompletionTask(null)
      setCompletionResult('')
      setCompletionClosing(false)
      setCompletionAnchorRect(null)
    }, 500)
  }

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setModalError('')
  }

  const saveTask = async (event) => {
    event.preventDefault()
    if (!form.title.trim()) {
      setModalError('请填写任务名称。')
      setModalAuthError('')
      return
    }
    setBusy(true)
    setModalError('')
    setModalAuthError('')
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
      scheduled_at: form.scheduled_at
        ? new Date(form.scheduled_at).toISOString()
        : null,
      reminder_at: form.reminder_at
        ? new Date(form.reminder_at).toISOString()
        : null,
      product_id: form.product_id ? Number(form.product_id) : null,
      aftercare_id: form.aftercare_id ? Number(form.aftercare_id) : null,
    }
    try {
      if (editingTask) {
        await taskApi.update(editingTask.id, payload)
        setNotice('任务已更新。')
      } else {
        await taskApi.create(payload)
        setNotice('任务已创建。')
        setPage(1)
      }
      closeTaskModal()
      await Promise.all([loadTasks(), loadTaskStats()])
    } catch (err) {
      const message = err.message || '保存任务失败。'
      const authStatus = [401, 403].includes(
        Number(err.status ?? err.response?.status)
      )
      const isAuthError =
        authStatus ||
        /登录|认证|身份|会话|token|令牌|auth|session|unauthori[sz]ed|forbidden|\b401\b|\b403\b|过期/i.test(
          message
        )
      if (isAuthError) {
        setModalAuthError(message)
        setModalError('')
      } else {
        setModalError(message)
        setModalAuthError('')
      }
    } finally {
      setBusy(false)
    }
  }

  const submitTaskCompletion = async (event) => {
    event.preventDefault()
    if (!completionTask) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await taskApi.update(completionTask.id, {
        status: 'completed',
        result: completionResult.trim() || null,
      })
      closeCompletionModal()
      setNotice('任务已完成，处理结果已保存。')
      setCelebratingTaskId(completionTask.id)
      window.setTimeout(() => setCelebratingTaskId(null), 320)
      await Promise.all([loadTasks(), loadTaskStats()])
    } catch (err) {
      setError(err.message || '提交任务完成结果失败。')
    } finally {
      setBusy(false)
    }
  }

  const handleTaskCheck = async (task, anchorEl) => {
    if (task.status === 'in_progress') {
      const rect = anchorEl?.getBoundingClientRect?.()
      if (rect) setCompletionAnchorRect(rect)
      setCompletionClosing(false)
      setCompletionTask(task)
      setCompletionResult(task.result || '')
      return
    }
    const nextStatus =
      task.status === 'pending'
        ? 'in_progress'
        : task.status === 'completed'
        ? 'in_progress'
        : null
    if (!nextStatus) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await taskApi.update(task.id, { status: nextStatus })
      setNotice(
        task.status === 'completed'
          ? '已撤销完成状态，任务恢复为进行中。'
          : '已开始处理这项任务。'
      )
      await Promise.all([loadTasks(), loadTaskStats()])
    } catch (err) {
      setError(err.message || '任务状态更新失败。')
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = async (task, nextStatus) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await taskApi.update(task.id, { status: nextStatus })
      setNotice(
        nextStatus === 'pending' ? '任务已恢复到待处理。' : '任务已取消。'
      )
      await Promise.all([loadTasks(), loadTaskStats()])
    } catch (err) {
      setError(err.message || '状态更新失败。')
    } finally {
      setBusy(false)
    }
  }

  const deleteTask = async (task) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await taskApi.remove(task.id)
      setNotice('任务已删除。')
      await loadTaskStats()  //刷新统计
      if (tasks.length === 1 && page > 1) {
        setPage((current) => current - 1)
      } else {
        await loadTasks()
      }
    } catch (err) {
      setError(err.message || '删除任务失败。')
    } finally {
      setBusy(false)
    }
  }

  const clearFilters = () => {
    setKeyword('')
    setStatus('')
    setPriority('')
    setPage(1)
  }

  /* 打开形变确认卡片 */
  const openMorph = (type, task, anchorEl) => {
    setOpenActionMenuId(null)
    if (type === 'edit') {
      openEdit(task, anchorEl)
      return
    }
    const rect = anchorEl.getBoundingClientRect()
    const configs = {
      cancel: {
        title: '取消这个任务？',
        description: '任务会标记为已取消，之后仍可从“已取消”状态恢复。',
        confirmText: '确认取消',
        cancelText: '保留任务',
      },
      restore: {
        title: '恢复这个任务？',
        description: '任务会回到待处理状态，可以重新开始安排处理。',
        confirmText: '恢复任务',
        cancelText: '暂不恢复',
      },
      delete: {
        title: '删除这个任务？',
        description: '任务以及它的处理结果会一起被移除，此操作无法撤销。',
        confirmText: '确认删除',
        cancelText: '保留任务',
      },
    }
    const config = configs[type]
    setMorph({
      type,
      task,
      rect,
      ...config,
    })
  }

  const handleMorphConfirm = async () => {
    if (!morph) return
    const { type, task } = morph
    if (type === 'cancel') {
      await changeStatus(task, 'cancelled')
    } else if (type === 'restore') {
      await changeStatus(task, 'pending')
    } else if (type === 'delete') {
      await deleteTask(task)
    }
  }

  return (
    <section className="task-center">
      <header className="task-header">
        <div>
          <div className="eyebrow">YOUR ACTION PLAN</div>
          <h1>任务工作台</h1>
          <p>把需要处理的小事安排好，一件一件完成。</p>
        </div>
        <button className="task-primary-btn" onClick={openCreate}>
          ＋ 创建任务
        </button>
      </header>

      {(error || notice) && (
        <div
          className={`task-message ${error ? 'is-error' : 'is-success'}`}
          role="status"
        >
          <span>{error || notice}</span>
          <button
            aria-label="关闭提示"
            onClick={() => {
              setError('')
              setNotice('')
            }}
          >
            ×
          </button>
        </div>
      )}

      <div className="task-stats">
        <article className="task-stat-card task-stat-card--all">
          <span>全部任务</span>
          <strong>{taskStats.total}</strong>
        </article>
        <article className="task-stat-card task-stat-card--pending">
          <span>待处理</span>
          <strong>{stats.pending}</strong>
        </article>
        <article className="task-stat-card task-stat-card--progress">
          <span>进行中</span>
          <strong>{stats.progress}</strong>
        </article>
        <article className="task-stat-card task-stat-card--completed">
          <span>已完成</span>
          <strong>{stats.completed}</strong>
        </article>
      </div>

      <div className="task-dashboard">
        <article className="task-panel task-completion">
          <div>
            <div className="eyebrow">CURRENT PAGE</div>
            <h3>任务完成率</h3>
{/*             <p>已完成任务占比</p> */}
          </div>
          <div
            className="task-donut"
            style={{ '--completion': `${stats.rate}%` }}
          >
            <div>
              <strong>{stats.rate}%</strong>
              <small>完成率</small>
            </div>
          </div>
        </article>

        <article className="task-panel">
          <div className="task-panel-heading">
            <h3>全部任务状态</h3>
            <span>{taskStats.total} 项</span>
          </div>

          {[
            ['待处理', stats.pending, '#d9b56e'],
            ['进行中', stats.progress, '#83a5b8'],
            ['已完成', stats.completed, '#71977a'],
            ['已取消', stats.cancelled, '#b7a9a0'],
          ].map(([label, count, color]) => (
            <div className="task-bar-row" key={label}>
              <span>{label}</span>
              <div className="task-bar-track">
                <i
                  style={{
                    width: `${
                      taskStats.total ? (count / taskStats.total) * 100 : 0
                    }%`,
                    background: color,
                  }}
                />
              </div>
              <strong>{count}</strong>
            </div>
          ))}
        </article>
      </div>

      <div className="task-list-heading">
        <div>
          <div className="eyebrow">TASK MANAGEMENT</div>
          <h2>任务清单</h2>
        </div>
        <span>共 {total} 项</span>
      </div>

      <div className="task-query">
        <input
          value={keyword}
          placeholder="搜索任务名称或描述..."
          onChange={(event) => {
            setKeyword(event.target.value)
            setPage(1)
          }}
        />

        <select
          value={status}
          aria-label="按状态筛选"
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={priority}
          aria-label="按优先级筛选"
          onChange={(event) => {
            setPriority(event.target.value)
            setPage(1)
          }}
        >
          <option value="">优先级</option>
          {Object.entries(PRIORITY).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>

        <button onClick={clearFilters}>重置</button>
        <button onClick={() => Promise.all([loadTasks(), loadTaskStats()])} disabled={loading}>
          ↻ 刷新
        </button>
      </div>

      <div className="task-list">
        {loading ? (
          <div className="task-empty">正在加载任务...</div>
        ) : tasks.length === 0 ? (
          <div className="task-empty">
              <span>✳</span>

              {targetSourceKey ? (
                <>
                  <strong>暂未找到关联的系统任务</strong>
                  <p>这条售后期限提醒暂时没有对应任务，请刷新后重试。</p>
                </>
              ) : (
                <>
                  <strong>这里还没有任务</strong>
                  <p>创建一个任务，开始安排接下来的行动。</p>
                  <button className="task-primary-btn" onClick={openCreate}>
                    ＋ 创建第一个任务
                  </button>
                </>
              )}
            </div>
        ) : (
          tasks.map((task) => {
            const isCompleted = task.status === 'completed'
            const canCheck = ['pending', 'in_progress', 'completed'].includes(
              task.status
            )

            return (
              <article
                  ref={
                    task.source_key === targetSourceKey
                      ? targetTaskRef
                      : null
                  }
                  className={`task-item ${
                    isCompleted ? 'is-completed' : ''
                  } ${
                    task.source_key === targetSourceKey
                      ? 'is-deadline-target'
                      : ''
                  }`}
                  key={task.id}
                >
                <div className="task-item-main">
                  {canCheck && (
                    <button
                      type="button"
                      className={`task-status-action ${task.status} ${
                        celebratingTaskId === task.id ? 'is-celebrating' : ''
                      }`}
                      disabled={busy}
                      onClick={(e) => handleTaskCheck(task, e.currentTarget)}
                      aria-label={`${
                        {
                          pending: '开始行动',
                          in_progress: '标记完成',
                          completed: '撤销完成',
                        }[task.status]
                      }：${task.title}`}
                      title={
                        {
                          pending: '开始处理这项任务',
                          in_progress: '将任务标记为已完成',
                          completed: '撤销完成，恢复为进行中',
                        }[task.status]
                      }
                    >
                      <span
                        className="task-status-action-icon"
                        aria-hidden="true"
                      >
                        {task.status === 'pending' && '▶'}
                        {task.status === 'completed' && '✓'}
                      </span>
                      <span className="task-status-action-label">
                        {
                          {
                            pending: '开始行动',
                            in_progress: '标记完成',
                            completed: '撤销完成',
                          }[task.status]
                        }
                      </span>
                    </button>
                  )}

                  <div className="task-item-content">
                    <div className="task-item-title">
                      <h3>{task.title}</h3>
                      <span className={`task-status ${task.status}`}>
                        {STATUS[task.status] || task.status}
                      </span>
                      <span className={`task-priority ${task.priority}`}>
                        {PRIORITY[task.priority] || task.priority}
                      </span>
                    </div>

                    {task.description && <p>{task.description}</p>}

                    <div className="task-meta">
                      <span>计划：{formatDate(task.scheduled_at)}</span>
                      <span>提醒：{formatDate(task.reminder_at)}</span>
                      <span>
                        来源：
                        {task.source_type === 'system'
                          ? '系统'
                          : task.source_type === 'ai'
                          ? 'AI'
                          : '手动'}
                      </span>
                      {isCompleted && task.completed_at && (
                        <span>完成于：{formatDate(task.completed_at)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="task-item-actions-panel">
                  {/* 高频操作保留在外层，低频操作收进“更多”菜单 */}
                  <button
                    type="button"
                    className="task-action-btn task-action-btn--edit task-action-btn--compact"
                    disabled={busy}
                    onClick={(e) => openMorph('edit', task, e.currentTarget)}
                    aria-label={`编辑任务：${task.title}`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 20h4l10-10-4-4L4 16v4Z" />
                      <path d="M13.5 6.5l4 4" />
                    </svg>
                    <span>编辑</span>
                  </button>

                  <div
                    className={`task-actions-menu ${
                      openActionMenuId === task.id ? 'is-open' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="task-action-btn task-action-btn--more"
                      disabled={busy}
                      aria-haspopup="menu"
                      aria-expanded={openActionMenuId === task.id}
                      aria-label="更多任务操作"
                      onClick={() =>
                        setOpenActionMenuId((current) =>
                          current === task.id ? null : task.id
                        )
                      }
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <circle cx="5" cy="12" r="1.7" />
                        <circle cx="12" cy="12" r="1.7" />
                        <circle cx="19" cy="12" r="1.7" />
                      </svg>
                      <span>更多</span>
                    </button>

                    <div className="task-actions-dropdown" role="menu">
                      {task.status === 'cancelled' && (
                        <button
                          type="button"
                          role="menuitem"
                          className="task-actions-dropdown-item task-actions-dropdown-item--restore"
                          disabled={busy}
                          onClick={(e) => {
                            setOpenActionMenuId(null)
                            openMorph('restore', task, e.currentTarget)
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
                            <path d="M4 4.5V10h5.5" />
                          </svg>
                          <span>恢复待处理</span>
                        </button>
                      )}

                      {['pending', 'in_progress'].includes(task.status) && (
                        <button
                          type="button"
                          role="menuitem"
                          className="task-actions-dropdown-item task-actions-dropdown-item--cancel"
                          disabled={busy}
                          onClick={(e) => {
                            setOpenActionMenuId(null)
                            openMorph('cancel', task, e.currentTarget)
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="8.5" />
                            <path d="M6 6l12 12" />
                          </svg>
                          <span>取消任务</span>
                        </button>
                      )}

                      <button
                        type="button"
                        role="menuitem"
                        className="task-actions-dropdown-item task-actions-dropdown-item--delete"
                        disabled={busy}
                        onClick={(e) => {
                          setOpenActionMenuId(null)
                          openMorph('delete', task, e.currentTarget)
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4.5 7h15" />
                          <path d="M9.5 7V4.5h5V7" />
                          <path d="M6.5 7l1 13h9l1-13" />
                        </svg>
                        <span>删除任务</span>
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>

      {!loading && total > 0 && (
        <div className="task-pagination">
          <span>
            共 {total} 项，第 {page}/{totalPages} 页
          </span>
          <div>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {modalOpen && (
        <MorphViewport
          anchorRect={modalAnchorRect}
          expanded={!modalClosing}
          className="task-form-morph-viewport"
          onBackdropMouseDown={closeTaskModal}
        >
          {modalAuthError && (
            <div className="task-modal-auth-error" role="alert">
              <span>{modalAuthError}</span>
              <button
                type="button"
                aria-label="关闭登录错误提示"
                onClick={() => setModalAuthError('')}
              >
                ×
              </button>
            </div>
          )}
          <form className="task-modal" onSubmit={saveTask}>
            <div className="task-modal-heading">
              <div>
                <div className="eyebrow">TASK DETAILS</div>
                <h2>{editingTask ? '编辑任务' : '创建任务'}</h2>
              </div>
              <button
                type="button"
                disabled={busy}
                aria-label="关闭弹窗"
                onClick={closeTaskModal}
              >
                ×
              </button>
            </div>

            <div className="task-modal-body">
              {modalError && (
                <div className="task-modal-error" role="alert">
                  <span>{modalError}</span>
                  <button
                    type="button"
                    aria-label="关闭错误提示"
                    onClick={() => setModalError('')}
                  >
                    ×
                  </button>
                </div>
              )}

              <label>
                任务名称 <b>*</b>
                <input
                  maxLength={200}
                  aria-invalid={Boolean(modalError)}
                  value={form.title}
                  onChange={(event) => updateField('title', event.target.value)}
                  placeholder="例如：联系商家确认退货进度"
                />
              </label>

              <label>
                任务描述
                <textarea
                  rows="3"
                  value={form.description}
                  onChange={(event) =>
                    updateField('description', event.target.value)
                  }
                  placeholder="补充任务的具体内容..."
                />
              </label>

              <label>
                优先级
                <select
                  value={form.priority}
                  onChange={(event) =>
                    updateField('priority', event.target.value)
                  }
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </label>

              <div className="task-form-grid">
                <label>
                  关联商品（可选）
                  <input
                    type="search"
                    value={productKeyword}
                    placeholder="搜索商品名称或品牌..."
                    onChange={(event) => setProductKeyword(event.target.value)}
                  />
                  <select
                    value={form.product_id}
                    onChange={(event) => {
                      const value = event.target.value
                      setForm((current) => ({
                        ...current,
                        product_id: value,
                        aftercare_id: '',
                      }))
                      setMissingProductId(null)
                      setMissingAftercareId(null)
                      setModalError('')
                    }}
                  >
                    <option value="">不关联商品</option>
                    {missingProductId && (
                      <option value={missingProductId}>
                        原关联商品已不存在（ID：{missingProductId}）
                      </option>
                    )}
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                        {product.brand ? ` · ${product.brand}` : ''}
                      </option>
                    ))}
                  </select>
                  <small className="task-field-hint">
                    {productLoading
                      ? '正在搜索商品...'
                      : `找到 ${products.length} 个商品`}
                  </small>
                </label>

                <label>
                  关联售后记录（可选）
                  <select
                    value={form.aftercare_id}
                    disabled={!form.product_id || aftercareLoading}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        aftercare_id: event.target.value,
                      }))
                      setMissingAftercareId(null)
                      setModalError('')
                    }}
                  >
                    <option value="">
                      {!form.product_id
                        ? '请先选择商品'
                        : aftercareLoading
                        ? '正在加载售后记录...'
                        : '不关联售后记录'}
                    </option>
                    {missingAftercareId && (
                      <option value={missingAftercareId}>
                        原关联售后记录已不存在（ID：{missingAftercareId}）
                      </option>
                    )}
                    {aftercareRecords.map((record) => (
                      <option key={record.id} value={record.id}>
                        {record.title || `售后记录 #${record.id}`}
                      </option>
                    ))}
                  </select>
                  <small className="task-field-hint">
                    {!form.product_id
                      ? '选择商品后才能选择售后记录'
                      : aftercareLoading
                      ? '正在加载关联记录...'
                      : `当前商品有 ${aftercareRecords.length} 条售后记录`}
                  </small>
                </label>
              </div>
            </div>

            <div className="task-modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={closeTaskModal}
              >
                取消
              </button>
              <button className="task-primary-btn" disabled={busy}>
                {busy ? '保存中...' : editingTask ? '保存修改' : '创建任务'}
              </button>
            </div>
          </form>
        </MorphViewport>
      )}

      {completionTask && (
        <MorphViewport
          anchorRect={completionAnchorRect}
          expanded={!completionClosing}
          className="task-form-morph-viewport"
          onBackdropMouseDown={closeCompletionModal}
        >
          <form
            className="task-modal task-completion-modal"
            onSubmit={submitTaskCompletion}
          >
            <div className="task-modal-heading">
              <div>
                <div className="eyebrow">TASK COMPLETION</div>
                <h2>完成任务</h2>
              </div>
              <button
                type="button"
                disabled={busy}
                aria-label="关闭弹窗"
                onClick={closeCompletionModal}
              >
                ×
              </button>
            </div>

            <div className="task-modal-body">
              <div className="task-completion-summary">
                <span>本次完成的任务</span>
                <strong>{completionTask.title}</strong>
              </div>

              <label className="task-result-field">
                处理结果
                <textarea
                  rows={5}
                  maxLength={2000}
                  value={completionResult}
                  onChange={(event) => setCompletionResult(event.target.value)}
                  placeholder="记录一下任务的处理结果，例如：已联系商家，商家同意退款，预计 3 个工作日到账。"
                />
                <small>{completionResult.length}/2000</small>
              </label>
            </div>

            <div className="task-modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={closeCompletionModal}
              >
                暂不完成
              </button>
              <button className="task-primary-btn" disabled={busy}>
                {busy ? '提交中...' : '确认完成'}
              </button>
            </div>
          </form>
        </MorphViewport>
      )}

      {morph && (
        <MorphConfirm
          type={morph.type}
          title={morph.title}
          description={morph.description}
          confirmText={morph.confirmText}
          cancelText={morph.cancelText}
          anchorRect={morph.rect}
          onConfirm={handleMorphConfirm}
          onClose={() => setMorph(null)}
        />
      )}
    </section>
  )
}

export default TaskCenter