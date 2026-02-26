@REM Maven Wrapper startup batch script
@echo off
setlocal

set MAVEN_PROJECTBASEDIR=%~dp0
set MAVEN_WRAPPERJAR=%MAVEN_PROJECTBASEDIR%.mvn\wrapper\maven-wrapper.jar

@REM Find java.exe
if defined JAVA_HOME goto findJavaFromJavaHome

set JAVACMD=java.exe
goto checkJar

:findJavaFromJavaHome
set JAVACMD=%JAVA_HOME%\bin\java.exe

:checkJar
if exist "%MAVEN_WRAPPERJAR%" goto runWrapper

@REM Download wrapper if not present
curl -sL -o "%MAVEN_WRAPPERJAR%" "https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.3.2/maven-wrapper-3.3.2.jar"

:runWrapper
"%JAVACMD%" %MAVEN_OPTS% "-Dmaven.multiModuleProjectDirectory=%MAVEN_PROJECTBASEDIR%" -classpath "%MAVEN_WRAPPERJAR%" org.apache.maven.wrapper.MavenWrapperMain %*

endlocal
