"""Laedt Dateien aus tools/holen.json (Liste von {"pfad","url"[,"enc":true]}).
enc=true: Datei wird verschluesselt abgelegt (nur mit privatem Schluessel lesbar) – fuer private Bauteile."""
import json, os, subprocess, urllib.request
jobs = json.load(open("tools/holen.json"))
log = []
for j in jobs:
    p = j["pfad"]
    os.makedirs(os.path.dirname(p), exist_ok=True)
    try:
        data = urllib.request.urlopen(j["url"], timeout=120).read()
        if j.get("enc"):
            open("/tmp/plain", "wb").write(data)
            open("/tmp/k", "wb").write(os.urandom(32).hex().encode())
            subprocess.run(["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-in", "/tmp/plain", "-out", p, "-pass", "file:/tmp/k"], check=True)
            subprocess.run(["openssl", "pkeyutl", "-encrypt", "-pubin", "-inkey", "tools/pub.pem", "-in", "/tmp/k", "-out", p + ".key"], check=True)
            os.remove("/tmp/plain"); os.remove("/tmp/k")
        else:
            open(p, "wb").write(data)
        log.append(f"OK {p} {len(data)}")
    except Exception as e:
        log.append(f"FEHLER {p} {e}")
open("tools/holen-log.txt", "w").write("\n".join(log) + "\n")
print("\n".join(log))
