// Canciones del modo juego.
// Formato: "NOTA[:duración]" separadas por espacios. Duración en tiempos (negra = 1). "R" = silencio.
// notes = mano derecha (melodía), bass = mano izquierda (acompañamiento, misma duración total).
// level: 1 Fácil, 2 Medio, 3 Difícil. En Difícil se tocan las dos manos a la vez (acordes).
window.SONGS = [
  // ---------- Fácil ----------
  { id: 'escala', name: 'Escalera de Do', emoji: '🪜', level: 1, bpm: 90,
    notes: 'C4 D4 E4 F4 G4 A4 B4 C5:2 C5 B4 A4 G4 F4 E4 D4 C4:2',
    bass:  'C3 D3 E3 F3 G3 A3 B3 C4:2 C4 B3 A3 G3 F3 E3 D3 C3:2' },
  { id: 'estrellita', name: 'Estrellita', emoji: '⭐', level: 1, bpm: 100,
    notes: 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2',
    bass:  'C3:4 F3:2 C3:2 F3:2 C3:2 G3:2 C3:2 C3:2 F3:2 C3:2 G3:2 C3:2 F3:2 C3:2 G3:2 C3:4 F3:2 C3:2 F3:2 C3:2 G3:2 C3:2' },
  { id: 'corderito', name: 'María tenía un corderito', emoji: '🐑', level: 1, bpm: 110,
    notes: 'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4',
    bass:  'C3:4 C3:4 G2:4 C3:4 C3:4 C3:4 G2:4 C3:4' },
  { id: 'martinillo', name: 'Martinillo', emoji: '🔔', level: 1, bpm: 110,
    notes: 'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2',
    bass:  'C3:4 C3:4 C3:4 C3:4 C3:4 C3:4 C3:2 G2:2 C3:4',
    beam: { unit: 2, offset: 0 } },

  // ---------- Medio ----------
  { id: 'cumple', name: 'Cumpleaños feliz', emoji: '🎂', level: 2, bpm: 100,
    notes: 'G4:.75 G4:.25 A4 G4 C5 B4:2 G4:.75 G4:.25 A4 G4 D5 C5:2 G4:.75 G4:.25 G5 E5 C5 B4 A4:2 F5:.75 F5:.25 E5 C5 D5 C5:3',
    bass:  'R C3:3 G2:3 G2:3 C3:3 C3:3 F3:3 C3:3 G2 C3:3' },
  { id: 'oda', name: 'Oda a la alegría', emoji: '🎉', level: 2, bpm: 110,
    notes: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2 D4 D4 E4 C4 D4 E4:.5 F4:.5 E4 C4 D4 E4:.5 F4:.5 E4 D4 C4 D4 G3:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2',
    bass:  'C3:4 G2:4 C3:4 G2:4 C3:4 G2:4 C3:4 G2:2 C3:2 G2:2 C3:2 G2:2 C3:2 G2:2 C3:2 C3:2 G2:2 C3:4 G2:4 C3:4 G2:2 C3:2' },
  { id: 'jingle', name: 'Navidad (Jingle Bells)', emoji: '🎄', level: 2, bpm: 120,
    notes: 'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 E4 D4 D4 E4 D4:2 G4:2 E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 G4 G4 F4 D4 C4:4',
    bass:  'C3:4 C3:4 C3:4 C3:4 F3:4 C3:4 G2:4 G2:4 C3:4 C3:4 C3:4 C3:4 F3:4 C3:4 G2:4 C3:4' },
  { id: 'cucaracha', name: 'La cucaracha', emoji: '🪇', level: 2, bpm: 140,
    notes: 'C4:.5 C4:.5 C4:.5 F4 A4:2 R:.5 C4:.5 C4:.5 C4:.5 F4 A4:2 R:.5 F4 F4 E4 E4 D4 D4 C4:3 C4:.5 C4:.5 C4:.5 E4 G4:2 R:.5 C4:.5 C4:.5 C4:.5 E4 G4:2 R:.5 C5 D5 C5 A#4 A4 G4 F4:3',
    bass:  'R:1.5 F3:3.5 F3:5 C3:9 C3:5 C3:5 C3:6 F3:3' },

  // ---------- Difícil (dos manos) ----------
  { id: 'elisa', name: 'Para Elisa', emoji: '🌹', level: 3, bpm: 80,
    notes: 'E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:1.5 C4:.5 E4:.5 A4:.5 B4:1.5 E4:.5 G#4:.5 B4:.5 C5:1.5 E4:.5 E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:1.5 C4:.5 E4:.5 A4:.5 B4:1.5 E4:.5 C5:.5 B4:.5 A4:3',
    bass:  'R:4 A2:.5 E3:.5 A3:.5 R:1.5 E2:.5 E3:.5 G#3:.5 R:1.5 A2:.5 E3:.5 A3:.5 R:4.5 A2:.5 E3:.5 A3:.5 R:1.5 E2:.5 E3:.5 G#3:.5 R:1.5 A2:.5 E3:.5 A3:.5 R:1.5',
    beam: { unit: 3, offset: 1 } },
  { id: 'minueto', name: 'Minueto en Sol', emoji: '🩰', level: 3, bpm: 110,
    notes: 'D5 G4:.5 A4:.5 B4:.5 C5:.5 D5 G4 G4 E5 C5:.5 D5:.5 E5:.5 F#5:.5 G5 G4 G4 C5 D5:.5 C5:.5 B4:.5 A4:.5 B4 C5:.5 B4:.5 A4:.5 G4:.5 F#4 G4:.5 A4:.5 B4:.5 G4:.5 A4:3 D5 G4:.5 A4:.5 B4:.5 C5:.5 D5 G4 G4 E5 C5:.5 D5:.5 E5:.5 F#5:.5 G5 G4 G4 C5 D5:.5 C5:.5 B4:.5 A4:.5 B4 C5:.5 B4:.5 A4:.5 G4:.5 A4 B4:.5 A4:.5 G4:.5 F#4:.5 G4:3',
    bass:  'G3+B3+D4:2 A3 B3:3 C4:3 B3:3 A3:3 G3:3 D4 B3 G3 D4 D3:.5 C4:.5 B3:.5 A3:.5 G3+B3+D4:2 A3 B3:3 C4:3 B3:3 A3:3 G3:3 C4 D4 D3 G3:2 G2',
    beam: { unit: 3, offset: 0 } },
  { id: 'escala2', name: 'Escalera gigante', emoji: '🚀', level: 3, bpm: 100,
    notes: 'C4:.5 D4:.5 E4:.5 F4:.5 G4:.5 A4:.5 B4:.5 C5:.5 D5:.5 E5:.5 F5:.5 G5:.5 A5:.5 B5:.5 C6:2 B5:.5 A5:.5 G5:.5 F5:.5 E5:.5 D5:.5 C5:.5 B4:.5 A4:.5 G4:.5 F4:.5 E4:.5 D4:.5 C4:2',
    bass:  'C3:.5 D3:.5 E3:.5 F3:.5 G3:.5 A3:.5 B3:.5 C4:.5 D4:.5 E4:.5 F4:.5 G4:.5 A4:.5 B4:.5 C5:2 B4:.5 A4:.5 G4:.5 F4:.5 E4:.5 D4:.5 C4:.5 B3:.5 A3:.5 G3:.5 F3:.5 E3:.5 D3:.5 C3:2',
    beam: { unit: 2, offset: 0 } },
  { id: 'cumple3', name: 'Cumpleaños feliz con acordes', emoji: '🎁', level: 3, bpm: 90,
    notes: 'G4:.75 G4:.25 A4 G4 C5 B4:2 G4:.75 G4:.25 A4 G4 D5 C5:2 G4:.75 G4:.25 G5 E5 C5 B4 A4:2 F5:.75 F5:.25 E5 C5 D5 C5:3',
    bass:  'R C3+E3+G3:3 B2+F3+G3:3 B2+F3+G3:3 C3+E3+G3:3 C3+E3+G3:3 C3+F3+A3:3 C3+E3+G3:3 B2+F3+G3 C3+E3+G3:3' },
  { id: 'oda3', name: 'Oda a la alegría con acordes', emoji: '🎆', level: 3, bpm: 100,
    notes: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2',
    bass:  'C3+E3+G3:4 B2+D3+G3:4 C3+E3+G3:4 B2+D3+G3:4 C3+E3+G3:4 B2+D3+G3:4 C3+E3+G3:4 B2+F3+G3:2 C3+E3+G3:2' },
];
