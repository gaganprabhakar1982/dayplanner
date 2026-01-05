import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  query, 
  orderBy, 
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  enableIndexedDbPersistence,
  writeBatch
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut 
} from 'firebase/auth';

// ============================================
// FIREBASE CONFIG - Replace with your values
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyDy0pTEm1qxdVdqdQUQ8I7TAB6Yd2zabgs",
  authDomain: "daily-tracker-2e4f4.firebaseapp.com",
  projectId: "daily-tracker-2e4f4",
  storageBucket: "daily-tracker-2e4f4.firebasestorage.app",
  messagingSenderId: "111250357138",
  appId: "1:111250357138:web:ebd7983f1b714b9e7e5f4b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.log('Persistence failed: Multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.log('Persistence not available');
  }
});

// ============================================
// UTILITY FUNCTIONS
// ============================================
const formatTime = (minutes) => {
  if (!minutes) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
};

const parseLocalDate = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatDate = (dateStr) => {
  const date = parseLocalDate(dateStr);
  const today = new Date();
  today.setHours(0,0,0,0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
  if (date.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const getTodayStr = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const dateToStr = (date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getNextDay = (dateStr) => {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + 1);
  return dateToStr(date);
};

// Sort tasks: pending first, then done
const sortTasks = (tasks) => {
  return [...tasks].sort((a, b) => {
    if (a.status === 'Done' && b.status !== 'Done') return 1;
    if (a.status !== 'Done' && b.status === 'Done') return -1;
    return 0;
  });
};

// ============================================
// COMPONENTS
// ============================================

// Login Screen - Improved UI
const LoginScreen = ({ onLogin }) => (
  <div className="login-screen">
    <div className="login-bg">
      <div className="login-shape shape-1"></div>
      <div className="login-shape shape-2"></div>
      <div className="login-shape shape-3"></div>
    </div>
    <div className="login-content">
      <div className="login-logo">
        <svg viewBox="0 0 48 48" fill="none">
          <rect width="48" height="48" rx="12" fill="#10B981"/>
          <path d="M14 24L21 31L34 18" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h1>DayPlanner</h1>
      <p>Organize your day, track your progress</p>
      <div className="login-features">
        <div className="feature-item">
          <span>✓</span> Track work & personal tasks
        </div>
        <div className="feature-item">
          <span>✓</span> Sync across all devices
        </div>
        <div className="feature-item">
          <span>✓</span> Analyze your productivity
        </div>
      </div>
      <button className="google-btn" onClick={onLogin}>
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>
      <p className="login-footer">Your data stays private and secure</p>
    </div>
  </div>
);

// Progress Summary
const ProgressSummary = ({ workDone, workTotal, personalDone, personalTotal }) => {
  const totalDone = workDone + personalDone;
  const totalAll = workTotal + personalTotal;
  const percent = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;
  
  return (
    <div className="progress-summary">
      <div className="progress-main">
        <div className="progress-bar-bg">
          <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
        </div>
        <span className="progress-text">{formatTime(totalDone)} / {formatTime(totalAll)}</span>
      </div>
      <div className="progress-breakdown">
        <span className="breakdown-item work">
          <span className="dot"></span>
          Work: {formatTime(workDone)}/{formatTime(workTotal)}
        </span>
        <span className="breakdown-item personal">
          <span className="dot"></span>
          Personal: {formatTime(personalDone)}/{formatTime(personalTotal)}
        </span>
      </div>
    </div>
  );
};

// Swipeable Task Item
const TaskItem = ({ task, onToggle, onEdit, onDelete, isSelected, onSelect }) => {
  const [swipeX, setSwipeX] = useState(0);
  const [startX, setStartX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const taskRef = useRef(null);
  const isDone = task.status === 'Done';
  
  const handleTouchStart = (e) => {
    setStartX(e.touches[0].clientX);
    setIsSwiping(true);
  };
  
  const handleTouchMove = (e) => {
    if (!isSwiping) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    // Only allow left swipe (negative values), limit to -140px
    if (diff < 0) {
      setSwipeX(Math.max(diff, -140));
    } else {
      setSwipeX(0);
    }
  };
  
  const handleTouchEnd = () => {
    setIsSwiping(false);
    // Snap to open or closed position
    if (swipeX < -70) {
      setSwipeX(-140);
    } else {
      setSwipeX(0);
    }
  };
  
  const closeSwipe = () => {
    setSwipeX(0);
  };
  
  return (
    <div className={`task-wrapper ${isSelected ? 'selected' : ''}`}>
      <div 
        className="task-actions"
        style={{ opacity: Math.min(1, Math.abs(swipeX) / 70) }}
      >
        <button className="action-btn edit" onClick={() => { closeSwipe(); onEdit(task); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Edit
        </button>
        <button className="action-btn delete" onClick={() => { closeSwipe(); onDelete(task.id); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Delete
        </button>
      </div>
      <div 
        ref={taskRef}
        className={`task-item ${isDone ? 'done' : ''} ${task.category.toLowerCase()}`}
        style={{ transform: `translateX(${swipeX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button 
          className={`checkbox ${isDone ? 'checked' : ''}`}
          onClick={() => onToggle(task.id, task.status)}
        >
          {isDone && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
        <div className="task-content">
          <span className="task-name">{task.task}</span>
          <div className="task-meta">
            <span className={`category-dot ${task.category.toLowerCase()}`}></span>
            <span className="time-badge">{formatTime(task.timeRequired)}</span>
            {task.repeat && task.repeat !== 'none' && (
              <span className="repeat-badge">🔁</span>
            )}
          </div>
        </div>
        <button 
          className={`select-btn ${isSelected ? 'selected' : ''}`}
          onClick={(e) => { e.stopPropagation(); onSelect(task.id); }}
        >
          {isSelected ? '✓' : ''}
        </button>
      </div>
    </div>
  );
};

// Add/Edit Task Modal
const TaskModal = ({ task, onSave, onClose, selectedDate }) => {
  const [formData, setFormData] = useState(task || {
    task: '',
    category: 'Work',
    timeRequired: 30,
    status: 'Pending',
    date: selectedDate,
    repeat: 'none'
  });
  
  const timePresets = [15, 30, 60, 90, 120];
  
  const repeatOptions = [
    { value: 'none', label: 'No repeat' },
    { value: 'daily', label: 'Daily' },
    { value: 'alternate', label: 'Alternate days' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'fortnightly', label: 'Fortnightly' },
    { value: 'monthly', label: 'Monthly' }
  ];
  
  const handleSave = () => {
    if (!formData.task.trim()) return;
    onSave(formData);
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{task ? 'Edit Task' : 'New Task'}</h2>
          <button className="close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        <div className="form-group">
          <label>Task Name</label>
          <input
            type="text"
            placeholder="What needs to be done?"
            value={formData.task}
            onChange={e => setFormData({...formData, task: e.target.value})}
            autoFocus
          />
        </div>
        
        <div className="form-group">
          <label>Category</label>
          <div className="form-row">
            <button 
              className={`cat-btn ${formData.category === 'Work' ? 'active work' : ''}`}
              onClick={() => setFormData({...formData, category: 'Work'})}
            >
              💼 Work
            </button>
            <button 
              className={`cat-btn ${formData.category === 'Personal' ? 'active personal' : ''}`}
              onClick={() => setFormData({...formData, category: 'Personal'})}
            >
              🏠 Personal
            </button>
          </div>
        </div>
        
        <div className="form-group">
          <label>Duration</label>
          <div className="time-presets">
            {timePresets.map(t => (
              <button
                key={t}
                className={`preset-btn ${formData.timeRequired === t ? 'active' : ''}`}
                onClick={() => setFormData({...formData, timeRequired: t})}
              >
                {formatTime(t)}
              </button>
            ))}
          </div>
          <div className="slider-row">
            <input
              type="range"
              min="5"
              max="240"
              step="5"
              value={formData.timeRequired}
              onChange={e => setFormData({...formData, timeRequired: parseInt(e.target.value)})}
            />
            <span className="slider-value">{formatTime(formData.timeRequired)}</span>
          </div>
        </div>
        
        <div className="form-row-2">
          <div className="form-group">
            <label>Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={e => setFormData({...formData, date: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>Repeat</label>
            <select 
              value={formData.repeat}
              onChange={e => setFormData({...formData, repeat: e.target.value})}
            >
              {repeatOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        
        <button className="save-btn" onClick={handleSave}>
          {task ? 'Save Changes' : 'Add Task'}
        </button>
      </div>
    </div>
  );
};

// Shift Tasks Modal
const ShiftModal = ({ onClose, onShift, selectedCount, targetDate }) => {
  const [shiftDate, setShiftDate] = useState(getNextDay(targetDate));
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content shift-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Shift Tasks</h2>
          <button className="close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        <p className="shift-info">
          {selectedCount > 0 
            ? `Move ${selectedCount} selected task${selectedCount > 1 ? 's' : ''} to:`
            : 'Move all incomplete tasks to:'}
        </p>
        
        <div className="form-group">
          <input
            type="date"
            value={shiftDate}
            onChange={e => setShiftDate(e.target.value)}
          />
        </div>
        
        <div className="shift-buttons">
          <button className="quick-shift-btn" onClick={() => setShiftDate(getNextDay(targetDate))}>
            Tomorrow
          </button>
          <button className="quick-shift-btn" onClick={() => {
            const d = parseLocalDate(targetDate);
            d.setDate(d.getDate() + 7);
            setShiftDate(dateToStr(d));
          }}>
            Next Week
          </button>
        </div>
        
        <button className="save-btn" onClick={() => onShift(shiftDate)}>
          Shift Tasks
        </button>
      </div>
    </div>
  );
};

// Settings/Export Modal
const SettingsModal = ({ onClose, tasks, user, onSignOut }) => {
  const [exportStatus, setExportStatus] = useState('');
  
  const exportToCSV = () => {
    const headers = ['Date', 'Task', 'Category', 'Time Required (mins)', 'Status', 'Created'];
    const rows = tasks.map(t => [
      t.date,
      `"${t.task.replace(/"/g, '""')}"`,
      t.category,
      t.timeRequired,
      t.status,
      t.createdAt || ''
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dayplanner-export-${getTodayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportStatus('✅ CSV downloaded!');
  };
  
  const exportToSheets = async () => {
    try {
      const headers = 'Date\tTask\tCategory\tTime Required\tStatus';
      const rows = tasks.map(t => 
        `${t.date}\t${t.task}\t${t.category}\t${t.timeRequired}\t${t.status}`
      );
      const tsvData = [headers, ...rows].join('\n');
      
      await navigator.clipboard.writeText(tsvData);
      setExportStatus('✅ Copied! Open Google Sheets → Ctrl+V to paste');
    } catch (err) {
      setExportStatus('❌ Failed to copy. Try CSV download instead.');
    }
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        <div className="user-info">
          {user.photoURL ? (
            <img src={user.photoURL} alt="" className="user-avatar" />
          ) : (
            <div className="user-avatar-placeholder">{user.displayName?.charAt(0) || 'U'}</div>
          )}
          <div>
            <div className="user-name">{user.displayName}</div>
            <div className="user-email">{user.email}</div>
          </div>
        </div>
        
        <div className="settings-section">
          <h3>Export Data</h3>
          <p className="section-desc">Backup your {tasks.length} tasks</p>
          
          <button className="export-btn" onClick={exportToSheets}>
            <span>📊</span> Copy for Google Sheets
          </button>
          
          <button className="export-btn" onClick={exportToCSV}>
            <span>📄</span> Download CSV
          </button>
          
          {exportStatus && <p className="export-status">{exportStatus}</p>}
        </div>
        
        <button className="signout-btn" onClick={onSignOut}>
          Sign Out
        </button>
      </div>
    </div>
  );
};

// Calendar View
const CalendarView = ({ tasks, onDateSelect, selectedDate }) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = parseLocalDate(selectedDate);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  };
  
  const days = getDaysInMonth(currentMonth);
  const today = getTodayStr();
  
  const getTaskCount = (date) => {
    if (!date) return { work: 0, personal: 0 };
    const dateStr = dateToStr(date);
    const dayTasks = tasks.filter(t => t.date === dateStr);
    return {
      work: dayTasks.filter(t => t.category === 'Work').length,
      personal: dayTasks.filter(t => t.category === 'Personal').length
    };
  };
  
  return (
    <div className="calendar-view">
      <div className="calendar-nav">
        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="nav-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2>{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="nav-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
      
      <div className="calendar-weekdays">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      
      <div className="calendar-grid">
        {days.map((date, i) => {
          if (!date) return <div key={i} className="cal-cell empty" />;
          
          const dateStr = dateToStr(date);
          const counts = getTaskCount(date);
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          
          return (
            <div 
              key={i} 
              className={`cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() => onDateSelect(dateStr)}
            >
              <span className="cal-date-num">{date.getDate()}</span>
              {(counts.work > 0 || counts.personal > 0) && (
                <div className="cal-dots">
                  {counts.work > 0 && <span className="cal-dot work" />}
                  {counts.personal > 0 && <span className="cal-dot personal" />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Analytics View
const AnalyticsView = ({ tasks }) => {
  const last7Days = Array.from({length: 7}, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return dateToStr(d);
  });
  
  const weeklyData = last7Days.map(date => {
    const dayTasks = tasks.filter(t => t.date === date);
    const workDone = dayTasks.filter(t => t.category === 'Work' && t.status === 'Done')
      .reduce((sum, t) => sum + t.timeRequired, 0);
    const personalDone = dayTasks.filter(t => t.category === 'Personal' && t.status === 'Done')
      .reduce((sum, t) => sum + t.timeRequired, 0);
    return { date, workDone, personalDone, total: workDone + personalDone };
  });
  
  const maxTime = Math.max(...weeklyData.map(d => d.total), 60);
  
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'Done').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  const totalWork = weeklyData.reduce((s, d) => s + d.workDone, 0);
  const totalPersonal = weeklyData.reduce((s, d) => s + d.personalDone, 0);
  
  return (
    <div className="analytics-view">
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{completionRate}%</span>
          <span className="stat-label">Done</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{formatTime(totalWork)}</span>
          <span className="stat-label">Work (7d)</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{formatTime(totalPersonal)}</span>
          <span className="stat-label">Personal (7d)</span>
        </div>
      </div>
      
      <div className="chart-card">
        <h3>Last 7 Days</h3>
        <div className="bar-chart">
          {weeklyData.map((day) => (
            <div key={day.date} className="bar-col">
              <div className="bar-stack">
                <div className="bar personal" style={{ height: `${(day.personalDone / maxTime) * 100}%` }} />
                <div className="bar work" style={{ height: `${(day.workDone / maxTime) * 100}%` }} />
              </div>
              <span className="bar-day">{parseLocalDate(day.date).toLocaleDateString('en-US', { weekday: 'short' }).charAt(0)}</span>
            </div>
          ))}
        </div>
        <div className="chart-legend">
          <span><span className="legend-dot work"></span> Work</span>
          <span><span className="legend-dot personal"></span> Personal</span>
        </div>
      </div>
      
      <div className="insight-card">
        <span className="insight-icon">⚖️</span>
        <p>Work-Life Split: <strong>{totalWork + totalPersonal > 0 ? Math.round(totalWork / (totalWork + totalPersonal) * 100) : 0}%</strong> work, <strong>{totalWork + totalPersonal > 0 ? Math.round(totalPersonal / (totalWork + totalPersonal) * 100) : 0}%</strong> personal</p>
      </div>
    </div>
  );
};

// ============================================
// MAIN APP
// ============================================
export default function DayPlannerApp() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [activeTab, setActiveTab] = useState('today');
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [selectedTasks, setSelectedTasks] = useState([]);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);
  
  useEffect(() => {
    if (!user) return;
    
    const q = query(
      collection(db, 'users', user.uid, 'tasks'),
      orderBy('date', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTasks(tasksData);
    });
    
    return unsubscribe;
  }, [user]);
  
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Login failed:', err);
    }
  };
  
  const handleSignOut = async () => {
    await signOut(auth);
    setShowSettings(false);
  };
  
  const toggleTask = async (taskId, currentStatus) => {
    const taskRef = doc(db, 'users', user.uid, 'tasks', taskId);
    await updateDoc(taskRef, {
      status: currentStatus === 'Done' ? 'Pending' : 'Done',
      completedAt: currentStatus === 'Done' ? null : new Date().toISOString()
    });
  };
  
  const handleSave = async (taskData) => {
    if (editingTask) {
      const taskRef = doc(db, 'users', user.uid, 'tasks', editingTask.id);
      await updateDoc(taskRef, taskData);
    } else {
      const dates = [taskData.date];
      if (taskData.repeat !== 'none') {
        const baseDate = parseLocalDate(taskData.date);
        for (let i = 1; i <= 30; i++) {
          const newDate = new Date(baseDate);
          switch (taskData.repeat) {
            case 'daily': newDate.setDate(baseDate.getDate() + i); break;
            case 'alternate': newDate.setDate(baseDate.getDate() + (i * 2)); break;
            case 'weekly': newDate.setDate(baseDate.getDate() + (i * 7)); break;
            case 'fortnightly': newDate.setDate(baseDate.getDate() + (i * 14)); break;
            case 'monthly': newDate.setMonth(baseDate.getMonth() + i); break;
          }
          if (taskData.repeat === 'monthly' && i > 6) break;
          if (taskData.repeat === 'fortnightly' && i > 8) break;
          if (taskData.repeat === 'weekly' && i > 12) break;
          dates.push(dateToStr(newDate));
        }
      }
      
      for (const date of dates) {
        await addDoc(collection(db, 'users', user.uid, 'tasks'), {
          ...taskData,
          date,
          createdAt: new Date().toISOString()
        });
      }
    }
    setShowModal(false);
    setEditingTask(null);
  };
  
  const handleDelete = async (taskId) => {
    if (window.confirm('Delete this task?')) {
      await deleteDoc(doc(db, 'users', user.uid, 'tasks', taskId));
    }
  };
  
  const handleEdit = (task) => {
    setEditingTask(task);
    setShowModal(true);
  };
  
  const handleSelectTask = (taskId) => {
    setSelectedTasks(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };
  
  const handleShift = async (newDate) => {
    const currentDateTasks = activeTab === 'today' 
      ? tasks.filter(t => t.date === getTodayStr())
      : tasks.filter(t => t.date === selectedDate);
    
    const tasksToShift = selectedTasks.length > 0
      ? currentDateTasks.filter(t => selectedTasks.includes(t.id) && t.status !== 'Done')
      : currentDateTasks.filter(t => t.status !== 'Done');
    
    const batch = writeBatch(db);
    
    for (const task of tasksToShift) {
      const taskRef = doc(db, 'users', user.uid, 'tasks', task.id);
      batch.update(taskRef, { date: newDate });
    }
    
    await batch.commit();
    setSelectedTasks([]);
    setShowShiftModal(false);
  };
  
  const navigateDate = (direction) => {
    const current = parseLocalDate(selectedDate);
    current.setDate(current.getDate() + direction);
    setSelectedDate(dateToStr(current));
    setSelectedTasks([]);
  };
  
  const today = getTodayStr();
  const todayTasks = sortTasks(tasks.filter(t => t.date === today));
  const selectedDateTasks = sortTasks(tasks.filter(t => t.date === selectedDate));
  
  const workTasks = todayTasks.filter(t => t.category === 'Work');
  const personalTasks = todayTasks.filter(t => t.category === 'Personal');
  const workDone = workTasks.filter(t => t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0);
  const workTotal = workTasks.reduce((s, t) => s + t.timeRequired, 0);
  const personalDone = personalTasks.filter(t => t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0);
  const personalTotal = personalTasks.reduce((s, t) => s + t.timeRequired, 0);
  
  const pendingCount = activeTab === 'today' 
    ? todayTasks.filter(t => t.status !== 'Done').length
    : selectedDateTasks.filter(t => t.status !== 'Done').length;
  
  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }
  
  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }
  
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        :root {
          --bg: #F4F4F2;
          --card: #FFFFFF;
          --text: #1A1A1A;
          --text-secondary: #52525B;
          --muted: #71717A;
          --work: #F59E0B;
          --work-light: #FEF3C7;
          --personal: #10B981;
          --personal-light: #D1FAE5;
          --border: #E4E4E7;
          --danger: #EF4444;
          --danger-light: #FEE2E2;
          --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
          --shadow: 0 4px 12px rgba(0,0,0,0.06);
          --shadow-lg: 0 8px 24px rgba(0,0,0,0.1);
          --radius: 16px;
          --radius-sm: 12px;
        }
        
        html, body, #root {
          width: 100%;
          min-height: 100vh;
          min-height: 100dvh;
          margin: 0;
          padding: 0;
          overflow-x: hidden;
        }
        
        body { 
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background: var(--bg);
          color: var(--text);
          -webkit-font-smoothing: antialiased;
        }
        
        .app {
          width: 100%;
          max-width: 480px;
          margin: 0 auto;
          min-height: 100vh;
          min-height: 100dvh;
          background: var(--bg);
          padding-bottom: 90px;
          position: relative;
        }
        
        /* Loading */
        .loading {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          height: 100dvh;
          background: var(--bg);
        }
        
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border);
          border-top-color: var(--personal);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        /* Login Screen - Improved */
        .login-screen {
          width: 100%;
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #065F46 0%, #047857 50%, #10B981 100%);
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        
        .login-bg {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          overflow: hidden;
        }
        
        .login-shape {
          position: absolute;
          border-radius: 50%;
          opacity: 0.1;
          background: white;
        }
        
        .shape-1 {
          width: 300px;
          height: 300px;
          top: -100px;
          right: -100px;
        }
        
        .shape-2 {
          width: 200px;
          height: 200px;
          bottom: 20%;
          left: -80px;
        }
        
        .shape-3 {
          width: 150px;
          height: 150px;
          bottom: -50px;
          right: 20%;
        }
        
        .login-content {
          text-align: center;
          color: white;
          width: 100%;
          max-width: 340px;
          position: relative;
          z-index: 1;
        }
        
        .login-logo {
          margin-bottom: 24px;
        }
        
        .login-logo svg {
          width: 72px;
          height: 72px;
          filter: drop-shadow(0 4px 12px rgba(0,0,0,0.2));
        }
        
        .login-content h1 { 
          font-size: 32px; 
          font-weight: 700; 
          margin-bottom: 8px; 
          letter-spacing: -0.5px;
        }
        
        .login-content > p { 
          color: rgba(255,255,255,0.8); 
          margin-bottom: 32px; 
          font-size: 16px;
        }
        
        .login-features {
          text-align: left;
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 32px;
        }
        
        .feature-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          font-size: 14px;
          color: rgba(255,255,255,0.9);
        }
        
        .feature-item span {
          width: 24px;
          height: 24px;
          background: rgba(255,255,255,0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
        }
        
        .google-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          padding: 16px 32px;
          background: white;
          color: var(--text);
          border: none;
          border-radius: 14px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: var(--shadow-lg);
          transition: transform 0.2s;
        }
        
        .google-btn:active {
          transform: scale(0.98);
        }
        
        .login-footer {
          margin-top: 24px;
          font-size: 12px;
          color: rgba(255,255,255,0.6);
        }
        
        /* Header */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: var(--card);
          position: sticky;
          top: 0;
          z-index: 50;
          border-bottom: 1px solid var(--border);
        }
        
        .header-left h1 {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.5px;
          color: var(--text);
        }
        
        .header-left span {
          font-size: 13px;
          color: var(--muted);
          margin-top: 2px;
          display: block;
        }
        
        .header-right {
          display: flex;
          gap: 8px;
        }
        
        .icon-btn {
          width: 40px;
          height: 40px;
          min-width: 40px;
          border-radius: 50%;
          border: none;
          background: var(--bg);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          transition: background 0.2s;
        }
        
        .icon-btn:active {
          background: var(--border);
        }
        
        /* FAB */
        .fab {
          position: fixed;
          bottom: 100px;
          right: 20px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: var(--personal);
          color: white;
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 90;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .fab:active {
          transform: scale(0.95);
        }
        
        .fab svg {
          width: 24px;
          height: 24px;
        }
        
        @media (min-width: 481px) {
          .fab {
            right: calc(50% - 240px + 20px);
          }
        }
        
        /* Progress Summary */
        .progress-summary {
          padding: 16px 20px;
          background: var(--card);
          border-bottom: 1px solid var(--border);
        }
        
        .progress-main {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 10px;
        }
        
        .progress-bar-bg {
          flex: 1;
          height: 10px;
          background: var(--border);
          border-radius: 5px;
          overflow: hidden;
        }
        
        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--work) 0%, var(--personal) 100%);
          border-radius: 5px;
          transition: width 0.4s ease;
        }
        
        .progress-text {
          font-size: 14px;
          font-weight: 600;
          white-space: nowrap;
          min-width: 90px;
          text-align: right;
          color: var(--text);
        }
        
        .progress-breakdown {
          display: flex;
          gap: 20px;
        }
        
        .breakdown-item {
          font-size: 12px;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .breakdown-item .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        
        .breakdown-item.work .dot { background: var(--work); }
        .breakdown-item.personal .dot { background: var(--personal); }
        
        /* Tasks Section */
        .tasks-section {
          padding: 16px 20px 20px;
        }
        
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }
        
        .section-header h2 {
          font-size: 16px;
          font-weight: 600;
          color: var(--text);
        }
        
        .section-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .task-count {
          font-size: 13px;
          color: var(--muted);
        }
        
        .shift-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .shift-btn:active {
          background: var(--bg);
        }
        
        .shift-btn svg {
          width: 16px;
          height: 16px;
        }
        
        /* Task Wrapper with Swipe */
        .task-wrapper {
          position: relative;
          margin-bottom: 10px;
          overflow: hidden;
          border-radius: var(--radius);
        }
        
        .task-wrapper.selected .task-item {
          background: var(--personal-light);
        }
        
        .task-actions {
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 140px;
          display: flex;
          gap: 0;
        }
        
        .action-btn {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          border: none;
          cursor: pointer;
          font-size: 11px;
          font-weight: 500;
          color: white;
        }
        
        .action-btn svg {
          width: 20px;
          height: 20px;
        }
        
        .action-btn.edit {
          background: #3B82F6;
        }
        
        .action-btn.delete {
          background: var(--danger);
        }
        
        /* Task Item */
        .task-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px;
          background: var(--card);
          border-radius: var(--radius);
          border-left: 4px solid var(--border);
          position: relative;
          box-shadow: var(--shadow-sm);
          transition: transform 0.15s ease-out;
          will-change: transform;
        }
        
        .task-item.work { border-left-color: var(--work); }
        .task-item.personal { border-left-color: var(--personal); }
        
        .task-item.done { 
          opacity: 0.55;
          background: var(--bg);
        }
        
        .task-item.done .task-name { 
          text-decoration: line-through;
          color: var(--muted);
        }
        
        .checkbox {
          width: 24px;
          height: 24px;
          min-width: 24px;
          min-height: 24px;
          border-radius: 50%;
          border: 2px solid var(--border);
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          padding: 0;
          flex-shrink: 0;
        }
        
        .checkbox.checked {
          background: var(--personal);
          border-color: var(--personal);
        }
        
        .checkbox svg { 
          width: 14px; 
          height: 14px; 
          color: white;
        }
        
        .task-content { 
          flex: 1; 
          min-width: 0;
        }
        
        .task-name { 
          font-size: 15px; 
          font-weight: 500; 
          display: block; 
          margin-bottom: 6px;
          word-wrap: break-word;
          color: var(--text);
        }
        
        .task-meta {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .category-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        
        .category-dot.work { background: var(--work); }
        .category-dot.personal { background: var(--personal); }
        
        .time-badge { 
          font-size: 12px; 
          color: var(--muted);
          font-weight: 500;
        }
        
        .repeat-badge {
          font-size: 12px;
        }
        
        .select-btn {
          width: 28px;
          height: 28px;
          min-width: 28px;
          border-radius: 50%;
          border: 2px solid var(--border);
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: white;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        
        .select-btn.selected {
          background: var(--personal);
          border-color: var(--personal);
        }
        
        /* Empty State */
        .empty-state {
          text-align: center;
          padding: 48px 20px;
          color: var(--muted);
        }
        
        .empty-icon { 
          font-size: 48px; 
          margin-bottom: 12px;
          opacity: 0.6;
        }
        
        .empty-state p {
          font-size: 15px;
          color: var(--muted);
        }
        
        /* Swipe Hint */
        .swipe-hint {
          text-align: center;
          padding: 8px;
          font-size: 12px;
          color: var(--muted);
          background: var(--card);
          border-radius: var(--radius-sm);
          margin-bottom: 12px;
        }
        
        /* Bottom Nav */
        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          background: var(--card);
          padding: 8px 20px;
          padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
          display: flex;
          justify-content: space-around;
          border-top: 1px solid var(--border);
          z-index: 100;
        }
        
        @media (min-width: 481px) {
          .bottom-nav {
            left: 50%;
            transform: translateX(-50%);
            max-width: 480px;
          }
        }
        
        .nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 10px 20px;
          border-radius: var(--radius-sm);
          color: var(--muted);
          transition: all 0.2s;
        }
        
        .nav-item.active { 
          color: var(--personal);
          background: var(--personal-light);
        }
        
        .nav-item svg { 
          width: 22px; 
          height: 22px;
        }
        
        .nav-item span { 
          font-size: 11px; 
          font-weight: 600;
        }
        
        /* Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .modal-content {
          background: var(--card);
          border-radius: 24px 24px 0 0;
          padding: 24px;
          padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
          width: 100%;
          max-width: 480px;
          max-height: 85vh;
          overflow-y: auto;
          animation: slideUp 0.3s ease;
        }
        
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        
        .modal-header h2 { 
          font-size: 20px;
          font-weight: 700;
          color: var(--text);
        }
        
        .close-btn {
          width: 36px;
          height: 36px;
          min-width: 36px;
          border-radius: 50%;
          background: var(--bg);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          flex-shrink: 0;
        }
        
        .close-btn svg {
          width: 18px;
          height: 18px;
          color: var(--muted);
        }
        
        .form-group { margin-bottom: 20px; }
        
        .form-group label { 
          display: block; 
          font-size: 13px; 
          font-weight: 600; 
          color: var(--text-secondary); 
          margin-bottom: 8px;
        }
        
        .form-group input[type="text"],
        .form-group input[type="date"],
        .form-group select {
          width: 100%;
          padding: 14px 16px;
          border: 2px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 16px;
          font-family: inherit;
          background: var(--card);
          color: var(--text);
          transition: border-color 0.2s;
          -webkit-appearance: none;
        }
        
        .form-group input::placeholder {
          color: var(--muted);
        }
        
        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: var(--personal);
        }
        
        .form-row {
          display: flex;
          gap: 12px;
        }
        
        .form-row-2 {
          display: flex;
          gap: 12px;
        }
        
        .form-row-2 .form-group { 
          flex: 1;
          margin-bottom: 0;
        }
        
        .cat-btn {
          flex: 1;
          padding: 14px;
          border: 2px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--card);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          color: var(--text-secondary);
        }
        
        .cat-btn.active.work { 
          border-color: var(--work); 
          background: var(--work-light); 
          color: #B45309;
        }
        
        .cat-btn.active.personal { 
          border-color: var(--personal); 
          background: var(--personal-light); 
          color: #047857;
        }
        
        .time-presets {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        
        .preset-btn {
          padding: 10px 16px;
          border: 2px solid var(--border);
          border-radius: 20px;
          background: var(--card);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          color: var(--text-secondary);
        }
        
        .preset-btn.active { 
          background: var(--text); 
          color: white; 
          border-color: var(--text);
        }
        
        .slider-row {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        
        .slider-row input[type="range"] { 
          flex: 1;
          height: 6px;
          -webkit-appearance: none;
          background: var(--border);
          border-radius: 3px;
          outline: none;
        }
        
        .slider-row input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          background: var(--text);
          border-radius: 50%;
          cursor: pointer;
        }
        
        .slider-value { 
          font-size: 14px; 
          font-weight: 600; 
          min-width: 55px;
          text-align: right;
          color: var(--text);
        }
        
        .save-btn {
          width: 100%;
          padding: 16px;
          background: var(--personal);
          color: white;
          border: none;
          border-radius: var(--radius-sm);
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 8px;
          transition: opacity 0.2s, transform 0.2s;
        }
        
        .save-btn:active {
          transform: scale(0.98);
        }
        
        /* Shift Modal */
        .shift-modal {
          max-height: 60vh;
        }
        
        .shift-info {
          font-size: 15px;
          color: var(--text-secondary);
          margin-bottom: 20px;
        }
        
        .shift-buttons {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }
        
        .quick-shift-btn {
          flex: 1;
          padding: 12px;
          border: 2px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--card);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.2s;
        }
        
        .quick-shift-btn:active {
          background: var(--bg);
        }
        
        /* Settings Modal */
        .modal-content.settings { 
          padding-bottom: calc(32px + env(safe-area-inset-bottom, 0px));
        }
        
        .user-info {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px;
          background: var(--bg);
          border-radius: var(--radius);
          margin-bottom: 24px;
        }
        
        .user-avatar { 
          width: 48px; 
          height: 48px; 
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }
        
        .user-avatar-placeholder {
          width: 48px;
          height: 48px;
          min-width: 48px;
          border-radius: 50%;
          background: var(--personal);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: 600;
          flex-shrink: 0;
        }
        
        .user-name { 
          font-weight: 600;
          font-size: 15px;
          color: var(--text);
        }
        
        .user-email { 
          font-size: 13px; 
          color: var(--muted);
          margin-top: 2px;
        }
        
        .settings-section { margin-bottom: 24px; }
        .settings-section h3 { 
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 4px;
          color: var(--text);
        }
        .section-desc { 
          font-size: 13px; 
          color: var(--muted); 
          margin-bottom: 14px;
        }
        
        .export-btn {
          width: 100%;
          padding: 16px;
          background: var(--bg);
          border: 2px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          margin-bottom: 10px;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: background 0.2s;
          color: var(--text);
        }
        
        .export-btn:active { background: var(--border); }
        .export-btn span { font-size: 18px; }
        
        .export-status { 
          font-size: 13px; 
          color: var(--personal); 
          margin-top: 10px;
          font-weight: 500;
        }
        
        .signout-btn {
          width: 100%;
          padding: 16px;
          background: var(--danger-light);
          border: none;
          color: var(--danger);
          border-radius: var(--radius-sm);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        /* Calendar */
        .calendar-view { 
          padding: 16px 20px;
        }
        
        .calendar-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        
        .calendar-nav h2 { 
          font-size: 18px;
          font-weight: 600;
          color: var(--text);
        }
        
        .nav-btn {
          width: 40px;
          height: 40px;
          min-width: 40px;
          border-radius: 50%;
          border: none;
          background: var(--card);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: var(--shadow-sm);
          flex-shrink: 0;
        }
        
        .nav-btn svg {
          width: 20px;
          height: 20px;
          color: var(--text);
        }
        
        .calendar-weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          text-align: center;
          margin-bottom: 10px;
        }
        
        .calendar-weekdays span { 
          font-size: 11px; 
          font-weight: 600; 
          color: var(--muted);
        }
        
        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 6px;
        }
        
        .cal-cell {
          aspect-ratio: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-sm);
          cursor: pointer;
          background: var(--card);
          transition: all 0.2s;
          position: relative;
        }
        
        .cal-cell.empty { 
          background: transparent;
          pointer-events: none;
        }
        
        .cal-cell.today { 
          border: 2px solid var(--personal);
        }
        
        .cal-cell.selected { 
          background: var(--personal);
          color: white;
        }
        
        .cal-date-num {
          font-size: 14px;
          font-weight: 500;
        }
        
        .cal-dots { 
          display: flex; 
          gap: 3px;
          margin-top: 4px;
          position: absolute;
          bottom: 6px;
        }
        
        .cal-dot { 
          width: 5px; 
          height: 5px; 
          border-radius: 50%;
        }
        
        .cal-dot.work { background: var(--work); }
        .cal-dot.personal { background: var(--personal); }
        
        .date-nav {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
          padding: 14px;
          background: var(--card);
          margin: 0 20px 16px;
          border-radius: var(--radius);
          box-shadow: var(--shadow-sm);
        }
        
        .date-nav button { 
          width: 32px; 
          height: 32px;
          min-width: 32px;
          border-radius: 50%; 
          border: none; 
          background: var(--bg); 
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          color: var(--text);
          flex-shrink: 0;
        }
        
        .date-nav span { 
          font-weight: 600; 
          min-width: 100px; 
          text-align: center; 
          font-size: 15px;
          color: var(--text);
        }
        
        /* Analytics */
        .analytics-view { 
          padding: 16px 20px;
        }
        
        .stats-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }
        
        .stat-card {
          background: var(--card);
          padding: 18px 14px;
          border-radius: var(--radius);
          text-align: center;
          box-shadow: var(--shadow-sm);
        }
        
        .stat-value { 
          font-size: 22px; 
          font-weight: 700; 
          display: block;
          color: var(--text);
        }
        
        .stat-label { 
          font-size: 11px; 
          color: var(--muted);
          text-transform: uppercase;
          font-weight: 600;
          margin-top: 4px;
          display: block;
        }
        
        .chart-card {
          background: var(--card);
          padding: 20px;
          border-radius: var(--radius);
          margin-bottom: 16px;
          box-shadow: var(--shadow-sm);
        }
        
        .chart-card h3 { 
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 16px;
          color: var(--text);
        }
        
        .bar-chart {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          height: 100px;
        }
        
        .bar-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          flex: 1;
        }
        
        .bar-stack {
          width: 28px;
          height: 80px;
          display: flex;
          flex-direction: column-reverse;
          border-radius: 6px;
          overflow: hidden;
          background: var(--bg);
        }
        
        .bar { 
          width: 100%; 
          transition: height 0.4s ease;
        }
        
        .bar.work { background: var(--work); }
        .bar.personal { background: var(--personal); }
        
        .bar-day { 
          font-size: 12px; 
          color: var(--muted);
          font-weight: 600;
        }
        
        .chart-legend {
          display: flex;
          justify-content: center;
          gap: 24px;
          margin-top: 16px;
          font-size: 12px;
          color: var(--muted);
        }
        
        .chart-legend span { 
          display: flex; 
          align-items: center; 
          gap: 6px;
        }
        
        .legend-dot { 
          width: 10px; 
          height: 10px; 
          border-radius: 50%;
        }
        
        .legend-dot.work { background: var(--work); }
        .legend-dot.personal { background: var(--personal); }
        
        .insight-card {
          display: flex;
          align-items: center;
          gap: 14px;
          background: var(--card);
          padding: 18px;
          border-radius: var(--radius);
          box-shadow: var(--shadow-sm);
        }
        
        .insight-icon { 
          font-size: 28px;
          line-height: 1;
        }
        
        .insight-card p { 
          font-size: 14px; 
          color: var(--muted);
        }
        
        .insight-card strong { 
          color: var(--text);
          font-weight: 600;
        }
      `}</style>
      
      <div className="app">
        {activeTab === 'today' && (
          <>
            <div className="header">
              <div className="header-left">
                <h1>Today</h1>
                <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="header-right">
                <button className="icon-btn" onClick={() => setShowSettings(true)}>⚙️</button>
              </div>
            </div>
            
            <ProgressSummary 
              workDone={workDone}
              workTotal={workTotal}
              personalDone={personalDone}
              personalTotal={personalTotal}
            />
            
            <div className="tasks-section">
              <div className="section-header">
                <h2>Tasks</h2>
                <div className="section-actions">
                  {pendingCount > 0 && (
                    <button className="shift-btn" onClick={() => setShowShiftModal(true)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                      Shift
                    </button>
                  )}
                  <span className="task-count">{pendingCount} remaining</span>
                </div>
              </div>
              
              {todayTasks.length > 0 && (
                <div className="swipe-hint">← Swipe left on task for Edit / Delete</div>
              )}
              
              {todayTasks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📋</div>
                  <p>No tasks for today</p>
                </div>
              ) : (
                todayTasks.map(task => (
                  <TaskItem 
                    key={task.id} 
                    task={task} 
                    onToggle={toggleTask}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    isSelected={selectedTasks.includes(task.id)}
                    onSelect={handleSelectTask}
                  />
                ))
              )}
            </div>
          </>
        )}
        
        {activeTab === 'calendar' && (
          <>
            <div className="header">
              <div className="header-left">
                <h1>Calendar</h1>
              </div>
            </div>
            
            <CalendarView 
              tasks={tasks} 
              onDateSelect={(d) => { setSelectedDate(d); setSelectedTasks([]); }}
              selectedDate={selectedDate}
            />
            
            <div className="date-nav">
              <button onClick={() => navigateDate(-1)}>‹</button>
              <span>{formatDate(selectedDate)}</span>
              <button onClick={() => navigateDate(1)}>›</button>
            </div>
            
            <div className="tasks-section">
              <div className="section-header">
                <h2>Tasks</h2>
                <div className="section-actions">
                  {pendingCount > 0 && (
                    <button className="shift-btn" onClick={() => setShowShiftModal(true)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                      Shift
                    </button>
                  )}
                  <span className="task-count">{selectedDateTasks.length} total</span>
                </div>
              </div>
              
              {selectedDateTasks.length > 0 && (
                <div className="swipe-hint">← Swipe left on task for Edit / Delete</div>
              )}
              
              {selectedDateTasks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📅</div>
                  <p>No tasks for this day</p>
                </div>
              ) : (
                selectedDateTasks.map(task => (
                  <TaskItem 
                    key={task.id} 
                    task={task} 
                    onToggle={toggleTask}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    isSelected={selectedTasks.includes(task.id)}
                    onSelect={handleSelectTask}
                  />
                ))
              )}
            </div>
          </>
        )}
        
        {activeTab === 'analytics' && (
          <>
            <div className="header">
              <div className="header-left">
                <h1>Analytics</h1>
              </div>
              <div className="header-right">
                <button className="icon-btn" onClick={() => setShowSettings(true)}>⚙️</button>
              </div>
            </div>
            <AnalyticsView tasks={tasks} />
          </>
        )}
        
        <button className="fab" onClick={() => setShowModal(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        
        <nav className="bottom-nav">
          <button className={`nav-item ${activeTab === 'today' ? 'active' : ''}`} onClick={() => { setActiveTab('today'); setSelectedTasks([]); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            <span>Today</span>
          </button>
          <button className={`nav-item ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Calendar</span>
          </button>
          <button className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>Analytics</span>
          </button>
        </nav>
        
        {showModal && (
          <TaskModal 
            task={editingTask}
            onSave={handleSave}
            onClose={() => { setShowModal(false); setEditingTask(null); }}
            selectedDate={activeTab === 'calendar' ? selectedDate : today}
          />
        )}
        
        {showShiftModal && (
          <ShiftModal 
            onClose={() => setShowShiftModal(false)}
            onShift={handleShift}
            selectedCount={selectedTasks.filter(id => {
              const task = tasks.find(t => t.id === id);
              return task && task.status !== 'Done';
            }).length}
            targetDate={activeTab === 'calendar' ? selectedDate : today}
          />
        )}
        
        {showSettings && (
          <SettingsModal 
            onClose={() => setShowSettings(false)}
            tasks={tasks}
            user={user}
            onSignOut={handleSignOut}
          />
        )}
      </div>
    </>
  );
}
