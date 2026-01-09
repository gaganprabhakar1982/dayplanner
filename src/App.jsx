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
  getDoc,
  setDoc,
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

enableIndexedDbPersistence(db).catch((err) => {
  console.log('Persistence:', err.code);
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

// Sort tasks: pending first (newest first), then done (newest first)
const sortTasks = (tasks) => {
  return [...tasks].sort((a, b) => {
    // First by status
    if (a.status === 'Done' && b.status !== 'Done') return 1;
    if (a.status !== 'Done' && b.status === 'Done') return -1;
    // Then by creation time (newest first)
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA;
  });
};

// Default settings
const DEFAULT_SETTINGS = {
  dailyLimit: 480, // 8 hours in minutes
  workLimit: 360,  // 6 hours
  personalLimit: 120 // 2 hours
};

// ============================================
// COMPONENTS
// ============================================

// Loading Screen
const LoadingScreen = () => (
  <div className="loading-screen">
    <div className="loading-content">
      <div className="loading-logo">
        <svg viewBox="0 0 48 48" fill="none">
          <rect width="48" height="48" rx="12" fill="#10B981"/>
          <path d="M14 24L21 31L34 18" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="loading-spinner"></div>
      <p>Loading your tasks...</p>
    </div>
  </div>
);

// Login Screen
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
        <div className="feature-item"><span>✓</span> Track work & personal tasks</div>
        <div className="feature-item"><span>✓</span> Sync across all devices</div>
        <div className="feature-item"><span>✓</span> Analyze your productivity</div>
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

// Progress Summary - Compact Clear Design (same space)
const ProgressSummary = ({ workDone, workTotal, personalDone, personalTotal, settings }) => {
  const totalDone = workDone + personalDone;
  const totalPlanned = workTotal + personalTotal;
  const percent = totalPlanned > 0 ? Math.round((totalDone / totalPlanned) * 100) : 0;
  
  // Capacity calculations
  const workFree = Math.max(0, settings.workLimit - workTotal);
  const personalFree = Math.max(0, settings.personalLimit - personalTotal);
  const workOver = workTotal > settings.workLimit;
  const personalOver = personalTotal > settings.personalLimit;
  
  return (
    <div className="progress-summary">
      {/* Main progress row */}
      <div className="progress-main">
        <span className="progress-label">
          <strong>{formatTime(totalDone)}</strong> done of <strong>{formatTime(totalPlanned)}</strong> planned
        </span>
        <span className="progress-percent">{percent}%</span>
      </div>
      <div className="progress-bar-bg">
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      
      {/* Category rows */}
      <div className="category-rows">
        <div className="category-row">
          <span className="cat-left">
            <span className="cat-dot work"></span>
            <span className="cat-text">Work: {formatTime(workDone)}/{formatTime(workTotal)} done</span>
          </span>
          <span className={`cat-right ${workOver ? 'over' : workFree === 0 ? 'full' : ''}`}>
            {workOver ? `${formatTime(workTotal - settings.workLimit)} over!` : workFree === 0 ? 'At limit' : `Can add ${formatTime(workFree)}`}
          </span>
        </div>
        <div className="category-row">
          <span className="cat-left">
            <span className="cat-dot personal"></span>
            <span className="cat-text">Personal: {formatTime(personalDone)}/{formatTime(personalTotal)} done</span>
          </span>
          <span className={`cat-right ${personalOver ? 'over' : personalFree === 0 ? 'full' : ''}`}>
            {personalOver ? `${formatTime(personalTotal - settings.personalLimit)} over!` : personalFree === 0 ? 'At limit' : `Can add ${formatTime(personalFree)}`}
          </span>
        </div>
      </div>
    </div>
  );
};

// Mini Progress for Calendar
const MiniProgress = ({ tasks, settings }) => {
  const workTasks = tasks.filter(t => t.category === 'Work');
  const personalTasks = tasks.filter(t => t.category === 'Personal');
  const workTotal = workTasks.reduce((s, t) => s + t.timeRequired, 0);
  const personalTotal = personalTasks.reduce((s, t) => s + t.timeRequired, 0);
  const workDone = workTasks.filter(t => t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0);
  const personalDone = personalTasks.filter(t => t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0);
  
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'Done').length;
  
  return (
    <div className="mini-progress">
      <div className="mini-stats">
        <div className="mini-stat">
          <span className="mini-value">{doneTasks}/{totalTasks}</span>
          <span className="mini-label">Tasks</span>
        </div>
        <div className="mini-stat work">
          <span className="mini-value">{formatTime(workDone)}/{formatTime(workTotal)}</span>
          <span className="mini-label">Work</span>
        </div>
        <div className="mini-stat personal">
          <span className="mini-value">{formatTime(personalDone)}/{formatTime(personalTotal)}</span>
          <span className="mini-label">Personal</span>
        </div>
      </div>
    </div>
  );
};

// Task Item
const TaskItem = ({ task, onToggle, onEdit, onDelete, isSelectionMode, isSelected, onSelect }) => {
  const [swipeX, setSwipeX] = useState(0);
  const [startX, setStartX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const isDone = task.status === 'Done';
  
  const handleTouchStart = (e) => {
    if (isSelectionMode) return;
    setStartX(e.touches[0].clientX);
    setIsSwiping(true);
  };
  
  const handleTouchMove = (e) => {
    if (!isSwiping || isSelectionMode) return;
    const diff = e.touches[0].clientX - startX;
    if (diff < 0) setSwipeX(Math.max(diff, -140));
    else setSwipeX(0);
  };
  
  const handleTouchEnd = () => {
    setIsSwiping(false);
    setSwipeX(swipeX < -70 ? -140 : 0);
  };
  
  const closeSwipe = () => setSwipeX(0);
  
  return (
    <div className={`task-wrapper ${isSelected ? 'selected' : ''}`}>
      <div className="task-actions" style={{ opacity: Math.min(1, Math.abs(swipeX) / 70) }}>
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
        className={`task-item ${isDone ? 'done' : ''} ${task.category.toLowerCase()} ${isSelectionMode && !isDone ? 'selectable' : ''}`}
        style={{ transform: `translateX(${swipeX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => isSelectionMode && !isDone && onSelect(task.id)}
      >
        {!isSelectionMode && (
          <button className={`checkbox ${isDone ? 'checked' : ''}`} onClick={(e) => { e.stopPropagation(); onToggle(task.id, task.status); }}>
            {isDone && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
          </button>
        )}
        {isSelectionMode && !isDone && (
          <div className={`select-circle ${isSelected ? 'selected' : ''}`}>{isSelected ? '✓' : ''}</div>
        )}
        {isSelectionMode && isDone && (
          <div className="checkbox checked disabled"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg></div>
        )}
        <div className="task-content">
          <span className="task-name">{task.task}</span>
          <div className="task-meta">
            <span className={`category-dot ${task.category.toLowerCase()}`}></span>
            <span className="time-badge">{formatTime(task.timeRequired)}</span>
            {task.repeat && task.repeat !== 'none' && <span className="repeat-badge">🔁</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

// Selection Header
const SelectionHeader = ({ selectedCount, onCancel, onMove }) => (
  <div className="selection-header">
    <button className="cancel-btn" onClick={onCancel}>Cancel</button>
    <span className="selection-count">{selectedCount} selected</span>
    <button className="move-btn" onClick={onMove} disabled={selectedCount === 0}>Move →</button>
  </div>
);

// Add/Edit Task Modal with Repeat End Control
const TaskModal = ({ task, onSave, onClose, selectedDate }) => {
  const [formData, setFormData] = useState(task || {
    task: '',
    category: 'Work',
    timeRequired: 30,
    status: 'Pending',
    date: selectedDate,
    repeat: 'none'
  });
  
  const [repeatEndType, setRepeatEndType] = useState('count'); // 'count' or 'date'
  const [repeatCount, setRepeatCount] = useState(10);
  const [repeatEndDate, setRepeatEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return dateToStr(d);
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
    
    let repeatInfo = null;
    if (formData.repeat !== 'none') {
      repeatInfo = {
        type: repeatEndType,
        count: repeatEndType === 'count' ? repeatCount : null,
        endDate: repeatEndType === 'date' ? repeatEndDate : null
      };
    }
    
    onSave({ ...formData, repeatInfo });
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{task ? 'Edit Task' : 'New Task'}</h2>
          <button className="close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        
        <div className="form-group">
          <label>Task Name</label>
          <input type="text" placeholder="What needs to be done?" value={formData.task} onChange={e => setFormData({...formData, task: e.target.value})} autoFocus />
        </div>
        
        <div className="form-group">
          <label>Category</label>
          <div className="form-row">
            <button className={`cat-btn ${formData.category === 'Work' ? 'active work' : ''}`} onClick={() => setFormData({...formData, category: 'Work'})}>💼 Work</button>
            <button className={`cat-btn ${formData.category === 'Personal' ? 'active personal' : ''}`} onClick={() => setFormData({...formData, category: 'Personal'})}>🏠 Personal</button>
          </div>
        </div>
        
        <div className="form-group">
          <label>Duration</label>
          <div className="time-presets">
            {timePresets.map(t => (
              <button key={t} className={`preset-btn ${formData.timeRequired === t ? 'active' : ''}`} onClick={() => setFormData({...formData, timeRequired: t})}>{formatTime(t)}</button>
            ))}
          </div>
          <div className="slider-row">
            <input type="range" min="5" max="240" step="5" value={formData.timeRequired} onChange={e => setFormData({...formData, timeRequired: parseInt(e.target.value)})} />
            <span className="slider-value">{formatTime(formData.timeRequired)}</span>
          </div>
        </div>
        
        <div className="form-row-2">
          <div className="form-group">
            <label>Start Date</label>
            <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
          </div>
          <div className="form-group">
            <label>Repeat</label>
            <select value={formData.repeat} onChange={e => setFormData({...formData, repeat: e.target.value})}>
              {repeatOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        </div>
        
        {formData.repeat !== 'none' && !task && (
          <div className="repeat-end-section">
            <label>Repeat Until</label>
            <div className="repeat-end-options">
              <label className={`radio-option ${repeatEndType === 'count' ? 'active' : ''}`}>
                <input type="radio" name="repeatEnd" checked={repeatEndType === 'count'} onChange={() => setRepeatEndType('count')} />
                <span className="radio-label">
                  <input type="number" min="2" max="100" value={repeatCount} onChange={e => setRepeatCount(parseInt(e.target.value) || 10)} className="inline-input" /> times
                </span>
              </label>
              <label className={`radio-option ${repeatEndType === 'date' ? 'active' : ''}`}>
                <input type="radio" name="repeatEnd" checked={repeatEndType === 'date'} onChange={() => setRepeatEndType('date')} />
                <span className="radio-label">
                  Until <input type="date" value={repeatEndDate} onChange={e => setRepeatEndDate(e.target.value)} className="inline-date" />
                </span>
              </label>
            </div>
          </div>
        )}
        
        <button className="save-btn" onClick={handleSave}>{task ? 'Save Changes' : 'Add Task'}</button>
      </div>
    </div>
  );
};

// Move Modal
const MoveModal = ({ onClose, onMove, selectedCount, targetDate }) => {
  const [moveDate, setMoveDate] = useState(getNextDay(targetDate));
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content move-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Move Tasks</h2>
          <button className="close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <p className="move-info">Move {selectedCount} task{selectedCount > 1 ? 's' : ''} to:</p>
        <div className="quick-dates">
          <button className="quick-date-btn" onClick={() => setMoveDate(getNextDay(targetDate))}>Tomorrow</button>
          <button className="quick-date-btn" onClick={() => { const d = parseLocalDate(targetDate); d.setDate(d.getDate() + 7); setMoveDate(dateToStr(d)); }}>Next Week</button>
        </div>
        <div className="form-group">
          <label>Or pick a date</label>
          <input type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)} />
        </div>
        <button className="save-btn" onClick={() => onMove(moveDate)}>Move Tasks</button>
      </div>
    </div>
  );
};

// Settings Modal with Time Limits
const SettingsModal = ({ onClose, tasks, user, onSignOut, settings, onUpdateSettings }) => {
  const [exportStatus, setExportStatus] = useState('');
  const [localSettings, setLocalSettings] = useState(settings);
  
  const exportToCSV = () => {
    const headers = ['Date', 'Task', 'Category', 'Time Required (mins)', 'Status'];
    const rows = tasks.map(t => [t.date, `"${t.task.replace(/"/g, '""')}"`, t.category, t.timeRequired, t.status]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dayplanner-${getTodayStr()}.csv`;
    a.click();
    setExportStatus('✅ Downloaded!');
  };
  
  const handleSaveSettings = () => {
    onUpdateSettings(localSettings);
    setExportStatus('✅ Settings saved!');
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        
        <div className="user-info">
          {user.photoURL ? <img src={user.photoURL} alt="" className="user-avatar" /> : <div className="user-avatar-placeholder">{user.displayName?.charAt(0) || 'U'}</div>}
          <div>
            <div className="user-name">{user.displayName}</div>
            <div className="user-email">{user.email}</div>
          </div>
        </div>
        
        <div className="settings-section">
          <h3>Daily Time Limits</h3>
          <p className="section-desc">Set your target hours per day</p>
          
          <div className="setting-item">
            <label>Daily Total Limit</label>
            <div className="setting-input">
              <input type="number" min="60" max="960" step="30" value={localSettings.dailyLimit} onChange={e => setLocalSettings({...localSettings, dailyLimit: parseInt(e.target.value)})} />
              <span>mins ({formatTime(localSettings.dailyLimit)})</span>
            </div>
          </div>
          
          <div className="setting-item">
            <label>Work Hours Limit</label>
            <div className="setting-input">
              <input type="number" min="0" max="720" step="30" value={localSettings.workLimit} onChange={e => setLocalSettings({...localSettings, workLimit: parseInt(e.target.value)})} />
              <span>mins ({formatTime(localSettings.workLimit)})</span>
            </div>
          </div>
          
          <div className="setting-item">
            <label>Personal Hours Limit</label>
            <div className="setting-input">
              <input type="number" min="0" max="480" step="30" value={localSettings.personalLimit} onChange={e => setLocalSettings({...localSettings, personalLimit: parseInt(e.target.value)})} />
              <span>mins ({formatTime(localSettings.personalLimit)})</span>
            </div>
          </div>
          
          <button className="save-settings-btn" onClick={handleSaveSettings}>Save Limits</button>
        </div>
        
        <div className="settings-section">
          <h3>Export Data</h3>
          <p className="section-desc">{tasks.length} tasks</p>
          <button className="export-btn" onClick={exportToCSV}><span>📄</span> Download CSV</button>
          {exportStatus && <p className="export-status">{exportStatus}</p>}
        </div>
        
        <button className="signout-btn" onClick={onSignOut}>Sign Out</button>
      </div>
    </div>
  );
};

// Calendar View with Bigger Arrows
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
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
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
        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="cal-nav-btn">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="#1A1A1A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h2>{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="cal-nav-btn">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M9 18L15 12L9 6" stroke="#1A1A1A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      
      <div className="calendar-weekdays">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      
      <div className="calendar-grid">
        {days.map((date, i) => {
          if (!date) return <div key={i} className="cal-cell empty" />;
          const dateStr = dateToStr(date);
          const counts = getTaskCount(date);
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          
          return (
            <div key={i} className={`cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`} onClick={() => onDateSelect(dateStr)}>
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

// Redesigned Analytics View
const AnalyticsView = ({ tasks }) => {
  const today = getTodayStr();
  const todayTasks = tasks.filter(t => t.date === today);
  const todayDone = todayTasks.filter(t => t.status === 'Done').length;
  const todayTotal = todayTasks.length;
  
  // Calculate streak
  const calculateStreak = () => {
    let streak = 0;
    let checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 1); // Start from yesterday
    
    while (true) {
      const dateStr = dateToStr(checkDate);
      const dayTasks = tasks.filter(t => t.date === dateStr);
      
      if (dayTasks.length === 0) break;
      
      const allDone = dayTasks.every(t => t.status === 'Done');
      if (!allDone) break;
      
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
      if (streak > 365) break; // Safety limit
    }
    
    return streak;
  };
  
  const streak = calculateStreak();
  
  // This week vs last week
  const getWeekData = (weeksAgo) => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - (weeksAgo * 7));
    
    let totalTime = 0;
    let completedTasks = 0;
    let totalTasks = 0;
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const dateStr = dateToStr(d);
      const dayTasks = tasks.filter(t => t.date === dateStr);
      
      totalTasks += dayTasks.length;
      completedTasks += dayTasks.filter(t => t.status === 'Done').length;
      totalTime += dayTasks.filter(t => t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0);
    }
    
    return { totalTime, completedTasks, totalTasks };
  };
  
  const thisWeek = getWeekData(0);
  const lastWeek = getWeekData(1);
  
  const weekComparison = lastWeek.completedTasks > 0 
    ? Math.round(((thisWeek.completedTasks - lastWeek.completedTasks) / lastWeek.completedTasks) * 100)
    : 0;
  
  // Last 7 days chart
  const last7Days = Array.from({length: 7}, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return dateToStr(d);
  });
  
  const weeklyData = last7Days.map(date => {
    const dayTasks = tasks.filter(t => t.date === date);
    const workDone = dayTasks.filter(t => t.category === 'Work' && t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0);
    const personalDone = dayTasks.filter(t => t.category === 'Personal' && t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0);
    return { date, workDone, personalDone, total: workDone + personalDone };
  });
  
  const maxTime = Math.max(...weeklyData.map(d => d.total), 60);
  const avgDaily = Math.round(weeklyData.reduce((s, d) => s + d.total, 0) / 7);
  
  // Best day
  const dayTotals = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
  tasks.filter(t => t.status === 'Done').forEach(t => {
    const day = parseLocalDate(t.date).getDay();
    dayTotals[day] += t.timeRequired;
  });
  const bestDayIndex = dayTotals.indexOf(Math.max(...dayTotals));
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  return (
    <div className="analytics-view">
      {/* Today's Progress */}
      <div className="analytics-card highlight">
        <h3>Today's Progress</h3>
        <div className="today-progress">
          <div className="big-number">{todayDone}<span>/{todayTotal}</span></div>
          <div className="big-label">tasks completed</div>
        </div>
      </div>
      
      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{streak}</span>
          <span className="stat-label">Day Streak 🔥</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{formatTime(avgDaily)}</span>
          <span className="stat-label">Daily Avg</span>
        </div>
        <div className={`stat-card ${weekComparison >= 0 ? 'positive' : 'negative'}`}>
          <span className="stat-value">{weekComparison >= 0 ? '+' : ''}{weekComparison}%</span>
          <span className="stat-label">vs Last Week</span>
        </div>
      </div>
      
      {/* Weekly Chart */}
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
      
      {/* Insight */}
      <div className="insight-card">
        <span className="insight-icon">📊</span>
        <p>Your most productive day is <strong>{dayNames[bestDayIndex]}</strong></p>
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
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState('today');
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState([]);
  
  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);
  
  // Tasks listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'tasks'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsubscribe;
  }, [user]);
  
  // Settings listener
  useEffect(() => {
    if (!user) return;
    const loadSettings = async () => {
      const settingsRef = doc(db, 'users', user.uid, 'settings', 'preferences');
      const settingsDoc = await getDoc(settingsRef);
      if (settingsDoc.exists()) {
        setSettings({ ...DEFAULT_SETTINGS, ...settingsDoc.data() });
      }
    };
    loadSettings();
  }, [user]);
  
  const handleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } 
    catch (err) { console.error('Login failed:', err); }
  };
  
  const handleSignOut = async () => {
    await signOut(auth);
    setShowSettings(false);
  };
  
  const handleUpdateSettings = async (newSettings) => {
    const settingsRef = doc(db, 'users', user.uid, 'settings', 'preferences');
    await setDoc(settingsRef, newSettings);
    setSettings(newSettings);
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
      await updateDoc(doc(db, 'users', user.uid, 'tasks', editingTask.id), taskData);
    } else {
      // Generate dates based on repeat settings
      const dates = [taskData.date];
      
      if (taskData.repeat !== 'none' && taskData.repeatInfo) {
        const baseDate = parseLocalDate(taskData.date);
        let maxIterations = 100;
        
        if (taskData.repeatInfo.type === 'count') {
          maxIterations = taskData.repeatInfo.count - 1;
        }
        
        for (let i = 1; i <= maxIterations; i++) {
          const newDate = new Date(baseDate);
          
          switch (taskData.repeat) {
            case 'daily': newDate.setDate(baseDate.getDate() + i); break;
            case 'alternate': newDate.setDate(baseDate.getDate() + (i * 2)); break;
            case 'weekly': newDate.setDate(baseDate.getDate() + (i * 7)); break;
            case 'fortnightly': newDate.setDate(baseDate.getDate() + (i * 14)); break;
            case 'monthly': newDate.setMonth(baseDate.getMonth() + i); break;
          }
          
          const newDateStr = dateToStr(newDate);
          
          // Check end date if specified
          if (taskData.repeatInfo.type === 'date' && newDateStr > taskData.repeatInfo.endDate) {
            break;
          }
          
          dates.push(newDateStr);
        }
      }
      
      // Remove repeatInfo before saving (it's just for calculation)
      const { repeatInfo, ...taskToSave } = taskData;
      
      for (const date of dates) {
        await addDoc(collection(db, 'users', user.uid, 'tasks'), {
          ...taskToSave, date, createdAt: new Date().toISOString()
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
  
  const handleEdit = (task) => { setEditingTask(task); setShowModal(true); };
  const handleSelectTask = (taskId) => setSelectedTasks(prev => prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]);
  const enterSelectionMode = () => { setIsSelectionMode(true); setSelectedTasks([]); };
  const exitSelectionMode = () => { setIsSelectionMode(false); setSelectedTasks([]); };
  
  const handleMove = async (newDate) => {
    const batch = writeBatch(db);
    for (const taskId of selectedTasks) {
      batch.update(doc(db, 'users', user.uid, 'tasks', taskId), { date: newDate });
    }
    await batch.commit();
    setShowMoveModal(false);
    exitSelectionMode();
  };
  
  const navigateDate = (dir) => {
    const current = parseLocalDate(selectedDate);
    current.setDate(current.getDate() + dir);
    setSelectedDate(dateToStr(current));
  };
  
  const today = getTodayStr();
  const currentDateTasks = sortTasks(tasks.filter(t => t.date === (activeTab === 'today' ? today : selectedDate)));
  const selectedDateTasks = sortTasks(tasks.filter(t => t.date === selectedDate));
  
  const workTasks = currentDateTasks.filter(t => t.category === 'Work');
  const personalTasks = currentDateTasks.filter(t => t.category === 'Personal');
  const workDone = workTasks.filter(t => t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0);
  const workTotal = workTasks.reduce((s, t) => s + t.timeRequired, 0);
  const personalDone = personalTasks.filter(t => t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0);
  const personalTotal = personalTasks.reduce((s, t) => s + t.timeRequired, 0);
  const pendingCount = currentDateTasks.filter(t => t.status !== 'Done').length;
  
  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={handleLogin} />;
  
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --bg: #F4F4F2; --card: #FFFFFF; --text: #1A1A1A; --text-secondary: #52525B;
          --muted: #71717A; --work: #F59E0B; --work-light: #FEF3C7;
          --personal: #10B981; --personal-light: #D1FAE5; --border: #E4E4E7;
          --danger: #EF4444; --danger-light: #FEE2E2; --blue: #3B82F6; --blue-light: #DBEAFE;
          --shadow-sm: 0 1px 2px rgba(0,0,0,0.04); --shadow: 0 4px 12px rgba(0,0,0,0.06);
          --radius: 16px; --radius-sm: 12px;
        }
        html, body, #root { width: 100%; min-height: 100vh; min-height: 100dvh; overflow-x: hidden; }
        body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }
        .app { width: 100%; max-width: 480px; margin: 0 auto; min-height: 100vh; min-height: 100dvh; background: var(--bg); padding-bottom: 90px; }
        
        /* Loading */
        .loading-screen { width: 100%; height: 100vh; height: 100dvh; display: flex; align-items: center; justify-content: center; background: var(--bg); }
        .loading-content { text-align: center; }
        .loading-logo { margin-bottom: 24px; }
        .loading-logo svg { width: 64px; height: 64px; }
        .loading-spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--personal); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
        .loading-content p { color: var(--muted); font-size: 14px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        /* Login */
        .login-screen { width: 100%; min-height: 100vh; min-height: 100dvh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #065F46 0%, #047857 50%, #10B981 100%); padding: 24px; position: relative; overflow: hidden; }
        .login-bg { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }
        .login-shape { position: absolute; border-radius: 50%; opacity: 0.1; background: white; }
        .shape-1 { width: 300px; height: 300px; top: -100px; right: -100px; }
        .shape-2 { width: 200px; height: 200px; bottom: 20%; left: -80px; }
        .shape-3 { width: 150px; height: 150px; bottom: -50px; right: 20%; }
        .login-content { text-align: center; color: white; width: 100%; max-width: 340px; position: relative; z-index: 1; }
        .login-logo { margin-bottom: 24px; }
        .login-logo svg { width: 72px; height: 72px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.2)); }
        .login-content h1 { font-size: 32px; font-weight: 700; margin-bottom: 8px; }
        .login-content > p { color: rgba(255,255,255,0.8); margin-bottom: 32px; font-size: 16px; }
        .login-features { text-align: left; background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); border-radius: 16px; padding: 20px; margin-bottom: 32px; }
        .feature-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; font-size: 14px; color: rgba(255,255,255,0.9); }
        .feature-item span { width: 24px; height: 24px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; }
        .google-btn { display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; padding: 16px; background: white; color: var(--text); border: none; border-radius: 14px; font-size: 16px; font-weight: 600; cursor: pointer; }
        .login-footer { margin-top: 24px; font-size: 12px; color: rgba(255,255,255,0.6); }
        
        /* Header */
        .header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: var(--card); position: sticky; top: 0; z-index: 50; border-bottom: 1px solid var(--border); }
        .header-left h1 { font-size: 22px; font-weight: 700; }
        .header-left span { font-size: 13px; color: var(--muted); }
        .icon-btn { width: 40px; height: 40px; min-width: 40px; border-radius: 50%; border: none; background: var(--bg); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; }
        
        /* Selection Header */
        .selection-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: var(--blue-light); border-bottom: 1px solid var(--blue); position: sticky; top: 0; z-index: 50; }
        .cancel-btn { padding: 8px 16px; background: transparent; border: none; color: var(--blue); font-size: 14px; font-weight: 600; cursor: pointer; }
        .selection-count { font-size: 14px; font-weight: 600; }
        .move-btn { padding: 8px 16px; background: var(--blue); border: none; border-radius: 8px; color: white; font-size: 14px; font-weight: 600; cursor: pointer; }
        .move-btn:disabled { opacity: 0.5; }
        
        /* FAB */
        .fab { position: fixed; bottom: 100px; right: 20px; width: 56px; height: 56px; border-radius: 50%; background: var(--personal); color: white; border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4); display: flex; align-items: center; justify-content: center; z-index: 90; }
        .fab svg { width: 24px; height: 24px; }
        @media (min-width: 481px) { .fab { right: calc(50% - 240px + 20px); } }
        
        /* Progress Summary - Compact Clear Design */
        .progress-summary { padding: 14px 20px; background: var(--card); border-bottom: 1px solid var(--border); }
        .progress-main { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .progress-label { font-size: 13px; color: var(--text-secondary); }
        .progress-label strong { color: var(--text); font-weight: 600; }
        .progress-percent { font-size: 14px; font-weight: 700; color: var(--personal); }
        .progress-bar-bg { height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; margin-bottom: 12px; }
        .progress-bar-fill { height: 100%; background: linear-gradient(90deg, var(--work) 0%, var(--personal) 100%); border-radius: 4px; transition: width 0.4s; }
        
        .category-rows { display: flex; flex-direction: column; gap: 6px; }
        .category-row { display: flex; justify-content: space-between; align-items: center; }
        .cat-left { display: flex; align-items: center; gap: 8px; }
        .cat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .cat-dot.work { background: var(--work); }
        .cat-dot.personal { background: var(--personal); }
        .cat-text { font-size: 12px; color: var(--text-secondary); }
        .cat-right { font-size: 12px; font-weight: 600; color: var(--personal); }
        .cat-right.full { color: var(--work); }
        .cat-right.over { color: var(--danger); }
        
        /* Mini Progress (Calendar) */
        .mini-progress { margin: 0 20px 16px; padding: 12px 16px; background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow-sm); }
        .mini-stats { display: flex; justify-content: space-around; }
        .mini-stat { text-align: center; }
        .mini-value { font-size: 14px; font-weight: 600; display: block; }
        .mini-label { font-size: 10px; color: var(--muted); text-transform: uppercase; }
        .mini-stat.work .mini-value { color: var(--work); }
        .mini-stat.personal .mini-value { color: var(--personal); }
        
        /* Tasks */
        .tasks-section { padding: 16px 20px 20px; }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .section-header h2 { font-size: 16px; font-weight: 600; }
        .section-actions { display: flex; align-items: center; gap: 12px; }
        .task-count { font-size: 13px; color: var(--muted); }
        .shift-btn { display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--card); border: 1px solid var(--border); border-radius: 20px; font-size: 13px; font-weight: 500; color: var(--text-secondary); cursor: pointer; }
        .shift-btn svg { width: 16px; height: 16px; }
        
        /* Task Item */
        .task-wrapper { position: relative; margin-bottom: 10px; overflow: hidden; border-radius: var(--radius); }
        .task-wrapper.selected .task-item { background: var(--blue-light); }
        .task-actions { position: absolute; right: 0; top: 0; bottom: 0; width: 140px; display: flex; }
        .action-btn { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: none; cursor: pointer; font-size: 11px; font-weight: 500; color: white; }
        .action-btn svg { width: 20px; height: 20px; }
        .action-btn.edit { background: var(--blue); }
        .action-btn.delete { background: var(--danger); }
        .task-item { display: flex; align-items: center; gap: 14px; padding: 16px; background: var(--card); border-radius: var(--radius); border-left: 4px solid var(--border); box-shadow: var(--shadow-sm); transition: transform 0.15s; will-change: transform; }
        .task-item.work { border-left-color: var(--work); }
        .task-item.personal { border-left-color: var(--personal); }
        .task-item.done { opacity: 0.55; background: var(--bg); }
        .task-item.done .task-name { text-decoration: line-through; color: var(--muted); }
        .task-item.selectable { cursor: pointer; }
        .checkbox { width: 24px; height: 24px; min-width: 24px; border-radius: 50%; border: 2px solid var(--border); background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; }
        .checkbox.checked { background: var(--personal); border-color: var(--personal); }
        .checkbox.disabled { opacity: 0.5; cursor: default; }
        .checkbox svg { width: 14px; height: 14px; color: white; }
        .select-circle { width: 24px; height: 24px; min-width: 24px; border-radius: 50%; border: 2px solid var(--blue); background: transparent; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 14px; color: white; }
        .select-circle.selected { background: var(--blue); }
        .task-content { flex: 1; min-width: 0; }
        .task-name { font-size: 15px; font-weight: 500; margin-bottom: 6px; word-wrap: break-word; }
        .task-meta { display: flex; align-items: center; gap: 10px; }
        .category-dot { width: 8px; height: 8px; border-radius: 50%; }
        .category-dot.work { background: var(--work); }
        .category-dot.personal { background: var(--personal); }
        .time-badge { font-size: 12px; color: var(--muted); font-weight: 500; }
        .repeat-badge { font-size: 12px; }
        
        /* Empty */
        .empty-state { text-align: center; padding: 48px 20px; color: var(--muted); }
        .empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.6; }
        .swipe-hint { text-align: center; padding: 8px; font-size: 12px; color: var(--muted); background: var(--card); border-radius: var(--radius-sm); margin-bottom: 12px; }
        
        /* Bottom Nav */
        .bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: var(--card); padding: 8px 20px; padding-bottom: calc(8px + env(safe-area-inset-bottom)); display: flex; justify-content: space-around; border-top: 1px solid var(--border); z-index: 100; }
        @media (min-width: 481px) { .bottom-nav { left: 50%; transform: translateX(-50%); max-width: 480px; } }
        .nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; background: none; border: none; cursor: pointer; padding: 10px 20px; border-radius: var(--radius-sm); color: var(--muted); }
        .nav-item.active { color: var(--personal); background: var(--personal-light); }
        .nav-item svg { width: 22px; height: 22px; }
        .nav-item span { font-size: 11px; font-weight: 600; }
        
        /* Modal */
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: flex; align-items: flex-end; justify-content: center; z-index: 1000; animation: fadeIn 0.2s; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .modal-content { background: var(--card); border-radius: 24px 24px 0 0; padding: 24px; padding-bottom: calc(24px + env(safe-area-inset-bottom)); width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; animation: slideUp 0.3s; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .modal-header h2 { font-size: 20px; font-weight: 700; }
        .close-btn { width: 36px; height: 36px; min-width: 36px; border-radius: 50%; background: var(--bg); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .close-btn svg { width: 18px; height: 18px; color: var(--muted); }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; }
        .form-group input[type="text"], .form-group input[type="date"], .form-group input[type="number"], .form-group select { width: 100%; padding: 14px 16px; border: 2px solid var(--border); border-radius: var(--radius-sm); font-size: 16px; font-family: inherit; background: var(--card); color: var(--text); }
        .form-group input::placeholder { color: var(--muted); }
        .form-group input:focus, .form-group select:focus { outline: none; border-color: var(--personal); }
        .form-row { display: flex; gap: 12px; }
        .form-row-2 { display: flex; gap: 12px; }
        .form-row-2 .form-group { flex: 1; margin-bottom: 0; }
        .cat-btn { flex: 1; padding: 14px; border: 2px solid var(--border); border-radius: var(--radius-sm); background: var(--card); font-size: 14px; font-weight: 600; cursor: pointer; color: var(--text-secondary); }
        .cat-btn.active.work { border-color: var(--work); background: var(--work-light); color: #B45309; }
        .cat-btn.active.personal { border-color: var(--personal); background: var(--personal-light); color: #047857; }
        .time-presets { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
        .preset-btn { padding: 10px 16px; border: 2px solid var(--border); border-radius: 20px; background: var(--card); font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-secondary); }
        .preset-btn.active { background: var(--text); color: white; border-color: var(--text); }
        .slider-row { display: flex; align-items: center; gap: 14px; }
        .slider-row input[type="range"] { flex: 1; height: 6px; -webkit-appearance: none; background: var(--border); border-radius: 3px; }
        .slider-row input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; background: var(--text); border-radius: 50%; cursor: pointer; }
        .slider-value { font-size: 14px; font-weight: 600; min-width: 55px; text-align: right; }
        .save-btn { width: 100%; padding: 16px; background: var(--personal); color: white; border: none; border-radius: var(--radius-sm); font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 8px; }
        
        /* Repeat End Section */
        .repeat-end-section { margin-bottom: 20px; padding: 16px; background: var(--bg); border-radius: var(--radius-sm); }
        .repeat-end-section > label { display: block; font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px; }
        .repeat-end-options { display: flex; flex-direction: column; gap: 12px; }
        .radio-option { display: flex; align-items: center; gap: 10px; padding: 12px; background: var(--card); border-radius: var(--radius-sm); cursor: pointer; border: 2px solid transparent; }
        .radio-option.active { border-color: var(--personal); }
        .radio-option input[type="radio"] { width: 18px; height: 18px; accent-color: var(--personal); }
        .radio-label { font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .inline-input { width: 60px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; text-align: center; }
        .inline-date { padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; }
        
        /* Move Modal */
        .move-modal { max-height: 60vh; }
        .move-info { font-size: 15px; color: var(--text-secondary); margin-bottom: 20px; }
        .quick-dates { display: flex; gap: 10px; margin-bottom: 20px; }
        .quick-date-btn { flex: 1; padding: 12px; border: 2px solid var(--border); border-radius: var(--radius-sm); background: var(--card); font-size: 14px; font-weight: 500; cursor: pointer; color: var(--text-secondary); }
        
        /* Settings */
        .modal-content.settings { padding-bottom: calc(32px + env(safe-area-inset-bottom)); }
        .user-info { display: flex; align-items: center; gap: 14px; padding: 16px; background: var(--bg); border-radius: var(--radius); margin-bottom: 24px; }
        .user-avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
        .user-avatar-placeholder { width: 48px; height: 48px; border-radius: 50%; background: var(--personal); color: white; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 600; }
        .user-name { font-weight: 600; font-size: 15px; }
        .user-email { font-size: 13px; color: var(--muted); }
        .settings-section { margin-bottom: 24px; }
        .settings-section h3 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
        .section-desc { font-size: 13px; color: var(--muted); margin-bottom: 14px; }
        .setting-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border); }
        .setting-item label { font-size: 14px; font-weight: 500; }
        .setting-input { display: flex; align-items: center; gap: 8px; }
        .setting-input input { width: 70px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; text-align: center; font-size: 14px; }
        .setting-input span { font-size: 12px; color: var(--muted); }
        .save-settings-btn { width: 100%; padding: 12px; background: var(--personal-light); color: var(--personal); border: none; border-radius: var(--radius-sm); font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 12px; }
        .export-btn { width: 100%; padding: 16px; background: var(--bg); border: 2px solid var(--border); border-radius: var(--radius-sm); font-size: 14px; font-weight: 500; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 10px; color: var(--text); }
        .export-btn span { font-size: 18px; }
        .export-status { font-size: 13px; color: var(--personal); margin-top: 10px; font-weight: 500; }
        .signout-btn { width: 100%; padding: 16px; background: var(--danger-light); border: none; color: var(--danger); border-radius: var(--radius-sm); font-size: 15px; font-weight: 600; cursor: pointer; }
        
        /* Calendar - Bigger Arrows */
        .calendar-view { padding: 16px 20px; }
        .calendar-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .calendar-nav h2 { font-size: 18px; font-weight: 600; }
        .cal-nav-btn { width: 56px; height: 56px; min-width: 56px; border-radius: 50%; border: none; background: var(--card); cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow-sm); }
        .cal-nav-btn:active { background: var(--bg); }
        .calendar-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; margin-bottom: 10px; }
        .calendar-weekdays span { font-size: 12px; font-weight: 600; color: var(--muted); }
        .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .cal-cell { aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: var(--radius-sm); cursor: pointer; background: var(--card); position: relative; }
        .cal-cell.empty { background: transparent; pointer-events: none; }
        .cal-cell.today { border: 2px solid var(--personal); }
        .cal-cell.selected { background: var(--personal); color: white; }
        .cal-date-num { font-size: 14px; font-weight: 500; }
        .cal-dots { display: flex; gap: 3px; position: absolute; bottom: 6px; }
        .cal-dot { width: 5px; height: 5px; border-radius: 50%; }
        .cal-dot.work { background: var(--work); }
        .cal-dot.personal { background: var(--personal); }
        .date-nav { display: flex; align-items: center; justify-content: center; gap: 20px; padding: 14px; background: var(--card); margin: 0 20px 16px; border-radius: var(--radius); box-shadow: var(--shadow-sm); }
        .date-nav button { width: 32px; height: 32px; border-radius: 50%; border: none; background: var(--bg); cursor: pointer; font-size: 16px; color: var(--text); display: flex; align-items: center; justify-content: center; }
        .date-nav span { font-weight: 600; min-width: 100px; text-align: center; font-size: 15px; }
        
        /* Analytics - Redesigned */
        .analytics-view { padding: 16px 20px; }
        .analytics-card { background: var(--card); padding: 20px; border-radius: var(--radius); margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .analytics-card.highlight { background: linear-gradient(135deg, var(--personal) 0%, #059669 100%); color: white; }
        .analytics-card h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; opacity: 0.9; }
        .today-progress { text-align: center; }
        .big-number { font-size: 48px; font-weight: 700; line-height: 1; }
        .big-number span { font-size: 24px; opacity: 0.7; }
        .big-label { font-size: 14px; margin-top: 8px; opacity: 0.9; }
        .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
        .stat-card { background: var(--card); padding: 16px 12px; border-radius: var(--radius); text-align: center; box-shadow: var(--shadow-sm); }
        .stat-card.positive { background: var(--personal-light); }
        .stat-card.negative { background: var(--danger-light); }
        .stat-value { font-size: 20px; font-weight: 700; display: block; }
        .stat-card.positive .stat-value { color: var(--personal); }
        .stat-card.negative .stat-value { color: var(--danger); }
        .stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; font-weight: 600; margin-top: 4px; display: block; }
        .chart-card { background: var(--card); padding: 20px; border-radius: var(--radius); margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .chart-card h3 { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
        .bar-chart { display: flex; justify-content: space-between; align-items: flex-end; height: 100px; }
        .bar-col { display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; }
        .bar-stack { width: 28px; height: 80px; display: flex; flex-direction: column-reverse; border-radius: 6px; overflow: hidden; background: var(--bg); }
        .bar { width: 100%; transition: height 0.4s; }
        .bar.work { background: var(--work); }
        .bar.personal { background: var(--personal); }
        .bar-day { font-size: 12px; color: var(--muted); font-weight: 600; }
        .chart-legend { display: flex; justify-content: center; gap: 24px; margin-top: 16px; font-size: 12px; color: var(--muted); }
        .chart-legend span { display: flex; align-items: center; gap: 6px; }
        .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
        .legend-dot.work { background: var(--work); }
        .legend-dot.personal { background: var(--personal); }
        .insight-card { display: flex; align-items: center; gap: 14px; background: var(--card); padding: 18px; border-radius: var(--radius); box-shadow: var(--shadow-sm); }
        .insight-icon { font-size: 28px; }
        .insight-card p { font-size: 14px; color: var(--muted); }
        .insight-card strong { color: var(--text); font-weight: 600; }
      `}</style>
      
      <div className="app">
        {isSelectionMode && <SelectionHeader selectedCount={selectedTasks.length} onCancel={exitSelectionMode} onMove={() => setShowMoveModal(true)} />}
        
        {activeTab === 'today' && !isSelectionMode && (
          <>
            <div className="header">
              <div className="header-left">
                <h1>Today</h1>
                <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
              </div>
              <button className="icon-btn" onClick={() => setShowSettings(true)}>⚙️</button>
            </div>
            <ProgressSummary workDone={workDone} workTotal={workTotal} personalDone={personalDone} personalTotal={personalTotal} settings={settings} />
          </>
        )}
        
        {activeTab === 'today' && (
          <div className="tasks-section">
            {!isSelectionMode && (
              <div className="section-header">
                <h2>Tasks</h2>
                <div className="section-actions">
                  {pendingCount > 0 && <button className="shift-btn" onClick={enterSelectionMode}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Shift</button>}
                  <span className="task-count">{pendingCount} remaining</span>
                </div>
              </div>
            )}
            {currentDateTasks.length > 0 && !isSelectionMode && <div className="swipe-hint">← Swipe left for Edit / Delete</div>}
            {isSelectionMode && <div className="swipe-hint">Tap incomplete tasks to select</div>}
            {currentDateTasks.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">📋</div><p>No tasks for today</p></div>
            ) : (
              currentDateTasks.map(task => <TaskItem key={task.id} task={task} onToggle={toggleTask} onEdit={handleEdit} onDelete={handleDelete} isSelectionMode={isSelectionMode} isSelected={selectedTasks.includes(task.id)} onSelect={handleSelectTask} />)
            )}
          </div>
        )}
        
        {activeTab === 'calendar' && !isSelectionMode && (
          <>
            <div className="header"><div className="header-left"><h1>Calendar</h1></div></div>
            <CalendarView tasks={tasks} onDateSelect={setSelectedDate} selectedDate={selectedDate} />
            <div className="date-nav">
              <button onClick={() => navigateDate(-1)}>‹</button>
              <span>{formatDate(selectedDate)}</span>
              <button onClick={() => navigateDate(1)}>›</button>
            </div>
            <MiniProgress tasks={selectedDateTasks} settings={settings} />
          </>
        )}
        
        {activeTab === 'calendar' && (
          <div className="tasks-section">
            {!isSelectionMode && (
              <div className="section-header">
                <h2>Tasks</h2>
                <div className="section-actions">
                  {selectedDateTasks.filter(t => t.status !== 'Done').length > 0 && <button className="shift-btn" onClick={enterSelectionMode}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Shift</button>}
                  <span className="task-count">{selectedDateTasks.length} total</span>
                </div>
              </div>
            )}
            {selectedDateTasks.length > 0 && !isSelectionMode && <div className="swipe-hint">← Swipe left for Edit / Delete</div>}
            {selectedDateTasks.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">📅</div><p>No tasks for this day</p></div>
            ) : (
              selectedDateTasks.map(task => <TaskItem key={task.id} task={task} onToggle={toggleTask} onEdit={handleEdit} onDelete={handleDelete} isSelectionMode={isSelectionMode} isSelected={selectedTasks.includes(task.id)} onSelect={handleSelectTask} />)
            )}
          </div>
        )}
        
        {activeTab === 'analytics' && (
          <>
            <div className="header"><div className="header-left"><h1>Analytics</h1></div><button className="icon-btn" onClick={() => setShowSettings(true)}>⚙️</button></div>
            <AnalyticsView tasks={tasks} />
          </>
        )}
        
        {!isSelectionMode && (
          <button className="fab" onClick={() => setShowModal(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        )}
        
        {!isSelectionMode && (
          <nav className="bottom-nav">
            <button className={`nav-item ${activeTab === 'today' ? 'active' : ''}`} onClick={() => setActiveTab('today')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
              <span>Today</span>
            </button>
            <button className={`nav-item ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              <span>Calendar</span>
            </button>
            <button className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
              <span>Analytics</span>
            </button>
          </nav>
        )}
        
        {showModal && <TaskModal task={editingTask} onSave={handleSave} onClose={() => { setShowModal(false); setEditingTask(null); }} selectedDate={activeTab === 'calendar' ? selectedDate : today} />}
        {showMoveModal && <MoveModal onClose={() => setShowMoveModal(false)} onMove={handleMove} selectedCount={selectedTasks.length} targetDate={activeTab === 'calendar' ? selectedDate : today} />}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} tasks={tasks} user={user} onSignOut={handleSignOut} settings={settings} onUpdateSettings={handleUpdateSettings} />}
      </div>
    </>
  );
}
