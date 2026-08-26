@echo off
set "JAVA_HOME=%~dp0jdk-17.0.17+10"
set "PATH=%JAVA_HOME%\bin;%PATH%"
echo JAVA_HOME is %JAVA_HOME%
java -version
cd android
call gradlew clean assembleDebug --info
