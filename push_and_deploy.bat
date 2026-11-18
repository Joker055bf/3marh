@echo off
echo ====================================================
echo  Building, Pushing to GitHub, and Deploying
echo ====================================================
echo.
echo 1. Building React app...
call npm run build
echo.
echo 2. Staging files...
git add .
echo.
echo 3. Committing changes locally...
git commit -m "Fix white screen, dynamic route basename, and SW cache optimize"
echo.
echo 4. Pushing source code to GitHub...
call git push
echo.
echo 5. Deploying compiled assets to GitHub Pages (gh-pages branch)...
call npm run deploy
echo.
echo ====================================================
echo  ALL DONE!
echo ====================================================
pause
