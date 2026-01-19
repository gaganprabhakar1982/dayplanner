import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, enableIndexedDbPersistence, writeBatch } from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDy0pTEm1qxdVdqdQUQ8I7TAB6Yd2zabgs",
  authDomain: "daily-tracker-2e4f4.firebaseapp.com",
  projectId: "daily-tracker-2e4f4",
  storageBucket: "daily-tracker-2e4f4.firebasestorage.app",
  messagingSenderId: "111250357138",
  appId: "1:111250357138:web:ebd7983f1b714b9e7e5f4b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
enableIndexedDbPersistence(db).catch((err) => console.log('Persistence:', err.code));

// Utilities
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
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
  if (date.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const getTodayStr = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const dateToStr = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const getNextDay = (dateStr) => {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + 1);
  return dateToStr(date);
};

// Time utilities for scheduling
const formatTimeRange = (startTime, endTime) => {
  if (!startTime || !endTime) return '';
  const formatTime12h = (time24) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
  };
  return `${formatTime12h(startTime)} - ${formatTime12h(endTime)}`;
};

const calculateEndTime = (startTime, durationMinutes) => {
  if (!startTime) return null;
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
};

const timeToMinutes = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const hasTimeConflict = (newStart, newEnd, existingTasks) => {
  const newStartMin = timeToMinutes(newStart);
  const newEndMin = timeToMinutes(newEnd);
  
  return existingTasks.some(task => {
    if (!task.scheduledStartTime || !task.scheduledEndTime || task.status === 'Done') return false;
    const taskStartMin = timeToMinutes(task.scheduledStartTime);
    const taskEndMin = timeToMinutes(task.scheduledEndTime);
    // Check if time ranges overlap
    return (newStartMin < taskEndMin && newEndMin > taskStartMin);
  });
};

const sortTasks = (tasks) => [...tasks].sort((a, b) => {
  // First, separate done and pending tasks
  if (a.status === 'Done' && b.status !== 'Done') return 1;
  if (a.status !== 'Done' && b.status === 'Done') return -1;
  
  // For pending tasks, separate scheduled vs anytime
  const aScheduled = a.isScheduled && a.scheduledStartTime;
  const bScheduled = b.isScheduled && b.scheduledStartTime;
  
  if (aScheduled && !bScheduled) return -1; // Scheduled tasks first
  if (!aScheduled && bScheduled) return 1;  // Anytime tasks last
  
  // If both are scheduled, sort by time
  if (aScheduled && bScheduled) {
    const aTime = timeToMinutes(a.scheduledStartTime);
    const bTime = timeToMinutes(b.scheduledStartTime);
    if (aTime !== bTime) return aTime - bTime;
  }
  
  // If both are anytime (or both are done), sort by creation time
  const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return timeB - timeA;
});

const useResponsive = () => {
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return { isDesktop, isTouchDevice };
};

const DEFAULT_SETTINGS = { 
  dailyLimit: 480, 
  workLimit: 360, 
  personalLimit: 120,
  // Time preferences for AI scheduling
  workingHours: { start: "09:00", end: "17:00" },
  personalHours: { start: "18:00", end: "21:00" },
  focusTimes: {
    workMorning: ["09:00", "12:00"],
    workAfternoon: ["14:00", "17:00"]
  },
  breakDuration: 15,
  timeSlotIncrement: 30
};

// Components
const LoadingScreen = () => (
  <div className="loading-screen">
    <div className="loading-content">
      <div className="loading-logo"><svg viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="12" fill="#10B981"/><path d="M14 24L21 31L34 18" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
      <div className="loading-spinner"></div>
      <p>Loading your tasks...</p>
    </div>
  </div>
);

const LoginScreen = ({ onLogin }) => (
  <div style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, #10B981 0%, #059669 100%)', padding: '40px 24px' }}>
    <div style={{ textAlign: 'center', width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ marginBottom: '24px' }}>
        <svg width="80" height="80" viewBox="0 0 48 48" fill="none" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))' }}>
          <rect width="48" height="48" rx="12" fill="white"/><path d="M14 24L21 31L34 18" stroke="#10B981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'white', marginBottom: '8px' }}>DayPlanner</h1>
      <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.85)', marginBottom: '32px' }}>Organize your day, track your progress</p>
      <div style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', borderRadius: '16px', padding: '16px 20px', marginBottom: '32px', textAlign: 'left', width: '100%', border: '1px solid rgba(255,255,255,0.2)' }}>
        {['📋 Track work & personal tasks', '🔄 Sync across all devices', '📊 Analyze your productivity'].map((text, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', color: 'white', fontSize: '14px', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.15)' : 'none' }}>
            <span style={{ fontSize: '20px', width: '28px', textAlign: 'center' }}>{text.slice(0,2)}</span>
            <span style={{ fontWeight: '500' }}>{text.slice(3)}</span>
          </div>
        ))}
      </div>
      <button onClick={onLogin} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', width: '100%', padding: '16px 24px', background: 'white', color: '#1A1A1A', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.15)', fontFamily: 'inherit' }}>
        <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </button>
    </div>
  </div>
);

const Sidebar = ({ activeTab, onTabChange, onSettingsClick, user }) => (
  <div className="sidebar">
    <div className="sidebar-logo">
      <svg viewBox="0 0 48 48" fill="none" width="32" height="32"><rect width="48" height="48" rx="12" fill="#10B981"/><path d="M14 24L21 31L34 18" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <span>DayPlanner</span>
    </div>
    <nav className="sidebar-nav">
      {[{id:'today',icon:'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',label:'Today',key:'T'},{id:'calendar',icon:'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18',label:'Calendar',key:'C'},{id:'analytics',icon:'M18 20V10M12 20V4M6 20v-6',label:'Analytics',key:'A'},{id:'parked',icon:'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',label:'Parked',key:'P'}].map(item => (
        <button key={item.id} className={`sidebar-item ${activeTab === item.id ? 'active' : ''} ${item.id === 'parked' ? 'parked' : ''}`} onClick={() => onTabChange(item.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={item.icon}/></svg>
          <span>{item.label}</span>
          <span className="shortcut-hint">{item.key}</span>
        </button>
      ))}
    </nav>
    <div className="sidebar-footer">
      <button className="sidebar-item" onClick={onSettingsClick}>
        <span className="sidebar-emoji">⚙️</span><span>Settings</span><span className="shortcut-hint">S</span>
      </button>
      {user && (
        <div className="sidebar-user">
          {user.photoURL ? <img src={user.photoURL} alt="" className="sidebar-avatar" /> : <div className="sidebar-avatar-placeholder">{user.displayName?.charAt(0) || '?'}</div>}
          <span className="sidebar-username">{user.displayName?.split(' ')[0]}</span>
        </div>
      )}
    </div>
  </div>
);

const ProgressSummary = ({ workDone, workTotal, personalDone, personalTotal, settings }) => {
  const totalDone = workDone + personalDone;
  const totalPlanned = workTotal + personalTotal;
  const percent = totalPlanned > 0 ? Math.round((totalDone / totalPlanned) * 100) : 0;
  const workFree = Math.max(0, settings.workLimit - workTotal);
  const personalFree = Math.max(0, settings.personalLimit - personalTotal);
  const workOver = workTotal > settings.workLimit;
  const personalOver = personalTotal > settings.personalLimit;
  return (
    <div className="progress-summary">
      <div className="progress-main">
        <span className="progress-label"><strong>{formatTime(totalDone)}</strong> done of <strong>{formatTime(totalPlanned)}</strong> planned</span>
        <span className="progress-percent">{percent}%</span>
      </div>
      <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${percent}%` }} /></div>
      <div className="category-rows">
        <div className="category-row">
          <span className="cat-left"><span className="cat-dot work"></span><span className="cat-text">Work: {formatTime(workDone)}/{formatTime(workTotal)} done</span></span>
          <span className={`cat-right ${workOver ? 'over' : workFree === 0 ? 'full' : ''}`}>{workOver ? `${formatTime(workTotal - settings.workLimit)} over!` : workFree === 0 ? 'At limit' : `Can add ${formatTime(workFree)}`}</span>
        </div>
        <div className="category-row">
          <span className="cat-left"><span className="cat-dot personal"></span><span className="cat-text">Personal: {formatTime(personalDone)}/{formatTime(personalTotal)} done</span></span>
          <span className={`cat-right ${personalOver ? 'over' : personalFree === 0 ? 'full' : ''}`}>{personalOver ? `${formatTime(personalTotal - settings.personalLimit)} over!` : personalFree === 0 ? 'At limit' : `Can add ${formatTime(personalFree)}`}</span>
        </div>
      </div>
    </div>
  );
};

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
        <div className="mini-stat"><span className="mini-value">{doneTasks}/{totalTasks}</span><span className="mini-label">Tasks</span></div>
        <div className="mini-stat work"><span className="mini-value">{formatTime(workDone)}/{formatTime(workTotal)}</span><span className="mini-label">Work</span></div>
        <div className="mini-stat personal"><span className="mini-value">{formatTime(personalDone)}/{formatTime(personalTotal)}</span><span className="mini-label">Personal</span></div>
      </div>
    </div>
  );
};

const TaskItem = ({ task, onToggle, onEdit, onDelete, isSelectionMode, isSelected, onSelect, isDesktop, isTouchDevice, onSchedule }) => {
  const [showHoverActions, setShowHoverActions] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const itemRef = useRef(null);
  const isDone = task.status === 'Done';
  
  const handleTouchStart = (e) => { if (isSelectionMode || isDesktop) return; startX.current = e.touches[0].clientX; };
  const handleTouchMove = (e) => {
    if (isSelectionMode || isDesktop) return;
    currentX.current = e.touches[0].clientX;
    const diff = startX.current - currentX.current;
    if (diff > 0 && itemRef.current) itemRef.current.style.transform = `translateX(-${Math.min(diff, 140)}px)`;
  };
  const handleTouchEnd = () => {
    if (isSelectionMode || isDesktop) return;
    const diff = startX.current - currentX.current;
    if (diff > 70 && itemRef.current) itemRef.current.style.transform = 'translateX(-140px)';
    else if (itemRef.current) itemRef.current.style.transform = 'translateX(0)';
  };
  const resetSwipe = () => { if (itemRef.current) itemRef.current.style.transform = 'translateX(0)'; };
  
  return (
    <div className={`task-wrapper ${isSelected ? 'selected' : ''}`} onMouseEnter={() => !isTouchDevice && setShowHoverActions(true)} onMouseLeave={() => { setShowHoverActions(false); resetSwipe(); }}>
      {!isDesktop && (
        <div className="task-actions">
          {!task.date && onSchedule && <button className="action-btn schedule" onClick={() => { onSchedule(task); resetSwipe(); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>Schedule</button>}
          <button className="action-btn edit" onClick={() => { onEdit(task); resetSwipe(); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>Edit</button>
          <button className="action-btn delete" onClick={() => { onDelete(task.id); resetSwipe(); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>Delete</button>
        </div>
      )}
      <div ref={itemRef} className={`task-item ${task.category.toLowerCase()} ${isDone ? 'done' : ''} ${isSelectionMode && !isDone ? 'selectable' : ''}`} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onClick={() => isSelectionMode && !isDone && onSelect(task.id)}>
        {!isSelectionMode && (
          <button className={`checkbox ${isDone ? 'checked' : ''}`} onClick={(e) => { e.stopPropagation(); onToggle(task.id, task.status); }}>
            {isDone && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
          </button>
        )}
        {isSelectionMode && !isDone && <div className={`select-circle ${isSelected ? 'selected' : ''}`}>{isSelected ? '✓' : ''}</div>}
        {isSelectionMode && isDone && <div className="checkbox checked disabled"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg></div>}
        <div className="task-content">
          {task.isScheduled && task.scheduledStartTime && task.scheduledEndTime && (
            <div className={`task-time ${task.category.toLowerCase()}`}>
              <span className="time-icon">🕐</span>
              <span>{formatTimeRange(task.scheduledStartTime, task.scheduledEndTime)}</span>
            </div>
          )}
          <span className="task-name">{task.task}</span>
          <div className="task-meta">
            <span className={`category-dot ${task.category.toLowerCase()}`}></span>
            <span className="time-badge">{formatTime(task.timeRequired)}</span>
            {task.repeat && task.repeat !== 'none' && <span className="repeat-badge">🔁</span>}
            {task.aiScheduled && <span className="ai-badge">✨ AI</span>}
          </div>
        </div>
        {!isSelectionMode && !isTouchDevice && showHoverActions && (
          <div className="hover-actions">
            {!task.date && onSchedule && (
              <button className="hover-btn schedule" onClick={(e) => { e.stopPropagation(); onSchedule(task); }} title="Schedule">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </button>
            )}
            <button className="hover-btn edit" onClick={(e) => { e.stopPropagation(); onEdit(task); }} title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </button>
            <button className="hover-btn delete" onClick={(e) => { e.stopPropagation(); onDelete(task.id); }} title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const SelectionHeader = ({ selectedCount, onCancel, onMove }) => (
  <div className="selection-header">
    <button className="cancel-btn" onClick={onCancel}>Cancel</button>
    <span className="selection-count">{selectedCount} selected</span>
    <button className="move-btn" onClick={onMove} disabled={selectedCount === 0}>Move →</button>
  </div>
);

const TaskModal = ({ task, onSave, onClose, selectedDate, existingTasks = [] }) => {
  const [formData, setFormData] = useState(task || { 
    task: '', 
    category: 'Work', 
    timeRequired: 30, 
    status: 'Pending', 
    date: selectedDate, 
    repeat: 'none',
    isScheduled: false,
    scheduledStartTime: '09:00'
  });
  const [repeatEndType, setRepeatEndType] = useState('count');
  const [repeatCount, setRepeatCount] = useState(10);
  const [repeatEndDate, setRepeatEndDate] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return dateToStr(d); });
  const timePresets = [15, 30, 60, 90, 120];
  const repeatOptions = [{ value: 'none', label: 'No repeat' },{ value: 'daily', label: 'Daily' },{ value: 'alternate', label: 'Alternate days' },{ value: 'weekly', label: 'Weekly' },{ value: 'fortnightly', label: 'Fortnightly' },{ value: 'monthly', label: 'Monthly' }];
  
  // Calculate end time when start time or duration changes
  const calculatedEndTime = formData.isScheduled && formData.scheduledStartTime 
    ? calculateEndTime(formData.scheduledStartTime, formData.timeRequired) 
    : null;
  
  // Check for time conflicts
  const sameDateTasks = existingTasks.filter(t => t.date === formData.date && t.id !== task?.id);
  const hasConflict = formData.isScheduled && formData.scheduledStartTime && calculatedEndTime
    ? hasTimeConflict(formData.scheduledStartTime, calculatedEndTime, sameDateTasks)
    : false;
  
  const handleSave = () => {
    if (!formData.task.trim()) return;
    let repeatInfo = null;
    if (formData.repeat !== 'none') repeatInfo = { type: repeatEndType, count: repeatEndType === 'count' ? repeatCount : null, endDate: repeatEndType === 'date' ? repeatEndDate : null };
    
    const taskData = {
      ...formData,
      scheduledEndTime: calculatedEndTime,
      repeatInfo
    };
    
    // Remove scheduling fields if anytime task
    if (!formData.isScheduled) {
      taskData.scheduledStartTime = null;
      taskData.scheduledEndTime = null;
    }
    
    onSave(taskData);
  };
  
  useEffect(() => { const handleKey = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey); }, [onClose]);
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>{task ? 'Edit Task' : 'New Task'}</h2><button className="close-btn" onClick={onClose}></button></div>
        <div className="form-group"><label>Task Name</label><input type="text" placeholder="What needs to be done?" value={formData.task} onChange={e => setFormData({...formData, task: e.target.value})} autoFocus /></div>
        <div className="form-group"><label>Category</label><div className="form-row"><button className={`cat-btn ${formData.category === 'Work' ? 'active work' : ''}`} onClick={() => setFormData({...formData, category: 'Work'})}>💼 Work</button><button className={`cat-btn ${formData.category === 'Personal' ? 'active personal' : ''}`} onClick={() => setFormData({...formData, category: 'Personal'})}>🏠 Personal</button></div></div>
        <div className="form-group"><label>Duration</label><div className="time-presets">{timePresets.map(t => (<button key={t} className={`preset-btn ${formData.timeRequired === t ? 'active' : ''}`} onClick={() => setFormData({...formData, timeRequired: t})}>{formatTime(t)}</button>))}</div><div className="slider-row"><input type="range" min="5" max="240" step="5" value={formData.timeRequired} onChange={e => setFormData({...formData, timeRequired: parseInt(e.target.value)})} /><span className="slider-value">{formatTime(formData.timeRequired)}</span></div></div>
        
        {/* NEW: Time Scheduling Toggle */}
        <div className="form-group">
          <label>Timing</label>
          <div className="timing-toggle">
            <button 
              className={`timing-btn ${!formData.isScheduled ? 'active' : ''}`} 
              onClick={() => setFormData({...formData, isScheduled: false})}
            >
              📋 Anytime
            </button>
            <button 
              className={`timing-btn ${formData.isScheduled ? 'active' : ''}`} 
              onClick={() => setFormData({...formData, isScheduled: true})}
            >
              ⏰ Schedule Time
            </button>
          </div>
        </div>
        
        {/* NEW: Time Picker (only shown when scheduled) */}
        {formData.isScheduled && (
          <div className="time-picker-section">
            <div className="form-group">
              <label>Start Time</label>
              <input 
                type="time" 
                value={formData.scheduledStartTime} 
                onChange={e => setFormData({...formData, scheduledStartTime: e.target.value})}
                className="time-input"
              />
            </div>
            {calculatedEndTime && (
              <div className="calculated-time">
                <span className="time-icon">→</span>
                <span className="time-range">{formatTimeRange(formData.scheduledStartTime, calculatedEndTime)}</span>
              </div>
            )}
            {hasConflict && (
              <div className="conflict-warning">
                ⚠️ This time overlaps with another scheduled task
              </div>
            )}
          </div>
        )}
        
        <div className="form-row-2"><div className="form-group"><label>Start Date</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} /></div><div className="form-group"><label>Repeat</label><select value={formData.repeat} onChange={e => setFormData({...formData, repeat: e.target.value})}>{repeatOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div></div>
        {formData.repeat !== 'none' && !task && (
          <div className="repeat-end-section"><label>Repeat Until</label><div className="repeat-end-options">
            <label className={`radio-option ${repeatEndType === 'count' ? 'active' : ''}`}><input type="radio" name="repeatEnd" checked={repeatEndType === 'count'} onChange={() => setRepeatEndType('count')} /><span className="radio-label"><input type="number" min="2" max="100" value={repeatCount} onChange={e => setRepeatCount(parseInt(e.target.value) || 10)} className="inline-input" /> times</span></label>
            <label className={`radio-option ${repeatEndType === 'date' ? 'active' : ''}`}><input type="radio" name="repeatEnd" checked={repeatEndType === 'date'} onChange={() => setRepeatEndType('date')} /><span className="radio-label">Until <input type="date" value={repeatEndDate} onChange={e => setRepeatEndDate(e.target.value)} className="inline-date" /></span></label>
          </div></div>
        )}
        <button className="save-btn" onClick={handleSave}>{task ? 'Save Changes' : 'Add Task'}</button>
      </div>
    </div>
  );
};

const MoveModal = ({ onClose, onMove, onPark, selectedCount, targetDate }) => {
  const today = getTodayStr();
  const tomorrow = getNextDay(today);
  const dayAfter = getNextDay(tomorrow);
  useEffect(() => { const handleKey = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey); }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content move-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Move Tasks</h2><button className="close-btn" onClick={onClose}></button></div>
        <p className="move-info">Move {selectedCount} task{selectedCount > 1 ? 's' : ''} to:</p>
        <div className="quick-dates"><button className="quick-date-btn" onClick={() => onMove(tomorrow)}>Tomorrow</button><button className="quick-date-btn" onClick={() => onMove(dayAfter)}>{formatDate(dayAfter)}</button></div>
        <div className="form-group"><label>Or pick a date:</label><input type="date" onChange={e => onMove(e.target.value)} min={targetDate} /></div>
        <div className="park-divider">OR</div>
        <div className="park-section-subtle">
          <button className="park-btn-subtle" onClick={onPark}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Park for Later
          </button>
          <p className="park-description-subtle">Save without scheduling</p>
        </div>
      </div>
    </div>
  );
};

const SettingsModal = ({ onClose, tasks, user, onSignOut, settings, onUpdateSettings }) => {
  const [localSettings, setLocalSettings] = useState(settings);
  const handleSave = () => { onUpdateSettings(localSettings); onClose(); };
  useEffect(() => { const handleKey = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey); }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Settings</h2><button className="close-btn" onClick={onClose}></button></div>
        {user && (<div className="user-info">{user.photoURL ? <img src={user.photoURL} alt="" className="user-avatar" /> : <div className="user-avatar-placeholder">{user.displayName?.charAt(0) || '?'}</div>}<div><div className="user-name">{user.displayName}</div><div className="user-email">{user.email}</div></div></div>)}
        <div className="settings-section"><h3>Daily Time Limits</h3>
          <div className="setting-item"><label>Work Hours</label><div className="setting-input"><input type="number" min="60" max="720" step="30" value={localSettings.workLimit} onChange={e => setLocalSettings({...localSettings, workLimit: parseInt(e.target.value) || 360})} /><span>{formatTime(localSettings.workLimit)}</span></div></div>
          <div className="setting-item"><label>Personal Hours</label><div className="setting-input"><input type="number" min="30" max="480" step="30" value={localSettings.personalLimit} onChange={e => setLocalSettings({...localSettings, personalLimit: parseInt(e.target.value) || 120})} /><span>{formatTime(localSettings.personalLimit)}</span></div></div>
        </div>
        <div className="settings-section"><h3>Keyboard Shortcuts</h3><div className="shortcuts-list">
          {[['N','New task'],['T','Today'],['C','Calendar'],['A','Analytics'],['S','Settings'],['Esc','Close modal']].map(([key, desc]) => (<div key={key} className="shortcut-row"><span className="key">{key}</span><span>{desc}</span></div>))}
        </div></div>
        <button className="save-btn" onClick={handleSave}>Save Settings</button>
        <button className="signout-btn" onClick={onSignOut}>Sign Out</button>
      </div>
    </div>
  );
};

const CalendarView = ({ tasks, onDateSelect, selectedDate }) => {
  const [viewMonth, setViewMonth] = useState(() => { const d = parseLocalDate(selectedDate); return { year: d.getFullYear(), month: d.getMonth() }; });
  const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewMonth.year, viewMonth.month, 1).getDay();
  const today = getTodayStr();
  const tasksByDate = tasks.reduce((acc, task) => { if (!acc[task.date]) acc[task.date] = { work: 0, personal: 0 }; acc[task.date][task.category.toLowerCase()] += task.timeRequired; return acc; }, {});
  const days = []; for (let i = 0; i < firstDayOfWeek; i++) days.push(null); for (let d = 1; d <= daysInMonth; d++) days.push(d);
  const navigateMonth = (dir) => setViewMonth(prev => { let m = prev.month + dir, y = prev.year; if (m > 11) { m = 0; y++; } if (m < 0) { m = 11; y--; } return { year: y, month: m }; });
  return (
    <div className="calendar-view">
      <div className="cal-header">
        <button className="cal-nav-btn" onClick={() => navigateMonth(-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg></button>
        <span className="cal-title">{new Date(viewMonth.year, viewMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <button className="cal-nav-btn" onClick={() => navigateMonth(1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg></button>
      </div>
      <div className="cal-weekdays">{['S','M','T','W','T','F','S'].map((d,i) => <div key={i} className="weekday">{d}</div>)}</div>
      <div className="cal-grid">
        {days.map((day, i) => {
          if (!day) return <div key={i} className="cal-day empty" />;
          const dateStr = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayTasks = tasksByDate[dateStr];
          return (
            <div key={i} className={`cal-day ${dateStr === today ? 'today' : ''} ${dateStr === selectedDate ? 'selected' : ''}`} onClick={() => onDateSelect(dateStr)}>
              <span className="day-num">{day}</span>
              {dayTasks && <div className="day-indicators">{dayTasks.work > 0 && <span className="indicator work" />}{dayTasks.personal > 0 && <span className="indicator personal" />}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MiniCalendar = ({ tasks, onDateSelect, selectedDate }) => {
  const today = getTodayStr();
  const viewMonth = { year: new Date().getFullYear(), month: new Date().getMonth() };
  const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewMonth.year, viewMonth.month, 1).getDay();
  const tasksByDate = tasks.reduce((acc, task) => { acc[task.date] = true; return acc; }, {});
  const days = []; for (let i = 0; i < firstDayOfWeek; i++) days.push(null); for (let d = 1; d <= daysInMonth; d++) days.push(d);
  return (
    <div className="mini-calendar">
      <div className="mini-cal-header">{new Date(viewMonth.year, viewMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
      <div className="mini-cal-weekdays">{['S','M','T','W','T','F','S'].map((d,i) => <div key={i}>{d}</div>)}</div>
      <div className="mini-cal-grid">
        {days.map((day, i) => {
          if (!day) return <div key={i} className="mini-cal-day empty" />;
          const dateStr = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return <div key={i} className={`mini-cal-day ${dateStr === today ? 'today' : ''} ${dateStr === selectedDate ? 'selected' : ''} ${tasksByDate[dateStr] ? 'has-tasks' : ''}`} onClick={() => onDateSelect(dateStr)}>{day}</div>;
        })}
      </div>
    </div>
  );
};

const AnalyticsView = ({ tasks }) => {
  const today = getTodayStr();
  const todayTasks = tasks.filter(t => t.date === today);
  const todayDone = todayTasks.filter(t => t.status === 'Done').length;
  const todayTotal = todayTasks.length;
  const todayWorkDone = todayTasks.filter(t => t.category === 'Work' && t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0);
  const todayPersonalDone = todayTasks.filter(t => t.category === 'Personal' && t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0);
  
  let streak = 0;
  let checkDate = new Date(); checkDate.setDate(checkDate.getDate() - 1);
  for (let i = 0; i < 365; i++) { const dateStr = dateToStr(checkDate); const dayTasks = tasks.filter(t => t.date === dateStr); if (dayTasks.length === 0 || !dayTasks.every(t => t.status === 'Done')) break; streak++; checkDate.setDate(checkDate.getDate() - 1); }
  
  const weeklyData = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const dateStr = dateToStr(d); const dayTasks = tasks.filter(t => t.date === dateStr); weeklyData.push({ date: dateStr, workDone: dayTasks.filter(t => t.category === 'Work' && t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0), personalDone: dayTasks.filter(t => t.category === 'Personal' && t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0) }); }
  const maxTime = Math.max(...weeklyData.map(d => d.workDone + d.personalDone), 60);
  const totalCompleted = weeklyData.reduce((s, d) => s + d.workDone + d.personalDone, 0);
  const avgDaily = Math.round(totalCompleted / 7);
  
  let lastWeekTotal = 0; for (let i = 13; i >= 7; i--) { const d = new Date(); d.setDate(d.getDate() - i); const dateStr = dateToStr(d); lastWeekTotal += tasks.filter(t => t.date === dateStr && t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0); }
  const weekComparison = lastWeekTotal > 0 ? Math.round(((totalCompleted - lastWeekTotal) / lastWeekTotal) * 100) : 0;
  
  const dayStats = [0,0,0,0,0,0,0]; tasks.filter(t => t.status === 'Done').forEach(t => { dayStats[parseLocalDate(t.date).getDay()] += t.timeRequired; });
  const bestDayIndex = dayStats.indexOf(Math.max(...dayStats));
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  
  return (
    <div className="analytics-view">
      <div className="analytics-card highlight">
        <span className="big-number">{todayDone}/{todayTotal}</span>
        <span className="big-label">tasks completed today</span>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '12px' }}>
          <span style={{ fontSize: '13px', color: '#047857' }}>💼 {formatTime(todayWorkDone)} work</span>
          <span style={{ fontSize: '13px', color: '#047857' }}>🏠 {formatTime(todayPersonalDone)} personal</span>
        </div>
      </div>
      
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">🔥 {streak}</span>
          <span className="stat-label">Consecutive days with all tasks done</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{formatTime(avgDaily)}</span>
          <span className="stat-label">Avg time completed per day (last 7 days)</span>
        </div>
        <div className={`stat-card ${weekComparison >= 0 ? 'positive' : 'negative'}`}>
          <span className="stat-value">{weekComparison >= 0 ? '+' : ''}{weekComparison}%</span>
          <span className="stat-label">{weekComparison >= 0 ? 'More' : 'Less'} productive than last week</span>
        </div>
      </div>
      
      <div className="chart-card">
        <h3>Work & Personal Time - Last 7 Days</h3>
        <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '-8px', marginBottom: '16px' }}>Hours of completed tasks by category</p>
        <div className="bar-chart">
          {weeklyData.map((day) => (
            <div key={day.date} className="bar-col">
              <div className="bar-stack" title={`Work: ${formatTime(day.workDone)}, Personal: ${formatTime(day.personalDone)}`}>
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
        <span className="insight-icon">📊</span>
        <div>
          <p style={{ marginBottom: '4px' }}>Based on your history, <strong>{dayNames[bestDayIndex]}</strong> is when you complete the most tasks.</p>
          <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Plan important work on this day for better results.</p>
        </div>
      </div>
    </div>
  );
};

// Main App
export default function DayPlannerApp() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState('today');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [taskToSchedule, setTaskToSchedule] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [isPanelSelectionMode, setIsPanelSelectionMode] = useState(false);
  const [panelSelectedTasks, setPanelSelectedTasks] = useState([]);
  const [expandedSections, setExpandedSections] = useState({});
  const { isDesktop, isTouchDevice } = useResponsive();

  useEffect(() => { const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); }); return unsub; }, []);
  useEffect(() => { if (!user) return; const q = query(collection(db, 'users', user.uid, 'tasks'), orderBy('date', 'desc')); return onSnapshot(q, (snap) => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })))); }, [user]);
  useEffect(() => { if (!user) return; const load = async () => { const ref = doc(db, 'users', user.uid, 'settings', 'preferences'); const d = await getDoc(ref); if (d.exists()) setSettings({ ...DEFAULT_SETTINGS, ...d.data() }); }; load(); }, [user]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (showModal || showSettings || showMoveModal) return;
      switch (e.key.toLowerCase()) {
        case 'n': e.preventDefault(); setShowModal(true); break;
        case 't': e.preventDefault(); setActiveTab('today'); break;
        case 'c': e.preventDefault(); setActiveTab('calendar'); break;
        case 'a': e.preventDefault(); setActiveTab('analytics'); break;
        case 'p': e.preventDefault(); setActiveTab('parked'); break;
        case 's': e.preventDefault(); setShowSettings(true); break;
        case 'escape': if (isSelectionMode) { setIsSelectionMode(false); setSelectedTasks([]); } break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal, showSettings, showMoveModal, isSelectionMode]);

  const handleLogin = async () => { try { await signInWithPopup(auth, googleProvider); } catch (err) { console.error('Login failed:', err); } };
  const handleSignOut = async () => { await signOut(auth); setShowSettings(false); };
  const handleUpdateSettings = async (newSettings) => { await setDoc(doc(db, 'users', user.uid, 'settings', 'preferences'), newSettings); setSettings(newSettings); };
  const toggleTask = async (taskId, currentStatus) => { await updateDoc(doc(db, 'users', user.uid, 'tasks', taskId), { status: currentStatus === 'Done' ? 'Pending' : 'Done', completedAt: currentStatus === 'Done' ? null : new Date().toISOString() }); };
  
  const handleSave = async (taskData) => {
    if (editingTask) { await updateDoc(doc(db, 'users', user.uid, 'tasks', editingTask.id), taskData); }
    else {
      const dates = [taskData.date];
      if (taskData.repeat !== 'none' && taskData.repeatInfo) {
        const baseDate = parseLocalDate(taskData.date);
        let maxIter = taskData.repeatInfo.type === 'count' ? taskData.repeatInfo.count - 1 : 100;
        for (let i = 1; i <= maxIter; i++) {
          const newDate = new Date(baseDate);
          switch (taskData.repeat) { case 'daily': newDate.setDate(baseDate.getDate() + i); break; case 'alternate': newDate.setDate(baseDate.getDate() + (i * 2)); break; case 'weekly': newDate.setDate(baseDate.getDate() + (i * 7)); break; case 'fortnightly': newDate.setDate(baseDate.getDate() + (i * 14)); break; case 'monthly': newDate.setMonth(baseDate.getMonth() + i); break; }
          const newDateStr = dateToStr(newDate);
          if (taskData.repeatInfo.type === 'date' && newDateStr > taskData.repeatInfo.endDate) break;
          dates.push(newDateStr);
        }
      }
      const { repeatInfo, ...taskToSave } = taskData;
      for (const date of dates) { await addDoc(collection(db, 'users', user.uid, 'tasks'), { ...taskToSave, date, createdAt: new Date().toISOString() }); }
    }
    setShowModal(false); setEditingTask(null);
  };

  const handleDelete = async (taskId) => { if (window.confirm('Delete this task?')) await deleteDoc(doc(db, 'users', user.uid, 'tasks', taskId)); };
  const handleEdit = (task) => { setEditingTask(task); setShowModal(true); };
  const handleSelectTask = (taskId) => setSelectedTasks(prev => prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]);
  const enterSelectionMode = () => { setIsSelectionMode(true); setSelectedTasks([]); };
  const exitSelectionMode = () => { setIsSelectionMode(false); setSelectedTasks([]); };
  const handleMove = async (newDate) => { const batch = writeBatch(db); const tasksToMove = isPanelSelectionMode ? panelSelectedTasks : selectedTasks; for (const taskId of tasksToMove) batch.update(doc(db, 'users', user.uid, 'tasks', taskId), { date: newDate }); await batch.commit(); setShowMoveModal(false); exitSelectionMode(); if (isPanelSelectionMode) { setIsPanelSelectionMode(false); setPanelSelectedTasks([]); } };
  const handlePark = async () => { const batch = writeBatch(db); const tasksToMove = isPanelSelectionMode ? panelSelectedTasks : selectedTasks; for (const taskId of tasksToMove) batch.update(doc(db, 'users', user.uid, 'tasks', taskId), { date: null }); await batch.commit(); setShowMoveModal(false); exitSelectionMode(); if (isPanelSelectionMode) { setIsPanelSelectionMode(false); setPanelSelectedTasks([]); } };
  const handleScheduleTask = (task) => { setTaskToSchedule(task); setShowScheduleModal(true); };
  const handleScheduleConfirm = async (newDate) => { if (taskToSchedule) { await updateDoc(doc(db, 'users', user.uid, 'tasks', taskToSchedule.id), { date: newDate }); setShowScheduleModal(false); setTaskToSchedule(null); } };
  const handleShiftSingleTask = (task) => { setSelectedTasks([task.id]); setShowMoveModal(true); };
  const togglePanelSelectionMode = () => { 
    setIsPanelSelectionMode(!isPanelSelectionMode); 
    if (isPanelSelectionMode) setPanelSelectedTasks([]); 
  };
  const handlePanelTaskSelect = (taskId) => setPanelSelectedTasks(prev => prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]);
  const handlePanelShift = () => { setSelectedTasks(panelSelectedTasks); setShowMoveModal(true); };
  const toggleSectionExpansion = (sectionKey) => setExpandedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  const navigateDate = (dir) => { const current = parseLocalDate(selectedDate); current.setDate(current.getDate() + dir); setSelectedDate(dateToStr(current)); };

  const today = getTodayStr();
  const currentDateTasks = sortTasks(tasks.filter(t => t.date === (activeTab === 'today' ? today : selectedDate)));
  const selectedDateTasks = sortTasks(tasks.filter(t => t.date === selectedDate));
  const parkedTasks = sortTasks(tasks.filter(t => t.date === null || t.date === undefined));
  const workTasks = currentDateTasks.filter(t => t.category === 'Work');
  const personalTasks = currentDateTasks.filter(t => t.category === 'Personal');
  const workDone = workTasks.filter(t => t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0);
  const workTotal = workTasks.reduce((s, t) => s + t.timeRequired, 0);
  const personalDone = personalTasks.filter(t => t.status === 'Done').reduce((s, t) => s + t.timeRequired, 0);
  const personalTotal = personalTasks.reduce((s, t) => s + t.timeRequired, 0);
  const pendingCount = currentDateTasks.filter(t => t.status !== 'Done').length;

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  const renderTasks = (taskList, showSwipeHint = true) => {
    const scheduledTasks = taskList.filter(t => t.isScheduled && t.scheduledStartTime);
    const anytimeTasks = taskList.filter(t => !t.isScheduled || !t.scheduledStartTime);
    
    return (
      <div className="tasks-section">
        {!isSelectionMode && (
          <div className="section-header">
            <h2>Tasks</h2>
            <div className="section-actions">
              {taskList.filter(t => t.status !== 'Done').length > 0 && <button className="shift-btn" onClick={enterSelectionMode}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Shift</button>}
              <span className="task-count">{taskList.filter(t => t.status !== 'Done').length} remaining</span>
            </div>
          </div>
        )}
        {taskList.length > 0 && !isSelectionMode && showSwipeHint && !isDesktop && <div className="swipe-hint">← Swipe left for Edit / Delete</div>}
        {isSelectionMode && <div className="swipe-hint">Tap incomplete tasks to select</div>}
        
        {taskList.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">📋</div><p>No tasks</p></div>
        ) : (
          <>
            {/* Scheduled Tasks Section */}
            {scheduledTasks.length > 0 && (
              <div className="task-group">
                {!isSelectionMode && <div className="task-group-header">⏰ Scheduled ({scheduledTasks.length})</div>}
                {scheduledTasks.map(task => (
                  <TaskItem 
                    key={task.id} 
                    task={task} 
                    onToggle={toggleTask} 
                    onEdit={handleEdit} 
                    onDelete={handleDelete} 
                    isSelectionMode={isSelectionMode} 
                    isSelected={selectedTasks.includes(task.id)} 
                    onSelect={handleSelectTask} 
                    isDesktop={isDesktop} 
                    isTouchDevice={isTouchDevice} 
                    onSchedule={handleScheduleTask} 
                  />
                ))}
              </div>
            )}
            
            {/* Anytime Tasks Section */}
            {anytimeTasks.length > 0 && (
              <div className="task-group">
                {!isSelectionMode && <div className="task-group-header">📋 Anytime ({anytimeTasks.length})</div>}
                {anytimeTasks.map(task => (
                  <TaskItem 
                    key={task.id} 
                    task={task} 
                    onToggle={toggleTask} 
                    onEdit={handleEdit} 
                    onDelete={handleDelete} 
                    isSelectionMode={isSelectionMode} 
                    isSelected={selectedTasks.includes(task.id)} 
                    onSelect={handleSelectTask} 
                    isDesktop={isDesktop} 
                    isTouchDevice={isTouchDevice} 
                    onSchedule={handleScheduleTask} 
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        :root{--bg:#F4F4F2;--card:#FFFFFF;--text:#1A1A1A;--text-secondary:#52525B;--muted:#71717A;--work:#F59E0B;--work-light:#FEF3C7;--personal:#10B981;--personal-light:#D1FAE5;--border:#E4E4E7;--danger:#EF4444;--danger-light:#FEE2E2;--blue:#3B82F6;--blue-light:#DBEAFE;--shadow-sm:0 1px 2px rgba(0,0,0,0.04);--shadow:0 4px 12px rgba(0,0,0,0.06);--radius:16px;--radius-sm:12px;--sidebar-width:200px}
        html,body,#root{width:100%;min-height:100vh;overflow-x:hidden}
        body{font-family:'Inter',-apple-system,sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}
        .app-container{display:flex;min-height:100vh}
        .app{width:100%;max-width:480px;margin:0 auto;min-height:100vh;background:var(--bg);padding-bottom:90px}
        @media(min-width:1024px){.app{max-width:none;margin:0;padding-bottom:0;flex:1}.main-content{display:flex;flex:1}.primary-panel{flex:1;min-width:400px;background:var(--bg);overflow-y:auto;height:100vh}.secondary-panel{width:320px;min-width:320px;background:var(--card);padding:24px;overflow-y:auto;height:100vh;flex-shrink:0;border-left:1px solid var(--border)}.bottom-nav{display:none!important}.fab{bottom:32px;right:32px}}
        .sidebar{display:none}
        @media(min-width:1024px){.sidebar{width:var(--sidebar-width);min-width:var(--sidebar-width);background:var(--card);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:20px 12px;flex-shrink:0;height:100vh;position:sticky;top:0}.sidebar-logo{display:flex;align-items:center;gap:10px;padding:8px 12px;margin-bottom:24px}.sidebar-logo svg{width:28px;height:28px}.sidebar-logo span{font-size:16px;font-weight:700}.sidebar-nav{flex:1;display:flex;flex-direction:column;gap:4px}.sidebar-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border:none;background:transparent;border-radius:var(--radius-sm);cursor:pointer;font-size:14px;font-weight:500;color:var(--text-secondary);text-align:left;transition:all 0.15s;font-family:inherit}.sidebar-item:hover{background:var(--bg);color:var(--text)}.sidebar-item.active{background:var(--personal-light);color:var(--personal)}.sidebar-item.parked:hover{color:#8B5CF6}.sidebar-item.parked.active{background:#EDE9FE;color:#8B5CF6}.sidebar-item svg{width:18px;height:18px;flex-shrink:0}.sidebar-item .sidebar-emoji{font-size:16px;width:18px;text-align:center}.shortcut-hint{margin-left:auto;font-size:10px;color:var(--muted);background:var(--bg);padding:2px 6px;border-radius:4px;font-weight:600}.sidebar-item.active .shortcut-hint{background:rgba(16,185,129,0.2)}.sidebar-item.parked.active .shortcut-hint{background:rgba(139,92,246,0.2)}.sidebar-footer{border-top:1px solid var(--border);padding-top:12px;margin-top:12px}.sidebar-user{display:flex;align-items:center;gap:10px;padding:10px;margin-top:8px}.sidebar-avatar{width:32px;height:32px;border-radius:50%;object-fit:cover}.sidebar-avatar-placeholder{width:32px;height:32px;border-radius:50%;background:var(--personal);color:white;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600}.sidebar-username{font-size:13px;font-weight:500}}
        .loading-screen{width:100%;height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg)}.loading-content{text-align:center}.loading-logo{margin-bottom:24px}.loading-logo svg{width:64px;height:64px}.loading-spinner{width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--personal);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px}.loading-content p{color:var(--muted);font-size:14px}@keyframes spin{to{transform:rotate(360deg)}}
        .header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:var(--card);position:sticky;top:0;z-index:50;border-bottom:1px solid var(--border)}.header-left h1{font-size:22px;font-weight:700}.header-left span{font-size:13px;color:var(--muted)}.icon-btn{width:40px;height:40px;min-width:40px;border-radius:50%;border:none;background:var(--bg);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px}
        .selection-header{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:var(--blue-light);border-bottom:1px solid var(--blue);position:sticky;top:0;z-index:50}.cancel-btn{padding:8px 16px;background:transparent;border:none;color:var(--blue);font-size:14px;font-weight:600;cursor:pointer}.selection-count{font-size:14px;font-weight:600}.move-btn{padding:8px 16px;background:var(--blue);border:none;border-radius:8px;color:white;font-size:14px;font-weight:600;cursor:pointer}.move-btn:disabled{opacity:0.5}
        .fab{position:fixed;bottom:100px;right:20px;width:56px;height:56px;border-radius:50%;background:var(--personal);color:white;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(16,185,129,0.4);display:flex;align-items:center;justify-content:center;z-index:90}.fab svg{width:24px;height:24px}
        .progress-summary{padding:14px 20px;background:var(--card);border-bottom:1px solid var(--border)}.progress-main{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.progress-label{font-size:13px;color:var(--text-secondary)}.progress-label strong{color:var(--text);font-weight:600}.progress-percent{font-size:14px;font-weight:700;color:var(--personal)}.progress-bar-bg{height:8px;background:var(--border);border-radius:4px;overflow:hidden;margin-bottom:12px}.progress-bar-fill{height:100%;background:linear-gradient(90deg,var(--work) 0%,var(--personal) 100%);border-radius:4px;transition:width 0.4s}.category-rows{display:flex;flex-direction:column;gap:6px}.category-row{display:flex;justify-content:space-between;align-items:center}.cat-left{display:flex;align-items:center;gap:8px}.cat-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}.cat-dot.work{background:var(--work)}.cat-dot.personal{background:var(--personal)}.cat-text{font-size:12px;color:var(--text-secondary)}.cat-right{font-size:12px;font-weight:600;color:var(--personal)}.cat-right.full{color:var(--work)}.cat-right.over{color:var(--danger)}
        .mini-progress{margin:0 20px 16px;padding:12px 16px;background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow-sm)}.mini-stats{display:flex;justify-content:space-around}.mini-stat{text-align:center}.mini-value{font-size:14px;font-weight:600;display:block}.mini-label{font-size:10px;color:var(--muted);text-transform:uppercase}.mini-stat.work .mini-value{color:var(--work)}.mini-stat.personal .mini-value{color:var(--personal)}
        .tasks-section{padding:16px 20px 20px}.section-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.section-header h2{font-size:16px;font-weight:600}.section-actions{display:flex;align-items:center;gap:12px}.task-count{font-size:13px;color:var(--muted)}.shift-btn{display:flex;align-items:center;gap:6px;padding:8px 14px;background:var(--card);border:1px solid var(--border);border-radius:20px;font-size:13px;font-weight:500;color:var(--text-secondary);cursor:pointer;font-family:inherit}.shift-btn svg{width:16px;height:16px}
        .task-wrapper{position:relative;margin-bottom:10px;overflow:hidden;border-radius:var(--radius)}.task-wrapper.selected .task-item{background:var(--blue-light)}.task-actions{position:absolute;right:0;top:0;bottom:0;width:140px;display:flex}.action-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:none;cursor:pointer;font-size:11px;font-weight:500;color:white}.action-btn svg{width:20px;height:20px}.action-btn.edit{background:var(--blue)}.action-btn.delete{background:var(--danger)}.task-item{display:flex;align-items:center;gap:14px;padding:16px;background:var(--card);border-radius:var(--radius);border-left:4px solid var(--border);box-shadow:var(--shadow-sm);transition:transform 0.15s;position:relative}.task-item.work{border-left-color:var(--work)}.task-item.personal{border-left-color:var(--personal)}.task-item.done{background:var(--bg)}.task-item.done .task-name{text-decoration:line-through;color:var(--muted);opacity:0.6}.task-item.done .task-meta{opacity:0.6}.task-item.done .checkbox{opacity:0.7}.task-item.selectable{cursor:pointer}.checkbox{width:24px;height:24px;min-width:24px;border-radius:50%;border:2px solid var(--border);background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0}.checkbox.checked{background:var(--personal);border-color:var(--personal)}.checkbox.disabled{opacity:0.5;cursor:default}.checkbox svg{width:14px;height:14px;color:white}.select-circle{width:24px;height:24px;min-width:24px;border-radius:50%;border:2px solid var(--blue);background:transparent;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;color:white}.select-circle.selected{background:var(--blue)}.task-content{flex:1;min-width:0}.task-name{font-size:15px;font-weight:500;margin-bottom:6px;word-wrap:break-word}.task-meta{display:flex;align-items:center;gap:10px}.category-dot{width:8px;height:8px;border-radius:50%}.category-dot.work{background:var(--work)}.category-dot.personal{background:var(--personal)}.time-badge{font-size:12px;color:var(--muted);font-weight:500}.repeat-badge{font-size:12px}
        .hover-actions{display:flex;gap:8px;margin-left:auto;padding-left:12px}.hover-btn{width:36px;height:36px;border-radius:8px;border:1px solid var(--border);background:var(--card);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;padding:0}.hover-btn svg{width:18px;height:18px;color:var(--muted);stroke:var(--muted)}.hover-btn:hover{background:var(--bg)}.hover-btn.edit:hover{border-color:var(--blue);background:var(--blue-light)}.hover-btn.edit:hover svg{color:var(--blue);stroke:var(--blue)}.hover-btn.delete:hover{border-color:var(--danger);background:var(--danger-light)}.hover-btn.delete:hover svg{color:var(--danger);stroke:var(--danger)}.hover-btn.schedule:hover{border-color:var(--personal);background:var(--personal-light)}.hover-btn.schedule:hover svg{color:var(--personal);stroke:var(--personal)}.action-btn.schedule{background:var(--personal)}
        .swipe-hint{font-size:12px;color:var(--muted);text-align:center;padding:10px;background:var(--bg);border-radius:8px;margin-bottom:12px}@media(min-width:1024px){.swipe-hint{display:none}}
        .empty-state{text-align:center;padding:48px 24px}.empty-icon{font-size:48px;margin-bottom:16px}.empty-state p{color:var(--muted);font-size:15px}
        .date-nav{display:flex;justify-content:center;align-items:center;gap:24px;padding:16px 20px;background:var(--card);border-bottom:1px solid var(--border)}.date-nav button{width:44px;height:44px;border-radius:50%;border:1px solid var(--border);background:var(--card);cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text);font-family:inherit;padding:0}.date-nav button svg{width:20px;height:20px;stroke:var(--text)}.date-nav span{font-size:16px;font-weight:600;min-width:140px;text-align:center}
        .calendar-view{padding:16px 20px;max-width:600px;margin:0 auto}.cal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.cal-nav-btn{width:40px;height:40px;border-radius:50%;border:1px solid var(--border);background:var(--card);cursor:pointer;display:flex;align-items:center;justify-content:center}.cal-nav-btn svg{width:20px;height:20px;color:var(--text)}.cal-title{font-size:16px;font-weight:600}.cal-weekdays{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:6px}.weekday{text-align:center;font-size:11px;font-weight:600;color:var(--muted);padding:6px 0}.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.cal-day{aspect-ratio:1;max-height:70px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:10px;cursor:pointer;position:relative;background:var(--card)}.cal-day.empty{background:transparent;cursor:default}.cal-day.today{background:var(--personal-light)}.cal-day.selected{background:var(--personal);color:white}.day-num{font-size:13px;font-weight:500}.day-indicators{display:flex;gap:2px;margin-top:3px}.indicator{width:4px;height:4px;border-radius:50%}.indicator.work{background:var(--work)}.indicator.personal{background:var(--personal)}.cal-day.selected .indicator.work,.cal-day.selected .indicator.personal{background:white}
        .mini-calendar{background:var(--bg);border-radius:var(--radius);padding:16px;margin-bottom:20px}.mini-cal-header{font-size:14px;font-weight:600;margin-bottom:12px;text-align:center}.mini-cal-weekdays{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:8px}.mini-cal-weekdays div{text-align:center;font-size:10px;font-weight:600;color:var(--muted)}.mini-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}.mini-cal-day{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:12px;border-radius:6px;cursor:pointer}.mini-cal-day.empty{cursor:default}.mini-cal-day.today{background:var(--personal-light);font-weight:600}.mini-cal-day.selected{background:var(--personal);color:white}.mini-cal-day.has-tasks{font-weight:600}.mini-cal-day:not(.empty):hover{background:var(--border)}.mini-cal-day.selected:hover{background:var(--personal)}
        .panel-title{font-size:14px;font-weight:600;color:var(--muted);margin-bottom:16px;text-transform:uppercase;letter-spacing:0.5px}.panel-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid var(--border)}.panel-header h3{font-size:14px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:1px}.bulk-shift-btn{display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--card);border:1px solid var(--border);border-radius:8px;font-size:12px;font-weight:600;color:var(--text-secondary);cursor:pointer;font-family:inherit;transition:all 0.15s}.bulk-shift-btn:hover{background:var(--personal-light);border-color:var(--personal);color:var(--personal)}.bulk-shift-btn.active{background:var(--personal);border-color:var(--personal);color:white}.bulk-shift-btn svg{width:14px;height:14px}.panel-selection-actions{display:flex;gap:8px;padding:12px;background:var(--blue-light);border-radius:var(--radius-sm);margin-bottom:16px;align-items:center}.panel-selection-count{flex:1;font-size:13px;font-weight:600;color:var(--blue)}.panel-selection-btn{padding:6px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}.panel-selection-btn.move{background:var(--blue);color:white}.panel-tasks{display:flex;flex-direction:column;gap:8px;margin-bottom:24px}.panel-task-item{display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg);border-radius:var(--radius-sm);border-left:3px solid var(--border);position:relative;transition:all 0.15s}.panel-task-item.work{border-left-color:var(--work)}.panel-task-item.personal{border-left-color:var(--personal)}.panel-task-item.done{opacity:0.5}.panel-task-item.panel-selectable{cursor:pointer}.panel-task-item.panel-selectable:hover{background:var(--blue-light)}.panel-task-item.panel-selected{background:var(--blue-light);border-left-color:var(--blue)}.panel-select-checkbox{width:20px;height:20px;min-width:20px;border-radius:4px;border:2px solid var(--border);background:white;display:flex;align-items:center;justify-content:center;flex-shrink:0}.panel-select-checkbox svg{width:12px;height:12px;stroke:white}.panel-select-checkbox.checked{background:var(--blue);border-color:var(--blue)}.panel-task-name{font-size:13px;font-weight:500;flex:1;word-wrap:break-word}.panel-task-time{font-size:11px;color:var(--muted)}.panel-task-actions{display:flex;gap:4px;margin-left:8px}.panel-action-btn{width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:var(--card);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:all 0.15s}.panel-action-btn svg{width:14px;height:14px;color:var(--muted);stroke:var(--muted)}.panel-action-btn:hover{background:var(--bg)}.panel-action-btn.shift:hover{border-color:var(--personal);background:var(--personal-light)}.panel-action-btn.shift:hover svg{color:var(--personal);stroke:var(--personal)}.panel-action-btn.edit:hover{border-color:var(--blue);background:var(--blue-light)}.panel-action-btn.edit:hover svg{color:var(--blue);stroke:var(--blue)}.panel-action-btn.delete:hover{border-color:var(--danger);background:var(--danger-light)}.panel-action-btn.delete:hover svg{color:var(--danger);stroke:var(--danger)}.show-more-btn{text-align:center;padding:8px;color:var(--blue);font-size:12px;font-weight:600;cursor:pointer;transition:all 0.15s;border-radius:6px}.show-more-btn:hover{background:var(--blue-light);color:var(--personal)}
        .bottom-nav{position:fixed;bottom:0;left:0;right:0;height:70px;background:var(--card);border-top:1px solid var(--border);display:flex;justify-content:space-around;align-items:center;padding-bottom:env(safe-area-inset-bottom);z-index:100}@media(min-width:481px)and(max-width:1023px){.bottom-nav{left:50%;transform:translateX(-50%);max-width:480px;border-radius:20px 20px 0 0}}.nav-item{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 20px;border:none;background:transparent;color:var(--muted);cursor:pointer;font-family:inherit}.nav-item.active{color:var(--personal)}.nav-item.parked{color:var(--muted)}.nav-item.parked.active{color:#8B5CF6}.nav-item svg{width:22px;height:22px}.nav-item span{font-size:11px;font-weight:600}
        .modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;z-index:1000;animation:fadeIn 0.2s}@keyframes fadeIn{from{opacity:0}to{opacity:1}}.modal-content{background:var(--card);border-radius:24px 24px 0 0;padding:24px;padding-bottom:calc(24px + env(safe-area-inset-bottom));width:100%;max-width:480px;max-height:90vh;overflow-y:auto;animation:slideUp 0.3s}@media(min-width:1024px){.modal-overlay{align-items:center}.modal-content{border-radius:24px;max-width:440px}}@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}.modal-header h2{font-size:20px;font-weight:700}.close-btn{width:36px;height:36px;min-width:36px;border-radius:50%;background:var(--bg);border:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0}.close-btn::before{content:"✕";font-size:16px;font-weight:500;color:var(--muted);line-height:1}.close-btn:active{background:var(--border)}.form-group{margin-bottom:20px}.form-group label{display:block;font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px}.form-group input[type="text"],.form-group input[type="date"],.form-group input[type="number"],.form-group input[type="time"],.form-group select{width:100%;padding:14px 16px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:16px;font-family:inherit;background:var(--card);color:var(--text)}.form-group input::placeholder{color:var(--muted)}.form-group input:focus,.form-group select:focus{outline:none;border-color:var(--personal)}.form-row{display:flex;gap:12px}.form-row-2{display:flex;gap:12px}.form-row-2 .form-group{flex:1;margin-bottom:0}.cat-btn{flex:1;padding:14px;border:2px solid var(--border);border-radius:var(--radius-sm);background:var(--card);font-size:14px;font-weight:600;cursor:pointer;color:var(--text-secondary);font-family:inherit}.cat-btn.active.work{border-color:var(--work);background:var(--work-light);color:#B45309}.cat-btn.active.personal{border-color:var(--personal);background:var(--personal-light);color:#047857}.time-presets{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}.preset-btn{padding:10px 16px;border:2px solid var(--border);border-radius:20px;background:var(--card);font-size:13px;font-weight:600;cursor:pointer;color:var(--text-secondary);font-family:inherit}.preset-btn.active{background:var(--text);color:white;border-color:var(--text)}.slider-row{display:flex;align-items:center;gap:14px}.slider-row input[type="range"]{flex:1;height:6px;-webkit-appearance:none;background:var(--border);border-radius:3px}.slider-row input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;background:var(--text);border-radius:50%;cursor:pointer}.slider-value{font-size:14px;font-weight:600;min-width:55px;text-align:right}.timing-toggle{display:flex;gap:8px}.timing-btn{flex:1;padding:12px;border:2px solid var(--border);border-radius:var(--radius-sm);background:var(--card);font-size:14px;font-weight:600;cursor:pointer;color:var(--text-secondary);font-family:inherit;transition:all 0.2s}.timing-btn.active{border-color:var(--personal);background:var(--personal-light);color:#047857}.time-picker-section{background:var(--bg);border-radius:var(--radius-sm);padding:16px;margin-bottom:12px}.time-input{width:100%;padding:14px 16px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:16px;font-family:inherit;background:var(--card);color:var(--text)}.time-input:focus{outline:none;border-color:var(--personal)}.calculated-time{display:flex;align-items:center;gap:10px;margin-top:12px;padding:12px;background:var(--card);border-radius:var(--radius-sm);font-size:14px;color:var(--text-secondary)}.time-icon{font-size:16px}.time-range{font-weight:600;color:var(--personal)}.conflict-warning{margin-top:12px;padding:12px;background:#FEE2E2;border:1px solid #EF4444;border-radius:var(--radius-sm);color:#DC2626;font-size:13px;font-weight:600}.save-btn{width:100%;padding:16px;background:var(--personal);color:white;border:none;border-radius:var(--radius-sm);font-size:16px;font-weight:600;cursor:pointer;margin-top:8px;font-family:inherit}
        .task-time{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;margin-bottom:6px}.task-time.work{color:var(--work)}.task-time.personal{color:var(--personal)}.task-time .time-icon{font-size:14px}.ai-badge{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;background:linear-gradient(135deg,#667EEA15 0%,#764BA215 100%);border:1px solid #667EEA;color:#667EEA;border-radius:10px;font-size:10px;font-weight:700}.task-group{margin-bottom:24px}.task-group:last-child{margin-bottom:0}.task-group-header{font-size:13px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border)}
        .repeat-end-section{margin-bottom:20px;padding:16px;background:var(--bg);border-radius:var(--radius-sm)}.repeat-end-section>label{display:block;font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:12px}.repeat-end-options{display:flex;flex-direction:column;gap:12px}.radio-option{display:flex;align-items:center;gap:10px;padding:12px;background:var(--card);border-radius:var(--radius-sm);cursor:pointer;border:2px solid transparent}.radio-option.active{border-color:var(--personal)}.radio-option input[type="radio"]{width:18px;height:18px;accent-color:var(--personal)}.radio-label{font-size:14px;display:flex;align-items:center;gap:8px}.inline-input{width:60px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:14px;text-align:center}.inline-date{padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:14px}
        .move-modal{max-height:60vh}.move-info{font-size:15px;color:var(--text-secondary);margin-bottom:20px}.quick-dates{display:flex;gap:10px;margin-bottom:20px}.quick-date-btn{flex:1;padding:12px;border:2px solid var(--border);border-radius:var(--radius-sm);background:var(--card);font-size:14px;font-weight:500;cursor:pointer;color:var(--text-secondary);font-family:inherit;transition:all 0.15s}.quick-date-btn:hover{border-color:var(--personal);background:var(--personal-light);color:var(--personal)}.park-divider{text-align:center;color:var(--muted);font-size:12px;font-weight:600;margin:20px 0;position:relative}.park-divider::before,.park-divider::after{content:'';position:absolute;top:50%;width:calc(50% - 20px);height:1px;background:var(--border)}.park-divider::before{left:0}.park-divider::after{right:0}.park-section-subtle{text-align:center;padding:12px 0}.park-btn-subtle{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:transparent;color:var(--muted);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;transition:all 0.15s}.park-btn-subtle:hover{background:var(--bg);border-color:#8B5CF6;color:#8B5CF6}.park-btn-subtle svg{width:16px;height:16px}.park-description-subtle{font-size:11px;color:var(--muted);margin-top:6px}
        .modal-content.settings{padding-bottom:calc(32px + env(safe-area-inset-bottom))}.user-info{display:flex;align-items:center;gap:14px;padding:16px;background:var(--bg);border-radius:var(--radius);margin-bottom:24px}.user-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover}.user-avatar-placeholder{width:48px;height:48px;border-radius:50%;background:var(--personal);color:white;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600}.user-name{font-weight:600;font-size:15px}.user-email{font-size:13px;color:var(--muted)}.settings-section{margin-bottom:24px}.settings-section h3{font-size:14px;font-weight:600;color:var(--text-secondary);margin-bottom:12px}.setting-item{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)}.setting-item label{font-size:14px}.setting-input{display:flex;align-items:center;gap:10px}.setting-input input{width:80px;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:14px;text-align:center}.setting-input span{font-size:13px;color:var(--muted);min-width:50px}.signout-btn{width:100%;padding:14px;background:transparent;color:var(--danger);border:2px solid var(--danger);border-radius:var(--radius-sm);font-size:15px;font-weight:600;cursor:pointer;margin-top:12px;font-family:inherit}
        .shortcuts-list{display:flex;flex-direction:column;gap:8px}.shortcut-row{display:flex;align-items:center;gap:12px;padding:8px 0}.shortcut-row .key{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600;font-family:monospace;min-width:40px;text-align:center}.shortcut-row span:last-child{font-size:13px;color:var(--text-secondary)}
        .analytics-view{padding:16px 20px}.analytics-card{background:var(--card);padding:20px;border-radius:var(--radius);margin-bottom:16px;box-shadow:var(--shadow-sm)}.analytics-card.highlight{background:linear-gradient(135deg,#D1FAE5 0%,#A7F3D0 100%);text-align:center}.big-number{font-size:48px;font-weight:700;color:var(--personal);display:block}.big-label{font-size:14px;color:#047857;font-weight:500}.stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}.stat-card{background:var(--card);padding:16px 12px;border-radius:var(--radius);text-align:center;box-shadow:var(--shadow-sm)}.stat-card.positive{background:var(--personal-light)}.stat-card.negative{background:var(--danger-light)}.stat-value{font-size:20px;font-weight:700;display:block}.stat-card.positive .stat-value{color:var(--personal)}.stat-card.negative .stat-value{color:var(--danger)}.stat-label{font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:600;margin-top:4px;display:block;line-height:1.3}.chart-card{background:var(--card);padding:20px;border-radius:var(--radius);margin-bottom:16px;box-shadow:var(--shadow-sm)}.chart-card h3{font-size:15px;font-weight:600;margin-bottom:16px}.bar-chart{display:flex;justify-content:space-between;align-items:flex-end;height:100px}.bar-col{display:flex;flex-direction:column;align-items:center;gap:8px;flex:1}.bar-stack{width:28px;height:80px;display:flex;flex-direction:column-reverse;border-radius:6px;overflow:hidden;background:var(--bg)}.bar{width:100%;transition:height 0.4s}.bar.work{background:var(--work)}.bar.personal{background:var(--personal)}.bar-day{font-size:12px;color:var(--muted);font-weight:600}.chart-legend{display:flex;justify-content:center;gap:24px;margin-top:16px;font-size:12px;color:var(--muted)}.chart-legend span{display:flex;align-items:center;gap:6px}.legend-dot{width:10px;height:10px;border-radius:50%}.legend-dot.work{background:var(--work)}.legend-dot.personal{background:var(--personal)}.insight-card{display:flex;align-items:center;gap:14px;background:var(--card);padding:18px;border-radius:var(--radius);box-shadow:var(--shadow-sm)}.insight-icon{font-size:28px}.insight-card p{font-size:14px;color:var(--muted)}.insight-card strong{color:var(--text);font-weight:600}
      `}</style>

      {isDesktop ? (
        <div className="app-container">
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSettingsClick={() => setShowSettings(true)} user={user} />
          <div className="app">
            <div className="main-content">
              <div className="primary-panel">
                {isSelectionMode && <SelectionHeader selectedCount={selectedTasks.length} onCancel={exitSelectionMode} onMove={() => setShowMoveModal(true)} />}
                {activeTab === 'today' && !isSelectionMode && (<><div className="header"><div className="header-left"><h1>Today</h1><span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span></div></div><ProgressSummary workDone={workDone} workTotal={workTotal} personalDone={personalDone} personalTotal={personalTotal} settings={settings} /></>)}
                {activeTab === 'today' && renderTasks(currentDateTasks)}
                {activeTab === 'calendar' && !isSelectionMode && (<><div className="header"><div className="header-left"><h1>Calendar</h1></div></div><CalendarView tasks={tasks} onDateSelect={setSelectedDate} selectedDate={selectedDate} /><div className="date-nav"><button onClick={() => navigateDate(-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg></button><span>{formatDate(selectedDate)}</span><button onClick={() => navigateDate(1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg></button></div><MiniProgress tasks={selectedDateTasks} settings={settings} /></>)}
                {activeTab === 'calendar' && renderTasks(selectedDateTasks)}
                {activeTab === 'analytics' && (<><div className="header"><div className="header-left"><h1>Analytics</h1></div></div><AnalyticsView tasks={tasks} /></>)}
                {activeTab === 'parked' && (<><div className="header"><div className="header-left"><h1>📦 Parked Tasks</h1><span>{parkedTasks.length} task{parkedTasks.length !== 1 ? 's' : ''} saved for later</span></div></div><div className="tasks-section">{parkedTasks.length === 0 ? <div className="empty-state"><div className="empty-icon">📦</div><p>No parked tasks</p><p style={{fontSize:'13px',color:'var(--muted)',marginTop:'8px'}}>Tasks you park will appear here</p></div> : parkedTasks.map(task => (<div key={task.id} className="task-wrapper"><div className={`task-item ${task.category.toLowerCase()} ${task.status === 'Done' ? 'done' : ''}`}><button className={`checkbox ${task.status === 'Done' ? 'checked' : ''}`} onClick={() => toggleTask(task.id, task.status)}>{task.status === 'Done' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}</button><div className="task-content"><span className="task-name">{task.task}</span><div className="task-meta"><span className={`category-dot ${task.category.toLowerCase()}`}></span><span className="time-badge">{formatTime(task.timeRequired)}</span><span style={{color:'var(--muted)',fontSize:'11px'}}>• No date</span></div></div>{!isTouchDevice && <div className="hover-actions"><button className="hover-btn schedule" onClick={(e) => { e.stopPropagation(); handleScheduleTask(task); }} title="Schedule"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button><button className="hover-btn edit" onClick={(e) => { e.stopPropagation(); handleEdit(task); }} title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button><button className="hover-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }} title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button></div>}</div></div>))}</div></>)}
              </div>
              <div className="secondary-panel">
                {activeTab === 'today' && (<>
                  <div className="panel-header">
                    <h3>Other Tasks</h3>
                    <button className={`bulk-shift-btn ${isPanelSelectionMode ? 'active' : ''}`} onClick={togglePanelSelectionMode}>
                      {isPanelSelectionMode ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>Cancel</> : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Shift</>}
                    </button>
                  </div>
                  {isPanelSelectionMode && panelSelectedTasks.length > 0 && (
                    <div className="panel-selection-actions">
                      <span className="panel-selection-count">{panelSelectedTasks.length} selected</span>
                      <button className="panel-selection-btn move" onClick={handlePanelShift}>Move <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:'14px',height:'14px',marginLeft:'4px'}}><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
                    </div>
                  )}
                  <h3 className="panel-title">This Month</h3>
                  <MiniCalendar tasks={tasks} onDateSelect={(date) => { setSelectedDate(date); setActiveTab('calendar'); }} selectedDate={selectedDate} />
                  {(() => {
                    const dates = [];
                    for (let i = 4; i >= 1; i--) {
                      const d = new Date();
                      d.setDate(d.getDate() - i);
                      dates.push({ dateStr: dateToStr(d), label: formatDate(dateToStr(d)), showAll: false });
                    }
                    for (let i = 1; i <= 2; i++) {
                      const d = new Date();
                      d.setDate(d.getDate() + i);
                      dates.push({ dateStr: dateToStr(d), label: formatDate(dateToStr(d)), showAll: true });
                    }
                    
                    return dates.map(({ dateStr, label, showAll }) => {
                      const dateTasks = tasks.filter(t => t.date === dateStr && (showAll || t.status !== 'Done'));
                      if (dateTasks.length === 0 && !showAll) return null;
                      
                      const isExpanded = expandedSections[dateStr];
                      const displayTasks = isExpanded ? dateTasks : dateTasks.slice(0, 4);
                      const remainingCount = dateTasks.length - 4;
                      
                      return (
                        <div key={dateStr}>
                          <h3 className="panel-title">{label}</h3>
                          <div className="panel-tasks">
                            {dateTasks.length > 0 ? displayTasks.map(task => (
                              <div 
                                key={task.id} 
                                className={`panel-task-item ${task.category.toLowerCase()} ${task.status === 'Done' ? 'done' : ''} ${isPanelSelectionMode && task.status !== 'Done' ? 'panel-selectable' : ''} ${panelSelectedTasks.includes(task.id) ? 'panel-selected' : ''}`}
                                onClick={() => isPanelSelectionMode && task.status !== 'Done' && handlePanelTaskSelect(task.id)}
                              >
                                {isPanelSelectionMode && task.status !== 'Done' && (
                                  <div className={`panel-select-checkbox ${panelSelectedTasks.includes(task.id) ? 'checked' : ''}`}>
                                    {panelSelectedTasks.includes(task.id) && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                                  </div>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span className="panel-task-name">{task.task}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                    <span className="panel-task-time">{formatTime(task.timeRequired)}</span>
                                  </div>
                                </div>
                                {!isPanelSelectionMode && task.status !== 'Done' && (
                                  <div className="panel-task-actions">
                                    <button className="panel-action-btn shift" onClick={(e) => { e.stopPropagation(); handleShiftSingleTask(task); }} title="Shift task">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                    </button>
                                    <button className="panel-action-btn edit" onClick={(e) => { e.stopPropagation(); handleEdit(task); }} title="Edit">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                    </button>
                                    <button className="panel-action-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }} title="Delete">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )) : <p style={{ color: 'var(--muted)', fontSize: '13px' }}>No tasks</p>}
                            {!isExpanded && remainingCount > 0 && (
                              <div className="show-more-btn" onClick={() => toggleSectionExpansion(dateStr)}>
                                + Show {remainingCount} more...
                              </div>
                            )}
                            {isExpanded && dateTasks.length > 4 && (
                              <div className="show-more-btn" onClick={() => toggleSectionExpansion(dateStr)}>
                                - Show less
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </>)}
                {activeTab === 'calendar' && (<>
                  <div className="panel-header">
                    <h3>{formatDate(selectedDate)}</h3>
                    <button className={`bulk-shift-btn ${isPanelSelectionMode ? 'active' : ''}`} onClick={togglePanelSelectionMode}>
                      {isPanelSelectionMode ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>Cancel</> : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Shift</>}
                    </button>
                  </div>
                  {isPanelSelectionMode && panelSelectedTasks.length > 0 && (
                    <div className="panel-selection-actions">
                      <span className="panel-selection-count">{panelSelectedTasks.length} selected</span>
                      <button className="panel-selection-btn move" onClick={handlePanelShift}>Move <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:'14px',height:'14px',marginLeft:'4px'}}><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
                    </div>
                  )}
                  <div className="panel-tasks">
                    {(() => {
                      const isExpanded = expandedSections[selectedDate];
                      const displayTasks = isExpanded ? selectedDateTasks : selectedDateTasks.slice(0, 4);
                      const remainingCount = selectedDateTasks.length - 4;
                      
                      return (<>
                        {displayTasks.map(task => (
                          <div 
                            key={task.id} 
                            className={`panel-task-item ${task.category.toLowerCase()} ${task.status === 'Done' ? 'done' : ''} ${isPanelSelectionMode && task.status !== 'Done' ? 'panel-selectable' : ''} ${panelSelectedTasks.includes(task.id) ? 'panel-selected' : ''}`}
                            onClick={() => isPanelSelectionMode && task.status !== 'Done' && handlePanelTaskSelect(task.id)}
                          >
                            {isPanelSelectionMode && task.status !== 'Done' && (
                              <div className={`panel-select-checkbox ${panelSelectedTasks.includes(task.id) ? 'checked' : ''}`}>
                                {panelSelectedTasks.includes(task.id) && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                              </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span className="panel-task-name">{task.task}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                <span className="panel-task-time">{formatTime(task.timeRequired)}</span>
                              </div>
                            </div>
                            {!isPanelSelectionMode && task.status !== 'Done' && (
                              <div className="panel-task-actions">
                                <button className="panel-action-btn shift" onClick={(e) => { e.stopPropagation(); handleShiftSingleTask(task); }} title="Shift task">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                </button>
                                <button className="panel-action-btn edit" onClick={(e) => { e.stopPropagation(); handleEdit(task); }} title="Edit">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                </button>
                                <button className="panel-action-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }} title="Delete">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                        {selectedDateTasks.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '13px' }}>No tasks for this day</p>}
                        {!isExpanded && remainingCount > 0 && (
                          <div className="show-more-btn" onClick={() => toggleSectionExpansion(selectedDate)}>
                            + Show {remainingCount} more...
                          </div>
                        )}
                        {isExpanded && selectedDateTasks.length > 4 && (
                          <div className="show-more-btn" onClick={() => toggleSectionExpansion(selectedDate)}>
                            - Show less
                          </div>
                        )}
                      </>);
                    })()}
                  </div>
                </>)}
                {activeTab === 'analytics' && (<><h3 className="panel-title">Quick Stats</h3><div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}><div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px' }}><div style={{ fontSize: '24px', fontWeight: '700' }}>{tasks.length}</div><div style={{ fontSize: '12px', color: 'var(--muted)' }}>Total Tasks</div></div><div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px' }}><div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--personal)' }}>{tasks.filter(t => t.status === 'Done').length}</div><div style={{ fontSize: '12px', color: 'var(--muted)' }}>Completed</div></div><div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px' }}><div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--work)' }}>{tasks.filter(t => t.status !== 'Done').length}</div><div style={{ fontSize: '12px', color: 'var(--muted)' }}>Pending</div></div></div></>)}
              </div>
            </div>
          </div>
          {!isSelectionMode && <button className="fab" onClick={() => setShowModal(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>}
        </div>
      ) : (
        <div className="app">
          {isSelectionMode && <SelectionHeader selectedCount={selectedTasks.length} onCancel={exitSelectionMode} onMove={() => setShowMoveModal(true)} />}
          {activeTab === 'today' && !isSelectionMode && (<><div className="header"><div className="header-left"><h1>Today</h1><span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span></div><button className="icon-btn" onClick={() => setShowSettings(true)}>⚙️</button></div><ProgressSummary workDone={workDone} workTotal={workTotal} personalDone={personalDone} personalTotal={personalTotal} settings={settings} /></>)}
          {activeTab === 'today' && renderTasks(currentDateTasks)}
          {activeTab === 'calendar' && !isSelectionMode && (<><div className="header"><div className="header-left"><h1>Calendar</h1></div></div><CalendarView tasks={tasks} onDateSelect={setSelectedDate} selectedDate={selectedDate} /><div className="date-nav"><button onClick={() => navigateDate(-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg></button><span>{formatDate(selectedDate)}</span><button onClick={() => navigateDate(1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg></button></div><MiniProgress tasks={selectedDateTasks} settings={settings} /></>)}
          {activeTab === 'calendar' && renderTasks(selectedDateTasks)}
          {activeTab === 'analytics' && (<><div className="header"><div className="header-left"><h1>Analytics</h1></div><button className="icon-btn" onClick={() => setShowSettings(true)}>⚙️</button></div><AnalyticsView tasks={tasks} /></>)}
          {activeTab === 'parked' && (<><div className="header"><div className="header-left"><h1>📦 Parked</h1><span>{parkedTasks.length} task{parkedTasks.length !== 1 ? 's' : ''}</span></div><button className="icon-btn" onClick={() => setShowSettings(true)}>⚙️</button></div><div className="tasks-section">{parkedTasks.length === 0 ? <div className="empty-state"><div className="empty-icon">📦</div><p>No parked tasks</p><p style={{fontSize:'13px',color:'var(--muted)',marginTop:'8px'}}>Tasks you park will appear here</p></div> : parkedTasks.map(task => (<TaskItem key={task.id} task={task} onToggle={toggleTask} onEdit={handleEdit} onDelete={handleDelete} isSelectionMode={false} isSelected={false} onSelect={() => {}} isDesktop={isDesktop} isTouchDevice={isTouchDevice} onSchedule={handleScheduleTask} />))}</div></>)}
          {!isSelectionMode && <button className="fab" onClick={() => setShowModal(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>}
          {!isSelectionMode && (
            <nav className="bottom-nav">
              <button className={`nav-item ${activeTab === 'today' ? 'active' : ''}`} onClick={() => setActiveTab('today')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg><span>Today</span></button>
              <button className={`nav-item ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg><span>Calendar</span></button>
              <button className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg><span>Analytics</span></button>
              <button className={`nav-item parked ${activeTab === 'parked' ? 'active' : ''}`} onClick={() => setActiveTab('parked')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><span>Parked</span></button>
            </nav>
          )}
        </div>
      )}
      {showModal && <TaskModal task={editingTask} onSave={handleSave} onClose={() => { setShowModal(false); setEditingTask(null); }} selectedDate={activeTab === 'calendar' ? selectedDate : activeTab === 'parked' ? today : selectedDate} existingTasks={tasks} />}
      {showMoveModal && <MoveModal onClose={() => setShowMoveModal(false)} onMove={handleMove} onPark={handlePark} selectedCount={selectedTasks.length} targetDate={activeTab === 'calendar' ? selectedDate : today} />}
      {showScheduleModal && taskToSchedule && <MoveModal onClose={() => { setShowScheduleModal(false); setTaskToSchedule(null); }} onMove={handleScheduleConfirm} onPark={() => { setShowScheduleModal(false); setTaskToSchedule(null); }} selectedCount={1} targetDate={today} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} tasks={tasks} user={user} onSignOut={handleSignOut} settings={settings} onUpdateSettings={handleUpdateSettings} />}
    </>
  );
}
