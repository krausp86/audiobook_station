# T2.02 komplett neu anlegen (overlayfs-Verlust + Shell-Fix)

## Was passiert ist

Alle Rootfs-Änderungen aus T2.02 (User, sshd_config, authorized_keys) waren in der
volatilen overlayfs-Oberschicht (RAM) und beim Reboot verloren. `/mnt/hoermond` hat
überlebt (eigene ext4-Partition, von overlayfs nicht betroffen).

> **Korrektur (2026-06-16):** Dieses Dokument zielte ursprünglich auf `/media` statt
> `/mnt/hoermond`. `/media` ist **keine eigene Partition** — es liegt auf der rootfs und
> hätte einen Reboot mit aktivem overlayfs *nicht* überlebt; es wirkte nur deshalb
> persistent, weil overlayfs zum damaligen Zeitpunkt deaktiviert war (siehe Vorbedingung
> unten). Der echte, persistente Mountpoint ist `/mnt/hoermond` (`mmcblk0p3`, siehe
> `m1-pi-setup.md`). Alle Pfade in diesem Dokument sind entsprechend korrigiert; siehe
> `tasks/m2-migration-media-to-mnt-hoermond.md` für den durchgeführten Migrationsschritt.

Außerdem war der Original-Plan fehlerhaft: `useradd --shell /usr/sbin/nologin` +
`ForceCommand` funktionieren nicht zusammen — nach dem SSH-Chroot zu `/mnt/hoermond` sucht
sshd die Shell unter `/mnt/hoermond/usr/sbin/nologin`, die dort nicht existiert. `nologin`
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
    ChrootDirectory /mnt/hoermond
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
sudo chown root:root /mnt/hoermond
sudo chmod 755 /mnt/hoermond
ls -ld /mnt/hoermond   # muss sein: drwxr-xr-x root root
```

---

## Schritt 6 — Binaries und ForceCommand-Script in die Chroot

**Wichtig:** ForceCommand-Pfade werden innerhalb der Chroot aufgelöst.
`ForceCommand /usr/local/sbin/media-sync-shell` → Datei muss liegen unter
`/mnt/hoermond/usr/local/sbin/media-sync-shell`. Gleiches gilt für `/bin/sh` und `rsync`.

```bash
# /bin/sh in Chroot
sudo mkdir -p /mnt/hoermond/bin
sudo cp /bin/sh /mnt/hoermond/bin/sh
ldd /bin/sh | awk '$3~/^\//{ print $3 }' | while read f; do
  sudo mkdir -p "/mnt/hoermond$(dirname "$f")"
  sudo cp "$f" "/mnt/hoermond$f"
done
ldd /bin/sh | awk '$1~/^\//{ print $1 }' | while read f; do
  sudo mkdir -p "/mnt/hoermond$(dirname "$f")"
  sudo cp "$f" "/mnt/hoermond$f"
done

# rsync in Chroot
sudo mkdir -p /mnt/hoermond/usr/bin
sudo cp /usr/bin/rsync /mnt/hoermond/usr/bin/rsync
ldd /usr/bin/rsync | awk '$3~/^\//{ print $3 }' | while read f; do
  sudo mkdir -p "/mnt/hoermond$(dirname "$f")"
  sudo cp "$f" "/mnt/hoermond$f"
done

# ForceCommand-Script in Chroot (nicht auf Rootfs!)
sudo mkdir -p /mnt/hoermond/usr/local/sbin
sudo tee /mnt/hoermond/usr/local/sbin/media-sync-shell >/dev/null <<'EOF'
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
sudo chmod 755 /mnt/hoermond/usr/local/sbin/media-sync-shell
sudo chown root:root /mnt/hoermond/usr/local/sbin/media-sync-shell
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

---

## Schritt 10 — Serverseitiger Permission-Fix (nicht auf Client-Flags verlassen)

**Praxis-Erfahrung:** `--no-perms` schützt nur, wenn der *Sync-Client* diese Flags
tatsächlich setzt. Verlässt man sich darauf, kommt jede Quelldatei mit restriktiven
Rechten (z. B. `700` vom Absender) 1:1 auf dem Pi an — `player`/MPD/beets können sie
dann nicht lesen. Deshalb normalisiert der Server selbst die Rechte nach jedem Sync,
unabhängig davon, mit welchen Flags synct wird. Details, fertiges Skript und
`sudoers`-Eintrag: siehe `tasks/m2-server-side-perm-fix.md`.

Kurzfassung: `/usr/local/sbin/media-fix-perms.sh` (root, NUR `audiobooks/` und `music/`
— **niemals** rekursiv über die ganze `/mnt/hoermond`-Partition, sonst werden die
Chroot-Jail-Binaries unter `bin/`, `lib/`, `usr/` mit-chmodet und der SSH-Login bricht)
wird in `media-watcher.sh` (T2.03) direkt nach dem Debounce, vor `mpc --wait update`,
per eng begrenztem `sudo`-Eintrag aufgerufen.
