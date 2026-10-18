; Grok Build Web NSIS installer. Version and paths come from the command line:
;   makensis /DVERSION=0.3.0 /DSTAGE=...\release\win-unpacked /DOUT=...\release installer.nsi

!include "MUI2.nsh"

!ifndef VERSION
  !error "pass /DVERSION=x.y.z"
!endif
!ifndef STAGE
  !error "pass /DSTAGE=path to win-unpacked"
!endif
!ifndef OUT
  !define OUT "."
!endif

Name "Grok Build"
OutFile "${OUT}\Grok-Build-Setup-${VERSION}.exe"
Unicode True
InstallDir "$LOCALAPPDATA\Programs\Grok Build"
InstallDirRegKey HKCU "Software\Grok Build Web" "InstallDir"
RequestExecutionLevel user

!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "${STAGE}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Grok Build Web" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Grok Build Web" "Version" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Grok Build Web" "DisplayName" "Grok Build"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Grok Build Web" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Grok Build Web" "Publisher" "qing-2114"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Grok Build Web" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Grok Build Web" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Grok Build Web" "NoRepair" 1
  CreateShortcut "$SMPROGRAMS\Grok Build.lnk" "$INSTDIR\node\node.exe" '"$INSTDIR\launch.cjs"' "$INSTDIR\icon.ico"
  CreateShortcut "$DESKTOP\Grok Build.lnk" "$INSTDIR\node\node.exe" '"$INSTDIR\launch.cjs"' "$INSTDIR\icon.ico"
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\Grok Build.lnk"
  Delete "$DESKTOP\Grok Build.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Grok Build Web"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Grok Build Web"
SectionEnd
