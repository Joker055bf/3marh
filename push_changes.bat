@echo off
echo ====================================================
echo  Property Tracking - Syncing Changes to GitHub
echo ====================================================
echo.
echo 1. Staging files...
git add .
echo.
echo 2. Committing changes locally...
git commit -m "Fix white screen, dynamic route basename, and SW cache optimize"
echo.
echo 3. Pushing to GitHub (Origin)...
echo (If prompted for username/password, please complete it in this window)
git push
echo.
echo ====================================================
echo  SYNC COMPLETED!
echo ====================================================
pause
