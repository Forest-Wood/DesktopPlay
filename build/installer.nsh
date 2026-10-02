; Keep shared user data. Remove only a startup command pointing at this install.
!macro updateLegacyStartup NAME
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${NAME}"
  ${if} $R0 == '"$INSTDIR\DesktopPlay.exe"'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${NAME}" '"$INSTDIR\DesktopPet.exe"'
  ${endif}
!macroend

!macro customInstall
  ; Repair even when the user unchecks 'run after install'. Preserve approval state.
  !insertmacro updateLegacyStartup "electron.app.DesktopPlay"
  !insertmacro updateLegacyStartup "io.github.forestwood.desktopplay"
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.DesktopPlay"
    ${if} $R0 == '"$INSTDIR\DesktopPet.exe"'
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.DesktopPlay"
    ${endif}
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "io.github.forestwood.desktopplay"
    ${if} $R0 == '"$INSTDIR\DesktopPet.exe"'
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "io.github.forestwood.desktopplay"
    ${endif}
  ${endif}
!macroend
