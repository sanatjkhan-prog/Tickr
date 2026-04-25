import React, { useState, useEffect, useCallback } from 'react';
import { Settings, BarChart, X, Target, ChevronLeft, Share2, CheckCircle2, Trash2, Sparkles, Globe, Users } from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, increment } from 'firebase/firestore';

const STORAGE_KEY = 'tickr_v3_cloud';
const DEFAULT_DHIKRS = [
  { id: 'astaghfirullah', label: 'Astaghfirullah', arabic: 'أستغفر الله' },
  { id: 'alhamdulillah', label: 'Alhamdulillah', arabic: 'الحمد لله' },
  { id: 'subhanallah', label: 'SubhanAllah', arabic: 'سبحان الله' },
  { id: 'salawat', label: 'Salawat', arabic: 'اللهم صل على محمد' },
  { id: 'custom', label: 'Custom', arabic: 'ذكر' },
];

export default function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasSeenIntro, setHasSeenIntro] = useState(true);
  const [view, setView] = useState('picker'); 
  const [activeDhikrId, setActiveDhikrId] = useState(null);
  const [dhikrs, setDhikrs] = useState({});
  const [globalStats, setGlobalStats] = useState({ totalDhikr: 0 });
  const [settings, setSettings] = useState({ hapticsEnabled: true, celebrationsEnabled: true });
  const [showSettings, setShowSettings] = useState(false);
  const [celebration, setCelebration] = useState(null);

  useEffect(() => {
    // Robust check for environment variables to avoid build warnings/errors
    let configString = null;
    try {
      configString = import.meta.env?.VITE_FIREBASE_CONFIG;
    } catch (e) {
      configString = window.__FIREBASE_CONFIG__; // Optional fallback
    }

    if (!configString) return;
    
    try {
      const firebaseConfig = typeof configString === 'string' ? JSON.parse(configString) : configString;
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      const _auth = getAuth(app);
      const _db = getFirestore(app);
      setAuth(_auth);
      setDb(_db);

      signInAnonymously(_auth).catch(console.error);
      return onAuthStateChanged(_auth, setUser);
    } catch (err) {
      console.error("Firebase initialization failed:", err);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setDhikrs(parsed.dhikrs || {});
      setHasSeenIntro(parsed.hasSeenIntro ?? true);
    } else {
      const initial = {};
      DEFAULT_DHIKRS.forEach(d => initial[d.id] = { ...d, currentCount: 0, target: 100, lifetimeTotal: 0 });
      setDhikrs(initial);
      setHasSeenIntro(false);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    
    let appId = 'tickr-prod';
    try {
      appId = import.meta.env?.VITE_APP_ID || 'tickr-prod';
    } catch (e) {}

    const globalDoc = doc(db, 'artifacts', appId, 'public', 'data', 'global_stats');
    return onSnapshot(globalDoc, (s) => s.exists() && setGlobalStats(s.data()), (e) => e.code !== 'permission-denied' && console.error(e));
  }, [user, db]);

  useEffect(() => {
    if (isLoaded) localStorage.setItem(STORAGE_KEY, JSON.stringify({ dhikrs, activeDhikrId, hasSeenIntro }));
  }, [dhikrs, activeDhikrId, hasSeenIntro, isLoaded]);

  const syncToCloud = useCallback(async (amount) => {
    if (!auth?.currentUser || !db) return;
    
    let appId = 'tickr-prod';
    try {
      appId = import.meta.env?.VITE_APP_ID || 'tickr-prod';
    } catch (e) {}

    const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'global_stats');
    try {
      await setDoc(globalRef, { totalDhikr: increment(amount), lastUpdated: new Date() }, { merge: true });
    } catch (e) { if (e.code !== 'permission-denied') console.error(e); }
  }, [auth, db]);

  const handleTap = useCallback(() => {
    if (!activeDhikrId) return;
    setDhikrs(prev => {
      const d = prev[activeDhikrId];
      const newCount = d.currentCount + 1;
      const newLifetime = (d.lifetimeTotal || 0) + 1;
      if (settings.hapticsEnabled && navigator.vibrate) navigator.vibrate(10);
      if (newLifetime % 10 === 0) syncToCloud(10);
      if (settings.celebrationsEnabled && newCount === d.target) setCelebration('goal');
      return { ...prev, [activeDhikrId]: { ...d, currentCount: newCount, lifetimeTotal: newLifetime } };
    });
  }, [activeDhikrId, settings, syncToCloud]);

  if (!isLoaded) return <div className="h-screen bg-black" />;

  return (
    <div className="h-screen w-screen bg-black text-white font-sans overflow-hidden select-none touch-none">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display&family=Inter:wght@200;400;600&display=swap');
        .font-serif { font-family: 'Playfair Display', serif; }
        body { font-family: 'Inter', sans-serif; background: black; margin: 0; padding: 0; }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>

      <div className="h-full max-w-md mx-auto relative border-x border-white/5 flex flex-col">
        {view === 'picker' ? (
          <div className="flex-1 p-8 overflow-y-auto">
            <header className="mb-12 text-center pt-8">
              <h1 className="text-2xl font-serif tracking-[0.3em] mb-3">T I C K R</h1>
              <div className="flex justify-center items-center gap-2 opacity-30 text-[9px] uppercase tracking-widest">
                <Globe size={10} /> {globalStats.totalDhikr?.toLocaleString() || 0} Global Taps
              </div>
            </header>
            <div className="space-y-4">
              {Object.values(dhikrs).map(d => (
                <button key={d.id} onClick={() => { setActiveDhikrId(d.id); setView('counter'); }} className="w-full p-6 border border-white/10 rounded-2xl flex justify-between items-center bg-white/[0.01] active:scale-95 transition-transform">
                  <div className="text-left">
                    <p className="text-[10px] opacity-40 uppercase tracking-widest mb-1">{d.label}</p>
                    <p className="text-xl font-serif">{d.arabic}</p>
                  </div>
                  <p className="text-2xl font-extralight">{d.currentCount || ""}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col" onClick={handleTap}>
            <div className="p-8 flex justify-between items-start">
              <button onClick={(e) => { e.stopPropagation(); setView('picker'); }} className="p-2 opacity-30"><ChevronLeft size={28}/></button>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-widest opacity-30">{dhikrs[activeDhikrId].label}</p>
                <p className="text-lg font-serif">{dhikrs[activeDhikrId].arabic}</p>
              </div>
              <div className="w-10"></div>
            </div>
            <div className="flex-1 flex flex-col justify-center items-center">
              <p className="text-[11rem] font-sans font-extralight tracking-tighter">{dhikrs[activeDhikrId].currentCount.toLocaleString()}</p>
            </div>
            <div className="p-12 text-center opacity-20 text-[9px] uppercase tracking-[0.3em]">Tap to count</div>
          </div>
        )}

        {!hasSeenIntro && (
          <div className="fixed inset-0 z-50 bg-black flex items-center justify-center p-12 text-center">
            <div className="space-y-8">
              <h2 className="text-3xl font-serif">Tickr</h2>
              <p className="text-sm opacity-50">A calm space for remembrance.</p>
              <button onClick={() => setHasSeenIntro(true)} className="w-full py-4 bg-white text-black rounded-2xl font-bold">Start</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}