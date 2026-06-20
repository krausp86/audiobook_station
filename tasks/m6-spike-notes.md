# M6 Spike-Ergebnisse: Bluetooth-Audio auf dem Pi

**Datum:** 2026-06-20
**Gerät:** Raspberry Pi, BlueZ 5.82, PipeWire 1.4.2
**Test-Kopfhörer:** OpenRun Pro 2 by Shokz (A2DP)

## Stack

- **BlueZ 5.82** — war bereits installiert, `bluetooth.service` enabled
- **PipeWire 1.4.2** — neu installiert: `pipewire pipewire-pulse pipewire-alsa
  libspa-0.2-bluetooth wireplumber`
- PipeWire läuft als **User-Service** des `player`-Users
- MPD läuft als **System-Service** (`/etc/systemd/system/mpd.service`), User `player`

## MPD-Konfiguration

MPD muss auf `type "pulse"` umgestellt werden (statt `type "alsa"`), damit Audio
über PipeWire läuft und Sink-Routing funktioniert:

```
audio_output {
    type    "pulse"
    name    "PipeWire"
    server  "unix:/run/user/1000/pulse/native"
}
```

**Ohne diese Änderung** geht MPD direkt auf ALSA und umgeht PipeWire — BT-Audio
funktioniert dann nicht.

## Befehls-Inventar (alle als `player`-User, ohne sudo)

### Pairing / Geräte-Verwaltung

| Aktion | Befehl | Ausgabe bei Erfolg |
|--------|--------|--------------------|
| Scan starten | `timeout 30 bluetoothctl --timeout 30 scan on` | `[NEW] Device <MAC> <Name>` |
| Pairen | `bluetoothctl pair <MAC>` | `Pairing successful` |
| Trusten | `bluetoothctl trust <MAC>` | `Changing ... trust succeeded` |
| Verbinden | `bluetoothctl connect <MAC>` | `Connection successful` |
| Trennen | `bluetoothctl disconnect <MAC>` | `Disconnection successful` |
| Pairing entfernen | `bluetoothctl remove <MAC>` | `Device has been removed` |
| Gekoppelte auflisten | `bluetoothctl devices Paired` | `Device <MAC> <Name>` pro Zeile |
| Geräte-Info | `bluetoothctl info <MAC>` | Key-Value, u.a. `Paired:`, `Connected:`, `Trusted:`, `Alias:` |
| Adapter-Status | `bluetoothctl show` | u.a. `Powered:`, `Name:` |
| Einschalten | `sudo bluetoothctl power on` | (braucht sudo oder rfkill) |

### Scan-Hinweis

`bluetoothctl scan on` im nicht-interaktiven Modus mit `timeout` beenden.
Bereits gekoppelte Geräte tauchen **nicht** als `[NEW]` auf.

### Pairing-Hinweis

- `pair` muss **immer** von `trust` gefolgt werden — sonst kein Autoconnect beim nächsten Boot.
- Nach einem `remove` steht `Pairable` ggf. auf `no` — vor einem neuen Scan `pairable on`
  aufrufen (oder im interaktiven Modus `agent on` + `default-agent` setzen).
- Scan im **interaktiven** Modus (`bluetoothctl` → `scan on`) ist zuverlässiger als
  nicht-interaktiv. Für den Adapter (T6.C2) den Scan als Subprozess mit `--timeout` wrappen.

### rfkill

BT-Adapter war nach Boot **blockiert** (`DOWN`). Lösung:
```bash
sudo rfkill unblock bluetooth
```
**Muss nach jedem Boot passieren** (oder per udev/systemd persistent gemacht werden).

## Sink-Routing

### Automatisches Verhalten (PipeWire)

| Ereignis | PipeWire-Verhalten | Aktion im Code nötig? |
|----------|--------------------|-----------------------|
| BT verbindet | BT-Sink wird automatisch Default, Audio springt auf BT | **Nein** |
| BT trennt (Gerät aus / Disconnect) | Fällt automatisch auf Klinke zurück, MPD spielt weiter | **Nein** |
| BT reconnected (Gerät wieder ein) | Springt automatisch zurück auf BT | **Nein** |

**Fazit: PipeWire handled Sink-Umschaltung vollautomatisch in beide Richtungen.**
`routeToBluetooth()` und `routeToJack()` sind No-Ops. Kein `wpctl set-default` nötig.
Kein MPD-Neustart. Kein Knacken/Aussetzer beim Umschalten.

### Manuelles Umschalten (falls je nötig)

```bash
# Sink-IDs sind dynamisch — immer zur Laufzeit ermitteln:
wpctl status | grep "Sinks" -A5

# Sink setzen:
wpctl set-default <ID>
```

**Achtung:** BT-Sink-IDs ändern sich bei jedem Reconnect. Nie cachen.

## Event-Quelle

### bluetoothctl (funktioniert als player)

Ein langlaufender `bluetoothctl`-Prozess gibt Events auf stdout aus:
```
[CHG] Device A8:F5:E1:CF:15:31 Connected: yes
[CHG] Device A8:F5:E1:CF:15:31 Connected: no
```

**Das ist die Event-Quelle für T6.C3.** Parsen: Zeilen mit `[CHG] Device <MAC> Connected: yes/no`.

### busctl monitor (funktioniert NICHT als player)

```
busctl monitor org.bluez → "Access denied"
```

`player`-User hat keine Berechtigung für D-Bus-Monitoring. **Nicht verwenden.**

## Rechte-Situation

| Befehl | Als `player` ohne sudo? |
|--------|------------------------|
| `bluetoothctl pair/trust/connect/disconnect/remove/info/devices/show` | ✅ Ja |
| `bluetoothctl scan on` | ✅ Ja |
| `bluetoothctl power on` | ❌ Nein (braucht sudo) |
| `rfkill unblock bluetooth` | ❌ Nein (braucht sudo) |
| `busctl monitor org.bluez` | ❌ Nein (Access denied) |
| `wpctl status/set-default` | ✅ Ja |
| `mpc` (MPD-Client) | ✅ Ja |

**Polkit-Bedarf (T6.P2):** `power on` und `rfkill unblock` brauchen Root-Rechte.
Am besten per Systemd-Service oder udev-Regel beim Boot automatisch erledigen,
statt dem `player`-User sudo zu geben.

## Auswirkungen auf die Code-Tasks

| Task | Auswirkung |
|------|------------|
| T6.C2 (Adapter) | Befehle oben verwenden. `pair` muss immer gefolgt von `trust` werden. |
| T6.C3 (Listener) | Langlaufender `bluetoothctl`-Prozess, stdout parsen auf `[CHG] Device <MAC> Connected: yes/no`. |
| T6.C5 (Sink-Fallback) | **Quasi No-Op.** PipeWire erledigt alles. Modul kann entfallen oder nur loggen. |
| T6.P2 (System-Setup) | rfkill-Unblock + power-on beim Boot automatisieren. PipeWire User-Service persistent. MPD-Config auf `type "pulse"`. |
| T6.P3 (Autoconnect) | BlueZ Trust + Autoconnect funktioniert bereits (Gerät einschalten → verbindet automatisch). Ggf. reicht das schon. |
