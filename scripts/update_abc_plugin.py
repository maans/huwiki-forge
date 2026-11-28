#!/usr/bin/env python3
"""Replace one bundled plugin inside existing single-file wikis."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import tempfile

TITLE = "$:/plugins/huwiki/abc"
SCRIPT = re.compile(r"<script\b(?P<attrs>[^>]*)>(?P<body>[\s\S]*?)</script\s*>", re.I)
ATTRIBUTE = re.compile(r"(?P<name>[\w:-]+)\s*=\s*(?P<quote>['\"])(?P<value>.*?)\2", re.S)
DECODER = json.JSONDecoder()


def version(value: object, *, allow_prerelease: bool = False) -> tuple[int, int, int]:
    pattern = r"(\d+)\.(\d+)\.(\d+)" + (r"(?:-[0-9A-Za-z.-]+)?" if allow_prerelease else "")
    match = re.fullmatch(pattern, str(value))
    if not match:
        raise ValueError("ABC must have a three-part numeric version")
    return tuple(map(int, match.groups()))


def array_items(text: str):
    """Yield decoded items and exact object spans, validating the whole array."""
    at = 0
    while at < len(text) and text[at].isspace():
        at += 1
    if at >= len(text) or text[at] != "[":
        raise ValueError("A tiddler store is not a JSON array")
    at += 1
    first = True
    while True:
        while at < len(text) and text[at].isspace():
            at += 1
        if at >= len(text):
            raise ValueError("An unterminated tiddler store was found")
        if text[at] == "]":
            if not first:
                raise ValueError("A trailing comma was found in a tiddler store")
            at += 1
            break
        start = at
        item, at = DECODER.raw_decode(text, at)
        yield item, start, at
        while at < len(text) and text[at].isspace():
            at += 1
        if at >= len(text):
            raise ValueError("An unterminated tiddler store was found")
        if text[at] == "]":
            at += 1
            break
        if text[at] != ",":
            raise ValueError("An invalid tiddler separator was found")
        at += 1
        first = False
    if text[at:].strip():
        raise ValueError("Unexpected content follows a tiddler store")


def replace_plugin(html: str, plugin: dict, expected_title: str = TITLE) -> tuple[str, str]:
    """Return updated HTML and status; all non-ABC bytes remain identical."""
    if plugin.get("title") != expected_title or plugin.get("plugin-type") != "plugin":
        raise ValueError("The replacement is not the ABC plugin")
    replacement_version = version(plugin.get("version"), allow_prerelease=expected_title != TITLE)
    # Validate the embedded plugin before writing any wiki files.
    payload = json.loads(plugin.get("text", ""))
    if not isinstance(payload.get("tiddlers"), dict):
        raise ValueError("The replacement ABC plugin has no bundled tiddlers")
    found = []
    for store in SCRIPT.finditer(html):
        attrs = {m["name"].lower(): m["value"] for m in ATTRIBUTE.finditer(store["attrs"])}
        if "tiddlywiki-tiddler-store" not in attrs.get("class", "").split():
            continue
        if attrs.get("type", "").lower() != "application/json":
            continue
        for item, start, end in array_items(store["body"]):
            if isinstance(item, dict) and item.get("title") == expected_title:
                found.append((item, store.start("body") + start, store.start("body") + end))
    if len(found) > 1:
        raise ValueError("A wiki contains duplicate ABC plugin tiddlers")
    if not found:
        return html, "absent"
    existing, start, end = found[0]
    if replacement_version < version(existing.get("version"), allow_prerelease=expected_title != TITLE):
        raise ValueError("Refusing to downgrade an existing ABC plugin")
    if existing == plugin:
        return html, "current"
    replacement = json.dumps(plugin, ensure_ascii=False, separators=(",", ":"))
    # HTML script elements must not contain a literal closing script token.
    replacement = replacement.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return html[:start] + replacement + html[end:], "updated"


def atomic_write(path: Path, data: bytes) -> None:
    mode = path.stat().st_mode & 0o777
    name = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".abc-update-", dir=path.parent, delete=False) as stream:
            name = stream.name
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, mode)
        os.replace(name, path)
        name = None
    finally:
        if name:
            Path(name).unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plugin", required=True, type=Path)
    parser.add_argument("--title", default=TITLE)
    parser.add_argument("wikis", nargs="+", type=Path)
    args = parser.parse_args()
    plugin = json.loads(args.plugin.read_bytes().decode("utf-8"))
    counts = {"updated": 0, "current": 0, "absent": 0}
    planned = []
    # Validate all inputs before changing any file.
    for path in dict.fromkeys(args.wikis):
        original = path.read_bytes()
        updated, status = replace_plugin(original.decode("utf-8"), plugin, args.title)
        counts[status] += 1
        if status == "updated":
            planned.append((path, updated.encode("utf-8")))
    for path, data in planned:
        atomic_write(path, data)
    print("{} {}: {} updated; {} already current; {} without plugin".format(
        plugin["title"], plugin["version"], counts["updated"], counts["current"], counts["absent"]))


if __name__ == "__main__":
    main()
