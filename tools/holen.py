"""Laedt Audiodateien aus tools/holen.json (Liste von {"pfad","url"}) und speichert sie im Repo."""
import json, os, urllib.request
jobs = json.load(open("tools/holen.json"))
log = []
for j in jobs:
    p = j["pfad"]
    os.makedirs(os.path.dirname(p), exist_ok=True)
    try:
        data = urllib.request.urlopen(j["url"], timeout=120).read()
        open(p, "wb").write(data)
        log.append(f"OK {p} {len(data)}")
    except Exception as e:
        log.append(f"FEHLER {p} {e}")
open("tools/holen-log.txt", "w").write("\n".join(log) + "\n")
print("\n".join(log))
