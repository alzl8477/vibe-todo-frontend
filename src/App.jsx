import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const API_URL = 'http://localhost:5000/todos'

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

async function requestTodos(path = '', options = {}) {
  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('백엔드 서버에 연결할 수 없습니다. localhost:5000 서버가 실행 중인지 확인해 주세요.')
  }

  let data
  try {
    data = await response.json()
  } catch {
    throw new Error('서버 응답을 읽을 수 없습니다.')
  }

  if (!response.ok) {
    throw new Error(data?.message || '요청을 처리하지 못했습니다.')
  }

  return data
}

function App() {
  const [todos, setTodos] = useState([])
  const [title, setTitle] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedDate, setSelectedDate] = useState(getLocalDateString)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const datePickerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pendingId, setPendingId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadTodos() {
      try {
        const data = await requestTodos(`?date=${encodeURIComponent(selectedDate)}`)
        if (!Array.isArray(data)) {
          throw new Error('서버에서 올바른 할 일 목록을 받지 못했습니다.')
        }
        if (isMounted) setTodos(data)
      } catch (loadError) {
        if (isMounted) setError(loadError.message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadTodos()
    return () => {
      isMounted = false
    }
  }, [selectedDate])

  useEffect(() => {
    if (!calendarOpen) return undefined

    function closeOnOutsideClick(event) {
      if (!datePickerRef.current?.contains(event.target)) {
        setCalendarOpen(false)
      }
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setCalendarOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [calendarOpen])

  const completedCount = todos.filter((todo) => todo.completed).length
  const remainingCount = todos.length - completedCount
  const achievementRate =
    todos.length === 0 ? 0 : Math.round((completedCount / todos.length) * 100)
  const visibleTodos = useMemo(
    () =>
      todos.filter((todo) => {
        if (filter === 'active') return !todo.completed
        if (filter === 'completed') return todo.completed
        return true
      }),
    [filter, todos],
  )

  async function addTodo(event) {
    event.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle || saving) return

    setSaving(true)
    setError('')
    try {
      const todo = await requestTodos('', {
        method: 'POST',
        body: JSON.stringify({ title: trimmedTitle, date: selectedDate }),
      })
      setTodos((currentTodos) => [todo, ...currentTodos])
      setTitle('')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleTodo(todo) {
    setPendingId(todo._id)
    setError('')
    try {
      const updatedTodo = await requestTodos(`/${todo._id}/completed`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !todo.completed }),
      })
      setTodos((currentTodos) =>
        currentTodos.map((item) => (item._id === todo._id ? updatedTodo : item)),
      )
    } catch (updateError) {
      setError(updateError.message)
    } finally {
      setPendingId(null)
    }
  }

  async function saveTodo(todo) {
    const trimmedTitle = editingTitle.trim()
    if (!trimmedTitle) {
      setError('할 일 제목을 입력해 주세요.')
      return
    }

    setPendingId(todo._id)
    setError('')
    try {
      const updatedTodo = await requestTodos(`/${todo._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: trimmedTitle }),
      })
      setTodos((currentTodos) =>
        currentTodos.map((item) => (item._id === todo._id ? updatedTodo : item)),
      )
      setEditingId(null)
      setEditingTitle('')
    } catch (updateError) {
      setError(updateError.message)
    } finally {
      setPendingId(null)
    }
  }

  async function deleteTodo(todo) {
    setPendingId(todo._id)
    setError('')
    try {
      await requestTodos(`/${todo._id}`, { method: 'DELETE' })
      setTodos((currentTodos) => currentTodos.filter((item) => item._id !== todo._id))
      if (editingId === todo._id) {
        setEditingId(null)
        setEditingTitle('')
      }
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setPendingId(null)
    }
  }

  function startEditing(todo) {
    setEditingId(todo._id)
    setEditingTitle(todo.title)
    setError('')
  }

  function changeSelectedDate(date) {
    if (date === selectedDate) return
    setSelectedDate(date)
    setLoading(true)
    setTodos([])
    setError('')
    setEditingId(null)
    setEditingTitle('')
  }

  function toggleCalendar() {
    if (!calendarOpen) {
      const [year, month] = selectedDate.split('-').map(Number)
      setCalendarMonth(new Date(year, month - 1, 1))
    }
    setCalendarOpen((isOpen) => !isOpen)
  }

  function changeCalendarMonth(offset) {
    setCalendarMonth(
      (currentMonth) =>
        new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1),
    )
  }

  function selectCalendarDate(day) {
    const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day)
    changeSelectedDate(getLocalDateString(date))
    setCalendarOpen(false)
  }

  const today = getLocalDateString()
  const calendarYear = calendarMonth.getFullYear()
  const calendarMonthIndex = calendarMonth.getMonth()
  const calendarOffset = (new Date(calendarYear, calendarMonthIndex, 1).getDay() + 6) % 7
  const calendarDayCount = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate()
  const calendarDays = [
    ...Array(calendarOffset).fill(null),
    ...Array.from({ length: calendarDayCount }, (_, index) => index + 1),
  ]

  return (
    <main className="app-shell">
      <section className="todo-card" aria-labelledby="page-title">
        <header className="app-header">
          <div className="header-topline">
            <p className="eyebrow">오늘도 차근차근</p>
            <div className="date-controls">
              {selectedDate !== today && (
                <button
                  className="today-button"
                  type="button"
                  onClick={() => changeSelectedDate(today)}
                >
                  오늘
                </button>
              )}
              <div className="date-picker-wrap" ref={datePickerRef}>
                <button
                  className="date-picker"
                  type="button"
                  onClick={toggleCalendar}
                  aria-label={`날짜 선택, 현재 ${formatDate(selectedDate)}`}
                  aria-expanded={calendarOpen}
                  aria-haspopup="dialog"
                >
                  <svg
                    aria-hidden="true"
                    className="calendar-icon"
                    viewBox="0 0 20 20"
                    fill="none"
                  >
                    <rect x="3" y="5" width="14" height="12" rx="2" />
                    <path d="M6.5 3.5v3M13.5 3.5v3M3 8.5h14" />
                  </svg>
                  <span>{formatDate(selectedDate)}</span>
                </button>
                {calendarOpen && (
                  <div className="calendar-popover" role="dialog" aria-label="날짜 선택">
                    <div className="calendar-header">
                      <button
                        className="calendar-nav"
                        type="button"
                        onClick={() => changeCalendarMonth(-1)}
                        aria-label="이전 달"
                      >
                        ‹
                      </button>
                      <strong>
                        {calendarYear}년 {calendarMonthIndex + 1}월
                      </strong>
                      <button
                        className="calendar-nav"
                        type="button"
                        onClick={() => changeCalendarMonth(1)}
                        aria-label="다음 달"
                      >
                        ›
                      </button>
                    </div>
                    <div className="calendar-grid calendar-weekdays" aria-hidden="true">
                      {['월', '화', '수', '목', '금', '토', '일'].map((weekday) => (
                        <span key={weekday}>{weekday}</span>
                      ))}
                    </div>
                    <div className="calendar-grid calendar-days">
                      {calendarDays.map((day, index) => {
                        if (day === null) {
                          return <span className="calendar-empty" key={`empty-${index}`} />
                        }

                        const date = getLocalDateString(
                          new Date(calendarYear, calendarMonthIndex, day),
                        )
                        const isToday = date === today
                        const isSelected = date === selectedDate

                        return (
                          <button
                            className={[
                              'calendar-day',
                              isToday && 'today',
                              isSelected && 'selected',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            key={date}
                            type="button"
                            onClick={() => selectCalendarDate(day)}
                            aria-label={formatDate(date)}
                            aria-current={isToday ? 'date' : undefined}
                            aria-pressed={isSelected}
                          >
                            {day}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      className="calendar-today"
                      type="button"
                      onClick={() => {
                        changeSelectedDate(today)
                        setCalendarOpen(false)
                      }}
                    >
                      오늘로 이동
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <h1 id="page-title">나의 할 일</h1>
          <p className="subtitle">{formatDate(selectedDate)}의 할 일</p>
        </header>

        <form className="todo-form" onSubmit={addTodo}>
          <label className="visually-hidden" htmlFor="new-todo">
            새로운 할 일
          </label>
          <input
            id="new-todo"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="새로운 할 일을 입력하세요"
            maxLength={200}
            disabled={saving}
          />
          <button type="submit" className="add-button" disabled={saving || !title.trim()}>
            {saving ? '추가 중...' : '추가'}
          </button>
        </form>

        <div className="summary" aria-live="polite">
          <span>
            남은 할 일 <strong>{remainingCount}</strong>
          </span>
          <span>
            완료 <strong>{completedCount}</strong>
          </span>
        </div>

        <section className="progress-section" aria-label="할 일 달성률">
          <div className="progress-heading">
            <div className="progress-label">
              <span>달성률</span>
              <strong>{achievementRate}%</strong>
            </div>
            {achievementRate >= 50 && (
              <p className="encouragement">
                <span aria-hidden="true">🏃</span>
                거의 다 왔어요! 힘을 내요!
              </p>
            )}
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="할 일 달성률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={achievementRate}
          >
            <span className="progress-fill" style={{ width: `${achievementRate}%` }} />
          </div>
          <p className="progress-caption">
            {completedCount} / {todos.length} 완료
          </p>
        </section>

        <nav className="filters" aria-label="할 일 필터">
          {[
            ['all', '전체'],
            ['active', '진행 중'],
            ['completed', '완료'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'filter-button selected' : 'filter-button'}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
            >
              {label}
            </button>
          ))}
        </nav>

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <p className="list-message" role="status">
            할 일을 불러오는 중...
          </p>
        ) : visibleTodos.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">
              ✓
            </span>
            <p>{todos.length === 0 ? '아직 할 일이 없어요.' : '표시할 할 일이 없어요.'}</p>
            <span>할 일을 추가하고 하나씩 완료해 보세요.</span>
          </div>
        ) : (
          <ul className="todo-list">
            {visibleTodos.map((todo) => {
              const isPending = pendingId === todo._id
              const isEditing = editingId === todo._id

              return (
                <li className={todo.completed ? 'todo-item completed' : 'todo-item'} key={todo._id}>
                  <input
                    className="todo-checkbox"
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => toggleTodo(todo)}
                    disabled={isPending}
                    aria-label={`${todo.title} 완료`}
                  />
                  {isEditing ? (
                    <form
                      className="edit-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        saveTodo(todo)
                      }}
                    >
                      <input
                        className="edit-input"
                        type="text"
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        maxLength={200}
                        autoFocus
                        aria-label="할 일 제목 수정"
                      />
                      <button className="text-button save-button" type="submit" disabled={isPending}>
                        저장
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => {
                          setEditingId(null)
                          setEditingTitle('')
                        }}
                      >
                        취소
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="todo-title">{todo.title}</span>
                      <div className="todo-actions">
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => startEditing(todo)}
                          disabled={isPending}
                          aria-label={`${todo.title} 수정`}
                          title="수정"
                        >
                          수정
                        </button>
                        <button
                          className="icon-button delete-button"
                          type="button"
                          onClick={() => deleteTodo(todo)}
                          disabled={isPending}
                          aria-label={`${todo.title} 삭제`}
                          title="삭제"
                        >
                          삭제
                        </button>
                      </div>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <footer className="card-footer">
          <span>{todos.length}개의 할 일</span>
          <span>꾸준히 해내고 있어요!</span>
        </footer>
      </section>
    </main>
  )
}

export default App
