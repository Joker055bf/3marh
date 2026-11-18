import React from 'react';
import { useTranslation } from '../hooks/useTranslation';

interface UnitSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    availableUnits: string[];
    selectedUnit: string;
    onSelect: (unit: string) => void;
    title: string;
}

const UnitSelectionModal: React.FC<UnitSelectionModalProps> = ({
    isOpen,
    onClose,
    availableUnits,
    selectedUnit,
    onSelect,
    title,
}) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
            <div
                className="bg-[#333333] text-white w-full max-w-[300px] rounded-lg shadow-xl overflow-hidden animate-scale-up"
                role="dialog"
                aria-modal="true"
            >
                {/* Header */}
                <div className="p-4 border-b border-gray-600">
                    <h3 className="text-lg font-medium text-center">{title}</h3>
                </div>

                {/* List */}
                <div className="max-h-[60vh] overflow-y-auto">
                    {availableUnits.map((unit) => (
                        <label
                            key={unit}
                            className="flex items-center justify-between px-4 py-3 border-b border-gray-600 hover:bg-gray-700 cursor-pointer last:border-0"
                            onClick={() => {
                                onSelect(unit);
                                onClose();
                            }}
                        >
                            <span className="text-lg">{unit}</span>
                            <div className="relative flex items-center">
                                <input
                                    type="radio"
                                    name="unit_selection"
                                    checked={selectedUnit === unit}
                                    onChange={() => { }} // Handled by label click
                                    className="peer h-5 w-5 appearance-none rounded-full border-2 border-gray-400 bg-transparent checked:border-[#4FD1C5] checked:bg-transparent"
                                />
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center peer-checked:after:block peer-checked:after:h-2.5 peer-checked:after:w-2.5 peer-checked:after:rounded-full peer-checked:after:bg-[#4FD1C5]"></div>
                            </div>

                        </label>
                    ))}
                    {availableUnits.length === 0 && (
                        <div className="p-4 text-center text-gray-400">
                            {t('buildingPage.noAvailableUnits')}
                        </div>
                    )}
                </div>

                {/* Footer (Cancel) - Optional, mimicking Android dialog behavior typically allows click-outside or specific cancel, 
                   but usually selecting an item closes it. I'll add a cancel anyway or rely on click-outside wrapper?
                   I'll add a click handling on the wrapper to close.
                */}
            </div>
            {/* Overlay click to close */}
            <div className="fixed inset-0 -z-10" onClick={onClose}></div>
        </div>
    );
};

export default UnitSelectionModal;
