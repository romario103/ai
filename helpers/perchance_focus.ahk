; === perchance_test.ahk (v2) ===
#Requires AutoHotkey v2.0

SetTitleMatchMode 2
Sleep(500)

WinActivate("AI Image Generator (free, no sign-up, unlimited)")
WinWaitActive("AI Image Generator (free, no sign-up, unlimited)", , 5)

; Vanuit de adresbalk 3x Tab om bij het tekstvak te komen
;Send("{Tab}")
;Sleep(100)
;Send("{Tab}")
;Sleep(100)
;Send("{Tab}")
Sleep(150)


ExitApp()