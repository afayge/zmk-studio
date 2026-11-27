"""Regenerate the Studio search index from a local ZMK checkout (default ~/zmk)."""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

root = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / "zmk"
include = root / "app/include"
header = (include / "dt-bindings/zmk/keys.h").read_text()
names = re.findall(r"^#define (\w+)\s+", header, re.M)
# Evaluate with the defining C headers to include aliases and implicit modifier bits.
program = '#include <stdio.h>\n#include <dt-bindings/zmk/keys.h>\nint main(void) {\n'
program += "".join(f'printf("%u {name}\\n", (unsigned)({name}));\n' for name in names)
with tempfile.TemporaryDirectory() as directory:
    exe = Path(directory) / "codes"
    subprocess.run(["cc", "-x", "c", "-", "-I", include, "-o", exe],
                   input=program + "}\n", text=True, check=True)
    rows = subprocess.check_output([exe], text=True).splitlines()

docs = (root / "docs/docs/keymaps/list-of-keycodes.mdx").read_text()
sections = {}
for heading, group in re.findall(r'^## ([^\n]+)|<Table group="([^"]+)"', docs, re.M):
    if heading:
        section = heading
    else:
        sections[group] = section
labels = {}
groups = (root / "docs/src/data/groups.js").read_text()
for group, body in re.findall(r'^  "?([\w-]+)"?: \[([^\]]*)\]', groups, re.M):
    for name in re.findall(r'"(\w+)"', body):
        labels[name] = sections[group]

index = {}
for row in rows:
    code, name = row.split()
    entry = index.setdefault(code, [[], []])
    entry[0].append(name)
    if name in labels and labels[name] not in entry[1]:
        entry[1].append(labels[name])
target = Path(__file__).resolve().parents[1] / "src/behaviors/zmk-keycodes.json"
target.write_text("{\n" + ",\n".join(
    f'  "{code}": ' + json.dumps([" ".join(names), " ".join(sections)])
    for code, (names, sections) in index.items()) + "\n}\n")
