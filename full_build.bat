@echo off
echo ===========================================
echo 1. Creating Icons
echo ===========================================
node do_icon.js

echo ===========================================
echo 2. Building Website Assets
echo ===========================================
call npm run build

echo ===========================================
echo 3. Syncing with Android
echo ===========================================
call npx cap sync android

echo ===========================================
echo 4. Compiling APK
echo ===========================================
call build_apk.bat

echo ===========================================
echo ALL DONE!
echo ===========================================
pause
