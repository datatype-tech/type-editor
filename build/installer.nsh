!ifndef BUILD_UNINSTALLER
  # These are normally pulled in by installer.nsi, but this file is spliced
  # into the header script (before that !include happens), so the custom
  # page Functions below need them available already.
  !include "MUI2.nsh"
  !include "nsDialogs.nsh"

  Var ContextMenuCheckbox
  Var AddContextMenu

  !macro customPageAfterChangeDir
    Page custom ContextMenuPageShow ContextMenuPageLeave
  !macroend

  Function ContextMenuPageShow
    !insertmacro MUI_HEADER_TEXT "Additional Options" "Select additional options for Type Editor."
    
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateCheckbox} 10u 20u 280u 14u "Add 'Open with Type Editor' to context menu"
    Pop $ContextMenuCheckbox
    
    # Default to checked
    ${If} $AddContextMenu == ""
      StrCpy $AddContextMenu "1"
    ${EndIf}
    
    ${If} $AddContextMenu == "1"
      ${NSD_Check} $ContextMenuCheckbox
    ${Else}
      ${NSD_Uncheck} $ContextMenuCheckbox
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function ContextMenuPageLeave
    ${NSD_GetState} $ContextMenuCheckbox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $AddContextMenu "1"
    ${Else}
      StrCpy $AddContextMenu "0"
    ${EndIf}
  FunctionEnd
!endif

!macro customInstall
  ${If} $AddContextMenu == "1"
    # Register context menu for all files (*)
    WriteRegStr SHELL_CONTEXT "Software\Classes\*\shell\TypeEditor" "" "Open with Type Editor"
    WriteRegStr SHELL_CONTEXT "Software\Classes\*\shell\TypeEditor" "Icon" "$appExe,0"
    WriteRegStr SHELL_CONTEXT "Software\Classes\*\shell\TypeEditor\command" "" '"$appExe" "%1"'
  ${EndIf}
!macroend

!macro customUnInstall
  DeleteRegKey SHELL_CONTEXT "Software\Classes\*\shell\TypeEditor"
!macroend
