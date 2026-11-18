// utils/dateUtils.ts

/**
 * Checks if a value is a valid date string in 'YYYY-MM-DD' format.
 * @param dateString The value to validate.
 * @returns True if the value is a valid date string, false otherwise.
 */
export const isValidDateString = (dateString: any): dateString is string => {
    return typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString);
};

/**
 * Safely parses a date string into a UTC Date object.
 * Returns null if the date is invalid.
 * @param dateString The date string to parse.
 * @returns A Date object (in UTC) or null.
 */
export const parseDate = (dateString: any): Date | null => {
    if (!isValidDateString(dateString)) {
        return null;
    }
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    
    // Final check to ensure date is not something like 2023-02-30, which JS would otherwise roll over.
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
        return date;
    }
    return null;
};

/**
 * Formats a Date object or a valid date string into 'D-M-YYYY' for display.
 * @param date The date to format.
 * @param fallback The string to return if the date is invalid.
 * @returns The formatted date string or the fallback.
 */
export const formatDateForDisplay = (date: Date | string | null | undefined, fallback: string = '', separator: string = '-'): string => {
    // Normalise local Date objects (e.g. `new Date()`) to their local calendar day first.
    let dateObj = (date instanceof Date) ? parseDate(formatDateForInput(date)) : parseDate(date);

    if (dateObj && !isNaN(dateObj.getTime())) {
        const day = dateObj.getUTCDate();
        const month = dateObj.getUTCMonth() + 1;
        const year = dateObj.getUTCFullYear();
        return [day, month, year].join(separator);
    }
    return fallback;
};

/**
 * Formats a Date object or a valid date string into 'DD/MM/YYYY' for padded display (e.g., in inputs).
 * @param date The date to format.
 * @param fallback The string to return if the date is invalid.
 * @returns The formatted date string or the fallback.
 */
export const formatDateForDisplayPadded = (date: Date | string | null | undefined, fallback: string = '', separator: string = '/'): string => {
    // Normalise local Date objects (e.g. `new Date()`) to their local calendar day first.
    let dateObj = (date instanceof Date) ? parseDate(formatDateForInput(date)) : parseDate(date);

    if (dateObj && !isNaN(dateObj.getTime())) {
        const day = String(dateObj.getUTCDate()).padStart(2, '0');
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const year = dateObj.getUTCFullYear();
        return [day, month, year].join(separator);
    }
    return fallback;
};

/**
 * Formats a Date object or a valid date string into 'YYYY-MM-DD' for HTML date inputs.
 * @param date The date to format.
 * @param fallback The string to return if the date is invalid.
 * @returns The formatted date string or the fallback.
 */
export const formatDateForInput = (date: Date | string | null | undefined, fallback: string = ''): string => {
    let dateObj = (date instanceof Date) ? date : parseDate(date);
    
    if (dateObj && !isNaN(dateObj.getTime())) {
        // Dates from parseDate()/calculateEndDate() sit at UTC midnight: read their UTC parts.
        // Any other Date (e.g. `new Date()`) is a moment in local time: read the local calendar day,
        // otherwise between 00:00 and 03:00 in Saudi time it would return yesterday.
        const isUtcMidnight = dateObj.getUTCHours() === 0 && dateObj.getUTCMinutes() === 0
            && dateObj.getUTCSeconds() === 0 && dateObj.getUTCMilliseconds() === 0;
        if (isUtcMidnight) return dateObj.toISOString().split('T')[0];
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    
    return fallback;
};

/**
 * Today's local calendar date as a UTC-midnight Date, so it compares correctly
 * with dates returned by parseDate().
 */
export const getTodayUtc = (): Date => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};


/**
 * Calculates the contract end date by adding months or years to the start date and subtracting one day.
 * Correctly handles fractional years produced by contract terminations and monthly contracts.
 * @param startDate The start date string 'YYYY-MM-DD'.
 * @param duration The duration in months or years.
 * @param durationUnit Either 'months' or 'years' (defaults to 'years').
 * @returns The end date string 'YYYY-MM-DD' or an empty string if inputs are invalid.
 */
export const calculateEndDate = (startDate: string, duration: number, durationUnit: 'months' | 'years' = 'years'): string => {
    const start = parseDate(startDate);
    if (!start || typeof duration !== 'number' || !isFinite(duration) || duration <= 0) {
        return '';
    }
    
    const endDate = new Date(start.getTime());

    if (durationUnit === 'months') {
        const months = Math.round(duration);
        endDate.setUTCMonth(endDate.getUTCMonth() + months);
        endDate.setUTCDate(endDate.getUTCDate() - 1);
        return formatDateForInput(endDate);
    }
    
    const years = Math.floor(duration);
    const fractionalYear = duration - years;
    const days = Math.round(fractionalYear * 365.25);

    endDate.setUTCFullYear(endDate.getUTCFullYear() + years);
    endDate.setUTCDate(endDate.getUTCDate() + days - 1); // Subtract 1 day at the very end of the calculation
    
    return formatDateForInput(endDate);
};

/**
 * Calculates the duration in years between two dates.
 * @param startDate The start date string 'YYYY-MM-DD'.
 * @param endDate The end date string 'YYYY-MM-DD'.
 * @returns The duration in years as a number.
 */
export const calculateDurationInYears = (startDate: string, endDate: string): number => {
    const start = parseDate(startDate);
    const end = parseDate(endDate);

    if (!start || !end || end < start) {
        return 0;
    }
    
    // Add 1 day to the end date to make the duration inclusive
    const inclusiveEnd = new Date(end.getTime());
    inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1);

    const diffInMs = inclusiveEnd.getTime() - start.getTime();
    const years = diffInMs / (1000 * 60 * 60 * 24 * 365.25); // Account for leap years on average
    return parseFloat(years.toFixed(4)); // Return with some precision
};
/**
 * Same as formatDateForDisplay, but safe to place next to Arabic text.
 * Without the leading LRM mark, the browser's RTL layout reverses the
 * parts ("1-1-2026" shows as "2026-1-1"). Use in UI only, not in jsPDF output.
 */
export const formatDateForUi = (date: Date | string | null | undefined, fallback: string = '', separator: string = '-'): string => {
    const s = formatDateForDisplay(date, fallback, separator);
    return s ? '\u200E' + s : s;
};
