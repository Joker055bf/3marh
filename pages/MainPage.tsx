import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import SettingsModal, { View as SettingsView } from '../components/SettingsModal';
import Modal from '../components/Modal';
import SetupModal from '../components/SetupModal';
import { useTranslation } from '../hooks/useTranslation';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';

import PushPrompt from '../components/PushPrompt';
import { getBuildings, addBuilding, deleteBuilding, isSetupComplete, verifyPassword } from '../services/dbService';
import { Building } from '../types';

const BuildingIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-blue-600 dark:text-blue-400">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
  </svg>
);

const SettingsIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
    <path fillRule="evenodd" d="M11.828 2.25c-.916 0-1.699.663-1.85 1.567l-.091.549a.798.798 0 01-.517.608 7.45 7.45 0 00-.478.198.798.798 0 01-.796-.064l-.453-.324a1.875 1.875 0 00-2.416.2l-.043.044a1.875 1.875 0 00-.2 2.416l.324.453a.798.798 0 01.064.796 7.448 7.448 0 00-.198.478.798.798 0 01-.608.517l-.55.09c-.903.152-1.566.934-1.566 1.85v.064c0 .916.663 1.698 1.566 1.85l.55.09c.281.047.508.25.608.517.06.162.127.321.198.478a.798.798 0 01-.064.796l-.324.453a1.875 1.875 0 00.2 2.416l.043.044a1.875 1.875 0 002.416.2l.453-.324a.798.798 0 01.796-.064c.157.071.316.137.478.198a.798.798 0 01.517.608l.092.549c.15.903.932 1.566 1.849 1.566h.064c.917 0 1.699-.663 1.85-1.566l.091-.549a.798.798 0 01.517-.608 7.52 7.52 0 00.478-.198.798.798 0 01.796.064l.453.324a1.875 1.875 0 002.416-.2l.043-.044a1.875 1.875 0 00.2-2.416l-.324-.453a.798.798 0 01-.064-.796c.071-.157.137-.316.198-.478a.798.798 0 01.608-.517l.55-.09c.903-.152 1.566-.934 1.566-1.85v-.064c0-.916-.663-1.698-1.566-1.85l-.55-.09a.798.798 0 01-.608-.517 7.493 7.493 0 00-.198-.478.798.798 0 01.064-.796l.324-.453a1.875 1.875 0 00-.2-2.416l-.043-.044a1.875 1.875 0 00-2.416-.2l-.453.324a.798.798 0 01-.796.064 7.462 7.462 0 00-.478-.198.798.798 0 01-.517-.608l-.091-.549a1.874 1.874 0 00-1.85-1.567h-.064zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
  </svg>
);

const PlusIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 me-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
  </svg>
);

const DeleteIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
  </svg>
);



const MainPage: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialView, setSettingsInitialView] = useState<SettingsView>();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [buildingToDelete, setBuildingToDelete] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [newBuildingName, setNewBuildingName] = useState('');
  const [newTotalUnits, setNewTotalUnits] = useState('');
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);

  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isNative && !isSetupComplete()) {
      setIsSetupModalOpen(true);
      setIsLoading(false);
    } else {
      let allBuildings = getBuildings();
      // Filter buildings based on worker permissions
      if (user && user.role === 'worker' && Array.isArray(user.permissions?.allowedBuildings) && user.permissions.allowedBuildings.length > 0) {
        allBuildings = allBuildings.filter(b => 
          user.permissions!.allowedBuildings!.includes(b.name)
        );
      }
      setBuildings(allBuildings);
      
      // Artificial delay to show skeleton if it's too fast (optional, but good for "feel")
      const timer = setTimeout(() => setIsLoading(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isNative, user]);

  const handleSetupComplete = () => {
    setIsSetupModalOpen(false);
    let allBuildings = getBuildings();
    if (user && user.role === 'worker' && Array.isArray(user.permissions?.allowedBuildings) && user.permissions.allowedBuildings.length > 0) {
      allBuildings = allBuildings.filter(b => user.permissions!.allowedBuildings!.includes(b.name));
    }
    setBuildings(allBuildings);
  };

  const handleAddBuilding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBuildingName.trim()) return;
    try {
      addBuilding(newBuildingName.trim(), Number(newTotalUnits));
      setBuildings(getBuildings());
      setNewBuildingName('');
      setNewTotalUnits('');
      setIsAddModalOpen(false);
    } catch (error: any) {
      if (error.message === 'DUPLICATE_BUILDING_NAME') {
        alert(t('addBuildingModal.duplicateError'));
      }
    }
  };

  const handleDeleteBuilding = (name: string) => {
    setBuildingToDelete(name);
    setIsDeleteModalOpen(true);
    setDeletePassword('');
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await verifyPassword(deletePassword)) {
      if (buildingToDelete) {
        deleteBuilding(buildingToDelete);
        setBuildings(getBuildings());
      }
      setIsDeleteModalOpen(false);
      setBuildingToDelete(null);
    } else {
      alert(t('deleteBuildingModal.incorrectPasswordError'));
    }
  };

  const openForgotPassword = () => {
    setIsDeleteModalOpen(false);
    setSettingsInitialView('forgotPassword_email');
    setIsSettingsOpen(true);
  }

  return (
    <Layout>
      {isNative && <SetupModal isOpen={isSetupModalOpen} onComplete={handleSetupComplete} />}

      {!isSetupModalOpen && (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="glass-card rounded-[2rem] w-full max-w-md overflow-hidden relative animate-scale-in border border-white/60 dark:border-slate-700/60 shadow-2xl">

            {/* Header Section */}
            <div className="p-8 pb-4 text-center relative">
              {/* Settings Button - Top Left */}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="absolute top-6 left-6 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
              >
                <SettingsIcon />
              </button>

              {/* Logout Button - Top Right */}
              <button
                onClick={logout}
                className="absolute top-6 right-6 text-red-400 hover:text-red-600 dark:text-red-500/70 dark:hover:text-red-400 transition-colors flex items-center gap-1 text-xs font-bold"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                <span>{t('auth.logout')}</span>
              </button>

              <div className="flex justify-center mb-4">
                <BuildingIcon />
              </div>
              <h1 className="text-2xl font-bold text-blue-700 dark:text-blue-400 mb-1">متابعة عقاراتي</h1>
              {user && (
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">
                  مرحباً بك، {user.role === 'worker' ? (user.workerName || user.username) : (user.username || 'المالك')}
                </p>
              )}
              <div className="w-full h-px bg-slate-200 dark:bg-slate-700 my-4"></div>
            </div>

            {!isNative && <PushPrompt />}

            {/* Buildings List */}
            <div className="px-8 pb-4 space-y-3">
              {isLoading ? (
                // Skeleton Loading Cards
                [1, 2, 3].map(i => (
                  <div key={i} className="bg-white/30 dark:bg-slate-700/30 rounded-2xl p-4 animate-pulse">
                    <div className="h-6 w-3/4 mx-auto skeleton rounded-md"></div>
                  </div>
                ))
              ) : buildings.length > 0 ? (
                buildings.map((building) => (
                  <div key={building.name} className="group relative">
                    <Link
                      to={`/${encodeURIComponent(building.name)}`}
                      className="block w-full bg-white/50 dark:bg-slate-700/50 backdrop-blur-sm border border-white/40 dark:border-slate-600/50 rounded-2xl p-4 text-center text-slate-700 dark:text-slate-200 font-bold hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
                    >
                      {building.name}
                    </Link>
                    {(!user || user?.role === 'owner') && (
                      <div className="absolute top-1/2 -translate-y-1/2 left-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 focus-within:opacity-100">
                        <button
                          onClick={() => handleDeleteBuilding(building.name)}
                          className="bg-red-500 text-white rounded-md p-1.5 hover:bg-red-600 focus:opacity-100"
                          aria-label={t('mainPage.deleteBuilding')}
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center p-6 text-slate-500 dark:text-slate-400">
                  {t('mainPage.noBuildings')}
                </div>
              )}
            </div>

            {/* Add Button & Footer */}
            <div className="px-8 pb-8">
              {(!user || user?.role === 'owner') && (
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-blue-500/30 hover:shadow-blue-600/40 transition-all duration-300 flex items-center justify-center mb-6 transform hover:-translate-y-1 active:scale-95"
                >
                  <PlusIcon />
                  {t('mainPage.addBuilding')}
                </button>
              )}

              <div className="text-center text-xs font-medium flex justify-center gap-1">
                <span className="text-slate-500 dark:text-slate-400">تطوير وبرمجة:</span>
                <span className="text-teal-600 dark:text-teal-400">JokeR_β</span>
              </div>
              <div className="text-center text-[10px] mt-1">
                <Link to="/contact" className="text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                  تواصل معنا / Contact Us (JokeR.BO.JD@gmail.com)
                </Link>
              </div>
            </div>
          </div>

          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => {
              setIsSettingsOpen(false);
              setSettingsInitialView(undefined);
            }}
            initialView={settingsInitialView}
          />

          <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title={t('addBuildingModal.title')}>
            <form onSubmit={handleAddBuilding}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="buildingName" className="block mb-1 text-slate-700 dark:text-slate-300">{t('addBuildingModal.nameLabel')}</label>
                  <input
                    type="text"
                    id="buildingName"
                    value={newBuildingName}
                    onChange={e => setNewBuildingName(e.target.value)}
                    required
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label htmlFor="totalUnits" className="block mb-1 text-slate-700 dark:text-slate-300">{t('buildingPage.totalUnitsLabel')}</label>
                  <input
                    type="number"
                    id="totalUnits"
                    min="0"
                    value={newTotalUnits}
                    onChange={e => setNewTotalUnits(e.target.value)}
                    required
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex justify-end gap-4">
                  <button type="button" onClick={() => setIsAddModalOpen(false)} className="bg-slate-300 dark:bg-slate-600 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-md">{t('addBuildingModal.cancel')}</button>
                  <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md">{t('addBuildingModal.save')}</button>
                </div>
              </div>
            </form>
          </Modal>

          <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title={t('deleteBuildingModal.title')}>
            <form onSubmit={handleConfirmDelete}>
              <div className="space-y-4">
                <p className="text-slate-700 dark:text-slate-300">
                  {t('deleteBuildingModal.confirmMessage').replace('{buildingName}', buildingToDelete || '')}
                </p>
                <div>
                  <label htmlFor="deletePassword" className="block mb-1 text-slate-700 dark:text-slate-300">{t('deleteBuildingModal.passwordLabel')}</label>
                  <input
                    type="password"
                    id="deletePassword"
                    value={deletePassword}
                    onChange={e => setDeletePassword(e.target.value)}
                    required
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
                <div className="text-sm">
                  <button type="button" onClick={openForgotPassword} className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
                    {t('deleteBuildingModal.forgotPassword')}
                  </button>
                </div>
                <div className="flex justify-end gap-4">
                  <button type="button" onClick={() => setIsDeleteModalOpen(false)} className="bg-slate-300 dark:bg-slate-600 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-md">{t('deleteBuildingModal.cancelButton')}</button>
                  <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded-md">{t('deleteBuildingModal.confirmButton')}</button>
                </div>
              </div>
            </form>
          </Modal>
        </div>
      )}
    </Layout>
  );
};

export default MainPage;
