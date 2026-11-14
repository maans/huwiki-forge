# Valgfri lokal dokumentkonvertering / Optional local document conversion

Slideshow kan læse PDF, TXT/Markdown, HTML og tekst fra DOCX/PPTX/ODT/ODP direkte i browseren. Visuel import af Office-filer og ældre DOC/PPT/RTF kan bruge LibreOffice på din egen computer. Alternativt kan du eksportere en PDF fra dit dokumentprogram og importere den direkte.

1. Installer Node.js 20+ og LibreOffice.
2. Start hjælperen fra denne mappe med `node server.mjs`.
3. Åbn Slideshow → Import → Valgfri lokal dokumentkonvertering. Indsæt den viste lokale adresse og midlertidige adgangskode.
4. Vælg filen og kontrollér forhåndsvisningen. Stop hjælperen med Ctrl+C bagefter.

Hvis LibreOffice ikke findes som `soffice`, angiv stien i `SOFFICE_BIN`. På macOS er den normalt `/Applications/LibreOffice.app/Contents/MacOS/soffice`.

Hjælperen lytter kun på 127.0.0.1. Den kræver en tilfældig adgangskode, bruger en separat LibreOffice-profil og sletter sine midlertidige filer efter konverteringen. Adgangskoden ligger kun i browserens hukommelse og gemmes ikke i wikien. Filer på højst 20 MB kan konverteres; kun én konvertering kører ad gangen. Browseren kan bede om adgang til det lokale netværk.

Kontrollér skrifter, layout og sideskift. Office-animationer og talernoter overføres ikke gennem PDF. En PDF uden tekstlag kan importeres som billeder; automatisk OCR er ikke inkluderet.

## English

Install Node.js 20+ and LibreOffice, then run `node server.mjs`. In Slideshow → Import → Optional local document conversion, enter the displayed loopback address and temporary session code. Set `SOFFICE_BIN` if LibreOffice is not on your path. Stop the helper with Ctrl+C when finished.

Files are converted on your computer using a separate LibreOffice profile. Temporary files are removed after conversion, and the session code is never saved in your wiki. Maximum file size: 20 MB. Only one conversion runs at a time. Your browser may request local-network permission.

Check fonts, layout and page breaks in the preview. Office animations and speaker notes are not imported through PDF. Scanned PDFs can be imported as images; OCR is not included. Exporting a PDF from your existing Office application avoids the need for this helper.
