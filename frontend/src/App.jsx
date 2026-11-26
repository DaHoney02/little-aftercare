import { useCallback, useEffect, useMemo, useState,useRef} from 'react'
import { aftercareApi,taskNotificationApi } from './api.js'
import { useAuth } from './pages/AuthContext.jsx'
import AuthPage from './pages/AuthPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import ProductsPage from './pages/ProductsPage.jsx'
import ProductCredPage from './pages/ProductCredPage.jsx'
import TaskCenter from './pages/TaskCenter.jsx'

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50]

const emptyForm = {
  title: '',
  platform: '',
  purchase_date: '',
  return_deadline: '',
  warranty_deadline: '',
  status: 'pending',
  notes: '',
}

const dateText = (value) => {
  if (!value) return '未设置'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

const dateTimeText = (value) => {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const getErrorMessage = (error, fallback = '操作失败，请稍后重试。') =>
  error?.message || fallback

const APP_ICON_PATHS = {
  layout: 'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z',
  list: 'M9 6h12 M9 12h12 M9 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  package: 'm12 3 9 5-9 5-9-5 9-5z M3 8v9l9 5 9-5V8 M12 13v9 M7.5 5.5l9 5',
  receipt: 'M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z M9 8h6 M9 12h6 M9 16h4',
  user: 'M20 21a8 8 0 0 0-16 0 M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 2.9-.2-.1a1.7 1.7 0 0 0-1.8.1l-.2.1h-3.4l-.1-.2a1.7 1.7 0 0 0-1.5-1l-.2.1-3-1.7.1-.2a1.7 1.7 0 0 0-.1-1.8l-.1-.2v-3.4l.2-.1a1.7 1.7 0 0 0 1-1.5l-.1-.2 1.7-3 .2.1a1.7 1.7 0 0 0 1.8-.1l.2-.1h3.4l.1.2a1.7 1.7 0 0 0 1.5 1l.2-.1 3 1.7-.1.2a1.7 1.7 0 0 0 .1 1.8l.1.2v3.4z',
  bell: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  sparkle: 'm12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z',
  plus: 'M12 5v14 M5 12h14',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  alert: 'M12 3 22 20H2L12 3z M12 9v5 M12 17h.01',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M17 17l4 4',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M5.5 9A7 7 0 0 1 18 6l2 6 M4 12l2 6a7 7 0 0 0 12.5-3',
}

function AppIcon({ name, size = 18, className = '' }) {
  return (
    <svg className={`app-icon ${className}`} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      <path d={APP_ICON_PATHS[name] || APP_ICON_PATHS.sparkle} />
    </svg>
  )
}


function App() {
  const { user, authLoading, logout,updateUser } = useAuth()

  // ---------- 页面数据 ----------
  const [records, setRecords] = useState([])
  const [overview, setOverview] = useState({ upcoming: [], overdue: [] })
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // ---------- 记录列表查询状态 ----------
  const [filter, setFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [deadlineType, setDeadlineType] = useState('all')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // ---------- 弹窗及表单状态 ----------
  const [modal, setModal] = useState(null)
  const [modalError, setModalError] = useState('')
  const [modalAuthError, setModalAuthError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [aiText, setAiText] = useState('')
  const [candidate, setCandidate] = useState(null)
  const [activePage, setActivePage] = useState('overview')
  // 工作台内部视图：总览与全部任务，共用一个导航入口。
  const [workspaceView, setWorkspaceView] = useState('overview')
  // 保存从售后期限提醒进入任务中心时，需要定位的系统任务标识
  const [deadlineTaskSourceKey, setDeadlineTaskSourceKey] = useState(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState(null)
  const [targetTaskId, setTargetTaskId] = useState(null)

  // 登录状态确认后加载数据。此处不把异步函数直接交给 useEffect。
  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    setError('')

    try {
      const [
          recordData,
          deadlineData,
          notificationData,
          taskNotificationData,
        ] = await Promise.all([
          // 当前用户身份由请求头中的 JWT 确定
          aftercareApi.list(),
          aftercareApi.overview(),
          aftercareApi.notifications(),
          taskNotificationApi.list(),
        ])

      // 兼容旧接口直接返回数组，以及包装成 { items: [] } 的接口格式。
      const recordItems = Array.isArray(recordData)
        ? recordData
        : Array.isArray(recordData?.items)
          ? recordData.items
          : []

      setRecords(recordItems)
      setOverview({
        upcoming: Array.isArray(deadlineData?.upcoming) ? deadlineData.upcoming : [],
        overdue: Array.isArray(deadlineData?.overdue) ? deadlineData.overdue : [],
      })

    // 1. 合并售后通知和任务通知
    const mergedNotifications = [
      ...(Array.isArray(notificationData) ? notificationData : []).map((item) => ({
        ...item,
        notification_type: 'aftercare',
      })),

      ...(Array.isArray(taskNotificationData) ? taskNotificationData : []).map((item) => ({
        ...item,
        notification_type: 'task',
      })),
    ]

    // 2. 按创建时间倒序排列，最新通知显示在最前面
    mergedNotifications.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime()
      const timeB = new Date(b.created_at).getTime()

      return timeB - timeA
    })

    // 3. 更新通知状态
    setNotifications(mergedNotifications)
    } catch (err) {
      setError(getErrorMessage(err, '暂时无法连接服务，请确认后端已启动。'))
    } finally {
      setLoading(false)
    }
  }, [])
// 登录状态加载
  useEffect(() => {
    if (!authLoading && user) {
      loadData(true)
    } else if (!authLoading && !user) {
      setLoading(false)
    }
  }, [authLoading, user, loadData])

  const loadNotifications = useCallback(async () => {
      const [aftercareData, taskData] = await Promise.all([
        aftercareApi.notifications(),
        taskNotificationApi.list(),
      ])

      const merged = [
        ...(Array.isArray(aftercareData) ? aftercareData : []).map(
          (item) => ({
            ...item,
            notification_type: 'aftercare',
          }),
        ),

        ...(Array.isArray(taskData) ? taskData : []).map(
          (item) => ({
            ...item,
            notification_type: 'task',
          }),
        ),
      ]

      // 最新通知排在前面
      merged.sort(
        (a, b) =>
          Date.parse(b.created_at || 0) -
          Date.parse(a.created_at || 0),
      )

      setNotifications(merged)
  }, [])

    // 用户保持登录时，每 60 秒刷新一次通知和工作台数据
   useEffect(() => {
      if (authLoading || !user) return

      const timer = window.setInterval(() => {
        loadNotifications()
      }, 60 * 1000)
      return () => window.clearInterval(timer)
   }, [authLoading, user, loadNotifications])

  // 输入停止 300ms 后再更新关键词，避免每次按键都触发列表计算。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setKeyword(searchInput.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  // 改变筛选/排序/每页数量后回到第一页，避免出现空白页。
  useEffect(() => {
    setPage(1)
  }, [filter, deadlineType, sortBy, sortOrder, pageSize, keyword])

  // ---------- 派生列表数据：所有筛选都作用于完整记录集 ----------
  const filteredRecords = useMemo(() => {
    let result = [...records]

    if (filter === 'active') {
      result = result.filter((item) => item.status !== 'completed')
    } else if (filter === 'completed') {
      result = result.filter((item) => item.status === 'completed')
    } else if (filter === 'upcoming') {
      const ids = new Set(overview.upcoming.map((item) => Number(item.record_id)))
      result = result.filter((item) => ids.has(Number(item.id)))
    } else if (filter === 'overdue') {
      const ids = new Set(overview.overdue.map((item) => Number(item.record_id)))
      result = result.filter((item) => ids.has(Number(item.id)))
    }

    if (deadlineType === 'return') {
      result = result.filter((item) => Boolean(item.return_deadline))
    } else if (deadlineType === 'warranty') {
      result = result.filter((item) => Boolean(item.warranty_deadline))
    }

    if (keyword) {
      const normalized = keyword.toLocaleLowerCase()
      result = result.filter((item) => [
        item.title,
        item.platform,
        item.notes,
        item.status,
      ].some((value) => String(value || '').toLocaleLowerCase().includes(normalized)))
    }

    const getSortValue = (item) => {
      if (sortBy === 'title') return String(item.title || '').toLocaleLowerCase()
      if (sortBy === 'purchase_date') return item.purchase_date || ''
      if (sortBy === 'return_deadline') return item.return_deadline || ''
      if (sortBy === 'warranty_deadline') return item.warranty_deadline || ''
      return item.created_at || item.updated_at || item.id || 0
    }

    result.sort((a, b) => {
      const left = getSortValue(a)
      const right = getSortValue(b)
      let comparison
      if (typeof left === 'number' && typeof right === 'number') {
        comparison = left - right
      } else {
        comparison = String(left).localeCompare(String(right), 'zh-CN', {
          numeric: true,
          sensitivity: 'base',
        })
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return result
  }, [records, filter, overview, deadlineType, keyword, sortBy, sortOrder])

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRecords = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredRecords.slice(start, start + pageSize)
  }, [filteredRecords, safePage, pageSize])

  const unreadCount = notifications.filter((item) => item.status === 'unread').length

  // 工作台图表使用已加载的真实记录计算，不额外请求后端。
   const dashboardStats = useMemo(() => {
    const total = records.length
    const completed = records.filter((item) => item.status === 'completed').length
    const processing = records.filter((item) => item.status === 'processing').length
    const pending = records.filter((item) => item.status !== 'completed' && item.status !== 'processing').length
    const max = Math.max(total, 1)
    return {
      total, completed, processing, pending,
      completedRate: Math.round((completed / max) * 100),
      processingRate: Math.round((processing / max) * 100),
      pendingRate: Math.round((pending / max) * 100),
      returnCount: records.filter((item) => Boolean(item.return_deadline)).length,
      warrantyCount: records.filter((item) => Boolean(item.warranty_deadline)).length,
    }
  }, [records])

  const pageTitle = ({
      overview: '工作台',
       records: '我的记录',
       products:'商品档案',
       credentials:'购物凭证',
        profile: '个人中心',
         settings: '偏好设置' ,

         })[activePage] || '工作台'

  // 手动刷新同时重置所有列表查询条件。
  const resetSearchAndRefresh = async () => {
    setSearchInput('')
    setKeyword('')
    setFilter('all')
    setDeadlineType('all')
    setSortBy('created_at')
    setSortOrder('desc')
    setPage(1)
    await loadData(true)
  }

  // ---------- 页面导航 ----------
  const showRecords = (nextFilter = 'all') => {
    setFilter(nextFilter)
    setActivePage('records')
    setPage(1)
  }

  // ---------- 通知 ----------

    // created_at 只解析一次，避免 sort 比较函数里反复 new Date()
    const toTime = (value) => (value ? Date.parse(value) : 0)

    const markingRef = useRef(new Set()) // 在组件顶层，防并发重复请求

    const markNotificationRead = useCallback(
      async (notification) => {
        if (!notification?.id) return

        const key = `${notification.notification_type}:${notification.id}`
        if (markingRef.current.has(key)) return // 同一通知正在处理中，直接丢弃

        setError('')
        markingRef.current.add(key)

        try {
          const updated =
            notification.notification_type === 'task'
              ? await taskNotificationApi.markRead(notification.id)
              : await aftercareApi.markNotificationRead(notification.id)

          setNotifications((current) => {
            let hit = false
            const next = current.map((item) => {
              if (
                item.id === notification.id &&
                item.notification_type === notification.notification_type
              ) {
                hit = true
                return { ...item, ...updated }
              }
              return item
            })
            // 没命中就返回原引用，React 会跳过这次 re-render
            return hit ? next : current
          })
        } catch (err) {
          setError(getErrorMessage(err, '暂时无法更新提醒状态。'))
        } finally {
          markingRef.current.delete(key)
        }
      },
      []
    )

// 区分notification_type
  const openNotification = (item) => {
      setNotificationsOpen(false)

      if (item.notification_type === 'task') {
        setDeadlineTaskSourceKey(null)
        setTargetTaskId(item.task_id)
        setWorkspaceView('tasks')
        setActivePage('overview')
        return
      }

      openRecordById(item.record_id)
  }


  const openRecordById = (recordId) => {
    // 先关闭提醒层，再打开详情层，避免提醒弹窗遮挡详情弹窗。
    setNotificationsOpen(false)
    const record = records.find((item) => Number(item.id) === Number(recordId))
    if (record) setDetailRecord(record)
    else setError('暂时找不到对应记录，请刷新列表后重试。')
  }

      // 点击售后期限提醒，定位对应的系统任务
  const openDeadlineTask = (item) => {
      const deadlineSuffix = {
        return: 'return_deadline',
        warranty: 'warranty_deadline',
      }[item.deadline_type]

      if (!deadlineSuffix || !item.record_id) {
        setError('无法识别这条提醒对应的售后期限。')
        return
      }

      // 与后端自动任务使用相同的 source_key 规则
      const sourceKey = `aftercare:${item.record_id}:${deadlineSuffix}`

      setDeadlineTaskSourceKey(sourceKey)
      setWorkspaceView('tasks')
    }

  // ---------- 售后记录表单 ----------
  const openCreate = () => {
    setForm(emptyForm)
    setModalError('')
    setModalAuthError('')
    setModal({ mode: 'create' })
  }

  const openEdit = (record) => {
    setModalError('')
    setModalAuthError('')
    setForm({
      title: record.title || '',
      platform: record.platform || '',
      purchase_date: record.purchase_date || '',
      return_deadline: record.return_deadline || '',
      warranty_deadline: record.warranty_deadline || '',
      status: record.status || 'pending',
      notes: record.notes || '',
    })
    setModal({ mode: 'edit', record })
  }

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    if (modalError) setModalError('')
    if (modalAuthError) setModalAuthError('')
  }

  const saveRecord = async (event) => {
    event.preventDefault()
    if (!form.title.trim()) {
      setModalError('请填写商品名称。')
      return
    }

    setBusy(true)
    setModalError('')
    setModalAuthError('')
    setError('')
    const payload = {
      ...form,
      title: form.title.trim(),
      platform: form.platform.trim() || null,
      purchase_date: form.purchase_date || null,
      return_deadline: form.return_deadline || null,
      warranty_deadline: form.warranty_deadline || null,
      notes: form.notes.trim() || null,
    }

    try {
      if (modal?.mode === 'edit') {
        const patch = { ...payload }
        delete patch.session_id
        await aftercareApi.update(modal.record.id, null, payload)
        setNotice('记录已更新。')
      } else {
        await aftercareApi.create(payload)
        setNotice('记录已保存。')
      }
      setModal(null)
      await loadData()
    } catch (err) {
      const message = getErrorMessage(err)
      const statusCode = err?.status || err?.response?.status
      const isAuthError = [401, 403].includes(statusCode) || /登录|认证|未授权|token|unauthorized|forbidden/i.test(message)
      if (isAuthError) setModalAuthError(message)
      else setModalError(message)
    } finally {
      setBusy(false)
    }
  }

  const deleteRecord = async (record) => {
    if (!window.confirm(`确定删除「${record.title}」吗？此操作不可撤销。`)) return
    setBusy(true)
    setError('')
    try {
      await aftercareApi.remove(record.id)
      setNotice('记录已删除。')
      await loadData()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // ---------- AI 提取与确认保存 ----------
  const extractWithAi = async (event) => {
    event.preventDefault()
    if (!aiText.trim()) return

    setBusy(true)
    setError('')
    try {
      const result = await aftercareApi.extract(aiText.trim())
      setCandidate(result)
    } catch (err) {
      setError(getErrorMessage(err, 'AI 信息提取失败，请稍后重试。'))
    } finally {
      setBusy(false)
    }
  }

  const saveCandidate = async () => {
    if (!candidate?.title?.trim()) {
      setError('AI 没有识别出商品名称，请补充后再保存。')
      return
    }

    setBusy(true)
    setError('')
    try {
      await aftercareApi.create({
        title: candidate.title.trim(),
        platform: candidate.platform || null,
        purchase_date: candidate.purchase_date || null,
        return_deadline: candidate.return_deadline || null,
        warranty_deadline: candidate.warranty_deadline || null,
        notes: candidate.notes || null,
        status: 'pending',
      })
      setCandidate(null)
      setAiText('')
      setNotice('AI 整理的记录已保存。')
      await loadData()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const updateCandidate = (field, value) => {
    setCandidate((current) => {
      if (!current) return current
      const missing = new Set(current.missing_fields || [])
      const trackable = ['title', 'platform', 'purchase_date', 'return_deadline', 'warranty_deadline']
      if (value && trackable.includes(field)) missing.delete(field)
      else if (!value && trackable.includes(field)) missing.add(field)
      return { ...current, [field]: value, missing_fields: [...missing] }
    })
  }

  // ---------- 登录状态 ----------
  if (authLoading) {
    return <div className="auth-loading">正在确认登录状态…</div>
  }

  if (!user) {
    return <AuthPage />
  }

  return (
    <div className="app-shell">

    <aside className="sidebar">
      <a className="brand" href="#top" aria-label="小事后援首页">
        <span className="brand-mark">小</span>
        <span>
          <strong>小事后援</strong>
          <small>AFTERCARE, MADE EASY</small>
        </span>
      </a>

      <div className="side-label">工作空间</div>

      <nav className="sidebar-nav" aria-label="主导航">
        <button
          className={`nav-item ${activePage === 'overview' ? 'active' : ''}`}
          onClick={() => { setActivePage('overview'); setWorkspaceView('overview') }}
          aria-current={activePage === 'overview' ? 'page' : undefined}
          type="button"
        >
          <AppIcon name="layout" />
          <span className="nav-text">工作台</span>
        </button>

        <button
          className={`nav-item ${activePage === 'records' ? 'active' : ''}`}
          onClick={() => showRecords('all')}
          aria-current={activePage === 'records' ? 'page' : undefined}
          type="button"
        >
          <AppIcon name="list" />
          <span className="nav-text">我的记录</span>
          <i>{records.length}</i>
        </button>

        <button
          className={`nav-item ${activePage === 'products' ? 'active' : ''}`}
          onClick={() => setActivePage('products')}
          aria-current={activePage === 'products' ? 'page' : undefined}
          type="button"
        >
          <AppIcon name="package" />
          <span className="nav-text">商品档案</span>
        </button>

        <button
          className={`nav-item ${activePage === 'credentials' ? 'active' : ''}`}
          onClick={() => setActivePage('credentials')}
          aria-current={activePage === 'credentials' ? 'page' : undefined}
          type="button"
        >
          <AppIcon name="receipt" />
          <span className="nav-text">购物凭证</span>
        </button>

        <button
          className={`nav-item ${activePage === 'profile' ? 'active' : ''}`}
          onClick={() => setActivePage('profile')}
          aria-current={activePage === 'profile' ? 'page' : undefined}
          type="button"
        >
          <AppIcon name="user" />
          <span className="nav-text">个人中心</span>
        </button>

        <button
          className={`nav-item ${activePage === 'settings' ? 'active' : ''}`}
          onClick={() => setActivePage('settings')}
          aria-current={activePage === 'settings' ? 'page' : undefined}
          type="button"
        >
          <AppIcon name="settings" />
          <span className="nav-text">偏好设置</span>
        </button>
      </nav>

      <div className="sidebar-bottom">
        <div className="privacy-icon">✳</div>
        <strong>重要期限，心里有数</strong>
        <p>把购物后的琐碎信息收好，给生活多一点从容。</p>
        <span className="session-tag">
          当前用户 · {user.username || '已登录'}
        </span>
      </div>
    </aside>


      <main className="main-content" id="top">
        <header className="topbar">
          <div className="breadcrumb">小事后援 <span>/</span> {pageTitle}</div>
          <div className="topbar-right">
            <button
              className="notification-trigger"
              onClick={() => setNotificationsOpen(true)}
              aria-label={`打开提醒，${unreadCount} 条未读`}
              type="button"
            >
              <AppIcon name="bell" size={19} />{unreadCount > 0 && <i>{unreadCount > 99 ? '99+' : unreadCount}</i>}
            </button>
            <span className="avatar">{user.username?.slice(0, 1).toUpperCase() || 'U'}</span>
            <span className="current-username">{user.username}</span>
            <button className="auth-logout" onClick={logout} type="button">退出登录</button>
          </div>
        </header>

        {(error || notice) && (
          <div className={`toast ${error ? 'error' : 'success'}`} role="status">
            <span>{error ? '!' : '✓'}</span>{error || notice}
            <button type="button" onClick={() => { setError(''); setNotice('') }}>×</button>
          </div>
        )}

        {activePage === 'overview' && <section className="workspace-page">
          <div className="workspace-switcher" role="tablist" aria-label="工作台视图">
            <button
              type="button"
              role="tab"
              aria-selected={workspaceView === 'overview'}
              className={`workspace-tab ${workspaceView === 'overview' ? 'active' : ''}`}
              onClick={() => setWorkspaceView('overview')}
            >
              <span className="workspace-tab-mark"><AppIcon name="layout" /></span>
              总览
              <small>Overview</small>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceView === 'tasks'}
              className={`workspace-tab ${workspaceView === 'tasks' ? 'active' : ''}`}
              onClick={() => setWorkspaceView('tasks')}
            >
              <span className="workspace-tab-mark"><AppIcon name="list" /></span>
              全部任务
              <small>Tasks</small>
            </button>
          </div>

          {workspaceView === 'overview' ? <>
          <section className="welcome-row" id="overview">
            <div>
              <div className="eyebrow">PERSONAL AFTERCARE</div>
              <h1>把重要的小事，<em>放心交给我。</em></h1>
              <p className="subtitle">购物之后的退换与保修期限，现在一目了然。</p>
            </div>
            <button className="primary-button" onClick={openCreate} type="button"><AppIcon name="plus" size={17} /> 新增记录</button>
          </section>

          <section className="stats-grid">
            <button className="stat-card stat-total clickable-card" onClick={() => showRecords('all')} type="button">
              <div className="stat-icon"><AppIcon name="list" size={20} /></div><span>售后档案 · 查看全部</span>
              <strong>{records.length}<small> 条记录</small></strong><p>点击进入记录管理</p>
            </button>
            <button className="stat-card stat-upcoming clickable-card" onClick={() => showRecords('upcoming')} type="button">
              <div className="stat-icon"><AppIcon name="clock" size={20} /></div><span>7 天内到期 · 点击查看</span>
              <strong>{overview.upcoming.length}<small> 项待关注</small></strong><p>进入相关记录并查看详情</p>
            </button>
            <button className="stat-card stat-overdue clickable-card" onClick={() => showRecords('overdue')} type="button">
              <div className="stat-icon"><AppIcon name="alert" size={20} /></div><span>已经过期 · 点击查看</span>
              <strong>{overview.overdue.length}<small> 项</small></strong>
              <p>{overview.overdue.length ? '进入过期事项记录' : '目前没有过期事项'}</p>
            </button>
          </section>

          <section className="dashboard-visuals">
            <div className="dashboard-chart-card">
              <div className="dashboard-card-heading"><div><div className="eyebrow">RECORD OVERVIEW</div><h2>记录状态分布</h2></div><span>共 {dashboardStats.total} 条记录</span></div>
              <div className="status-chart" role="img" aria-label={`待处理 ${dashboardStats.pending} 条，处理中 ${dashboardStats.processing} 条，已完成 ${dashboardStats.completed} 条`}>
                <div className="status-chart-track">
                  <span className="chart-segment pending-segment" style={{ width: `${dashboardStats.pendingRate}%` }} />
                  <span className="chart-segment processing-segment" style={{ width: `${dashboardStats.processingRate}%` }} />
                  <span className="chart-segment completed-segment" style={{ width: `${dashboardStats.completedRate}%` }} />
                </div>
                <div className="chart-legend">
                  <span><i className="legend-dot pending-dot" />待处理 <strong>{dashboardStats.pending}</strong></span>
                  <span><i className="legend-dot processing-dot" />处理中 <strong>{dashboardStats.processing}</strong></span>
                  <span><i className="legend-dot completed-dot" />已完成 <strong>{dashboardStats.completed}</strong></span>
                </div>
              </div>
            </div>
            <div className="dashboard-chart-card deadline-summary-card">
              <div className="dashboard-card-heading"><div><div className="eyebrow">DEADLINE COVERAGE</div><h2>期限信息概览</h2></div></div>
              <div className="deadline-summary-items">
                <div><span className="summary-icon return-summary-icon">退</span><span>设置退货期限</span><strong>{dashboardStats.returnCount}</strong></div>
                <div><span className="summary-icon warranty-summary-icon">保</span><span>设置保修期限</span><strong>{dashboardStats.warrantyCount}</strong></div>
                <div><span className="summary-icon upcoming-summary-icon">时</span><span>7 天内到期</span><strong>{overview.upcoming.length}</strong></div>
                <div><span className="summary-icon overdue-summary-icon">!</span><span>已过期事项</span><strong>{overview.overdue.length}</strong></div>
              </div>
            </div>
          </section>

          <section className="deadline-grid">
              <DeadlinePanel
                title="即将到期"
                subtitle="点击事项查看关联任务"
                items={overview.upcoming}
                kind="upcoming"
                onItemClick={openDeadlineTask}
              />

              <DeadlinePanel
                title="已过期事项"
                subtitle="点击事项查看关联任务"
                items={overview.overdue}
                kind="overdue"
                onItemClick={openDeadlineTask}
              />
          </section>

          <section className="ai-panel">
            <div className="ai-copy">
              <div className="ai-spark">✦</div>
              <div><div className="eyebrow">SMART ASSISTANT</div><h2>说句话，帮你整理购物信息</h2><p>试着描述商品、平台和售后期限，AI 会整理成一条待确认记录。</p></div>
            </div>
            <form className="ai-form" onSubmit={extractWithAi}>
              <textarea value={aiText} onChange={(event) => setAiText(event.target.value)} placeholder="例如：昨天在京东买了无线耳机，七天内可以退，保修一年……" rows={2} />
              <button className="ai-button" disabled={busy || !aiText.trim()}>{busy ? '整理中…' : <><AppIcon name="sparkle" size={16} /> 智能整理</>}</button>
            </form>
            {candidate && <div className="candidate-card">
              <div className="candidate-head"><strong>请核对 AI 整理结果</strong><button type="button" className="icon-button" onClick={() => setCandidate(null)}>×</button></div>
              <div className="candidate-grid">
                <CandidateField label="商品名称" field="title" value={candidate.title} required onChange={updateCandidate} />
                <CandidateField label="购买平台" field="platform" value={candidate.platform} onChange={updateCandidate} />
                <CandidateField label="购买日期" field="purchase_date" value={candidate.purchase_date} type="date" onChange={updateCandidate} />
                <CandidateField label="退货截止日期" field="return_deadline" value={candidate.return_deadline} type="date" onChange={updateCandidate} />
                <CandidateField label="保修截止日期" field="warranty_deadline" value={candidate.warranty_deadline} type="date" onChange={updateCandidate} />
                <CandidateField label="备注" field="notes" value={candidate.notes} onChange={updateCandidate} />
              </div>
              {candidate.missing_fields?.length > 0 && <p className="missing-note">黄色字段尚未识别，可直接在上方填写：{candidate.missing_fields.map((field) => ({ title: '商品名称', platform: '购买平台', purchase_date: '购买日期', return_deadline: '退货截止日期', warranty_deadline: '保修截止日期' }[field] || field)).join('、')}</p>}
              <div className="candidate-actions">
                <button type="button" className="secondary-button" onClick={() => setCandidate(null)}>取消</button>
                <button type="button" className="primary-button compact" disabled={busy || !candidate.title?.trim()} onClick={saveCandidate}>确认并保存</button>
              </div>
            </div>}
          </section>
          </> : <div className="workspace-task-view">
              <TaskCenter targetSourceKey={deadlineTaskSourceKey} targetTaskId={targetTaskId}/></div>}
        </section>}

        {/* 商品档案页面 */}
        {activePage === 'products' && (
          <ProductsPage />
        )}

        {/* 购物凭证页面 */}
        {activePage === 'credentials' && (
          <ProductCredPage />
        )}

        {activePage === 'records' && <section className="records-section records-page" id="records">
          <div className="section-heading records-heading">
            <div><div className="eyebrow">YOUR PURCHASES</div><h2>售后记录</h2></div>
            <div className="record-heading-actions">
              <span className="records-total">共 {filteredRecords.length} 条</span>
              <button className="refresh-button" onClick={resetSearchAndRefresh} title="刷新并重置搜索条件" type="button"><AppIcon name="refresh" size={15} /> 重置</button>
              <button className="primary-button compact" onClick={openCreate} type="button">＋ 新增记录</button>
            </div>
          </div>

          <div className="record-query-panel">
            <label className="record-search" htmlFor="record-search-input">
              <AppIcon name="search" size={17} />
              <input
                id="record-search-input"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="搜索商品名称、购买平台或备注…"
              />
              {searchInput && <button type="button" onClick={() => setSearchInput('')} aria-label="清空搜索">×</button>}
            </label>
            <label className="query-control">
              <span>期限类型</span>
              <select value={deadlineType} onChange={(event) => setDeadlineType(event.target.value)}>
                <option value="all">全部期限</option>
                <option value="return">有退货期限</option>
                <option value="warranty">有保修期限</option>
              </select>
            </label>
            <label className="query-control">
              <span>排序字段</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="created_at">创建时间</option>
                <option value="title">商品名称</option>
                <option value="purchase_date">购买日期</option>
                <option value="return_deadline">退货截止日期</option>
                <option value="warranty_deadline">保修截止日期</option>
              </select>
            </label>
            <label className="query-control">
              <span>排序方向</span>
              <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                <option value="desc">降序</option>
                <option value="asc">升序</option>
              </select>
            </label>
          </div>

          <div className="record-tools">
            <div className="filter-tabs">
              {[
                ['all', '全部'],
                ['active', '未完成'],
                ['completed', '已完成'],
                ['upcoming', '即将到期'],
                ['overdue', '已过期'],
              ].map(([key, label]) => (
                <button key={key} type="button" className={filter === key ? 'selected' : ''} onClick={() => showRecords(key)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="record-list">
            {loading ? (
              <div className="empty-state"><div className="loader" />正在加载记录…</div>
            ) : pageRecords.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><AppIcon name="list" size={28} /></div>
                <strong>{records.length ? '没有找到符合条件的记录' : '还没有售后记录'}</strong>
                <p>{records.length ? '试试调整搜索关键词或筛选条件。' : '手动添加一条，或试试上方的 AI 智能整理。'}</p>
                {!records.length && <button type="button" className="secondary-button" onClick={openCreate}>添加第一条记录</button>}
              </div>
            ) : pageRecords.map((record) => (
              <RecordCard key={record.id} record={record} onEdit={openEdit} onDelete={deleteRecord} onDetails={setDetailRecord} />
            ))}
          </div>

          <div className="pagination-bar">
            <div className="pagination-summary">第 {filteredRecords.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, filteredRecords.length)} 条，共 {filteredRecords.length} 条</div>
            <div className="pagination-actions">
              <label>每页
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                  {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
                条
              </label>
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(1)}>首页</button>
              <button type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button>
              <span>{safePage} / {totalPages}</span>
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>下一页</button>
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>末页</button>
            </div>
          </div>
        </section>}

        {activePage === 'profile' && (
          <ProfilePage
            user={user}
            updateUser={updateUser}
            logout={logout}
            recordCount={records.length}
            unreadCount={unreadCount}
          />
        )}

        {activePage === 'settings' && <section className="account-page">
          <div className="section-heading"><div><div className="eyebrow">PREFERENCES</div><h2>偏好设置</h2></div></div>
          <div className="settings-placeholder"><div className="settings-placeholder-icon"><AppIcon name="settings" size={26} /></div><h3>个性化设置即将开放</h3><p>后续可在这里配置提醒偏好、默认排序、页面显示和账户安全选项。</p><span>当前版本：基础展示</span></div>
        </section>}

        <footer className="footer"><span>小事后援 · 让每个售后期限都被妥善记住</span><span>为日常多留一点安心 <b>✳</b></span></footer>
      </main>

      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}>
        <div className="record-modal-wrap">
        {modalAuthError && <div className="modal-auth-error" role="alert">{modalAuthError}</div>}
        <form className="record-modal" onSubmit={saveRecord}>
          <div className="modal-heading">
            <div><div className="eyebrow">AFTERCARE RECORD</div><h2>{modal.mode === 'edit' ? '编辑售后记录' : '新增售后记录'}</h2></div>
            <button type="button" className="icon-button" onClick={() => { setModal(null); setModalError(''); setModalAuthError('') }}>×</button>
          </div>
          {modalError && <div className="modal-form-error" role="alert">{modalError}</div>}
          <label>商品名称 <b>*</b><input aria-invalid={Boolean(modalError && !form.title.trim())} maxLength="200" value={form.title} onChange={(event) => setField('title', event.target.value)} placeholder="例如：无线耳机" /></label>
          <label>购买平台<input maxLength="100" value={form.platform} onChange={(event) => setField('platform', event.target.value)} placeholder="例如：京东、淘宝" /></label>
          <div className="form-row">
            <label>购买日期<input type="date" value={form.purchase_date} onChange={(event) => setField('purchase_date', event.target.value)} /></label>
            <label>记录状态<select value={form.status} onChange={(event) => setField('status', event.target.value)}><option value="pending">待处理</option><option value="processing">处理中</option><option value="completed">已完成</option></select></label>
          </div>
          <div className="form-row">
            <label>退货截止日期<input type="date" value={form.return_deadline} onChange={(event) => setField('return_deadline', event.target.value)} /></label>
            <label>保修截止日期<input type="date" value={form.warranty_deadline} onChange={(event) => setField('warranty_deadline', event.target.value)} /></label>
          </div>
          <label>备注<textarea rows="3" value={form.notes} onChange={(event) => setField('notes', event.target.value)} placeholder="订单号、凭证位置或售后沟通记录" /></label>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => { setModal(null); setModalError(''); setModalAuthError('') }}>取消</button>
            <button className="primary-button compact" disabled={busy}>{busy ? '保存中…' : '保存记录'}</button>
          </div>
        </form>
        </div>
      </div>}

      {notificationsOpen && <NotificationModal
        notifications={notifications}
        onClose={() => setNotificationsOpen(false)}
        onMarkRead={markNotificationRead}
        onOpenNotification={openNotification}
      />}

      {detailRecord && <RecordDetailModal
        record={detailRecord}
        onClose={() => setDetailRecord(null)}
        onEdit={() => { openEdit(detailRecord); setDetailRecord(null) }}
      />}
    </div>
  )
}

function DeadlinePanel({ title, subtitle, items, kind, onItemClick }) {
  return <article className={`deadline-panel ${kind}`}>
    <div className="panel-heading"><div><h3>{title}</h3><p>{subtitle}</p></div><span className="panel-count">{items.length}</span></div>
    {items.length === 0 ? (
      <div className="panel-empty"><span>✳</span><p>{kind === 'upcoming' ? '近期没有到期事项' : '暂时没有过期事项'}</p></div>
    ) : (
      <div className="deadline-items">{items.slice(0, 4).map((item, index) => (
        <button type="button" className="deadline-item clickable-deadline" onClick={() => onItemClick(item)} key={`${item.record_id}-${item.deadline_type}-${index}`}>
          <span className="deadline-marker">{item.deadline_type === 'return' ? '退' : '保'}</span>
          <div className="deadline-info"><strong>{item.title}</strong><small>{item.deadline_type === 'return' ? '退货截止' : '保修截止'} · {dateText(item.deadline)}</small></div>
          <span className={`deadline-chip ${kind}`}>{kind === 'upcoming' ? item.days_remaining === 0 ? '今天' : `${item.days_remaining} 天后` : `逾期 ${item.days_overdue} 天`}</span>
        </button>
      ))}</div>
    )}
  </article>
}

function RecordCard({ record, onEdit, onDelete, onDetails }) {
  const statusLabel = { pending: '待处理', processing: '处理中', completed: '已完成' }[record.status] || record.status || '未知状态'
  return <article className="record-card">
    <div className="product-icon">{record.title?.slice(0, 1) || '物'}</div>
    <div className="record-main">
      <div className="record-title-row"><h3>{record.title}</h3><span className={`status-pill ${record.status}`}>{statusLabel}</span></div>
      <p>{record.platform || '未填写购买平台'}{record.purchase_date ? ` · ${record.purchase_date} 购买` : ''}</p>
      <div className="record-deadlines">
        {record.return_deadline && <span><i className="mini-dot return-dot" />退货截止 {dateText(record.return_deadline)}</span>}
        {record.warranty_deadline && <span><i className="mini-dot warranty-dot" />保修截止 {dateText(record.warranty_deadline)}</span>}
        {!record.return_deadline && !record.warranty_deadline && <span className="muted">尚未设置售后期限</span>}
      </div>
      {record.notes && <div className="record-note">{record.notes}</div>}
    </div>
    <div className="record-actions">
      <button type="button" onClick={() => onDetails(record)}>详情</button>
      <button type="button" onClick={() => onEdit(record)}>编辑</button>
      <button type="button" className="delete-action" onClick={() => onDelete(record)}>删除</button>
    </div>
  </article>
}

function NotificationModal({ notifications, onClose, onMarkRead, onOpenNotification }) {
  const unreadCount = notifications.filter((item) => item.status === 'unread').length

  return <div className="modal-backdrop notification-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-title">
      <div className="modal-heading">
        <div><div className="eyebrow">INBOX</div><h2 id="notification-title">提醒 <span className="modal-unread-count">{unreadCount} 条未读</span></h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭提醒">×</button>
      </div>
      {notifications.length === 0 ? (
        <div className="notification-empty">暂无提醒。到期扫描任务生成提醒后会显示在这里。</div>
      ) : (
        <div className="notification-list notification-modal-list">
          {notifications.map((item) => (
            <article className={`notification-card ${item.status}`} key={`${item.notification_type}-${item.id}`}>
              <div className="notification-mark">{item.deadline_type === 'return' ? '退' : '保'}</div>
              <button type="button" className="notification-content notification-record-link" onClick={() => onOpenNotification(item)}>
                <strong>{item.notification_type === 'task' ? '任务提醒' : item.deadline_type==='return' ? '退货期限提醒' :'保修期限提醒'}</strong>
                {item.notification_type==='task' ? (
                    <>
                        <p>{item.task_title || `任务 #${item.task_id}`}</p>
                        <small>提醒时间{dateTimeText(item.reminder_at)}</small>
                    </>
                ):(
                    <><p>记录 #{item.record_id} · 截止日期{dateText(item.deadline)}</p>
                      <small>提醒时间{dateText(item.remind_on)}</small>
                    </>
                )}
              </button>
              {item.status === 'unread'
                ? <button type="button" className="secondary-button" onClick={() => onMarkRead(item)}>标记已读</button>
                : <span className="read-label">已读</span>}
            </article>
          ))}
        </div>
      )}
    </section>
  </div>
}

function RecordDetailModal({ record, onClose, onEdit }) {
  const statusLabel = { pending: '待处理', processing: '处理中', completed: '已完成' }[record.status] || record.status || '未知状态'
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="record-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="record-detail-title">
      <div className="modal-heading">
        <div><div className="eyebrow">RECORD DETAIL · #{record.id}</div><h2 id="record-detail-title">{record.title}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭详情">×</button>
      </div>
      <div className="detail-grid">
        <DetailField icon="◉" label="状态" value={statusLabel} />
        <DetailField icon="▣" label="购买平台" value={record.platform || '未填写'} />
        <DetailField icon="▦" label="购买日期" value={record.purchase_date || '未填写'} />
        <DetailField icon="↩" label="退货截止日期" value={record.return_deadline || '未设置'} />
        <DetailField icon="◇" label="保修截止日期" value={record.warranty_deadline || '未设置'} />
        <DetailField icon="≡" label="备注" value={record.notes || '暂无备注'} />
      </div>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>关闭</button>
        <button type="button" className="primary-button compact" onClick={onEdit}>编辑记录</button>
      </div>
    </section>
  </div>
}

function DetailField({ icon, label, value }) {
  return <div className="detail-field"><div className="detail-label"><span aria-hidden="true">{icon}</span><small>{label}</small></div><strong>{value}</strong></div>
}

function CandidateField({ label, field, value, type = 'text', required = false, onChange }) {
  return <div>
    <label className="candidate-field-label" htmlFor={`candidate-${field}`}>{label}{required && <b> *</b>}</label>
    <input
      id={`candidate-${field}`}
      type={type}
      value={value || ''}
      required={required}
      onChange={(event) => onChange(field, event.target.value)}
      placeholder={type === 'date' ? '选择日期' : '未识别，可补充'}
      className={value ? '' : 'candidate-missing'}
    />
  </div>
}

export default App
