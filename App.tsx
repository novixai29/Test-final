import { useState, useEffect, useCallback } from 'react';
import { useUserStore } from './store/useUserStore';
import { analyzeLecture, LectureAnalysis } from './lib/gemini';
import { Dashboard } from './components/Dashboard';
import { Uploader } from './components/Uploader';
import { ExplanationView } from './components/ExplanationView';
import { WelcomeView } from './components/WelcomeView';
import { HistoryView } from './components/HistoryView';
import { AdminDashboard } from './components/AdminDashboard';
import { Stethoscope, Moon, Sun, ChevronRight, ChevronLeft, User, LogOut, RefreshCw, BookOpen, ShieldCheck, ExternalLink } from 'lucide-react';
import { auth, signInWithGoogle, logOut, db } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { useRef } from 'react';

type AppState = 'welcome' | 'idle' | 'analyzing' | 'explanation' | 'history' | 'admin' | 'ai_tools';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const { stats, addPastLecture, setDialect, incrementFreeUploads, upgradeSubscription } = useUserStore(user?.uid);
  
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser && currentUser.email) {
        try {
          // Check admin status
          if (currentUser.email === 'musen.almajidi.alallaf@gmail.com') {
            setIsAdmin(true);
          } else {
            const adminDoc = await getDoc(doc(db, 'admins', currentUser.email.toLowerCase()));
            setIsAdmin(adminDoc.exists());
          }
        } catch (e) {
          console.error("Error checking admin status", e);
        }
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const syncUser = async () => {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          
          if (!userSnap.exists()) {
            const newUserData: any = {
              uid: user.uid,
              subscription: stats.subscription,
              freeUploadsUsed: stats.freeUploadsUsed || 0,
              level: stats.level || 'Beginner',
              dialect: stats.dialect || 'Iraqi',
              createdAt: new Date().toISOString()
            };
            if (user.email) newUserData.email = user.email;
            if (user.displayName) newUserData.displayName = user.displayName;

            await setDoc(userRef, newUserData);
          } else {
            await setDoc(userRef, {
              uid: user.uid,
              subscription: stats.subscription,
              freeUploadsUsed: stats.freeUploadsUsed || 0,
              level: stats.level || 'Beginner',
              dialect: stats.dialect || 'Iraqi'
            }, { merge: true });
          }

          // Sync public profile for leaderboard
          const publicRef = doc(db, 'public_profiles', user.uid);
          await setDoc(publicRef, {
            uid: user.uid,
            displayName: userSnap.exists() && userSnap.data().displayName ? userSnap.data().displayName : (user.displayName || 'طالب متميز'),
            level: stats.level || 'Beginner'
          }, { merge: true });

        } catch (e) {
          console.error("Error syncing user to firestore", e);
        }
      };
      syncUser();
    }
  }, [user, stats]);

  const getNavKey = (uid?: string) => uid ? `app_history_${uid}` : 'app_history';
  const getNavIndexKey = (uid?: string) => uid ? `app_historyIndex_${uid}` : 'app_historyIndex';
  const getAnalysisKey = (uid?: string) => uid ? `app_analysis_${uid}` : 'app_analysis';

  const [nav, setNav] = useState<{history: AppState[], index: number}>({ history: ['welcome'], index: 0 });
  const appState = nav.history[nav.index];

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('app_isDarkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  
  const [fileData, setFileData] = useState<{ base64: string; mimeType: string } | null>(null);
  const [analysis, setAnalysis] = useState<LectureAnalysis | null>(null);

  useEffect(() => {
    if (isAuthReady) {
      try {
        const savedHistory = localStorage.getItem(getNavKey(user?.uid));
        const savedIndex = localStorage.getItem(getNavIndexKey(user?.uid));
        if (savedHistory && savedIndex) {
          setNav({ history: JSON.parse(savedHistory), index: JSON.parse(savedIndex) });
        } else {
          setNav({ history: ['welcome'], index: 0 });
        }
        
        const savedAnalysis = localStorage.getItem(getAnalysisKey(user?.uid));
        setAnalysis(savedAnalysis ? JSON.parse(savedAnalysis) : null);
      } catch (e) { setAnalysis(null); }
    }
  }, [user?.uid, isAuthReady]); // Note: removing `nav` dependency to only run on mount and auth changes

  useEffect(() => {
    if (isAuthReady) {
      try {
        localStorage.setItem(getNavKey(user?.uid), JSON.stringify(nav.history));
        localStorage.setItem(getNavIndexKey(user?.uid), JSON.stringify(nav.index));
        localStorage.setItem('app_isDarkMode', JSON.stringify(isDarkMode));
        
        if (analysis) localStorage.setItem(getAnalysisKey(user?.uid), JSON.stringify(analysis));
        else localStorage.removeItem(getAnalysisKey(user?.uid));
      } catch (e) {
        console.warn('Failed to save state to localStorage', e);
      }
    }
  }, [nav.history, nav.index, isDarkMode, analysis, user?.uid, isAuthReady]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const currentUploadId = useRef(0);

  const navigateTo = useCallback((newState: AppState, replace = false) => {
    setNav(prev => {
      if (replace) {
        const newHistory = [...prev.history];
        newHistory[prev.index] = newState;
        return { ...prev, history: newHistory };
      } else {
        const newHistory = prev.history.slice(0, prev.index + 1);
        newHistory.push(newState);
        return { history: newHistory, index: newHistory.length - 1 };
      }
    });
  }, []);

  const goBack = () => {
    setNav(prev => prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev);
  };

  const goForward = () => {
    setNav(prev => prev.index < prev.history.length - 1 ? { ...prev, index: prev.index + 1 } : prev);
  };

  const handleLogoClick = () => {
    navigateTo('idle');
  };

  useEffect(() => {
    const handleGoHome = () => {
      navigateTo('idle');
    };

    window.addEventListener('go-home', handleGoHome);

    return () => {
      window.removeEventListener('go-home', handleGoHome);
    };
  }, [navigateTo, stats.subscription]);

  const handleUpload = async (file: File) => {
    try {
      navigateTo('analyzing');
      const uploadId = ++currentUploadId.current;
      
      // Convert file to base64 using FileReader (much faster than arrayBuffer reduce)
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          const result = reader.result as string;
          // Remove the data:*/*;base64, prefix
          resolve(result.split(',')[1]);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
      });
      
      if (uploadId !== currentUploadId.current) return; // Cancelled during read

      setFileData({ base64, mimeType: file.type || 'text/plain' });

      const result = await analyzeLecture(base64, file.type || 'text/plain', stats);
      
      if (uploadId !== currentUploadId.current) return; // Cancelled during API call

      setAnalysis(result);
      
      // Save to past lectures
      addPastLecture({
        id: Date.now().toString(),
        title: result.title || file.name,
        summary: result.summaryForFuture,
        date: Date.now(),
        analysis: result // Save full analysis for later review
      });

      incrementFreeUploads();
      navigateTo('explanation', true);
    } catch (error: any) {
      console.error(error);
      const errorMessage = error?.message || '';
      if (errorMessage.includes('xhr error') || errorMessage.includes('timeout')) {
        alert('انقطع الاتصال بسبب طول العملية أو ضعف الإنترنت. يرجى المحاولة مرة أخرى.');
      } else {
        alert('حدث خطأ أثناء معالجة الملف. يرجى المحاولة مرة أخرى.');
      }
      navigateTo('idle', true);
    }
  };

  const handleReset = () => {
    navigateTo('idle');
  };

  const handleLogout = async () => {
    await logOut();
    // Don't clear local storage to preserve progress as requested
    window.location.reload();
  };

  const handleSwitchAccount = async () => {
    await signInWithGoogle(true);
  };

  const handleLectureSelect = (lecture: any) => {
    if (lecture.analysis) {
      setAnalysis(lecture.analysis);
      navigateTo('explanation');
    } else {
      alert('هذه المحاضرة قديمة ولا تحتوي على الشرح الكامل. يرجى رفعها من جديد.');
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-slate-100 dark:border-slate-800">
          <div className="bg-teal-600 text-white p-4 rounded-2xl inline-block mb-6">
            <Stethoscope className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">Med Tutor</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-8">سجل دخولك بحساب جوجل للبدء بشرح المحاضرات</p>
          <button
            onClick={() => signInWithGoogle(false)}
            className="w-full flex items-center justify-center space-x-3 space-x-reverse bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-6 py-4 rounded-xl font-bold transition-all"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span>تسجيل الدخول باستخدام Google</span>
          </button>
          
          <button
            onClick={() => window.open(window.location.href, '_blank')}
            className="w-full mt-6 flex items-center justify-center space-x-2 space-x-reverse text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-bold transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            <span>فتح التطبيق في نافذة جديدة (لحل مشاكل تسجيل الدخول)</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300" dir="rtl">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 transition-colors duration-300">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 space-x-reverse">
            
            {/* User Profile */}
            <div className="relative ml-4">
              <button 
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center space-x-2 space-x-reverse bg-slate-100 dark:bg-slate-800 p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center text-white">
                  <User className="w-5 h-5" />
                </div>
                <span className="font-bold text-sm hidden sm:block text-slate-700 dark:text-slate-200">طالب طب</span>
              </button>
              
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{user.displayName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                  </div>
                  {isAdmin && (
                    <button onClick={() => { setShowProfileMenu(false); navigateTo('admin'); }} className="w-full text-right px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center space-x-2 space-x-reverse text-sm font-medium text-purple-600 dark:text-purple-400 border-b border-slate-100 dark:border-slate-700">
                      <ShieldCheck className="w-4 h-4" />
                      <span>لوحة الإدارة</span>
                    </button>
                  )}
                  <button onClick={() => { setShowProfileMenu(false); handleSwitchAccount(); }} className="w-full text-right px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center space-x-2 space-x-reverse text-sm font-medium text-slate-700 dark:text-slate-200">
                    <RefreshCw className="w-4 h-4" />
                    <span>تبديل الحساب</span>
                  </button>
                  <button onClick={() => { setShowProfileMenu(false); handleLogout(); }} className="w-full text-right px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center space-x-2 space-x-reverse text-sm font-medium text-red-600 dark:text-red-400">
                    <LogOut className="w-4 h-4" />
                    <span>تسجيل الخروج</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-1 space-x-reverse ml-4">
              <button onClick={() => navigateTo('history')} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-2" title="سجل المحاضرات">
                <BookOpen className="w-6 h-6 text-slate-700 dark:text-slate-300" />
              </button>
              <button onClick={goBack} disabled={nav.index === 0} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors">
                <ChevronRight className="w-6 h-6 text-slate-700 dark:text-slate-300" />
              </button>
              <button onClick={goForward} disabled={nav.index === nav.history.length - 1} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors">
                <ChevronLeft className="w-6 h-6 text-slate-700 dark:text-slate-300" />
              </button>
            </div>
            <div className="flex items-center space-x-3 space-x-reverse cursor-pointer" onClick={handleLogoClick}>
              <div className="bg-teal-600 text-white p-2 rounded-xl">
                <Stethoscope className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-teal-800 dark:text-teal-100">Med Tutor</h1>
                <p className="text-xs text-teal-600 dark:text-teal-400 font-medium hidden sm:block">شرح المحاضرات الطبية بلهجتك المفضلة</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isDarkMode ? <Sun className="w-6 h-6 text-amber-400" /> : <Moon className="w-6 h-6 text-slate-600" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {appState === 'welcome' && (
          <WelcomeView 
            onStartFree={() => navigateTo('idle')} 
          />
        )}

        {appState === 'idle' && (
          <div className="animate-in fade-in duration-500">
            <Dashboard stats={stats} onDialectChange={setDialect} onLectureSelect={handleLectureSelect} />
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors duration-300">
              <h2 className="text-2xl font-bold text-teal-800 dark:text-teal-100 mb-6 text-center">ارفع محاضرتك ونبسطها إلك</h2>
              <Uploader onUpload={handleUpload} isProcessing={false} />
            </div>
          </div>
        )}

        {appState === 'analyzing' && (
          <div className="animate-in fade-in duration-500">
            <Dashboard stats={stats} onDialectChange={setDialect} onLectureSelect={handleLectureSelect} />
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors duration-300">
              <Uploader onUpload={() => {}} isProcessing={true} />
            </div>
          </div>
        )}

        {(appState === 'explanation') && analysis && (
          <div className="space-y-8 animate-in fade-in zoom-in duration-500">
            <ExplanationView 
              analysis={analysis}
            />
          </div>
        )}

        {appState === 'history' && (
          <HistoryView pastLectures={stats.pastLectures} onSelect={handleLectureSelect} />
        )}

        {appState === 'admin' && isAdmin && (
          <AdminDashboard />
        )}
      </main>
    </div>
  );
}
