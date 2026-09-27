; === perchance_test.ahk (v2) ===
#Requires AutoHotkey v2.0

; Eerst alles selecteren in het tekstveld
Send("^a")
Sleep(150)

; Dan plakken
Send("^v")
Sleep(300)

; Enter om de generate-actie te starten
Send("{Enter}")

ExitApp()