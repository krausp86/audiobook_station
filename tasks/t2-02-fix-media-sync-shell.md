# T2.02 komplett neu anlegen (overlayfs-Verlust + Shell-Fix)

## Was passiert ist

Alle Rootfs-Änderungen aus T2.02 (User, sshd_config, authorized_keys) waren in der
volatilen overlayfs-Oberschicht (RAM) und beim Reboot verloren. `/media` hat überlebt
(eigene ext4-Partition, nicht betroffen).

Außerdem war der Original-Plan fehlerhaft: `useradd --shell /usr/sbin/nologin` +
`ForceCommand` funktionieren nicht zusammen — nach dem SSH-Chroot zu `/media` sucht
sshd die Shell unter `/media/usr/sbin/nologin`, die dort nicht existiert. `nologin`
akzeptiert auch kein `-c <command>` das ForceCommand braucht.

**Lösung:** Shell ist `/bin/sh`. Sicherheit kommt von `ForceCommand` + `PermitTTY no`.

---

## Vorbedingung: overlayfs ist gerade AUS (wurde in Schritt 1 deaktiviert)

Überprüfen:
```bash
findmnt -t overlay   # sollte leer sein
```

---

## Schritt 1 — Laptop-Public-Key holen

**Auf dem Laptop** (nicht auf dem Pi) ausführen:
```bash
cat ~/.ssh/id_ed25519.pub
```
Den gesamten Schlüssel (eine Zeile, beginnt mit `ssh-ed25519 AAAA...`) kopieren.
Den kopierten Key brauchen wir in Schritt 3.

---

## Schritt 2 — media-sync User anlegen (mit korrekter Shell)

```bash
# Shell ist /bin/sh, nicht nologin (nologin ist keine echte Shell für ForceCommand)
sudo useradd --system --no-create-home --shell /bin/sh --groups media media-sync
sudo passwd -l media-sync
```

---

## Schritt 3 — Authorized Key einrichten

```bash
sudo mkdir -p /etc/ssh/authorized_keys.d
sudo chmod 755 /etc/ssh/authorized_keys.d

# Laptop-Key eintragen (Key aus Schritt 1 einsetzen):
echo 'HIER-DEN-LAPTOP-KEY-EINFÜGEN' \
  | sudo tee /etc/ssh/authorized_keys.d/media-sync >/dev/null

sudo chown root:root /etc/ssh/authorized_keys.d/media-sync
sudo chmod 644 /etc/ssh/authorized_keys.d/media-sync
```

---

## Schritt 4 — sshd drop-in Konfiguration

```bash
sudo tee /etc/ssh/sshd_config.d/10-media-sync.conf >/dev/null <<'EOF'
Match User media-sync
    AuthorizedKeysFile /etc/ssh/authorized_keys.d/%u
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PubkeyAuthentication yes
    ChrootDirectory /media
    AllowTcpForwarding no
    AllowAgentForwarding no
    X11Forwarding no
    PermitTunnel no
    PermitTTY no
    ForceCommand /usr/local/sbin/media-sync-shell
EOF
```

---

## Schritt 5 — Chroot-Verzeichnis: Ownership prüfen

sshd verlangt dass die chroot-Wurzel `root:root 0755` ist:
```bash
sudo chown root:root /media
sudo chmod 755 /media
ls -ld /media   # muss sein: drwxr-xr-x root root
```

---

## Schritt 6 — Binaries und ForceCommand-Script in die Chroot

**Wichtig:** ForceCommand-Pfade werden innerhalb der Chroot aufgelöst.
`ForceCommand /usr/local/sbin/media-sync-shell` → Datei muss liegen unter
`/media/usr/local/sbin/media-sync-shell`. Gleiches gilt für `/bin/sh` und `rsync`.

```bash
# /bin/sh in Chroot
sudo mkdir -p /media/bin
sudo cp /bin/sh /media/bin/sh
ldd /bin/sh | awk '$3~/^\//{ print $3 }' | while read f; do
  sudo mkdir -p "/media$(dirname "$f")"
  sudo cp "$f" "/media$f"
done
ldd /bin/sh | awk '$1~/^\//{ print $1 }' | while read f; do
  sudo mkdir -p "/media$(dirname "$f")"
  sudo cp "$f" "/media$f"
done

# rsync in Chroot
sudo mkdir -p /media/usr/bin
sudo cp /usr/bin/rsync /media/usr/bin/rsync
ldd /usr/bin/rsync | awk '$3~/^\//{ print $3 }' | while read f; do
  sudo mkdir -p "/media$(dirname "$f")"
  sudo cp "$f" "/media$f"
done

# ForceCommand-Script in Chroot (nicht auf Rootfs!)
sudo mkdir -p /media/usr/local/sbin
sudo tee /media/usr/local/sbin/media-sync-shell >/dev/null <<'EOF'
#!/bin/sh
export PATH="/usr/bin:/bin"
case "$SSH_ORIGINAL_COMMAND" in
  "rsync --server "*)
    exec $SSH_ORIGINAL_COMMAND
    ;;
  *)
    echo "Nur rsync ist erlaubt (media-sync)." >&2
    exit 1
    ;;
esac
EOF
sudo chmod 755 /media/usr/local/sbin/media-sync-shell
sudo chown root:root /media/usr/local/sbin/media-sync-shell
```

---

## Schritt 7 — sshd prüfen und neu laden

```bash
sudo sshd -t && sudo systemctl reload ssh
```

---

## Schritt 8 — overlayfs wieder aktivieren

```bash
sudo raspi-config nonint do_overlayfs 1 && sudo reboot
```

---

## Schritt 9 — Vom Laptop testen

`media-sync` ist nicht Eigentümer der Unterordner (gehört `player:media`) — daher
darf es keine Permissions, Owner, Group oder Dir-Timestamps setzen. Kanonischer
Flag-Satz für dieses Setup:

```bash
# Testverzeichnis anlegen falls noch nicht vorhanden:
mkdir -p /tmp/sync-test && echo "test" > /tmp/sync-test/test.txt

# Sync testen (kanonische Flags für dieses chroot-Setup):
rsync -avz --no-owner --no-group --no-perms --omit-dir-times \
  /tmp/sync-test/ media-sync@hoermond.krfu.home:/audiobooks/

# Interaktiver Login muss abgewiesen werden:
ssh media-sync@hoermond.krfu.home
# Erwartet: "Nur rsync ist erlaubt (media-sync)." und Exit 1
```

**Flags erklärt:** `-a` = `-rlptgoD`; wir deaktivieren `p` (perms), `o` (owner),
`g` (group) und `-O` (dir-times) weil `media-sync` nicht Eigentümer der Zielordner
ist. Inhalt und Mtimes von Dateien werden korrekt übertragen.
