import { useState } from 'react'
import { useAssistantChat } from './useAssistantChat.js'
import '../../styles/assistant.css'

const QUICK_PROMPTS = [
  '最近有哪些售后即将到期？',
  '帮我查询最近添加的商品。',
  '我还有哪些未完成任务？',
  '帮我查询某个商品的售后进度。',
]

function AssistantDrawer({ open, onClose }) {
  const [input, setInput] = useState('')

  const {
    messages,
    loading,
    error,
    sendMessage,
    resetChat,
  } = useAssistantChat()

  if (!open) return null

  /**
   * 发送消息。
   */
  const handleSend = async (content = input) => {
    const text = content.trim()

    if (!text || loading) return

    setInput('')
    await sendMessage(text)
  }

  /**
   * Enter 发送，Shift + Enter 换行。
   */
  const handleKeyDown = (event) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <aside
      className="assistant-drawer"
      role="dialog"
      aria-modal="false"
      aria-label="AI 助手"
    >
      {/* 顶部标题栏 */}
      <header className="assistant-header">
        <div className="assistant-header-info">
          <div className="assistant-avatar">
            ✳
          </div>

          <div>
            <h2>小事后援 AI 助手</h2>
            <span>
              <i className="assistant-status-dot" />
              智能助手 · 随时为你整理售后事项
            </span>
          </div>
        </div>

        <div className="assistant-header-actions">
          <button
            type="button"
            onClick={resetChat}
            title="开启新会话"
            aria-label="开启新会话"
          >
            ↻
          </button>

          <button
            type="button"
            onClick={onClose}
            title="关闭助手"
            aria-label="关闭助手"
          >
            ×
          </button>
        </div>
      </header>

      {/* 消息区域 */}
      <div className="assistant-messages">
        {messages.length === 0 ? (
          <div className="assistant-welcome">
            <div className="assistant-welcome-icon">
              ✳
            </div>

            <h3>有什么售后问题需要处理？</h3>

            <p>
              我可以帮你查询商品、售后记录和待办任务，
              也可以协助整理购物后的事项。
            </p>

            <div className="assistant-quick-prompts">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={loading}
                  onClick={() => handleSend(prompt)}
                >
                  {prompt}
                  <span>→</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="assistant-message-list">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`assistant-message ${message.role}`}
              >
                {message.role === 'assistant' && (
                  <div className="assistant-message-avatar">
                    ✳
                  </div>
                )}

                <div className="assistant-message-content">
                  {message.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="assistant-message assistant">
                <div className="assistant-message-avatar">
                  ✳
                </div>

                <div className="assistant-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="assistant-error" role="alert">
            {error}
          </div>
        )}
      </div>

      {/* 输入区域 */}
      <footer className="assistant-input-area">
        <div className="assistant-input-box">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你想查询的商品、售后或任务..."
            rows={2}
            disabled={loading}
            maxLength={2000}
          />

          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
          >
            {loading ? '处理中…' : '发送'}
          </button>
        </div>

        <div className="assistant-input-hint">
          Enter 发送 · Shift + Enter 换行
        </div>
      </footer>
    </aside>
  )
}

export default AssistantDrawer