
import { useRef, useState } from 'react'
import { userApi } from '../api.js'
import '../profile.css'

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export default function ProfilePage({
  user,
  updateUser,
  logout,
  recordCount = 0,
  unreadCount = 0,
}) {
  const fileInputRef = useRef(null)

  // 控制当前打开的弹窗：profile / password / null
  const [activeModal, setActiveModal] = useState(null)

  const [profileForm, setProfileForm] = useState({
    nickname: '',
    email: '',
  })

  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  })

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [passwordChanged, setPasswordChanged] = useState(false)

  const avatarUrl = user?.avatar_url
    ? user.avatar_url.startsWith('http')
      ? user.avatar_url
      : `${API_BASE}${user.avatar_url}`
    : ''

  const showMessage = (text, isError = false) => {
    setMessage(isError ? '' : text)
    setError(isError ? text : '')
  }

  // 打开资料弹窗时，使用最新用户资料初始化表单
  const openProfileModal = () => {
    setProfileForm({
      nickname: user?.nickname || '',
      email: user?.email || '',
    })
    showMessage('')
    setActiveModal('profile')
  }

  // 打开密码弹窗时，清空旧表单
  const openPasswordModal = () => {
    setPasswordForm({
      old_password: '',
      new_password: '',
      confirm_password: '',
    })
    setPasswordChanged(false)
    showMessage('')
    setActiveModal('password')
  }

  // 保存个人资料
  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    showMessage('')

    try {
      const result = await userApi.updateProfile({
        nickname: profileForm.nickname.trim(),
        email: profileForm.email.trim(),
      })

      updateUser(result.data)
      setActiveModal(null)
      showMessage('个人资料已更新')
    } catch (err) {
      showMessage(err.message || '资料保存失败', true)
    } finally {
      setLoading(false)
    }
  }

  // 上传头像
  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showMessage('请选择图片文件', true)
      event.target.value = ''
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      showMessage('图片不能超过 2MB', true)
      event.target.value = ''
      return
    }

    setLoading(true)
    showMessage('')

    try {
      const result = await userApi.uploadAvatar(file)
      updateUser(result.data)
      showMessage('头像上传成功')
    } catch (err) {
      showMessage(err.message || '头像上传失败', true)
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

  // 修改密码
  const handlePasswordSubmit = async (event) => {
    event.preventDefault()
    showMessage('')

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      showMessage('两次输入的新密码不一致', true)
      return
    }

    if (passwordForm.new_password.length < 8) {
      showMessage('新密码至少需要 8 位', true)
      return
    }

    if (passwordForm.old_password === passwordForm.new_password) {
      showMessage('新密码不能与当前密码相同', true)
      return
    }

    setLoading(true)

    try {
      await userApi.changePassword({
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password,
      })

      // 不直接关闭弹窗，先展示重新登录提示
      setPasswordChanged(true)
      setPasswordForm({
        old_password: '',
        new_password: '',
        confirm_password: '',
      })
    } catch (err) {
      showMessage(err.message || '密码修改失败', true)
    } finally {
      setLoading(false)
    }
  }

  const closeModal = () => {
    if (loading) return
    setActiveModal(null)
    showMessage('')
  }

  return (
    <section className="profile-page">
      <div className="section-heading">
        <div>
          <div className="eyebrow">YOUR ACCOUNT</div>
          <h2>个人中心</h2>
          <p>管理个人资料与账户安全</p>
        </div>
      </div>

      {message && (
        <div className="profile-message">{message}</div>
      )}

      {error && (
        <div className="profile-message is-error">{error}</div>
      )}

      {/* 账户信息 */}
      <section className="profile-card">
        <h3>账户信息</h3>

        <div className="profile-account">
          <div className="profile-avatar">
            {avatarUrl ? (
              <img
                src={`${avatarUrl}?t=${encodeURIComponent(user?.avatar_url || '')}`}
                alt="用户头像"
              />
            ) : (
              user?.username?.slice(0, 1).toUpperCase() || 'U'
            )}
          </div>

          <div className="profile-account-info">
            <strong>{user?.nickname || user?.username || '用户'}</strong>
            <span>用户名：{user?.username || '—'}</span>
            <span>邮箱：{user?.email || '暂未填写'}</span>
          </div>

          <button
            type="button"
            className="profile-secondary-button"
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
          >
            更换头像
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleAvatarChange}
          />
        </div>

        <div className="profile-stats">
          <div>
            <span>售后记录</span>
            <strong>{recordCount}</strong>
          </div>
          <div>
            <span>未读提醒</span>
            <strong>{unreadCount}</strong>
          </div>
        </div>
      </section>

      {/* 个人资料：默认只展示，不直接显示输入框 */}
      <section className="profile-card">
        <div className="profile-card-heading">
          <div>
            <h3>个人资料</h3>
            <p>管理你的昵称和邮箱信息</p>
          </div>
          <button
            type="button"
            className="profile-secondary-button"
            onClick={openProfileModal}
          >
            编辑资料
          </button>
        </div>

        <div className="profile-info-list">
          <div>
            <span>用户名</span>
            <strong>{user?.username || '—'}</strong>
          </div>
          <div>
            <span>昵称</span>
            <strong>{user?.nickname || '未设置'}</strong>
          </div>
          <div>
            <span>邮箱</span>
            <strong>{user?.email || '未设置'}</strong>
          </div>
        </div>
      </section>

      {/* 账户安全：默认隐藏密码输入框 */}
      <section className="profile-card">
        <div className="profile-card-heading">
          <div>
            <h3>账户安全</h3>
            <p>定期更新密码，保护账户安全</p>
          </div>
          <button
            type="button"
            className="profile-secondary-button"
            onClick={openPasswordModal}
          >
            修改密码
          </button>
        </div>

        <div className="profile-security-status">
          <span className="security-dot" />
          <span>账户密码已设置</span>
        </div>
      </section>

      {/* 弹窗：个人资料编辑 */}
      {activeModal === 'profile' && (
        <div className="profile-modal-mask" onMouseDown={(e) => {
          if (e.target === e.currentTarget) closeModal()
        }}>
          <section className="profile-modal">
            <div className="profile-modal-heading">
              <div>
                <h3>编辑个人资料</h3>
                <p>修改后将同步更新账户信息</p>
              </div>
              <button
                type="button"
                className="profile-modal-close"
                onClick={closeModal}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleProfileSubmit}>
              <label className="profile-field">
                <span>用户名</span>
                <input value={user?.username || ''} disabled />
              </label>

              <label className="profile-field">
                <span>昵称</span>
                <input
                  value={profileForm.nickname}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      nickname: e.target.value,
                    })
                  }
                  placeholder="请输入昵称"
                />
              </label>

              <label className="profile-field">
                <span>邮箱</span>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      email: e.target.value,
                    })
                  }
                  placeholder="请输入邮箱"
                />
              </label>

              {error && (
                <div className="profile-message is-error">{error}</div>
              )}

              <div className="profile-modal-actions">
                <button
                  type="button"
                  className="profile-secondary-button"
                  onClick={closeModal}
                  disabled={loading}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="profile-primary-button"
                  disabled={loading}
                >
                  {loading ? '保存中...' : '保存修改'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* 弹窗：修改密码 */}
      {activeModal === 'password' && (
        <div className="profile-modal-mask">
          <section className="profile-modal">
            {passwordChanged ? (
              // 修改成功后显示醒目的重新登录提示
              <div className="password-success">
                <div className="password-success-icon">✓</div>
                <h3>密码修改成功</h3>
                <p>
                  为保障账户安全，请退出当前账户并使用新密码重新登录。
                </p>
                <button
                  type="button"
                  className="profile-primary-button"
                  onClick={logout}
                >
                  我知道了，退出登录
                </button>
              </div>
            ) : (
              <>
                <div className="profile-modal-heading">
                  <div>
                    <h3>修改登录密码</h3>
                    <p>请先验证当前密码，再设置新密码</p>
                  </div>
                  <button
                    type="button"
                    className="profile-modal-close"
                    onClick={closeModal}
                  >
                    ×
                  </button>
                </div>

                <form onSubmit={handlePasswordSubmit}>
                  <label className="profile-field">
                    <span>当前密码</span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={passwordForm.old_password}
                      onChange={(e) =>
                        setPasswordForm({
                          ...passwordForm,
                          old_password: e.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label className="profile-field">
                    <span>新密码</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={passwordForm.new_password}
                      onChange={(e) =>
                        setPasswordForm({
                          ...passwordForm,
                          new_password: e.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label className="profile-field">
                    <span>确认新密码</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={passwordForm.confirm_password}
                      onChange={(e) =>
                        setPasswordForm({
                          ...passwordForm,
                          confirm_password: e.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  {error && (
                    <div className="profile-message is-error">{error}</div>
                  )}

                  <div className="profile-modal-actions">
                    <button
                      type="button"
                      className="profile-secondary-button"
                      onClick={closeModal}
                      disabled={loading}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="profile-primary-button"
                      disabled={loading}
                    >
                      {loading ? '提交中...' : '确认修改'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
