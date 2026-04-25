import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, BarChart, X, Target, ChevronLeft, Share2, CheckCircle2, Trash2, Sparkles, Globe, RotateCcw, MessageSquare, Zap } from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, increment } from 'firebase/firestore';

const STORAGE_KEY = 'tickr_v3_cloud';
const DEFAULT_DHIKRS = [
  { id: 'astaghfirullah', label: 'Astaghfirullah', arabic: 'أستغفر الله' },
  { id: 'alhamdulillah', label: 'Alhamdulillah', arabic: 'الحمد لله' },
  { id: 'subhanallah', label: 'SubhanAllah', arabic: 'سبحان الله' },
  { id: 'salawat', label: 'Salawat', arabic: 'اللهم صل على محمد' },
  { id: 'custom', label: 'Custom', arabic: 'ذكر' },
];

const apiKey = "";
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";

async function callGemini(prompt, systemInstruction = "") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined
  };
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('API request failed');
      const result = await response.json();
      return result.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (e) {
      const delay = Math.pow(2, i) * 1000;
      await new Promise(res => setTimeout(res, delay));
    }
  }
  return "Could not connect to the wisdom engine right now. Please try again later.";
}

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
  const [isResetConfirming, setIsResetConfirming] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const resetTimerRef = useRef(null);

  useEffect(() => {
    let configString = null;
    try {
      configString = import.meta.env?.VITE_FIREBASE_CONFIG;
    } catch (e) {
      configString = window.__FIREBASE_CONFIG__;
    }
    if (!configString) return;
    try {
      const firebaseConfig = typeof configString === 'string' ? JSON.parse(configString) : configString;
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      const _auth = getAuth(app);
      const _db = getFirestore(app);
      setAuth(_auth);
      setDb(_db);
      const initAuth = async () => {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(_auth, __initial_auth_token);
        } else {
          await signInAnonymously(_auth);
        }
      };
      initAuth();
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
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'tickr-prod';
    const globalDoc = doc(db, 'artifacts', appId, 'public', 'data', 'global_stats');
    return onSnapshot(globalDoc, (s) => s.exists() && setGlobalStats(s.data()), (e) => {});
  }, [user, db]);

  useEffect(() => {
    if (isLoaded) localStorage.setItem(STORAGE_KEY, JSON.stringify({ dhikrs, activeDhikrId, hasSeenIntro }));
  }, [dhikrs, activeDhikrId, hasSeenIntro, isLoaded]);

  const syncToCloud = useCallback(async (amount) => {
    if (!user || !db) return;
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'tickr-prod';
    const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'global_stats');
    try {
      await setDoc(globalRef, { totalDhikr: increment(amount), lastUpdated: new Date() }, { merge: true });
    } catch (e) {}
  }, [user, db]);

  const handleTap = useCallback(() => {
    if (!activeDhikrId || isResetConfirming || aiResponse) {
      if (aiResponse) setAiResponse(null);
      setIsResetConfirming(false);
      return;
    }
    setDhikrs(prev => {
      const d = prev[activeDhikrId];
      const newCount = d.currentCount + 1;
      const newLifetime = (d.lifetimeTotal || 0) + 1;
      if (settings.hapticsEnabled && navigator.vibrate) navigator.vibrate(10);
      if (newLifetime % 10 === 0) syncToCloud(10);
      return { ...prev, [activeDhikrId]: { ...d, currentCount: newCount, lifetimeTotal: newLifetime } };
    });
  }, [activeDhikrId, settings, syncToCloud, isResetConfirming, aiResponse]);

  const handleReset = useCallback((e) => {
    e.stopPropagation();
    if (isResetConfirming) {
      setDhikrs(prev => ({
        ...prev,
        [activeDhikrId]: { ...prev[activeDhikrId], currentCount: 0 }
      }));
      setIsResetConfirming(false);
      if (settings.hapticsEnabled && navigator.vibrate) navigator.vibrate([30, 30, 30]);
    } else {
      setIsResetConfirming(true);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setIsResetConfirming(false), 3000);
    }
  }, [activeDhikrId, isResetConfirming, settings.hapticsEnabled]);

  const getReflection = async (e) => {
    e.stopPropagation();
    if (aiLoading) return;
    setAiLoading(true);
    const dhikr = dhikrs[activeDhikrId];
    const prompt = `Provide a short, beautiful Islamic reflection or a motivational quote related to the dhikr: "${dhikr.label}" (${dhikr.arabic}). How does this specific remembrance bring peace to the heart? Maximum 2 sentences.`;
    const system = "You are a peaceful Islamic mentor and spiritual guide. Your words are rooted in Quranic wisdom and the Prophetic tradition. Your tone is poetic, serene, and deeply motivational.";
    const text = await callGemini(prompt, system);
    setAiResponse(text);
    setAiLoading(false);
  };

  const getSummary = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    const summaryData = Object.values(dhikrs).map(d => `${d.label}: ${d.currentCount}`).join(", ");
    const prompt = `The user has completed these dhikr counts: ${summaryData}. Based on this effort, provide a short (1-2 sentence) motivational insight from Islamic tradition about consistency in remembrance and the weight of these small actions on the Scale.`;
    const system = "You are a wise mentor specializing in Islamic motivation. Your goal is to inspire the user to keep going, using concepts like Barakah (blessing) and the love Allah has for consistent small deeds.";
    const text = await callGemini(prompt, system);
    setAiResponse(text);
    setAiLoading(false);
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
        .ai-modal { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      <div className="h-full max-w-md mx-auto relative border-x border-white/5 flex flex-col">
        {view === 'picker' ? (
          <div className="flex-1 p-8 overflow-y-auto pb-32">
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
                  <p className="text-2xl font-extralight">{d.currentCount || "0"}</p>
                </button>
              ))}
            </div>
            <button 
              onClick={getSummary}
              className="mt-12 w-full p-4 border border-emerald-500/20 bg-emerald-500/5 rounded-2xl flex items-center justify-center gap-3 text-emerald-400 text-xs uppercase tracking-widest active:scale-95 transition-all"
            >
              {aiLoading ? <Zap className="animate-pulse" size={14} /> : <Sparkles size={14} />}
              <span>✨ Spiritual Insight</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col" onClick={handleTap}>
            <div className="p-8 flex justify-between items-start">
              <button onClick={(e) => { e.stopPropagation(); setView('picker'); }} className="p-2 opacity-30 active:opacity-100"><ChevronLeft size={28}/></button>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-widest opacity-30">{dhikrs[activeDhikrId].label}</p>
                <p className="text-lg font-serif">{dhikrs[activeDhikrId].arabic}</p>
              </div>
              <button onClick={handleReset} className={`p-2 transition-all duration-300 opacity-30 active:opacity-100 ${isResetConfirming ? 'reset-confirm' : ''}`}>
                <RotateCcw size={24} />
              </button>
            </div>
            <div className="flex-1 flex flex-col justify-center items-center relative">
              <p className={`text-[11rem] font-sans font-extralight tracking-tighter transition-all duration-300 ${isResetConfirming || aiResponse ? 'blur-sm opacity-10 scale-90' : ''}`}>
                {dhikrs[activeDhikrId].currentCount.toLocaleString()}
              </p>
              {aiResponse && (
                <div className="absolute inset-0 flex items-center justify-center p-8 text-center ai-modal">
                  <div className="p-8 bg-white/[0.04] border border-white/10 rounded-[2.5rem] backdrop-blur-md shadow-2xl">
                    <p className="text-base font-light leading-relaxed font-serif opacity-90">"{aiResponse}"</p>
                    <div className="mt-6 w-8 h-[1px] bg-white/20 mx-auto"></div>
                    <p className="mt-4 text-[8px] uppercase tracking-[0.4em] opacity-30">Tap to continue</p>
                  </div>
                </div>
              )}
              {isResetConfirming && (
                <div className="absolute flex flex-col items-center pointer-events-none">
                  <p className="text-red-500 uppercase tracking-[0.2em] text-xs font-bold animate-pulse">Tap icon to reset</p>
                </div>
              )}
            </div>
            <div className="p-8 flex flex-col items-center gap-6">
              <button onClick={getReflection} className="p-5 rounded-full bg-white/5 border border-white/10 opacity-40 active:opacity-100 active:scale-95 transition-all text-emerald-400">
                {aiLoading ? <Zap className="animate-pulse" size={20} /> : <MessageSquare size={20} />}
              </button>
              <div className="text-center opacity-20 text-[9px] uppercase tracking-[0.3em]">
                {isResetConfirming ? "Resetting..." : "Tap to count"}
              </div>
            </div>
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
