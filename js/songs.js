// Canciones del modo juego.
// Formato: "NOTA[:duración]" separadas por espacios. Duración en tiempos (negra = 1). "R" = silencio.
// level: 1 Fácil, 2 Medio, 3 Difícil.
window.SONGS = [
  // ---------- Fácil ----------
  { id: 'escala', name: 'Escalera de Do', emoji: '🪜', level: 1, bpm: 90,
    notes: 'C4 D4 E4 F4 G4 A4 B4 C5:2 C5 B4 A4 G4 F4 E4 D4 C4:2' },
  { id: 'estrellita', name: 'Estrellita', emoji: '⭐', level: 1, bpm: 100,
    notes: 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2' },
  { id: 'corderito', name: 'María tenía un corderito', emoji: '🐑', level: 1, bpm: 110,
    notes: 'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4' },
  { id: 'martinillo', name: 'Martinillo', emoji: '🔔', level: 1, bpm: 110,
    notes: 'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2' },

  // ---------- Medio ----------
  { id: 'cumple', name: 'Cumpleaños feliz', emoji: '🎂', level: 2, bpm: 100,
    notes: 'G4:.75 G4:.25 A4 G4 C5 B4:2 G4:.75 G4:.25 A4 G4 D5 C5:2 G4:.75 G4:.25 G5 E5 C5 B4 A4:2 F5:.75 F5:.25 E5 C5 D5 C5:3' },
  { id: 'oda', name: 'Oda a la alegría', emoji: '🎉', level: 2, bpm: 110,
    notes: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2 D4 D4 E4 C4 D4 E4:.5 F4:.5 E4 C4 D4 E4:.5 F4:.5 E4 D4 C4 D4 G3:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2' },
  { id: 'jingle', name: 'Navidad (Jingle Bells)', emoji: '🎄', level: 2, bpm: 120,
    notes: 'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 E4 D4 D4 E4 D4:2 G4:2 E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 G4 G4 F4 D4 C4:4' },
  { id: 'cucaracha', name: 'La cucaracha', emoji: '🪇', level: 2, bpm: 140,
    notes: 'C4:.5 C4:.5 C4:.5 F4 A4:2.5 C4:.5 C4:.5 C4:.5 F4 A4:2.5 F4 F4 E4 E4 D4 D4 C4:3 C4:.5 C4:.5 C4:.5 E4 G4:2.5 C4:.5 C4:.5 C4:.5 E4 G4:2.5 C5 D5 C5 A#4 A4 G4 F4:3' },

  // ---------- Difícil ----------
  { id: 'elisa', name: 'Para Elisa', emoji: '🌹', level: 3, bpm: 80,
    notes: 'E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:1.5 C4:.5 E4:.5 A4:.5 B4:1.5 E4:.5 G#4:.5 B4:.5 C5:1.5 E4:.5 E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:1.5 C4:.5 E4:.5 A4:.5 B4:1.5 E4:.5 C5:.5 B4:.5 A4:3' },
  { id: 'minueto', name: 'Minueto en Sol', emoji: '🩰', level: 3, bpm: 110,
    notes: 'D5 G4:.5 A4:.5 B4:.5 C5:.5 D5 G4 G4 E5 C5:.5 D5:.5 E5:.5 F#5:.5 G5 G4 G4 C5 D5:.5 C5:.5 B4:.5 A4:.5 B4 C5:.5 B4:.5 A4:.5 G4:.5 F#4 G4:.5 A4:.5 B4:.5 G4:.5 A4:3 D5 G4:.5 A4:.5 B4:.5 C5:.5 D5 G4 G4 E5 C5:.5 D5:.5 E5:.5 F#5:.5 G5 G4 G4 C5 D5:.5 C5:.5 B4:.5 A4:.5 B4 C5:.5 B4:.5 A4:.5 G4:.5 A4 B4:.5 A4:.5 G4:.5 F#4:.5 G4:3' },
  { id: 'escala2', name: 'Escalera gigante', emoji: '🚀', level: 3, bpm: 100,
    notes: 'C4:.5 D4:.5 E4:.5 F4:.5 G4:.5 A4:.5 B4:.5 C5:.5 D5:.5 E5:.5 F5:.5 G5:.5 A5:.5 B5:.5 C6:2 B5:.5 A5:.5 G5:.5 F5:.5 E5:.5 D5:.5 C5:.5 B4:.5 A4:.5 G4:.5 F4:.5 E4:.5 D4:.5 C4:2' },
];
