# Pinned working Mac launcher (ForgeShare 0.1.13)

These two files are byte-for-byte copies of the native Mac executable and icon from commit `1663d11e7f85a72b028b98eb9d7667d8579d8eb5`, whose window and library UI opened on the project Mac. They are retained independently from regenerated `native/compiled/` artifacts, so later bundle updates do not change the executable or its UI behavior.

The 0.1.15 test build reuses these files but ad-hoc re-signs the complete app after bundling the updated JavaScript helper. These files are **not** Developer ID-signed, notarized, or approved for public release. New downloaded copies may still trigger Gatekeeper.

Only replace these pinned files after a full macOS normal-window startup test and explicit review. Tests and SHA-256 guards reject an accidental replacement.
