import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, Globe, RotateCcw, Flame, Trophy, Stars, PlusCircle } from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, increment } from 'firebase/firestore';

const STORAGE_KEY = 'tickr_v5';
const FB_PATH = ['tickr', 'prod', 'public', 'global_stats'];
const DEFAULT_DHIKRS = [
  { id: 'astaghfirullah', label: 'Astaghfirullah', arabic: 'أستغفر الله' },
  { id: 'alhamdulillah', label: 'Alhamdulillah', arabic: 'الحمد لله' },
  { id: 'subhanallah', label: 'SubhanAllah', arabic: 'سبحان الله' },
  { id: 'salawat', label: 'Salawat', arabic: 'اللهم صل على محمد' },
  { id: 'custom', label: 'Custom', arabic: 'ذكر' },
];

const CelebrationParticles = () => (
  <div className="fixed inset-0 pointer-events-none z-[200] overflow-hidden">
    {[...Array(40)].map((_, i) => (
      <div key={i} className="absolute animate-particle" style={{
        left: `${Math.random() * 100}%`, top: '110%',
        fontSize: `${Math.random() * 12 + 6}px`,
        animationDelay: `${Math.random() * 2}s`,
        animationDuration: `${Math.random() * 2 + 2}s`,
        color: ['#fde047','#f97316','#4ade80','#60a5fa','#f472b6'][Math.floor(Math.random()*5)]
      }}>✦</div>
    ))}
  </div>
);

export default function App() {
  const [user, setUser] = useState(null);
  const [db, setDb] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [view, setView] = useState('picker');
  const [activeDhikrId, setActiveDhikrId] = useState(null);
  const [dhikrs, setDhikrs] = useState({});
  const [streak, setStreak] = useState({ count: 0, lastDate: null });
  const [annualGoal, setAnnualGoal] = useState(100000);
  const [dailyGoal, setDailyGoal] = useState(100);
  const [dailyCount, setDailyCount] = useState({ count: 0, date: null });
  const [reminderTime, setReminderTime] = useState("20:00");
  const [isRemindersEnabled, setIsRemindersEnabled] = useState(false);
  const [globalStats, setGlobalStats] = useState({ totalDhikr: 0 });
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isStoryOpen, setIsStoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [isResetConfirming, setIsResetConfirming] = useState(false);
  const resetTimerRef = useRef(null);

  useEffect(() => {
    let configString = null;
    try { configString = import.meta.env?.VITE_FIREBASE_CONFIG; } catch (e) {}
    if (!configString) return;
    try {
      const firebaseConfig = typeof configString === 'string' ? JSON.parse(configString) : configString;
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      const _auth = getAuth(app);
      const _db = getFirestore(app);
      setDb(_db);
      signInAnonymously(_auth).catch(console.error);
      return onAuthStateChanged(_auth, setUser);
    } catch (err) { console.error("Firebase init failed:", err); }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setDhikrs(parsed.dhikrs || {});
        setStreak(parsed.streak || { count: 0, lastDate: null });
        setAnnualGoal(parsed.annualGoal || 100000);
        setDailyGoal(parsed.dailyGoal || 100);
        setDailyCount(parsed.dailyCount || { count: 0, date: null });
        setReminderTime(parsed.reminderTime || "20:00");
        setIsRemindersEnabled(parsed.isRemindersEnabled || false);
      } catch (e) {}
    } else {
      const initial = {};
      DEFAULT_DHIKRS.forEach(d => initial[d.id] = { ...d, currentCount: 0, lifetimeTotal: 0 });
      setDhikrs(initial);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const ref = doc(db, ...FB_PATH);
    return onSnapshot(ref, (s) => {
      if (s.exists()) setGlobalStats(s.data());
    }, (err) => console.error('Firestore error:', err));
  }, [user, db]);

  useEffect(() => {
    if (isLoaded) localStorage.setItem(STORAGE_KEY, JSON.stringify({
      dhikrs, streak, annualGoal, dailyGoal, dailyCount, reminderTime, isRemindersEnabled
    }));
  }, [dhikrs, isLoaded, streak, annualGoal, dailyGoal, dailyCount, reminderTime, isRemindersEnabled]);

  useEffect(() => {
    if (!isRemindersEnabled) return;
    const check = setInterval(() => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      if (timeStr === reminderTime && dailyCount.date !== now.toDateString()) {
        if (Notification.permission === "granted") {
          new Notification("Tickr", { body: "Have you done your dhikr today? Keep the flame alive." });
        }
      }
    }, 60000);
    return () => clearInterval(check);
  }, [isRemindersEnabled, reminderTime, dailyCount.date]);

  const totalLifetime = Object.values(dhikrs).reduce((sum, d) => sum + (d.lifetimeTotal || 0), 0);
  const isAnnualGoalMet = totalLifetime >= annualGoal;
  const annualProgressPercent = Math.min(100, Math.floor((totalLifetime / (annualGoal || 1)) * 100));

  const today = new Date().toDateString();
  const todayCount = dailyCount.date === today ? dailyCount.count : 0;
  const isDailyGoalMet = todayCount >= dailyGoal;
  const dailyProgressPercent = Math.min(100, Math.floor((todayCount / (dailyGoal || 1)) * 100));

  const dailyPacing = Math.ceil(annualGoal / 365);
  const weeklyPacing = Math.ceil(annualGoal / 52);
  const monthlyPacing = Math.ceil(annualGoal / 12);

  const addNotification = useCallback((text) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, text }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  }, []);

  const updateStreak = useCallback(() => {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    setStreak(prev => {
      if (prev.lastDate === today) return prev;
      return { count: prev.lastDate === yesterday ? prev.count + 1 : 1, lastDate: today };
    });
  }, []);

  const handleTap = useCallback(() => {
    if (!activeDhikrId || isResetConfirming) {
      setIsResetConfirming(false);
      return;
    }
    updateStreak();

    const today = new Date().toDateString();
    let newDailyCount = 0;

    setDailyCount(prev => {
      newDailyCount = prev.date === today ? prev.count + 1 : 1;
      return { count: newDailyCount, date: today };
    });

    setDhikrs(prev => {
      const d = prev[activeDhikrId];
      const newCount = (d.currentCount || 0) + 1;
      const newLifetime = (d.lifetimeTotal || 0) + 1;
      if (navigator.vibrate) navigator.vibrate(10);
      if (user && db && newLifetime % 10 === 0) {
        const ref = doc(db, ...FB_PATH);
        setDoc(ref, { totalDhikr: increment(10) }, { merge: true }).catch(() => {});
      }
      // Annual goal celebration
      if (totalLifetime + 1 === annualGoal) {
        setShowCelebration(true);
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
        addNotification("🏆 Annual goal reached!");
        setTimeout(() => setShowCelebration(false), 6000);
      }
      return { ...prev, [activeDhikrId]: { ...d, currentCount: newCount, lifetimeTotal: newLifetime } };
    });
  }, [activeDhikrId, isResetConfirming, annualGoal, totalLifetime, updateStreak, user, db, addNotification, dailyGoal]);

  // Daily goal celebration — watch dailyCount
  useEffect(() => {
    if (!isLoaded) return;
    const today = new Date().toDateString();
    if (dailyCount.date === today && dailyCount.count === dailyGoal) {
      setShowCelebration(true);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
      addNotification("🎉 Daily goal reached!");
      setTimeout(() => setShowCelebration(false), 6000);
    }
  }, [dailyCount, dailyGoal, isLoaded, addNotification]);

  const handleReset = useCallback((e) => {
    e.stopPropagation();
    if (isResetConfirming) {
      setDhikrs(prev => ({ ...prev, [activeDhikrId]: { ...prev[activeDhikrId], currentCount: 0 } }));
      setIsResetConfirming(false);
      if (navigator.vibrate) navigator.vibrate([30, 30, 30]);
    } else {
      setIsResetConfirming(true);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setIsResetConfirming(false), 3000);
    }
  }, [activeDhikrId, isResetConfirming]);

  const requestNotifications = async () => {
    if (!("Notification" in window)) { addNotification("Not supported on this device"); return; }
    const permission = await Notification.requestPermission();
    if (permission === "granted") { setIsRemindersEnabled(true); addNotification("Reminders enabled ✓"); }
    else { addNotification("Permission denied"); }
  };

  if (!isLoaded) return <div className="h-screen bg-black" />;

  return (
    <div className="h-screen w-screen bg-black text-white font-sans overflow-hidden select-none touch-none">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display&family=Inter:wght@200;400;600&display=swap');
        .font-serif { font-family: 'Playfair Display', serif; }
        body { font-family: 'Inter', sans-serif; background: black; margin: 0; padding: 0; }
        * { -webkit-tap-highlight-color: transparent; }
        .reset-confirm { color: #ef4444; opacity: 1 !important; transform: scale(1.1); }
        .gold-shimmer { background: linear-gradient(135deg, #fde047 0%, #ca8a04 50%, #fde047 100%); background-size: 200% 200%; animation: shimmer 3s linear infinite; }
        @keyframes shimmer { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes particle { 0% { transform: translateY(0) rotate(0deg); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(-120vh) rotate(360deg); opacity: 0; } }
        .animate-particle { animation: particle linear infinite; position: absolute; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .slide-up { animation: slideUp 0.3s ease; }
      `}</style>

      {showCelebration && <CelebrationParticles />}

      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] flex flex-col gap-2 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className="bg-white text-black px-4 py-2 rounded-full text-[9px] uppercase tracking-widest font-bold shadow-2xl slide-up">
            {n.text}
          </div>
        ))}
      </div>

      <div className="h-full max-w-md mx-auto relative border-x border-white/5 flex flex-col">
        {view === 'picker' && (
          <div className="flex-1 p-8 overflow-y-auto pb-32">
            <header className="mb-8 text-center pt-8">
              <div className="flex justify-between items-center mb-6">
                <button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-2 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20 text-orange-500 text-[10px] font-bold tracking-widest">
                  <Flame size={12} /> {streak.count} DAYS
                </button>
                <div className="flex items-center gap-1 opacity-20 text-[8px] tracking-widest uppercase">
                  <Globe size={10} /> {globalStats.totalDhikr?.toLocaleString() || 0}
                </div>
                <button onClick={() => setIsGoalModalOpen(true)} className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black tracking-widest transition-all ${isAnnualGoalMet ? 'gold-shimmer border-transparent text-black' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                  <Trophy size={12} /> {isAnnualGoalMet ? 'COMPLETE' : `${annualProgressPercent}%`}
                </button>
              </div>

              <h1 className="text-3xl font-serif tracking-[0.3em] mb-2">T I C K R</h1>
              <p className="text-[9px] opacity-30 uppercase tracking-[0.4em] mb-5">{totalLifetime.toLocaleString()} Total Taps</p>

              {/* Daily Progress */}
              <button onClick={() => setIsGoalModalOpen(true)} className="w-full mb-3">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-[8px] uppercase tracking-widest opacity-30">Today</p>
                  <p className="text-[8px] uppercase tracking-widest opacity-30">{todayCount} / {dailyGoal}</p>
                </div>
                <div className="w-full h-[2px] bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${isDailyGoalMet ? 'gold-shimmer' : 'bg-blue-400/60'}`} style={{ width: `${dailyProgressPercent}%` }} />
                </div>
              </button>

              {/* Annual Progress */}
              <button onClick={() => setIsGoalModalOpen(true)} className="w-full">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-[8px] uppercase tracking-widest opacity-30">Annual Goal</p>
                  <p className="text-[8px] uppercase tracking-widest opacity-30">{totalLifetime.toLocaleString()} / {annualGoal.toLocaleString()}</p>
                </div>
                <div className="w-full h-[2px] bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${isAnnualGoalMet ? 'gold-shimmer' : 'bg-emerald-500/60'}`} style={{ width: `${annualProgressPercent}%` }} />
                </div>
              </button>
            </header>

            <div className="space-y-4">
              {Object.values(dhikrs).map(d => (
                <button key={d.id} onClick={() => { setActiveDhikrId(d.id); setView('counter'); }} className="w-full p-6 border border-white/10 rounded-2xl flex justify-between items-center bg-white/[0.02] active:scale-95 transition-all">
                  <div className="text-left">
                    <p className="text-[10px] opacity-40 uppercase tracking-widest mb-1">{d.label}</p>
                    <p className="text-xl font-serif">{d.arabic}</p>
                  </div>
                  <p className="text-2xl font-extralight">{d.currentCount?.toLocaleString() || "0"}</p>
                </button>
              ))}
            </div>

            <button onClick={() => setIsStoryOpen(true)} className="mt-8 w-full p-5 border border-white/10 bg-white/5 rounded-2xl flex items-center justify-center gap-3 text-white/50 text-[10px] uppercase tracking-[0.3em] active:scale-95 transition-all">
              <Stars size={14} className={isAnnualGoalMet ? 'text-yellow-400' : ''} />
              <span>View Your Story</span>
            </button>
          </div>
        )}

        {view === 'counter' && activeDhikrId && (
          <div className="flex-1 flex flex-col" onClick={handleTap}>
            <div className="p-8 flex justify-between items-start">
              <button onClick={(e) => { e.stopPropagation(); setView('picker'); }} className="p-2 opacity-30 active:opacity-100"><ChevronLeft size={28} /></button>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-widest opacity-30">{dhikrs[activeDhikrId].label}</p>
                <p className="text-lg font-serif">{dhikrs[activeDhikrId].arabic}</p>
              </div>
              <button onClick={handleReset} className={`p-2 transition-all duration-300 opacity-30 active:opacity-100 ${isResetConfirming ? 'reset-confirm' : ''}`}>
                <RotateCcw size={24} />
              </button>
            </div>
            <div className="flex-1 flex flex-col justify-center items-center">
              <p className={`text-[10rem] font-sans font-extralight tracking-tighter transition-all ${isDailyGoalMet ? 'text-yellow-100' : ''}`}>
                {dhikrs[activeDhikrId].currentCount?.toLocaleString()}
              </p>
              <div className="w-48 mt-4">
                <div className="w-full h-[1px] bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${isDailyGoalMet ? 'gold-shimmer' : 'bg-blue-400/40'}`} style={{ width: `${dailyProgressPercent}%` }} />
                </div>
              </div>
            </div>
            <div className="p-12 text-center opacity-20 text-[9px] uppercase tracking-[0.3em]">
              {isResetConfirming ? "Tap icon again to reset" : "Tap to count"}
            </div>
          </div>
        )}

        {isSettingsOpen && (
          <div className="fixed inset-0 z-[500] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-6 slide-up">
              <h2 className="text-xl font-serif tracking-widest uppercase text-center">Settings</h2>
              <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold mb-1">Daily Reminders</p>
                    <p className="text-[10px] text-white/40">Get nudged if you haven't checked in</p>
                  </div>
                  <button onClick={() => isRemindersEnabled ? setIsRemindersEnabled(false) : requestNotifications()} className={`w-10 h-5 rounded-full relative transition-colors ${isRemindersEnabled ? 'bg-white' : 'bg-white/10'}`}>
                    <div className={`absolute top-1 w-3 h-3 rounded-full transition-all ${isRemindersEnabled ? 'right-1 bg-black' : 'left-1 bg-white/40'}`} />
                  </button>
                </div>
                {isRemindersEnabled && (
                  <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                    <p className="text-[8px] uppercase tracking-widest opacity-40 font-bold">Reminder Time</p>
                    <input type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} className="bg-transparent border-b border-white/20 text-xs font-mono outline-none px-1" />
                  </div>
                )}
              </div>
              <div className="p-5 bg-white/5 rounded-2xl border border-white/10 flex justify-between items-center">
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold mb-1">Streak</p>
                  <p className="text-[10px] text-white/40">Tap once daily to keep your flame alive</p>
                </div>
                <div className="flex items-center gap-2 text-orange-500">
                  <Flame size={20} />
                  <span className="text-2xl font-extralight">{streak.count}</span>
                </div>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="w-full py-4 bg-white text-black rounded-2xl text-[10px] uppercase tracking-[0.4em] font-bold">Done</button>
            </div>
          </div>
        )}

        {isGoalModalOpen && (
          <div className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-6 slide-up">
              <div className="text-center">
                <h2 className="text-2xl font-serif tracking-widest uppercase">Goals</h2>
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-40 mt-2">Set your targets</p>
              </div>

              {/* Daily Goal */}
              <div className="bg-white/[0.03] p-6 rounded-[2rem] border border-white/5 space-y-4">
                <p className="text-[9px] uppercase tracking-widest opacity-40 text-center">Daily Goal</p>
                <div className="text-4xl font-serif text-blue-400 text-center">{dailyGoal.toLocaleString()}</div>
                <input type="range" min="10" max="1000" step="10" value={dailyGoal} onChange={(e) => setDailyGoal(parseInt(e.target.value))} className="w-full accent-blue-400 h-1 bg-white/10 rounded-full appearance-none" />
              </div>

              {/* Annual Goal */}
              <div className="bg-white/[0.03] p-6 rounded-[2rem] border border-white/5 space-y-4">
                <p className="text-[9px] uppercase tracking-widest opacity-40 text-center">Annual Goal</p>
                <div className="text-4xl font-serif text-yellow-400 text-center">{annualGoal.toLocaleString()}</div>
                <input type="range" min="10000" max="1000000" step="10000" value={annualGoal} onChange={(e) => setAnnualGoal(parseInt(e.target.value))} className="w-full accent-yellow-400 h-1 bg-white/10 rounded-full appearance-none" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-center">
                  <p className="text-[8px] uppercase tracking-widest opacity-40 mb-1">Daily</p>
                  <p className="text-sm font-medium">{dailyPacing.toLocaleString()}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-center">
                  <p className="text-[8px] uppercase tracking-widest opacity-40 mb-1">Weekly</p>
                  <p className="text-sm font-medium">{weeklyPacing.toLocaleString()}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-center">
                  <p className="text-[8px] uppercase tracking-widest opacity-40 mb-1">Monthly</p>
                  <p className="text-sm font-medium">{monthlyPacing.toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-3">
                <button onClick={() => setIsGoalModalOpen(false)} className="w-full py-4 bg-white text-black rounded-2xl font-bold text-[10px] uppercase tracking-[0.3em]">Commit to Path</button>
                <button onClick={() => setIsGoalModalOpen(false)} className="w-full py-4 border border-white/10 rounded-2xl text-[9px] uppercase tracking-[0.4em] text-white/40">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {isStoryOpen && (
          <div className="fixed inset-0 z-[400] bg-black flex flex-col items-center justify-center p-6 text-center slide-up">
            <div className="w-full max-w-[340px] aspect-[9/16] rounded-[3rem] border border-white/10 p-10 flex flex-col bg-zinc-900/50">
              <p className="text-[10px] tracking-[0.5em] uppercase opacity-40 mb-8">My Journey</p>
              <div className="flex-1 flex flex-col justify-center space-y-10">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-yellow-400 font-bold mb-2">Lifetime</p>
                  <p className="text-6xl font-serif">{totalLifetime.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-blue-400 font-bold mb-2">Today</p>
                  <p className="text-4xl font-serif">{todayCount} / {dailyGoal}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-emerald-400 font-bold mb-2">Annual Goal</p>
                  <p className="text-4xl font-serif">{annualProgressPercent}%</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-orange-400 font-bold mb-2">Day Streak</p>
                  <p className="text-4xl font-serif">{streak.count}</p>
                </div>
                {isAnnualGoalMet && <p className="text-yellow-400 text-xs uppercase tracking-widest">🏆 Annual Goal Complete</p>}
                {isDailyGoalMet && <p className="text-blue-400 text-xs uppercase tracking-widest">🎉 Daily Goal Complete</p>}
              </div>
            </div>
            <button onClick={() => setIsStoryOpen(false)} className="mt-10 py-4 px-12 bg-white text-black rounded-xl font-bold text-[10px] uppercase tracking-widest">Return</button>
          </div>
        )}
      </div>
    </div>
  );
}
