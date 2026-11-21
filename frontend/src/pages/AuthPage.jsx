
import { useState } from 'react'
import { useAuth } from './AuthContext.jsx'

export default function AuthPage() {
  const { login, register } = useAuth()

  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const isRegister = mode === 'register'

  const switchMode = (nextMode) => {
    setMode(nextMode)
    setError('')
    setNotice('')
    setPassword('')
    setConfirmPassword('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')

    const cleanUsername = username.trim()

    if (cleanUsername.length < 3 || cleanUsername.length > 50) {
      setError('用户名长度需要在 3～50 个字符之间')
      return
    }

    if (password.length < (isRegister ? 8 : 1)) {
      setError(isRegister ? '密码至少需要 8 个字符' : '请输入密码')
      return
    }

    if (isRegister && password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setBusy(true)

    try {
      if (isRegister) {
        await register({
          username: cleanUsername,
          password,
        })

        // 注册成功后切换到登录模式，不自动登录。
        setMode('login')
        setPassword('')
        setConfirmPassword('')
        setNotice('注册成功，请使用新账号登录')
      } else {
        await login({
          username: cleanUsername,
          password,
        })
        // 登录成功后，AuthContext 会更新 user。
        // App.jsx 检测到 user 后自动展示业务首页。
      }
    } catch (err) {
      setError(err.message || (isRegister ? '注册失败，请稍后重试' : '登录失败，请检查账号和密码'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <a className="brand auth-brand" href="/" aria-label="小事后援">
          <span className="brand-mark">小</span>
          <span>
            <strong>小事后援</strong>
            <small>AFTERCARE, MADE EASY</small>
          </span>
        </a>

        <div className="auth-brand-copy">
          <div className="eyebrow">PERSONAL AFTERCARE</div>
          <h1>
            把重要的小事，
            <span>放心交给我。</span>
          </h1>
          <p>
            购物之后的退换与保修期限，
            现在开始一目了然。
          </p>

          <div className="auth-feature-list">
            <div><span>✓</span> 集中管理售后记录</div>
            <div><span>✓</span> AI 整理商品与期限信息</div>
            <div><span>✓</span> 及时关注重要截止日期</div>
          </div>
        </div>

        <div className="auth-brand-footer">
          让每一件重要的小事，都有妥善安排。
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-card">
          <div className="eyebrow">WELCOME TO AFTERCARE</div>

          <h2>{isRegister ? '创建你的账号' : '欢迎回来'}</h2>
          <p className="auth-description">
            {isRegister
              ? '注册账号，开始管理你的售后事项。'
              : '登录后继续管理你的商品与售后记录。'}
          </p>

          <div className="auth-tabs">
            <button
              type="button"
              className={!isRegister ? 'active' : ''}
              onClick={() => switchMode('login')}
            >
              登录
            </button>
            <button
              type="button"
              className={isRegister ? 'active' : ''}
              onClick={() => switchMode('register')}
            >
              注册
            </button>
          </div>

          {error && <div className="auth-message error" role="alert">{error}</div>}
          {notice && <div className="auth-message success" role="status">{notice}</div>}

          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              用户名
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="请输入用户名"
                minLength={3}
                maxLength={50}
                autoComplete="username"
                required
              />
            </label>

            <label>
              密码
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isRegister ? '至少 8 个字符' : '请输入密码'}
                minLength={isRegister ? 8 : 1}
                maxLength={128}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
              />
            </label>

            {isRegister && (
              <label>
                确认密码
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="请再次输入密码"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                />
              </label>
            )}

            <button className="auth-submit" type="submit" disabled={busy}>
              {busy
                ? (isRegister ? '正在创建账号…' : '正在登录…')
                : (isRegister ? '创建账号' : '登录')}
            </button>
          </form>

          <p className="auth-switch">
            {isRegister ? '已经有账号了？' : '还没有账号？'}
            <button
              type="button"
              onClick={() => switchMode(isRegister ? 'login' : 'register')}
            >
              {isRegister ? '立即登录' : '立即注册'}
            </button>
          </p>

          <div className="auth-security">
            <span>✓</span>
            你的售后记录仅对当前登录账号开放
          </div>
        </div>
      </section>
    </main>
  )
}
