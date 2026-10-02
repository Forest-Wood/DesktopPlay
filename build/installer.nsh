; Keep shared user data. Remove only a startup command pointing at this install.
; Never kill a process by filename: another installation may use the same name.
!macro customCheckAppRunning
  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("DESKTOPPET_UNINSTALL_DIRECTORY", "$INSTDIR").r0'
  nsExec::Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -EncodedCommand JABFAHIAcgBvAHIAQQBjAHQAaQBvAG4AUAByAGUAZgBlAHIAZQBuAGMAZQA9ACIAUwB0AG8AcAAiADsAIAB0AHIAeQAgAHsAIAAkAHIAbwBvAHQAPQBbAEkATwAuAFAAYQB0AGgAXQA6ADoARwBlAHQARgB1AGwAbABQAGEAdABoACgAJABlAG4AdgA6AEQARQBTAEsAVABPAFAAUABFAFQAXwBVAE4ASQBOAFMAVABBAEwATABfAEQASQBSAEUAQwBUAE8AUgBZACkALgBUAHIAaQBtAEUAbgBkACgAWwBJAE8ALgBQAGEAdABoAF0AOgA6AEQAaQByAGUAYwB0AG8AcgB5AFMAZQBwAGEAcgBhAHQAbwByAEMAaABhAHIAKQArAFsASQBPAC4AUABhAHQAaABdADoAOgBEAGkAcgBlAGMAdABvAHIAeQBTAGUAcABhAHIAYQB0AG8AcgBDAGgAYQByADsAIAAkAGIAdQBzAHkAPQBAACgARwBlAHQALQBDAGkAbQBJAG4AcwB0AGEAbgBjAGUAIABXAGkAbgAzADIAXwBQAHIAbwBjAGUAcwBzACAAfAAgAFcAaABlAHIAZQAtAE8AYgBqAGUAYwB0ACAAewAgACQAXwAuAEUAeABlAGMAdQB0AGEAYgBsAGUAUABhAHQAaAAgAC0AYQBuAGQAIAAkAF8ALgBFAHgAZQBjAHUAdABhAGIAbABlAFAAYQB0AGgALgBTAHQAYQByAHQAcwBXAGkAdABoACgAJAByAG8AbwB0ACwAWwBTAHQAcgBpAG4AZwBDAG8AbQBwAGEAcgBpAHMAbwBuAF0AOgA6AE8AcgBkAGkAbgBhAGwASQBnAG4AbwByAGUAQwBhAHMAZQApACAAfQApADsAIABpAGYAKAAkAGIAdQBzAHkALgBDAG8AdQBuAHQAIAAtAGcAdAAgADAAKQB7AGUAeABpAHQAIAAxAH0AOwAgAGUAeABpAHQAIAAwACAAfQAgAGMAYQB0AGMAaAAgAHsAIABlAHgAaQB0ACAAMgAgAH0A'
  Pop $R0
  ${if} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Please close DesktopPet in this installation before continuing. No running process was stopped." /SD IDOK
    SetErrorLevel 1
    Quit
  ${endif}
!macroend

!macro customUnInit
  ; /D supplied by the in-app helper pins this installation. Do not unregister
  ; another install sharing the appId when a stale copy is being uninstalled.
  ReadRegStr $R0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $R0 != $INSTDIR
    MessageBox MB_OK|MB_ICONEXCLAMATION "This installation does not match the registered DesktopPet installation. Nothing was uninstalled." /SD IDOK
    SetErrorLevel 1
    Quit
  ${endif}
!macroend

!macro updateLegacyStartup NAME
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${NAME}"
  ${if} $R0 == '"$INSTDIR\DesktopPlay.exe"'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${NAME}" '"$INSTDIR\DesktopPet.exe"'
  ${endif}
!macroend

; Only an actual completed uninstall can authorize the separate helper to
; clear the shared DesktopPlay data. Upgrades never create this receipt.
!macro customHeader
!ifdef BUILD_UNINSTALLER
Function un.onUninstSuccess
  ${if} ${isUpdated}
    Return
  ${endif}
  ClearErrors
  ${GetParameters} $R0
  ${GetOptions} $R0 "/desktopplay-token=" $R1
  ${if} ${Errors}
    Return
  ${endif}
  StrLen $R0 $R1
  ${if} $R0 != 36
    Return
  ${endif}
  StrCpy $R0 0
  token_loop:
    StrCpy $R2 $R1 1 $R0
    ${if} $R2 == "0"
    ${orIf} $R2 == "1"
    ${orIf} $R2 == "2"
    ${orIf} $R2 == "3"
    ${orIf} $R2 == "4"
    ${orIf} $R2 == "5"
    ${orIf} $R2 == "6"
    ${orIf} $R2 == "7"
    ${orIf} $R2 == "8"
    ${orIf} $R2 == "9"
    ${orIf} $R2 == "a"
    ${orIf} $R2 == "b"
    ${orIf} $R2 == "c"
    ${orIf} $R2 == "d"
    ${orIf} $R2 == "e"
    ${orIf} $R2 == "f"
    ${orIf} $R2 == "-"
    ${else}
      Return
    ${endif}
    IntOp $R0 $R0 + 1
    ${if} $R0 < 36
      Goto token_loop
    ${endif}
  ; A locked or partially removed installation must not clear user data.
  IfFileExists "$INSTDIR\*.*" receipt_done
  IfFileExists "$TEMP\DesktopPet-uninstall-$R1\manifest.json" 0 receipt_done
  FileOpen $R0 "$TEMP\DesktopPet-uninstall-$R1\success.tmp" w
  IfErrors receipt_done
  FileWrite $R0 $R1
  FileClose $R0
  Rename "$TEMP\DesktopPet-uninstall-$R1\success.tmp" "$TEMP\DesktopPet-uninstall-$R1\success"
  receipt_done:
FunctionEnd
!endif
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
