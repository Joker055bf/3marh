import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { cleanFlatNo } from '../services/dbService';
import { WorkerPermissions } from '../types';

export type PermissionKey = keyof Omit<WorkerPermissions, 'allowedBuildings' | 'allowedUnits'>;

export const usePermissions = () => {
    const { user } = useAuth();
    const isOwner = user?.role === 'owner';

    return useMemo(() => {
        // Owners have every permission. Workers use their saved flag, or `defaultWhenUnset`
        // when the flag was never stored (older accounts predate some permissions).
        const can = (key: PermissionKey, defaultWhenUnset = false): boolean => {
            if (isOwner) return true;
            if (user?.role !== 'worker') return defaultWhenUnset;
            const value = user.permissions?.[key];
            return value === undefined ? defaultWhenUnset : !!value;
        };

        const allowedBuildings = user?.permissions?.allowedBuildings;
        const buildingRestrictionActive = user?.role === 'worker'
            && Array.isArray(allowedBuildings)
            && allowedBuildings.length > 0;

        const canAccessBuilding = (buildingName?: string): boolean => {
            if (isOwner || !buildingName) return true;
            if (!buildingRestrictionActive) return true;
            return allowedBuildings!.includes(buildingName);
        };

        const canAccessUnit = (buildingName: string | undefined, flatNo?: string): boolean => {
            if (isOwner || !flatNo) return true;
            if (!canAccessBuilding(buildingName)) return false;
            const allowedUnits = user?.permissions?.allowedUnits?.[buildingName || ''];
            if (!Array.isArray(allowedUnits) || allowedUnits.length === 0) return true;
            const clean = cleanFlatNo(flatNo);
            return allowedUnits.some(u => cleanFlatNo(u) === clean);
        };

        return { user, isOwner, can, canAccessBuilding, canAccessUnit };
    }, [user, isOwner]);
};
