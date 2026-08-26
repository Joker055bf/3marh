@echo off
echo =========================================== > build_log.txt
echo 1. Creating Icons >> build_log.txt 2>&1
echo =========================================== >> build_log.txt
powershell.exe -ExecutionPolicy Bypass -File .\update_all_icons.ps1 >> build_log.txt 2>&1

echo =========================================== >> build_log.txt
echo 2. Building Website Assets >> build_log.txt 2>&1
echo =========================================== >> build_log.txt
call npm run build >> build_log.txt 2>&1

echo =========================================== >> build_log.txt
echo 3. Syncing with Android >> build_log.txt 2>&1
echo =========================================== >> build_log.txt
call npx cap sync android >> build_log.txt 2>&1

echo =========================================== >> build_log.txt
echo 4. Compiling APK >> build_log.txt 2>&1
echo =========================================== >> build_log.txt
call build_apk.bat >> build_log.txt 2>&1

echo =========================================== >> build_log.txt
echo DONE >> build_log.txt 2>&1
echo =========================================== >> build_log.txt

start notepad build_log.txt
