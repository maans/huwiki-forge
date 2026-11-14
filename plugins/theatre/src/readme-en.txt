! HUWiki Theatre

A lightweight player that sequences real PasteUp boards using their scene durations.

The performance tiddler stores JSON with an ordered list of scenes (`pasteup`, `duration`, optional `motion`). Use `<$cutout-theatre tiddler="Theatre – My performance"/>`.

Each scene is an independent PasteUp board. Its `/Motion` tiddler can contain keyframes per PasteUp field: `dx`, `dy` (percent), `rotate` (degrees), `scale` and `opacity`. These movements are separate from the original PasteUp layout. CutOut players inside scenes follow the performance timeline.

Theatre requires CutOut as its playback engine and PasteUp for this scene type. Slideshow is not required. Theatre examples are separate content.
