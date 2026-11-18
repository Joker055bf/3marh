// utils/ocrUtils.ts
import { createWorker } from 'tesseract.js';

// Convert Arabic-Indic numerals to standard Latin digits
export const normalizeArabicNumbers = (text: string): string => {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  
  let result = text;
  for (let i = 0; i < 10; i++) {
    result = result.replace(new RegExp(arabicDigits[i], 'g'), String(i));
    result = result.replace(new RegExp(persianDigits[i], 'g'), String(i));
  }
  return result;
};

// Resize and optimize image for OCR and local storage
export const preprocessImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1600;
        const MAX_HEIGHT = 1600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        // Draw image on canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Export high quality compressed JPEG
        const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.90);
        resolve(optimizedDataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

// Nationalities dictionary: English country/nationality to Arabic
const NATIONALITY_TRANSLATION_MAP: Record<string, string> = {
  // Common Asian nationalities
  'INDIA': 'هندي',
  'INDIAN': 'هندي',
  'PAKISTAN': 'باكستاني',
  'PAKISTANI': 'باكستاني',
  'BANGLADESH': 'بنجلاديشي',
  'BANGLADESHI': 'بنجلاديشي',
  'PHILIPPINES': 'فلبيني',
  'FILIPINO': 'فلبيني',
  'PHILIPPINE': 'فلبيني',
  'INDONESIA': 'إندونيسي',
  'INDONESIAN': 'إندونيسي',
  'NEPAL': 'نيبالي',
  'NEPALI': 'نيبالي',
  'NEPALESE': 'نيبالي',
  'SRI LANKA': 'سريلانكي',
  'SRI LANKAN': 'سريلانكي',
  'AFGHANISTAN': 'أفغاني',
  'AFGHAN': 'أفغاني',
  'MYANMAR': 'بورمي',
  'BURMESE': 'بورمي',

  // Arab nationalities
  'YEMEN': 'يمني',
  'YEMENI': 'يمني',
  'EGYPT': 'مصري',
  'EGYPTIAN': 'مصري',
  'SUDAN': 'سوداني',
  'SUDANESE': 'سوداني',
  'SYRIA': 'سوري',
  'SYRIAN': 'سوري',
  'JORDAN': 'أردني',
  'JORDANIAN': 'أردني',
  'PALESTINE': 'فلسطيني',
  'PALESTINIAN': 'فلسطيني',
  'LEBANON': 'لبناني',
  'LEBANESE': 'لبناني',
  'MOROCCO': 'مغربي',
  'MOROCCAN': 'مغربي',
  'TUNISIA': 'تونسي',
  'TUNISIAN': 'تونسي',
  'ALGERIA': 'جزائري',
  'ALGERIAN': 'جزائري',
  'IRAQ': 'عراقي',
  'IRAQI': 'عراقي',
  'SOMALIA': 'صومالي',
  'SOMALI': 'صومالي',
  'MAURITANIA': 'موريتاني',
  'MAURITANIAN': 'موريتاني',
  'SAUDI ARABIA': 'سعودي',
  'SAUDI': 'سعودي',
  'KUWAIT': 'كويتي',
  'KUWAITI': 'كويتي',
  'BAHRAIN': 'بحريني',
  'BAHRAINI': 'بحريني',
  'OMAN': 'عماني',
  'OMANI': 'عماني',
  'UNITED ARAB EMIRATES': 'إماراتي',
  'EMIRATES': 'إماراتي',
  'EMIRATI': 'إماراتي',
  'UAE': 'إماراتي',
  'QATAR': 'قطري',
  'QATARI': 'قطري',

  // African nationalities
  'ETHIOPIA': 'إثيوبي',
  'ETHIOPIAN': 'إثيوبي',
  'CHAD': 'تشادي',
  'CHADIAN': 'تشادي',
  'UGANDA': 'أوغندي',
  'UGANDAN': 'أوغندي',
  'KENYA': 'كيني',
  'KENYAN': 'كيني',
  'NIGERIA': 'نيجيري',
  'NIGERIAN': 'نيجيري',
  'GHANA': 'غاني',
  'GHANAIAN': 'غاني',
  'ERITREA': 'إريتري',
  'ERITREAN': 'إريتري',
  'MALI': 'مالي',
  'MALIAN': 'مالي',
  'NIGER': 'نيجري',
  'NIGERIEN': 'نيجري',

  // Other nationalities
  'TURKEY': 'تركي',
  'TURKISH': 'تركي',
  'UNITED KINGDOM': 'بريطاني',
  'BRITISH': 'بريطاني',
  'UNITED STATES': 'أمريكي',
  'AMERICAN': 'أمريكي',
  'CANADA': 'كندي',
  'CANADIAN': 'كندي',
};

const COMMON_ARABIC_NATIONALITIES = [
  'سعودي', 'سعودية', 'يمني', 'يمنية', 'مصري', 'مصرية', 'سوداني', 'سودانية', 
  'سوري', 'سورية', 'أردني', 'أردنية', 'فلسطيني', 'فلسطينية', 'لبناني', 'لبنانية', 
  'باكستاني', 'باكستانية', 'هندي', 'هندية', 'بنجلاديشي', 'بنجلاديشية', 'فلبيني', 'فلبينية', 
  'إندونيسي', 'إندونيسية', 'مغربي', 'مغربية', 'تونسي', 'تونسية', 'جزائري', 'جزائرية', 
  'إثيوبي', 'إثيوبية', 'تشادي', 'تشادية', 'أفغاني', 'أفغانية', 'نيبالي', 'نيبالية', 
  'سريلانكي', 'سريلانكية', 'أوغندي', 'أوغندية', 'كيني', 'كينية', 'نيجيري', 'نيجيرية',
  'غاني', 'غانية', 'تركي', 'تركية', 'صومالي', 'صومالية', 'إريتري', 'إريترية',
  'بورمي', 'بورمية', 'مالي', 'مالية', 'موريتاني', 'موريتانية', 'عراقي', 'عراقية',
  'كويتي', 'كويتية', 'بحريني', 'بحرينية', 'عماني', 'عمانية', 'إماراتي', 'إماراتية', 'قطري', 'قطرية'
];

const IGNORE_PATTERNS_ARABIC = [
  /المملكة/i,
  /العربية/i,
  /السعودية/i,
  /وزارة/i,
  /الداخلية/i,
  /الأحوال/i,
  /المدنية/i,
  /الهوية/i,
  /الوطنية/i,
  /الإقامة/i,
  /الاقامة/i,
  /مقيم/i,
  /بطاقة/i,
  /رخصة/i,
  /تاريخ/i,
  /الميلاد/i,
  /الانتهاء/i,
  /الإصدار/i,
  /الاصدار/i,
  /المهنة/i,
  /الديانة/i,
  /صاحب العمل/i,
  /مكان/i,
  /الرقم/i,
  /الجنسية/i,
  /الاسم/i,
  /الكامل/i,
  /الجوازات/i,
  /المديرية/i,
  /العامة/i,
  /منشأة/i,
  /المنشأة/i,
  /صلاحية/i,
];

const IGNORE_PATTERNS_ENGLISH = [
  /\bKINGDOM\b/i,
  /\bSAUDI\b/i,
  /\bARABIA\b/i,
  /\bMINISTRY\b/i,
  /\bINTERIOR\b/i,
  /\bIDENTITY\b/i,
  /\bRESIDENT\b/i,
  /\bRESIDENCY\b/i,
  /\bMUQEEM\b/i,
  /\bIQAMA\b/i,
  /\bPASSPORT\b/i,
  /\bPASSPORTS\b/i,
  /\bDIRECTORATE\b/i,
  /\bCIVIL\b/i,
  /\bAFFAIRS\b/i,
  /\bBIRTH\b/i,
  /\bEXPIRY\b/i,
  /\bEXPIRATION\b/i,
  /\bISSUE\b/i,
  /\bOCCUPATION\b/i,
  /\bEMPLOYER\b/i,
  /\bSPONSOR\b/i,
  /\bNATIONALITY\b/i,
  /\bNAME\b/i,
  /\bNUMBER\b/i,
  /\bCARD\b/i,
  /\bDATE\b/i,
  /\bSEX\b/i,
  /\bRELIGION\b/i,
  /\bESTABLISHMENT\b/i,
  /\bVERSION\b/i,
];

export interface ExtractedTenantInfo {
  name?: string;
  nationality?: string;
  idNumber?: string;
  rawText: string;
}

// Clean and format English names to Title Case
const formatEnglishName = (name: string): string => {
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

export const extractIdDataFromImage = async (
  imageData: string,
  onProgress?: (progress: number) => void
): Promise<ExtractedTenantInfo> => {
  let worker = null;
  try {
    worker = await createWorker('ara+eng');
    
    // Set parameters for better line/word segmentation on ID cards
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: '3' as any,
      });
    } catch (_) {
      // Ignore if setParameters fails on some environments
    }

    const ret = await worker.recognize(imageData);
    const rawText = ret.data.text || '';
    const normalizedText = normalizeArabicNumbers(rawText);

    let idNumber: string | undefined;
    let nationality: string | undefined;
    let name: string | undefined;

    // -------------------------------------------------------------
    // 1. EXTRACT 10-DIGIT ID / IQAMA NUMBER
    // -------------------------------------------------------------
    // In Saudi Arabia:
    // Iqama starts with 2 (e.g. 2xxxxxxxxx)
    // National ID starts with 1 (e.g. 1xxxxxxxxx)
    // Border number starts with 3 or 4

    // Check for separated digits (e.g. 2 4 5 1 2 3 4 5 6 7)
    const collapsedSpacesText = normalizedText.replace(/(\d)\s+(\d)/g, '$1$2').replace(/(\d)\s+(\d)/g, '$1$2');

    // Priority 1: Match 10 digits starting with 2 (Iqama) or 1 (National ID)
    const primaryMatches = collapsedSpacesText.match(/\b([12]\d{9})\b/g) || normalizedText.match(/\b([12]\d{9})\b/g);
    if (primaryMatches && primaryMatches.length > 0) {
      // If multiple, prefer one starting with 2 for resident cards, or the first one found
      const iqamaMatch = primaryMatches.find(m => m.startsWith('2'));
      idNumber = iqamaMatch || primaryMatches[0];
    } else {
      // Priority 2: Look around keywords for Iqama / ID
      const keywordRegex = /(?:الإقامة|الاقامة|هوية\s*مقيم|مقيم|Iqama|Residency|Identity|ID)[\s:]*([0-9\s]{10,15})/i;
      const kwMatch = normalizedText.match(keywordRegex);
      if (kwMatch && kwMatch[1]) {
        const digitsOnly = kwMatch[1].replace(/\D/g, '');
        if (digitsOnly.length >= 10) {
          idNumber = digitsOnly.slice(0, 10);
        }
      }
      
      // Priority 3: Relaxed search for any 10 consecutive digits
      if (!idNumber) {
        const any10 = collapsedSpacesText.match(/\b(\d{10})\b/) || normalizedText.match(/\b(\d{10})\b/);
        if (any10) {
          idNumber = any10[1];
        }
      }
    }

    // -------------------------------------------------------------
    // 2. EXTRACT NATIONALITY (Arabic first, English if no Arabic)
    // -------------------------------------------------------------
    // If Saudi ID (starts with 1), nationality is Saudi
    if (idNumber && idNumber.startsWith('1')) {
      nationality = 'سعودي';
    } else {
      // Check after "الجنسية" keyword in Arabic
      const arNatRegex = /الجنسية\s*[:\s-]?\s*([^\n\r,./;]+)/i;
      const arMatch = normalizedText.match(arNatRegex);
      if (arMatch && arMatch[1]) {
        const potential = arMatch[1].trim();
        for (const nat of COMMON_ARABIC_NATIONALITIES) {
          if (potential.includes(nat)) {
            nationality = nat;
            break;
          }
        }
        if (!nationality) {
          // Check if it's an English nationality written after "الجنسية" or "الجنسية / Nationality"
          const upperPotential = potential.toUpperCase();
          for (const [enKey, arVal] of Object.entries(NATIONALITY_TRANSLATION_MAP)) {
            if (upperPotential.includes(enKey)) {
              nationality = arVal;
              break;
            }
          }
        }
      }

      // Check after "Nationality" keyword in English
      if (!nationality) {
        const enNatRegex = /Nationality\s*[:\s-]?\s*([^\n\r,./;]+)/i;
        const enMatch = normalizedText.match(enNatRegex);
        if (enMatch && enMatch[1]) {
          const upperPotential = enMatch[1].trim().toUpperCase();
          for (const [enKey, arVal] of Object.entries(NATIONALITY_TRANSLATION_MAP)) {
            if (upperPotential.includes(enKey)) {
              nationality = arVal;
              break;
            }
          }
          // If not translated to Arabic, keep the cleaned English word
          if (!nationality) {
            const cleanEn = enMatch[1].replace(/[^A-Za-z\s]/g, '').trim();
            if (cleanEn.length >= 3 && cleanEn.length <= 25) {
              nationality = formatEnglishName(cleanEn);
            }
          }
        }
      }

      // Search anywhere in text for common Arabic nationalities
      if (!nationality) {
        for (const nat of COMMON_ARABIC_NATIONALITIES) {
          // Use word boundary for short Arabic words
          const regex = new RegExp(`(^|\\s)${nat}(\\s|$)`);
          if (regex.test(normalizedText)) {
            nationality = nat;
            break;
          }
        }
      }

      // Search anywhere in text for English nationalities (translate to Arabic)
      if (!nationality) {
        const upperText = normalizedText.toUpperCase();
        for (const [enKey, arVal] of Object.entries(NATIONALITY_TRANSLATION_MAP)) {
          const regex = new RegExp(`\\b${enKey}\\b`, 'i');
          if (regex.test(upperText)) {
            nationality = arVal;
            break;
          }
        }
      }
    }

    // -------------------------------------------------------------
    // 3. EXTRACT NAME (Arabic first, English if no Arabic)
    // -------------------------------------------------------------
    const lines = normalizedText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // Step 3A: Search for ARABIC Name
    // Pattern 1: Look for "الاسم" or "الاسم الكامل" or "اسم المقيم" line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/الاسم|الاسم الكامل|اسم المقيم|اسم صاحب الهوية/i.test(line)) {
        let cleanName = line
          .replace(/الاسم\s*الكامل|الاسم|اسم\s*المقيم|اسم\s*صاحب\s*الهوية/gi, '')
          .replace(/[:\-–—/]/g, '')
          .trim();
        // Remove non-Arabic or punctuation noise
        const arOnly = cleanName.replace(/[^\u0600-\u06FF\s]/g, '').trim();
        const words = arOnly.split(/\s+/).filter(w => w.length > 1);
        if (words.length >= 2) {
          name = words.join(' ');
          break;
        } else if (i + 1 < lines.length) {
          // Check if the Arabic name is on the next line
          const nextLineAr = lines[i + 1].replace(/[^\u0600-\u06FF\s]/g, '').trim();
          const nextWords = nextLineAr.split(/\s+/).filter(w => w.length > 1);
          if (nextWords.length >= 2 && !IGNORE_PATTERNS_ARABIC.some(pat => pat.test(nextLineAr))) {
            name = nextWords.join(' ');
            break;
          }
        }
      }
    }

    // Pattern 2: Fallback scan for candidate Arabic name lines with 2-5 words
    if (!name) {
      for (const line of lines) {
        const arOnly = line.replace(/[^\u0600-\u06FF\s]/g, '').trim();
        const words = arOnly.split(/\s+/).filter(w => w.length > 1);
        if (words.length >= 2 && words.length <= 5) {
          const isIgnored = IGNORE_PATTERNS_ARABIC.some(pat => pat.test(arOnly));
          if (!isIgnored) {
            name = words.join(' ');
            break;
          }
        }
      }
    }

    // Step 3B: If NO Arabic name found -> Search for ENGLISH Name
    // (User requirement: "ابغى يعرف كل الاقامات الليتي يراها بلعربي اذا مافي عربي بلانجليزي")
    if (!name) {
      // Look for lines after "Name" or lines containing "Name:"
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\bName\b/i.test(line)) {
          let cleanEn = line
            .replace(/\bName\b/gi, '')
            .replace(/[:\-–—/]/g, '')
            .trim();
          // Remove non-Latin characters
          cleanEn = cleanEn.replace(/[^A-Za-z\s]/g, '').trim();
          const words = cleanEn.split(/\s+/).filter(w => w.length > 1);
          if (words.length >= 2) {
            const isIgnored = IGNORE_PATTERNS_ENGLISH.some(pat => pat.test(cleanEn));
            if (!isIgnored) {
              name = formatEnglishName(words.join(' '));
              break;
            }
          } else if (i + 1 < lines.length) {
            // Check next line for English name
            const nextLineEn = lines[i + 1].replace(/[^A-Za-z\s]/g, '').trim();
            const nextWords = nextLineEn.split(/\s+/).filter(w => w.length > 1);
            if (nextWords.length >= 2) {
              const isIgnored = IGNORE_PATTERNS_ENGLISH.some(pat => pat.test(nextLineEn));
              if (!isIgnored) {
                name = formatEnglishName(nextWords.join(' '));
                break;
              }
            }
          }
        }
      }

      // Fallback: scan lines for 2 to 5 Latin words that don't match ignore words
      if (!name) {
        for (const line of lines) {
          const latinOnly = line.replace(/[^A-Za-z\s]/g, '').trim();
          const words = latinOnly.split(/\s+/).filter(w => w.length > 1);
          if (words.length >= 2 && words.length <= 5) {
            const isIgnored = IGNORE_PATTERNS_ENGLISH.some(pat => pat.test(latinOnly));
            if (!isIgnored) {
              name = formatEnglishName(words.join(' '));
              break;
            }
          }
        }
      }
    }

    await worker.terminate();

    return {
      name,
      nationality,
      idNumber,
      rawText,
    };
  } catch (error) {
    console.error('OCR Processing error:', error);
    if (worker) {
      try {
        await worker.terminate();
      } catch (_) {}
    }
    return {
      rawText: '',
    };
  }
};

// Re-encode an image data URL at a smaller size for storage (OCR still uses the full-size image).
export const shrinkDataUrl = (dataUrl: string, maxSide: number, quality: number): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};
