import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Header from '../components/Header';
import Modal from '../components/Modal';
import AccessDenied from '../components/AccessDenied';
import { getNotes, addNote, deleteNote } from '../services/dbService';
import { Note } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { usePermissions } from '../hooks/usePermissions';

const NotesPage: React.FC = () => {
    const { buildingName } = useParams<{ buildingName: string }>();
    const decodedBuildingName = buildingName ? decodeURIComponent(buildingName) : '';
    const { t } = useTranslation();
    const { isOwner, can, canAccessBuilding } = usePermissions();
    const canViewNotes = can('canViewNotes');

    const [notes, setNotes] = useState<Note[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newNote, setNewNote] = useState({ note: '' });
    const [forceUpdate, setForceUpdate] = useState(0);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);

    useEffect(() => {
        setNotes(getNotes(decodedBuildingName));
    }, [decodedBuildingName, forceUpdate]);

    const handleAddNote = () => {
        if (!newNote.note.trim()) {
            alert(t('notesPage.fillAllFields'));
            return;
        }
        addNote({ building: decodedBuildingName, ...newNote });
        setIsModalOpen(false);
        setNewNote({ note: '' });
        setForceUpdate(f => f + 1);
    };

    const promptDelete = (note: Note) => {
        setNoteToDelete(note);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = () => {
        if (noteToDelete) {
            deleteNote(noteToDelete.id);
            setIsDeleteModalOpen(false);
            setNoteToDelete(null);
            setForceUpdate(f => f + 1);
        }
    };

    if (!canViewNotes || !canAccessBuilding(decodedBuildingName)) {
        return (
            <Layout>
                <Header title={`${t('notesPage.title')} - ${decodedBuildingName}`} showBackButton backTo={`/${buildingName}`} />
                <AccessDenied backTo={`/${buildingName}`} />
            </Layout>
        );
    }

    return (
        <Layout>
            <Header title={`${t('notesPage.title')} - ${decodedBuildingName}`} showBackButton backTo={`/${buildingName}`} />

            {isOwner && (
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mb-4">
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 active:scale-[0.98] transition-all w-full md:w-auto"
                    >
                        {t('notesPage.addNew')}
                    </button>
                </div>
            )}

            {notes.length > 0 ? (
                <>
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-4">
                        {notes.map((note) => (
                            <div key={note.id} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                                <p className="text-slate-900 dark:text-slate-200 whitespace-pre-wrap mb-3">{note.note}</p>
                                {isOwner && (
                                    <div className="text-left">
                                        <button onClick={() => promptDelete(note)} className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 px-3 py-1 rounded-md text-sm hover:bg-red-200 dark:hover:bg-red-900/80">{t('notesPage.delete')}</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-hidden bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-start">
                            <thead className="bg-slate-100 dark:bg-slate-700/50">
                                <tr>
                                    <th className="p-3 text-slate-900 dark:text-slate-200">{t('notesPage.note')}</th>
                                    {isOwner && <th className="p-3 w-32 text-slate-900 dark:text-slate-200">{t('notesPage.actions')}</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {notes.map((note) => (
                                    <tr key={note.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="p-3 whitespace-pre-wrap text-slate-900 dark:text-slate-200">{note.note}</td>
                                        {isOwner && (
                                            <td className="p-3">
                                                <button onClick={() => promptDelete(note)} className="text-red-600 dark:text-red-400 hover:underline">{t('notesPage.delete')}</button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            ) : (
                <div className="text-center py-12 px-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <p className="text-4xl mb-3">📝</p>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">{t('notesPage.noNotes')}</p>
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('notesPage.addModalTitle')}>
                <div className="space-y-4">
                    <div>
                        <label className="block mb-1">{t('notesPage.note')}</label>
                        <textarea value={newNote.note} onChange={e => setNewNote(p => ({ ...p, note: e.target.value }))} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" rows={4}></textarea>
                    </div>
                    <div className="flex justify-end gap-4">
                        <button onClick={() => setIsModalOpen(false)} className="bg-slate-300 dark:bg-slate-600 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-md">{t('notesPage.cancel')}</button>
                        <button onClick={handleAddNote} className="bg-blue-600 text-white px-4 py-2 rounded-md">{t('notesPage.add')}</button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title={t('notesPage.deleteModalTitle')}
            >
                <div className="space-y-4">
                    <p className="text-slate-700 dark:text-slate-300">
                        {t('notesPage.deleteModalMessage')}
                    </p>
                    {noteToDelete && (
                        <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded-md text-slate-900 dark:text-slate-200">
                            <p className="whitespace-pre-wrap">{noteToDelete.note}</p>
                        </div>
                    )}
                    <div className="flex justify-end gap-4">
                        <button
                            type="button"
                            onClick={() => setIsDeleteModalOpen(false)}
                            className="bg-slate-300 dark:bg-slate-600 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-md"
                        >
                            {t('notesPage.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmDelete}
                            className="bg-red-600 text-white px-4 py-2 rounded-md"
                        >
                            {t('notesPage.delete')}
                        </button>
                    </div>
                </div>
            </Modal>
        </Layout>
    );
};

export default NotesPage;