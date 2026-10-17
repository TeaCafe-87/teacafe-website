"""Generate the site's original, quiet UI and ambient sounds (standard library only)."""

from pathlib import Path
import math
import wave


OUT = Path(__file__).resolve().parents[1] / "dist" / "audio"
OUT.mkdir(parents=True, exist_ok=True)
RATE = 22050


def save(name, samples):
    with wave.open(str(OUT / name), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(b"".join(int(max(-1, min(1, value)) * 32767).to_bytes(2, "little", signed=True) for value in samples))


def tone(frequency, t):
    return math.sin(2 * math.pi * frequency * t) + 0.2 * math.sin(4 * math.pi * frequency * t)


click = []
for index in range(int(RATE * 0.09)):
    t = index / RATE
    envelope = (1 - t / 0.09) ** 3
    click.append(0.18 * envelope * (tone(680, t) + 0.35 * tone(1020, t)))
save("ui-click.wav", click)

duration = 16
notes = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 293.66, 392.00]
ambient = []
for index in range(RATE * duration):
    t = index / RATE
    value = 0.0
    for note_index, frequency in enumerate(notes):
        start = note_index * 2
        age = t - start
        if 0 <= age < 3.6:
            attack = min(1.0, age / 0.35)
            release = min(1.0, (3.6 - age) / 1.5)
            value += 0.065 * attack * release * tone(frequency, age)
    loop_fade = min(1.0, t / 0.6, (duration - t) / 0.6)
    ambient.append(value * max(0, loop_fade))
save("background.wav", ambient)
