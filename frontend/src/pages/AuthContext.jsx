
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

import {
  authApi,
  getAccessToken,
  setAccessToken,
  clearAccessToken,
} from '../api.js'

// 创建全局身份上下文
const AuthContext = createContext(null)

/**
 * 身份管理组件
 *
 * 作用：
 * 1. 统一保存当前用户信息
 * 2. 统一管理登录状态
 * 3. 页面刷新时验证已有 Token
 * 4. 提供登录、注册、退出登录方法
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)

  // 初始状态为加载中，避免验证 Token 时提前显示登录页面
  const [authLoading, setAuthLoading] = useState(true)

  /**
   * 页面初始化时检查登录状态
   *
   * 调用流程：
   * localStorage -> 获取 Token -> /auth/me -> 更新用户状态
   */
  useEffect(() => {
    const restoreLogin = async () => {
      const token = getAccessToken()

      // 没有 Token，说明当前没有登录
      if (!token) {
        setAuthLoading(false)
        return
      }

      try {
        // 向后端验证 Token，并获取当前用户信息
        const result = await authApi.me()
        setUser(result.data)
      } catch (error) {
        // Token 无效或过期，清除本地凭证
        clearAccessToken()
        setUser(null)
      } finally {
        setAuthLoading(false)
      }
    }

    restoreLogin()
  }, [])

  /**
   * 用户登录
   *
   * 后端返回 JWT 后先保存 Token，
   * 再调用 /auth/me 验证身份。
   */
  const login = useCallback(async (credentials) => {
    const result = await authApi.login(credentials)

    const token = result.data.access_token

    if (!token) {
      throw new Error('登录成功，但后端没有返回 Token')
    }

    setAccessToken(token)

    try {
      const userResult = await authApi.me()
      setUser(userResult.data)
      return userResult.data
    } catch (error) {
      // 身份验证失败时不能保留无效 Token
      clearAccessToken()
      setUser(null)
      throw error
    }
  }, [])

  /**
   * 用户注册
   *
   * 注册成功后暂不自动登录，
   * 由登录页面引导用户手动登录。
   */
  const register = useCallback(async (data) => {
    return authApi.register(data)
  }, [])

  /**
   * 用户退出登录
   */
  const logout = useCallback(() => {
    clearAccessToken()
    setUser(null)
  }, [])

  /**
   * 更新全局用户信息
   *
   * 个人中心修改昵称、邮箱或头像后调用，
   * 避免页面局部更新而顶部导航仍显示旧数据。
   */
  const updateUser = useCallback((updatedUser) => {
    setUser((current) => ({
      ...current,
      ...updatedUser,
    }))
  }, [])

  const value = {
    user,
    authLoading,
    isAuthenticated: Boolean(user),
    login,
    register,
    logout,
    updateUser
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * 其他组件通过 useAuth() 获取身份状态和操作方法
 */
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用')
  }

  return context
}
