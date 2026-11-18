# خطوات تفعيل الحماية الجديدة

هذه الخطوات تنقل الحسابات إلى Firebase Authentication وتقفل قاعدة البيانات.
**نفّذها بالترتيب** — لو نشرت الموقع الجديد قبل الخطوة 3، لن يستطيع أحد تسجيل الدخول.

كل مستخدم يحتفظ باسم المستخدم وكلمة المرور نفسها، ولن يلاحظ أي فرق عند الدخول.

---

## 1. فعّل تسجيل الدخول بالبريد وكلمة المرور (مرة واحدة)

1. افتح [Firebase Console](https://console.firebase.google.com) ← مشروع **marh-6ccfc**.
2. **Authentication** ← **Get started** (إذا ظهر) ← تبويب **Sign-in method**.
3. اختر **Email/Password** ← فعّل الخيار الأول ← **Save**.
4. (اختياري) **Authentication ← Templates ← Password reset**: غيّر اللغة إلى العربية.

## 2. نزّل مفتاح الخدمة (Service account key)

1. ⚙️ **Project settings** ← تبويب **Service accounts** ← **Generate new private key**.
2. احفظ الملف **خارج مجلد المشروع**، مثلاً: `C:\Users\baslo\firebase-key.json`
3. ⚠️ هذا الملف يعطي تحكماً كاملاً في المشروع: لا ترسله لأحد ولا ترفعه على GitHub.
   (المشروع يتجاهل هذه الملفات تلقائياً، لكن الأفضل إبقاؤه خارج المجلد.)

## 3. انقل الحسابات (مع إبقاء النظام القديم شغالاً مؤقتاً)

من مجلد المشروع:

```bash
node scripts/migrate-accounts.mjs --key C:/Users/baslo/firebase-key.json
```

هذا **تجربة فقط** ولا يغيّر شيئاً — يعرض قائمة الحسابات التي سيتم إنشاؤها وأي ملاحظات.
إذا كانت القائمة صحيحة:

```bash
node scripts/migrate-accounts.mjs --key C:/Users/baslo/firebase-key.json --apply --keep-legacy
```

`--keep-legacy` يبقي القائمة القديمة مؤقتاً حتى لا يتعطل الموقع الحالي قبل نشر الجديد.

## 4. جرّب ثم انشر الموقع الجديد

قبل النشر، شغّل النسخة الجديدة على جهازك وسجّل دخولك بحسابك الحقيقي:

```bash
npm run dev
```

افتح `http://localhost:3000/3marh/` وسجّل الدخول. إذا نجح الدخول وظهرت بياناتك، انشر:

```bash
npm run deploy
```

إذا فشل الدخول: لا تنشر، الموقع الحالي ما زال يعمل كالمعتاد — أرسل لي رسالة الخطأ.

## 5. اقفل قاعدة البيانات

```bash
npx firebase login
```

```bash
npm run deploy:rules
```

من هذه اللحظة لا يمكن لأحد قراءة بيانات مالك آخر، والقائمة القديمة مقفلة.

## 6. احذف كلمات المرور القديمة نهائياً

```bash
node scripts/migrate-accounts.mjs --key C:/Users/baslo/firebase-key.json --apply
```

يحذف قائمة كلمات المرور القديمة وكلمات المرور المخزنة في بيانات الملاك.
(لو سجّل أحد حساباً جديداً في الموقع القديم بين الخطوتين 3 و 4، سيتم نقله هنا أيضاً.)

## 7. تطبيق الأندرويد

النسخ القديمة من التطبيق ستتوقف عن المزامنة بعد الخطوة 5. ابنِ نسخة جديدة ووزّعها:

```bash
npm run build
```

```bash
npx cap sync android
```

ثم ابنِ الـ APK كالمعتاد (`build_apk.bat`).

---

## بعد التفعيل

- **نسيت كلمة المرور (مالك عنده بريد):** من شاشة الدخول ← "نسيت كلمة المرور؟" ← يصله رابط من Firebase.
- **نسيت كلمة المرور (حساب بدون بريد):** أنت تعيّنها له:
  ```bash
  node scripts/reset-password.mjs --key C:/Users/baslo/firebase-key.json --username اسم_المستخدم --password كلمة_جديدة
  ```
- **العامل نسي كلمة المرور:** المالك يدخل "إدارة العمال" ← تعديل ← كلمة مرور جديدة.
- **كلمات المرور الجديدة** يجب أن تكون 6 خانات على الأقل (شرط Firebase). القديمة الأقصر تبقى تعمل.
- **إضافة بريد لحساب قديم:** الإعدادات ← البريد الإلكتروني ← يصله رابط تأكيد، وبعدها يقدر يستخدم "نسيت كلمة المرور".

## اختبار محلي (بدون لمس البيانات الحقيقية)

```bash
npm run emulators
```

وفي نافذة ثانية:

```bash
node scripts/emulator/seed-legacy.mjs
```

```bash
node scripts/migrate-accounts.mjs --emulator --apply
```

```bash
node scripts/emulator/test-security.mjs
```

```bash
npm run dev:emulator
```

يحتاج المحاكي Java 17 (موجود في مجلد `jdk-17.0.17+10`؛ عرّف `JAVA_HOME` عليه).
