@ECHO OFF
set SPHINXBUILD=sphinx-build
set SOURCEDIR=source
set BUILDDIR=build

if "%1" == "" goto help

%SPHINXBUILD% -M %1 %SOURCEDIR% %BUILDDIR%
goto end

:help
echo.Usage:
echo.  make.bat html

echo.Example:
echo.  python -m sphinx -M html docs/source docs/build

:end
