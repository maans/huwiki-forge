# Editions

Hver Edition har et manifest med relative stier til JSON-tiddlere og TiddlyWiki-pluginbundles. `demo` er den første, afgrænsede test.

Alle Editions indlæser `../shared/libraries.json` fra deres manifest. Det giver **HUWiki Plugin Library**, F-linket til Forge og en almindelig henvisning til **TiddlyWiki Community** uden en fane i sidepanelet. Tools-fanen skjules, når den eksisterende HUWiki-læsetilstand er slået til, og vises igen i redigeringstilstand.
