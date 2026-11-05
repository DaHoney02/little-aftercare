import { useCallback, useEffect, useMemo, useState } from 'react'
import { aftercareApi } from './api.js'

const SESSION_ID = localStorage.getItem('little-aftercare-session') || 'web-demo-session'
localStorage.setItem('little-aftercare-session', SESSION_ID)

const emptyForm = {
  title: '', platform: '', purchase_date: '', return_deadline: '',
  warranty_deadline: '', status: 'pending', notes: '',
}

const dateText = (value) => value
  ? new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(`${value}T00:00:00`))
  : '未设置'

function App() {
  const [records, setRecords] = useState([])
  const [overview, setOverview] = useState({ upcoming: [], overdue: [] })
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [aiText, setAiText] = useState('')
  const [candidate, setCandidate] = useState(null)
  const [activePage, setActivePage] = useState('overview')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState(null)

  const loadData = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    setError('')
    try {
      const [recordData, deadlineData, notificationData] = await Promise.all([
        aftercareApi.list(SESSION_ID),
        aftercareApi.overview(SESSION_ID),
        aftercareApi.notifications(SESSION_ID),
      ])
      setRecords(recordData)
      setOverview(deadlineData)
      setNotifications(notificationData)
    } catch (err) {
      setError(err.message || '暂时无法连接服务，请确认后端已启动。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData(true) }, [loadData])

  const markNotificationRead = async (notificationId) => {
    setError('')
    try {
      const updated = await aftercareApi.markNotificationRead(
        notificationId,
        SESSION_ID,
      )
      setNotifications((current) => current.map((item) => (
        item.id === notificationId ? updated : item
      )))
    } catch (err) {
      setError(err.message || '暂时无法更新提醒状态')
    }
  }

  const filteredRecords = useMemo(() => {
    if (filter === 'active') return records.filter((item) => item.status !== 'completed')
    if (filter === 'completed') return records.filter((item) => item.status === 'completed')
    if (filter === 'upcoming') {
      const ids = new Set(overview.upcoming.map((item) => item.record_id))
      return records.filter((item) => ids.has(item.id))
    }
    if (filter === 'overdue') {
      const ids = new Set(overview.overdue.map((item) => item.record_id))
      return records.filter((item) => ids.has(item.id))
    }
    return records
  }, [filter, records, overview])

  const unreadCount = notifications.filter((item) => item.status === 'unread').length

  const showRecords = (nextFilter = 'all') => {
    setFilter(nextFilter)
    setActivePage('records')
  }

  const openDeadlineRecord = (item) => {
    const record = records.find((entry) => entry.id === item.record_id)
    if (record) setDetailRecord(record)
  }

  const openCreate = () => {
    setForm(emptyForm)
    setModal({ mode: 'create' })
  }

  const openEdit = (record) => {
    setForm({
      title: record.title || '', platform: record.platform || '',
      purchase_date: record.purchase_date || '', return_deadline: record.return_deadline || '',
      warranty_deadline: record.warranty_deadline || '', status: record.status || 'pending',
      notes: record.notes || '',
    })
    setModal({ mode: 'edit', record })
  }

  const saveRecord = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const payload = {
      ...form,
      platform: form.platform || null,
      purchase_date: form.purchase_date || null,
      return_deadline: form.return_deadline || null,
      warranty_deadline: form.warranty_deadline || null,
      notes: form.notes || null,
      session_id: SESSION_ID,
    }
    try {
      if (modal.mode === 'edit') {
        const patch = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'session_id'))
        await aftercareApi.update(modal.record.id, SESSION_ID, patch)
        setNotice('记录已更新')
      } else {
        await aftercareApi.create(payload)
        setNotice('记录已保存')
      }
      setModal(null)
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const deleteRecord = async (record) => {
    if (!window.confirm(`确定删除「${record.title}」吗？`)) return
    setBusy(true)
    try {
      await aftercareApi.remove(record.id, SESSION_ID)
      setNotice('记录已删除')
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const extractWithAi = async (event) => {
    event.preventDefault()
    if (!aiText.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await aftercareApi.extract(aiText.trim())
      setCandidate(result)
    } catch (err) {
      setError(err.message)
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
    try {
      await aftercareApi.create({
        title: candidate.title.trim(), platform: candidate.platform || null,
        purchase_date: candidate.purchase_date || null,
        return_deadline: candidate.return_deadline || null,
        warranty_deadline: candidate.warranty_deadline || null,
        notes: candidate.notes || null, status: 'pending', session_id: SESSION_ID,
      })
      setCandidate(null)
      setAiText('')
      setNotice('AI 整理的记录已保存')
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const updateCandidate = (field, value) => {
    setCandidate((current) => {
      const missing = new Set(current.missing_fields || [])
      const trackable = ['title', 'platform', 'purchase_date', 'return_deadline', 'warranty_deadline']
      if (value || !trackable.includes(field)) missing.delete(field)
      else missing.add(field)
      return { ...current, [field]: value, missing_fields: [...missing] }
    })
  }

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="小事后援首页">
          <span className="brand-mark">小</span>
          <span><strong>小事后援</strong><small>AFTERCARE, MADE EASY</small></span>
        </a>
        <div className="side-label">工作台</div>
        <button className={`nav-item ${activePage === 'overview' ? 'active' : ''}`} onClick={() => setActivePage('overview')}><span>◫</span> 售后总览</button>
        <button className={`nav-item ${activePage === 'records' ? 'active' : ''}`} onClick={() => showRecords('all')}><span>▤</span> 我的记录 <i>{records.length}</i></button>
        <div className="sidebar-bottom">
          <div className="privacy-icon">✳</div>
          <strong>重要期限，心里有数</strong>
          <p>把购物后的琐碎信息收好，给生活多一点从容。</p>
          <span className="session-tag">演示空间 · {SESSION_ID}</span>
        </div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <div className="breadcrumb">工作台 <span>/</span> {activePage === 'overview' ? '售后总览' : '我的记录'}</div>
          <div className="topbar-right">
            <button className={`notification-trigger ${unreadCount > 0 ? 'has-unread' : ''}`} onClick={() => setNotificationsOpen(true)} aria-label={`打开提醒，${unreadCount} 条未读`}>
              🔔{unreadCount > 0 && <i>{unreadCount}</i>}
            </button>
            <span className="live-dot" /> 数据已连接 <span className="avatar">U</span>
          </div>
        </header>

        {activePage === 'overview' && <>
        <section className="welcome-row" id="overview">
          <div>
            <div className="eyebrow">PERSONAL AFTERCARE</div>
            <h1>把重要的小事，<em>放心交给我。</em></h1>
            <p className="subtitle">购物之后的退换与保修期限，现在一目了然。</p>
          </div>
          <button className="primary-button" onClick={openCreate}><span>＋</span> 新增记录</button>
        </section>

        {(error || notice) && <div className={`toast ${error ? 'error' : 'success'}`} role="status">
          <span>{error ? '!' : '✓'}</span>{error || notice}<button onClick={() => { setError(''); setNotice('') }}>×</button>
        </div>}

        <section className="stats-grid">
          <button className="stat-card stat-total clickable-card" onClick={() => showRecords('all')}><div className="stat-icon">▤</div><span>售后档案 · 查看全部</span><strong>{records.length}<small> 条记录</small></strong><p>点击进入记录管理</p></button>
          <button className="stat-card stat-upcoming clickable-card" onClick={() => showRecords('upcoming')}><div className="stat-icon">◷</div><span>7 天内到期 · 点击查看</span><strong>{overview.upcoming.length}<small> 项待关注</small></strong><p>进入相关记录并查看详情</p></button>
          <button className="stat-card stat-overdue clickable-card" onClick={() => showRecords('overdue')}><div className="stat-icon">!</div><span>已经过期 · 点击查看</span><strong>{overview.overdue.length}<small> 项</small></strong><p>{overview.overdue.length ? '进入过期事项记录' : '目前没有过期事项'}</p></button>
        </section>

        <section className="deadline-grid">
          <DeadlinePanel title="即将到期" subtitle="点击事项查看商品详情" items={overview.upcoming} kind="upcoming" onItemClick={openDeadlineRecord} />
          <DeadlinePanel title="已过期事项" subtitle="点击事项查看商品详情" items={overview.overdue} kind="overdue" onItemClick={openDeadlineRecord} />
        </section>

        <section className="ai-panel">
          <div className="ai-copy">
            <div className="ai-spark">✦</div>
            <div><div className="eyebrow">SMART ASSISTANT</div><h2>说句话，帮你整理购物信息</h2><p>试着描述商品、平台和售后期限，AI 会整理成一条待确认记录。</p></div>
          </div>
          <form className="ai-form" onSubmit={extractWithAi}>
            <textarea value={aiText} onChange={(event) => setAiText(event.target.value)} placeholder="例如：昨天在京东买了无线耳机，七天内可以退，保修一年……" rows={2} />
            <button className="ai-button" disabled={busy || !aiText.trim()}>{busy ? '整理中…' : '✦ 智能整理'}</button>
          </form>
          {candidate && <div className="candidate-card">
            <div className="candidate-head"><strong>请核对 AI 整理结果</strong><button className="icon-button" onClick={() => setCandidate(null)}>×</button></div>
            <div className="candidate-grid">
              <CandidateField label="商品名称" field="title" value={candidate.title} required onChange={updateCandidate} />
              <CandidateField label="购买平台" field="platform" value={candidate.platform} onChange={updateCandidate} />
              <CandidateField label="购买日期" field="purchase_date" value={candidate.purchase_date} type="date" onChange={updateCandidate} />
              <CandidateField label="退货截止日期" field="return_deadline" value={candidate.return_deadline} type="date" onChange={updateCandidate} />
              <CandidateField label="保修截止日期" field="warranty_deadline" value={candidate.warranty_deadline} type="date" onChange={updateCandidate} />
              <CandidateField label="备注" field="notes" value={candidate.notes} onChange={updateCandidate} />
            </div>
            {candidate.missing_fields?.length > 0 && <p className="missing-note">黄色字段尚未识别，可直接在上方填写：{candidate.missing_fields.map((field) => ({ title: '商品名称', platform: '购买平台', purchase_date: '购买日期', return_deadline: '退货截止日期', warranty_deadline: '保修截止日期' }[field] || field)).join('、')}</p>}
            <div className="candidate-actions"><button className="secondary-button" onClick={() => setCandidate(null)}>取消</button><button className="primary-button compact" disabled={busy || !candidate.title} onClick={saveCandidate}>确认并保存</button></div>
          </div>}
        </section>
        </>}

        {activePage === 'records' && <section className="records-section records-page" id="records">
          <div className="section-heading">
            <div><div className="eyebrow">YOUR PURCHASES</div><h2>售后记录</h2></div>
            <div className="record-tools">
              <div className="filter-tabs">
                {[['all', '全部'], ['active', '未完成'], ['completed', '已完成'], ['upcoming', '即将到期'], ['overdue', '已过期']].map(([key, label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}</button>)}
              </div>
              <button className="refresh-button" onClick={() => loadData(true)} title="刷新">↻</button>
            </div>
          </div>
          <div className="record-list">
            {loading ? <div className="empty-state"><div className="loader" />正在加载记录…</div> : filteredRecords.length === 0 ? <div className="empty-state"><div className="empty-icon">▤</div><strong>{records.length ? '这个分类下暂时没有记录' : '还没有售后记录'}</strong><p>手动添加一条，或试试上方的 AI 智能整理。</p>{!records.length && <button className="secondary-button" onClick={openCreate}>添加第一条记录</button>}</div> : filteredRecords.map((record) => <RecordCard key={record.id} record={record} onEdit={openEdit} onDelete={deleteRecord} onDetails={setDetailRecord} />)}
          </div>
        </section>}

        <footer className="footer"><span>小事后援 · 让每个售后期限都被妥善记住</span><span>为日常多留一点安心 <b>✳</b></span></footer>
      </main>

      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}>
        <form className="record-modal" onSubmit={saveRecord}>
          <div className="modal-heading"><div><div className="eyebrow">AFTERCARE RECORD</div><h2>{modal.mode === 'edit' ? '编辑售后记录' : '新增售后记录'}</h2></div><button type="button" className="icon-button" onClick={() => setModal(null)}>×</button></div>
          <label>商品名称 <b>*</b><input required maxLength="200" value={form.title} onChange={(event) => setField('title', event.target.value)} placeholder="例如：无线耳机" /></label>
          <label>购买平台<input maxLength="100" value={form.platform} onChange={(event) => setField('platform', event.target.value)} placeholder="例如：京东、淘宝" /></label>
          <div className="form-row"><label>购买日期<input type="date" value={form.purchase_date} onChange={(event) => setField('purchase_date', event.target.value)} /></label><label>记录状态<select value={form.status} onChange={(event) => setField('status', event.target.value)}><option value="pending">待处理</option><option value="processing">处理中</option><option value="completed">已完成</option></select></label></div>
          <div className="form-row"><label>退货截止日期<input type="date" value={form.return_deadline} onChange={(event) => setField('return_deadline', event.target.value)} /></label><label>保修截止日期<input type="date" value={form.warranty_deadline} onChange={(event) => setField('warranty_deadline', event.target.value)} /></label></div>
          <label>备注<textarea rows="3" value={form.notes} onChange={(event) => setField('notes', event.target.value)} placeholder="订单号、凭证位置或售后沟通记录" /></label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>取消</button><button className="primary-button compact" disabled={busy}>{busy ? '保存中…' : '保存记录'}</button></div>
        </form>
      </div>}
      {notificationsOpen && <NotificationModal
        notifications={notifications}
        onClose={() => setNotificationsOpen(false)}
        onMarkRead={markNotificationRead}
        onOpenRecord={(id) => {
          const record = records.find((item) => item.id === id)
          if (record) setDetailRecord(record)
          setNotificationsOpen(false)
        }}
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
    {items.length === 0 ? <div className="panel-empty"><span>✳</span><p>{kind === 'upcoming' ? '近期没有到期事项' : '暂时没有过期事项'}</p></div> : <div className="deadline-items">{items.slice(0, 4).map((item, index) => <button className="deadline-item clickable-deadline" onClick={() => onItemClick(item)} key={`${item.record_id}-${item.deadline_type}-${index}`}>
      <span className="deadline-marker">{item.deadline_type === 'return' ? '退' : '保'}</span>
      <div className="deadline-info"><strong>{item.title}</strong><small>{item.deadline_type === 'return' ? '退货截止' : '保修截止'} · {dateText(item.deadline)}</small></div>
      <span className={`deadline-chip ${kind}`}>{kind === 'upcoming' ? item.days_remaining === 0 ? '今天' : `${item.days_remaining} 天后` : `逾期 ${item.days_overdue} 天`}</span>
    </button>)}</div>}
  </article>
}

function RecordCard({ record, onEdit, onDelete, onDetails }) {
  const statusLabel = { pending: '待处理', processing: '处理中', completed: '已完成' }[record.status] || record.status
  return <article className="record-card">
    <div className="product-icon">{record.title?.slice(0, 1) || '物'}</div>
    <div className="record-main"><div className="record-title-row"><h3>{record.title}</h3><span className={`status-pill ${record.status}`}>{statusLabel}</span></div><p>{record.platform || '未填写购买平台'}{record.purchase_date ? ` · ${record.purchase_date} 购买` : ''}</p>
      <div className="record-deadlines">{record.return_deadline && <span><i className="mini-dot return-dot" />退货截止 {dateText(record.return_deadline)}</span>}{record.warranty_deadline && <span><i className="mini-dot warranty-dot" />保修截止 {dateText(record.warranty_deadline)}</span>}{!record.return_deadline && !record.warranty_deadline && <span className="muted">尚未设置售后期限</span>}</div>
      {record.notes && <div className="record-note">{record.notes}</div>}
    </div>
    <div className="record-actions"><button onClick={() => onDetails(record)}>详情</button><button onClick={() => onEdit(record)}>编辑</button><button className="delete-action" onClick={() => onDelete(record)}>删除</button></div>
  </article>
}

function NotificationModal({ notifications, onClose, onMarkRead, onOpenRecord }) {
  const unreadCount = notifications.filter((item) => item.status === 'unread').length
  return <div className="modal-backdrop notification-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-title">
      <div className="modal-heading">
        <div><div className="eyebrow">INBOX</div><h2 id="notification-title">提醒 <span className="modal-unread-count">{unreadCount} 条未读</span></h2></div>
        <button className="icon-button" onClick={onClose} aria-label="关闭提醒">×</button>
      </div>
      {notifications.length === 0 ? <div className="notification-empty">暂无提醒。到期扫描任务生成提醒后会显示在这里。</div> :
        <div className="notification-list notification-modal-list">
          {notifications.map((item) => <article className={`notification-card ${item.status}`} key={item.id}>
            <div className="notification-mark">{item.deadline_type === 'return' ? '退' : '保'}</div>
            <button className="notification-content notification-record-link" onClick={() => onOpenRecord(item.record_id)}>
              <strong>{item.deadline_type === 'return' ? '退货期限提醒' : '保修期限提醒'}</strong>
              <p>记录 #{item.record_id} · 截止日期 {dateText(item.deadline)}</p>
              <small>提醒日期 {dateText(item.remind_on)}</small>
            </button>
            {item.status === 'unread' ? <button className="secondary-button" onClick={() => onMarkRead(item.id)}>标记已读</button> : <span className="read-label">已读</span>}
          </article>)}
        </div>}
    </section>
  </div>
}

function RecordDetailModal({ record, onClose, onEdit }) {
  const statusLabel = { pending: '待处理', processing: '处理中', completed: '已完成' }[record.status] || record.status
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="record-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="record-detail-title">
      <div className="modal-heading"><div><div className="eyebrow">RECORD DETAIL · #{record.id}</div><h2 id="record-detail-title">{record.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭详情">×</button></div>
      <div className="detail-grid">
        <DetailField icon="◉" label="状态" value={statusLabel} />
        <DetailField icon="▣" label="购买平台" value={record.platform || '未填写'} />
        <DetailField icon="▦" label="购买日期" value={record.purchase_date || '未填写'} />
        <DetailField icon="↩" label="退货截止日期" value={record.return_deadline || '未设置'} />
        <DetailField icon="◇" label="保修截止日期" value={record.warranty_deadline || '未设置'} />
        <DetailField icon="≡" label="备注" value={record.notes || '暂无备注'} />
      </div>
      <div className="modal-actions"><button className="secondary-button" onClick={onClose}>关闭</button><button className="primary-button compact" onClick={onEdit}>编辑记录</button></div>
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
      onChange={(event) => onChange(field, event.target.value || null)}
      placeholder={type === 'date' ? '选择日期' : '未识别，可补充'}
      className={value ? '' : 'candidate-missing'}
    />
  </div>
}

export default App
