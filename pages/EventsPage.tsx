import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { getActivityLog } from '../services/dbService';
import { ActivityLog } from '../types';
import { usePermissions } from '../hooks/usePermissions';
import AccessDenied from '../components/AccessDenied';

const TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  tenant_added:      { label: 'إضافة مستأجر', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', icon: '➕' },
  tenant_edited:     { label: 'تعديل مستأجر', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400', icon: '✏️' },
  tenant_terminated: { label: 'إنهاء عقد', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400', icon: '🔴' },
  payment_paid:      { label: 'دفعة مكتملة', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400', icon: '✅' },
  payment_partial:   { label: 'دفعة جزئية', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400', icon: '🔶' },
  payment_unpaid:    { label: 'إلغاء دفع', color: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400', icon: '↩️' },
  expense_added:     { label: 'مصروف مضاف', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400', icon: '💸' },
  expense_deleted:   { label: 'حذف مصروف', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400', icon: '🗑️' },
  worker_action:     { label: 'فعل عامل', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400', icon: '👷' },
};

const FILTER_TYPES = [
  { key: 'all',      label: 'الكل' },
  { key: 'tenants',  label: 'المستأجرون' },
  { key: 'overdue',  label: 'المتأخرة' },
  { key: 'partial',  label: 'الجزئية' },
  { key: 'workers',  label: 'العمال' },
];

const EventsPage: React.FC = () => {
  const navigate = useNavigate();
  const { buildingName } = useParams<{ buildingName?: string }>();
  const decodedBuildingName = buildingName ? decodeURIComponent(buildingName) : undefined;
  const { can, canAccessBuilding } = usePermissions();

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [filterType, setFilterType] = useState('all');
  const [filterYear, setFilterYear]   = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterDay, setFilterDay]     = useState('');

  useEffect(() => {
    if (!can('canViewEvents')) return;
    let allLogs = getActivityLog().filter(l => canAccessBuilding(l.buildingName));
    // If viewing from a specific building, filter by building
    if (decodedBuildingName) {
      if (!canAccessBuilding(decodedBuildingName)) {
        setLogs([]);
        return;
      }
      allLogs = allLogs.filter(l => l.buildingName === decodedBuildingName);
    }
    setLogs(allLogs);
  }, [can, canAccessBuilding, decodedBuildingName]);

  const years = useMemo(() => {
    const s = new Set(logs.map(l => l.date?.slice(0, 4)).filter(Boolean));
    return [...s].sort().reverse();
  }, [logs]);

  const months = useMemo(() => {
    if (!filterYear) return [];
    const s = new Set(logs.filter(l => l.date?.startsWith(filterYear)).map(l => l.date?.slice(5, 7)).filter(Boolean));
    return [...s].sort();
  }, [logs, filterYear]);

  const days = useMemo(() => {
    const prefix = filterYear && filterMonth ? `${filterYear}-${filterMonth}` : filterYear || '';
    if (!prefix) return [];
    const s = new Set(logs.filter(l => l.date?.startsWith(prefix)).map(l => l.date?.slice(8, 10)).filter(Boolean));
    return [...s].sort();
  }, [logs, filterYear, filterMonth]);

  const filtered = useMemo(() => {
    return logs.filter(l => {
      // Type filter
      if (filterType === 'tenants' && !['tenant_added', 'tenant_edited', 'tenant_terminated'].includes(l.type)) return false;
      if (filterType === 'overdue' && l.type !== 'payment_paid') return false;
      if (filterType === 'partial' && l.type !== 'payment_partial') return false;
      if (filterType === 'workers' && !l.isWorkerAction) return false;
      // Date filters
      if (filterYear && !l.date?.startsWith(filterYear)) return false;
      if (filterMonth && !l.date?.slice(5, 7).startsWith(filterMonth)) return false;
      if (filterDay && !l.date?.slice(8, 10).startsWith(filterDay)) return false;
      return true;
    });
  }, [logs, filterType, filterYear, filterMonth, filterDay]);

  const MONTH_NAMES: Record<string, string> = {
    '01':'يناير','02':'فبراير','03':'مارس','04':'أبريل','05':'مايو','06':'يونيو',
    '07':'يوليو','08':'أغسطس','09':'سبتمبر','10':'أكتوبر','11':'نوفمبر','12':'ديسمبر'
  };

  if (!can('canViewEvents')) {
    return (
      <Layout>
        <AccessDenied backTo={decodedBuildingName ? `/${buildingName}` : '/'} />
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Custom Styled Header for Events */}
      <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-40 rounded-b-2xl mb-4 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors flex items-center justify-center shadow-sm"
              title="رجوع"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 rtl:rotate-180 transform">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg md:text-xl font-extrabold text-slate-800 dark:text-white">سجل الأحداث</h1>
              {decodedBuildingName && (
                <p className="text-xs text-teal-600 dark:text-teal-400 font-bold">🏢 {decodedBuildingName}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(filterYear || filterMonth || filterDay || filterType !== 'all') && (
              <button onClick={() => { setFilterYear(''); setFilterMonth(''); setFilterDay(''); setFilterType('all'); }}
                className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/30 px-3 py-1 rounded-full hover:bg-red-100 transition-colors border border-red-100 dark:border-red-900/50">
                إعادة ضبط
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Type Filter Chips - Primary Level */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-2 no-scrollbar px-4">
        {FILTER_TYPES.map(f => (
          <button key={f.key} onClick={() => setFilterType(f.key)}
            className={`flex-shrink-0 px-5 py-2 rounded-2xl text-xs font-black transition-all duration-300 border ${filterType === f.key 
              ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30 scale-105' 
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-700 hover:border-blue-400'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Date Filters - Secondary Level */}
      <div className="px-4 mb-6">
        <div className="flex gap-2 p-3 bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
          <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar">
            <select value={filterYear} onChange={e => { setFilterYear(e.target.value); setFilterMonth(''); setFilterDay(''); }}
              className="min-w-[90px] bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer">
              <option value="">السنة</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 self-center"></div>
            <select value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setFilterDay(''); }}
              disabled={!filterYear}
              className="min-w-[90px] bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer disabled:opacity-30">
              <option value="">الشهر</option>
              {months.map(m => <option key={m} value={m}>{MONTH_NAMES[m] || m}</option>)}
            </select>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 self-center"></div>
            <select value={filterDay} onChange={e => setFilterDay(e.target.value)}
              disabled={!filterMonth}
              className="min-w-[80px] bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer disabled:opacity-30">
              <option value="">اليوم</option>
              {days.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="text-blue-600 dark:text-blue-400 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0h18" />
            </svg>
          </div>
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 text-center">
        {filtered.length} حدث {filtered.length !== logs.length ? `من أصل ${logs.length}` : ''}
      </p>

      {/* Events List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 glass-card rounded-3xl">
          <p className="text-5xl mb-3">📋</p>
          <p className="text-slate-500 dark:text-slate-400 text-lg font-medium">لا توجد أحداث</p>
          <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
            {decodedBuildingName
              ? `لا توجد أحداث مسجلة لمبنى ${decodedBuildingName}`
              : 'ستظهر هنا جميع أحداث النظام تلقائياً'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 pb-8">
          {filtered.map(log => {
            const meta = TYPE_LABELS[log.type] || { label: log.type, color: 'bg-slate-100 text-slate-700', icon: '•' };
            const time = new Date(log.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={log.id} className="glass-card rounded-2xl p-4 flex items-start gap-3 hover:shadow-md transition-all animate-fade-in">
                <span className="text-2xl flex-shrink-0 mt-0.5">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${meta.color}`}>{meta.label}</span>
                    {log.isWorkerAction && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">👷 عامل</span>
                    )}
                    {/* Only show building badge when viewing all buildings */}
                    {!decodedBuildingName && log.buildingName && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">🏢 {log.buildingName}</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-relaxed">{log.description}</p>
                  {log.performedByName && log.isWorkerAction && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">بواسطة: {log.performedByName}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400">{log.date}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{time}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
};

export default EventsPage;
