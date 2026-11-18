import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { getBuildings } from '../services/dbService';
import { listWorkers, createWorker, updateWorker, deleteWorker, authErrorMessage, MIN_PASSWORD_LENGTH } from '../services/authService';
import { WorkerPermissions, User, Building } from '../types';

const defaultPermissions: WorkerPermissions = {
  canAddTenants: false, canEditTenants: false, canRenewContracts: false, canViewPayments: true,
  canViewHistory: false, canViewAlerts: false, canViewReports: false, canViewExpenses: false,
  canViewNotes: false, canViewInquiry: false, canViewEvents: false,
  canViewUnits: true, allowedBuildings: undefined, allowedUnits: undefined,
};

const PERM_GROUPS = [
  {
    title: 'إدارة المستأجرين', icon: '👥',
    color: 'blue',
    perms: [
      { key: 'canAddTenants' as keyof WorkerPermissions, label: 'إضافة مستأجر' },
      { key: 'canEditTenants' as keyof WorkerPermissions, label: 'تعديل بيانات المستأجر' },
      { key: 'canRenewContracts' as keyof WorkerPermissions, label: 'تجديد العقد' },
      { key: 'canViewHistory' as keyof WorkerPermissions, label: 'رؤية العقود السابقة' },
    ]
  },
  {
    title: 'المالية والتقارير', icon: '💰',
    color: 'emerald',
    perms: [
      { key: 'canViewPayments' as keyof WorkerPermissions, label: 'رؤية المدفوعات فقط' },
      { key: 'canViewReports' as keyof WorkerPermissions, label: 'رؤية تقارير الإيجار' },
      { key: 'canViewExpenses' as keyof WorkerPermissions, label: 'رؤية المصروفات' },
    ]
  },
  {
    title: 'التنبيهات والمتابعة', icon: '🔔',
    color: 'orange',
    perms: [
      { key: 'canViewAlerts' as keyof WorkerPermissions, label: 'رؤية التنبيهات' },
      { key: 'canViewEvents' as keyof WorkerPermissions, label: 'رؤية الأحداث' },
    ]
  },
  {
    title: 'النظام والاستعلام', icon: '🔍',
    color: 'purple',
    perms: [
      { key: 'canViewNotes' as keyof WorkerPermissions, label: 'رؤية الملاحظات' },
      { key: 'canViewInquiry' as keyof WorkerPermissions, label: 'رؤية الاستعلام' },
      { key: 'canViewUnits' as keyof WorkerPermissions, label: 'رؤية الوحدات فقط من دون تحديث' },
    ]
  },
];

interface WorkerFormState {
  workerName: string; username: string; password: string;
  permissions: WorkerPermissions; restrictBuildings: boolean;
  selectedBuildings: string[]; allowedUnits: Record<string, string[]>;
}
const emptyForm = (): WorkerFormState => ({
  workerName: '', username: '', password: '',
  permissions: { ...defaultPermissions }, restrictBuildings: false,
  selectedBuildings: [], allowedUnits: {},
});

// Simple Toast
const Toast: React.FC<{ msg: string; type: 'success' | 'error' }> = ({ msg, type }) => (
  <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-5 py-3 rounded-2xl shadow-2xl text-white text-sm font-bold animate-slide-up ${type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
    <span>{type === 'success' ? '✓' : '✕'}</span>
    {msg}
  </div>
);

const colorMap: Record<string, string> = {
  blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50',
  emerald: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50',
  purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800/50',
};
const headerColorMap: Record<string, string> = {
  blue: 'text-blue-700 dark:text-blue-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  purple: 'text-purple-700 dark:text-purple-300',
};
const checkColorMap: Record<string, string> = {
  blue: 'accent-blue-600',
  emerald: 'accent-emerald-600',
  purple: 'accent-purple-600',
};

const WorkerManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [workers, setWorkers] = useState<User[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [form, setForm] = useState<WorkerFormState>(emptyForm());
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [isBusy, setIsBusy] = useState(false);

  const loadData = useCallback(async () => {
    setBuildings(getBuildings());
    if (!user?.ownerId) return;
    try {
      setWorkers(await listWorkers(user.ownerId));
    } catch (err) {
      console.error('Loading workers failed:', err);
      showToast(authErrorMessage(err), 'error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.ownerId]);

  useEffect(() => {
    if (!user || user.role !== 'owner') { navigate('/'); return; }
    loadData();
  }, [user, navigate, loadData]);

  const handleOpenAdd = () => { setForm(emptyForm()); setEditingWorkerId(null); setError(''); setIsModalOpen(true); };

  const handleOpenEdit = (w: User) => {
    const allowedBuildings = w.permissions?.allowedBuildings;
    setForm({
      workerName: w.workerName || '', username: w.username, password: '',
      permissions: { ...defaultPermissions, ...w.permissions },
      restrictBuildings: !!allowedBuildings && allowedBuildings.length > 0,
      selectedBuildings: allowedBuildings || [],
      allowedUnits: { ...(w.permissions?.allowedUnits || {}) },
    });
    setEditingWorkerId(w.uid || w.workerId || w.username);
    setError(''); setIsModalOpen(true);
  };

  const handlePermToggle = (key: keyof WorkerPermissions) => {
    setForm(prev => ({ ...prev, permissions: { ...prev.permissions, [key]: !prev.permissions[key] } }));
  };

  const handleBuildingToggle = (bName: string) => {
    setForm(prev => {
      const isSelected = prev.selectedBuildings.includes(bName);
      const sel = isSelected ? prev.selectedBuildings.filter(b => b !== bName) : [...prev.selectedBuildings, bName];
      const newUnits = { ...prev.allowedUnits };
      if (isSelected) delete newUnits[bName];
      return { ...prev, selectedBuildings: sel, allowedUnits: newUnits };
    });
  };

  const handleUnitToggle = (buildingName: string, unitNo: string) => {
    setForm(prev => {
      const curr = prev.allowedUnits[buildingName] || [];
      const newU = curr.includes(unitNo) ? curr.filter(u => u !== unitNo) : [...curr, unitNo];
      return { ...prev, allowedUnits: { ...prev.allowedUnits, [buildingName]: newU } };
    });
  };

  const handleSelectAllUnits = (buildingName: string, totalUnits: number) => {
    setForm(prev => {
      const curr = prev.allowedUnits[buildingName] || [];
      const newU = curr.length === totalUnits ? [] : Array.from({ length: totalUnits }, (_, i) => String(i + 1));
      return { ...prev, allowedUnits: { ...prev.allowedUnits, [buildingName]: newU } };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.workerName.trim()) { setError('يرجى إدخال اسم العامل'); return; }
    if (!form.username.trim()) { setError('يرجى إدخال اسم المستخدم'); return; }
    if (editingWorkerId === null && !form.password) { setError('يرجى إدخال كلمة المرور'); return; }
    if (form.password && form.password.length < MIN_PASSWORD_LENGTH) { setError(`كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} خانات على الأقل`); return; }
    if (isBusy) return;
    const finalPermissions: WorkerPermissions = {
      ...form.permissions,
      allowedBuildings: form.restrictBuildings ? form.selectedBuildings : undefined,
      allowedUnits: form.restrictBuildings ? form.allowedUnits : undefined,
    };
    setIsBusy(true);
    try {
      if (editingWorkerId === null) {
        const ownerId = user?.ownerId;
        if (!ownerId) {
          setError('تعذر تحديد حساب المالك الحالي');
          return;
        }
        await createWorker(ownerId, form.username, form.password, form.workerName, finalPermissions);
        showToast('تمت إضافة العامل بنجاح ✓');
      } else {
        const worker = workers.find(w => (w.uid || w.workerId || w.username) === editingWorkerId);
        if (!worker) throw new Error('WORKER_NOT_FOUND');
        await updateWorker(worker, {
          username: form.username,
          password: form.password || undefined,
          workerName: form.workerName,
          permissions: finalPermissions,
        });
        showToast('تم تحديث البيانات بنجاح ✓');
      }
      setIsModalOpen(false); await loadData();
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`هل أنت متأكد من حذف العامل "${name}"؟`)) {
      const worker = workers.find(w => (w.uid || w.workerId || w.username) === id);
      if (!worker) return;
      try {
        await deleteWorker(worker);
        await loadData();
        showToast('تم حذف العامل', 'error');
      } catch (err) {
        showToast(authErrorMessage(err), 'error');
      }
    }
  };

  return (
    <Layout>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div className="pb-10">
        {/* Header */}
        <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-40 rounded-b-2xl mb-6 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(-1)}
                className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 rtl:rotate-180 transform">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <h1 className="text-lg font-extrabold text-slate-800 dark:text-white">إدارة حسابات العمال</h1>
            </div>
            <button onClick={handleOpenAdd}
              className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-md hover:shadow-lg active:scale-95 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              إضافة عامل
            </button>
          </div>
        </header>

        {/* Stats card */}
        <div className="mx-4 mb-6 bg-gradient-to-r from-indigo-600 to-blue-600 rounded-3xl p-5 text-white shadow-xl shadow-indigo-500/20">
          <p className="text-sm font-medium opacity-80 mb-1">إجمالي العمال المسجلين</p>
          <p className="text-4xl font-black">{workers.length}</p>
        </div>

        {/* Workers list */}
        <div className="px-4 space-y-3">
          {workers.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700">
              <p className="text-5xl mb-3">👷</p>
              <p className="text-slate-500 dark:text-slate-400 font-medium">لا يوجد عمال مسجلين</p>
            </div>
          ) : (
            workers.map(w => (
              <div key={w.workerId || w.username}
                className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white flex items-center justify-center text-lg font-black shadow-md">
                    {(w.workerName || w.username).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-100">{w.workerName || 'عامل'}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">@{w.username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleOpenEdit(w)}
                    className="p-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(w.workerId || w.username, w.workerName || w.username)}
                    className="p-2 text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingWorkerId ? 'تعديل بيانات العامل' : 'إضافة عامل جديد'}
      >
        <form onSubmit={handleSave} className="space-y-4 mt-1">
              {/* Basic Info */}
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">الاسم *</label>
                  <input type="text" value={form.workerName} onChange={e => setForm({ ...form, workerName: e.target.value })}
                    placeholder="اسم العامل" required
                    className="w-full p-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">اسم المستخدم *</label>
                  <input type="text" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                    disabled={!!editingWorkerId} placeholder="username" required style={{ direction: 'ltr' }}
                    className="w-full p-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {editingWorkerId ? 'كلمة المرور الجديدة (اتركها فارغة)' : 'كلمة المرور *'}
                  </label>
                  <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                    required={!editingWorkerId} placeholder="••••••••" style={{ direction: 'ltr' }}
                    className="w-full p-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm font-bold p-3 rounded-xl">
                  ⚠️ {error}
                </div>
              )}

              {/* Grouped Permissions */}
              <div>
                <p className="text-xs font-black text-slate-700 dark:text-slate-300 mb-2">الصلاحيات الممنوحة</p>
                <div className="space-y-2">
                  {PERM_GROUPS.map(group => (
                    <div key={group.title} className={`rounded-xl border p-2.5 ${colorMap[group.color]}`}>
                      <p className={`text-[10px] font-black mb-2 flex items-center gap-1.5 ${headerColorMap[group.color]}`}>
                        <span>{group.icon}</span> {group.title}
                      </p>
                      <div className="grid grid-cols-2 gap-x-1.5 gap-y-2">
                        {group.perms.map(p => (
                          <label key={p.key} className="flex items-center gap-1.5 cursor-pointer group shrink-0">
                            <input type="checkbox" checked={!!form.permissions[p.key]}
                              onChange={() => handlePermToggle(p.key)}
                              className={`w-3.5 h-3.5 rounded shrink-0 cursor-pointer ${checkColorMap[group.color]}`} />
                            <span className="text-[10px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-white transition-colors truncate">{p.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Building/Unit Restriction */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
                <label className="flex items-center justify-between cursor-pointer mb-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">🏢 تقييد المباني والوحدات</span>
                  <div className={`w-8 h-4 rounded-full transition-colors ${form.restrictBuildings ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'} relative`}
                    onClick={() => setForm(p => ({ ...p, restrictBuildings: !p.restrictBuildings }))}>
                    <div className={`w-3 h-3 bg-white rounded-full shadow absolute top-0.5 transition-all ${form.restrictBuildings ? 'right-0.5' : 'left-0.5'}`} />
                  </div>
                </label>
                {form.restrictBuildings && (
                  <div className="mt-2 space-y-2">
                    {buildings.map(b => (
                      <div key={b.name} className={`p-3 rounded-xl border-2 transition-all ${form.selectedBuildings.includes(b.name) ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'}`}>
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                          <input type="checkbox" checked={form.selectedBuildings.includes(b.name)}
                            onChange={() => handleBuildingToggle(b.name)} className="w-4 h-4 accent-indigo-600" />
                          <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{b.name}</span>
                        </label>
                        {form.selectedBuildings.includes(b.name) && b.totalUnits > 0 && (
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">اختر الوحدات:</span>
                              <button type="button" onClick={() => handleSelectAllUnits(b.name, b.totalUnits)}
                                className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                                {(form.allowedUnits[b.name]?.length || 0) === b.totalUnits ? 'إلغاء الكل' : 'تحديد الكل'}
                              </button>
                            </div>
                            <div className="grid grid-cols-6 gap-1">
                              {Array.from({ length: b.totalUnits }, (_, i) => String(i + 1)).map(u => (
                                <button key={u} type="button" onClick={() => handleUnitToggle(b.name, u)}
                                  className={`py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${form.allowedUnits[b.name]?.includes(u) ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                                  {u}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

          {/* Actions */}
          <div className="flex gap-2 pt-3 mt-4 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={() => setIsModalOpen(false)}
              className="flex-1 py-2 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              إلغاء
            </button>
            <button type="submit" disabled={isBusy}
              className="flex-1 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-600/40 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-wait">
              {isBusy ? 'جاري الحفظ...' : editingWorkerId ? 'حفظ التعديلات' : 'إضافة العامل'}
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
};

export default WorkerManagementPage;