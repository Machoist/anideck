; AniDeck retention guards. electron-builder includes this file automatically from build/.
; AniDeck keeps local data on every install, update and uninstall. An explicit request to delete
; app data is refused with exit code 2 before the stock install/uninstall sections run.
; This file must not remove, move or write files, folders, shortcuts or registry values.

!include LogicLib.nsh
!include FileFunc.nsh

!ifdef DELETE_APP_DATA_ON_UNINSTALL
  !error "AniDeck keeps app data on uninstall; remove deleteAppDataOnUninstall."
!endif

; Refuses when either stock parser sees the flag:
; - FileFunc GetOptions, which the stock uninstaller uses to decide deletion (uninstaller.nsh);
; - StdUtils TestParameter, behind the generated isDeleteAppData that forwards the flag on update.
; Ambiguous forms are refused too (fail closed).
!macro anideckRefuseAppDataDeletion
  Push $R0
  Push $R1
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "--delete-app-data" $R1
  ${IfNot} ${Errors}
    SetErrorLevel 2
    Quit
  ${EndIf}
  ${StdUtils.TestParameter} $R1 "delete-app-data"
  ${If} $R1 == "true"
    SetErrorLevel 2
    Quit
  ${EndIf}
  Pop $R1
  Pop $R0
!macroend

; Installer: runs in .onInit, before the install section closes the app or removes the old version.
!macro customInit
  !insertmacro anideckRefuseAppDataDeletion
!macroend

; Uninstaller: runs in un.onInit after the stock confirmation and running-app check, which may already
; have closed AniDeck. Refusing here prevents program and data removal, not those earlier steps.
!macro customUnInit
  !insertmacro anideckRefuseAppDataDeletion
!macroend
