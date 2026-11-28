//Hook负责聊天业务状态
import { useCallback, useState } from 'react'
import { chatApi } from '../../api.js'

// 会话 ID 的本地存储名称。
// 只在当前浏览器中保存，不作为用户身份凭证。
const SESSION_STORAGE_KEY = 'little-aftercare-chat-session'

/**
 * 生成新的聊天会话 ID。
 *
 * 使用浏览器原生 crypto.randomUUID()，
 * 不需要额外安装 UUID 依赖。
 */
function createSessionId() {
  return crypto.randomUUID()
}

/**
 * 从后端响应中提取 AI 回复。
 *
 * 兼容以下常见响应格式：
 * { answer: "..." }
 * { data: { answer: "..." } }
 * { message: "..." }
 *
 * 最终应以实际后端响应结构为准。
 */
function extractAnswer(response) {
  return (
    response?.answer ||
    response?.data?.answer ||
    response?.message ||
    response?.data?.message ||
    ''
  )
}

export function useAssistantChat() {
  const [sessionId, setSessionId] = useState(() => {
    return (
      localStorage.getItem(SESSION_STORAGE_KEY) ||
      createSessionId()
    )
  })

  const [messages, setMessages] = useState([])

  const [loading, setLoading] = useState(false)

  const [error, setError] = useState('')

  /**
   * 发送消息。
   */
  const sendMessage = useCallback(
    async (content) => {
      const text = content.trim()

      if (!text || loading) return

      setError('')

      // 先将用户消息显示到界面。
      const userMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
      }

      const nextMessages = [...messages, userMessage]

      setMessages(nextMessages)
      setLoading(true)

      try {
        // 保存当前会话 ID。
        localStorage.setItem(
          SESSION_STORAGE_KEY,
          sessionId,
        )

        // 将历史消息和当前消息一起发送。
        const response = await chatApi.send(
          nextMessages.map((item) => ({
            role: item.role,
            content: item.content,
          })),
          sessionId,
        )

        const answer = extractAnswer(response)

        if (!answer) {
          throw new Error('AI 暂时没有返回有效内容。')
        }

        // 将 AI 回复追加到消息列表。
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: answer,
          },
        ])
      } catch (err) {
        setError(err?.message || '消息发送失败，请稍后重试。')
      } finally {
        setLoading(false)
      }
    },
    [messages, loading, sessionId],
  )

  /**
   * 开启新会话。
   */
  const resetChat = useCallback(() => {
    const newSessionId = createSessionId()

    setSessionId(newSessionId)
    setMessages([])
    setError('')

    localStorage.setItem(
      SESSION_STORAGE_KEY,
      newSessionId,
    )
  }, [])

  return {
    messages,
    loading,
    error,
    sendMessage,
    resetChat,
  }
}