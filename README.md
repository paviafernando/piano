# Piano

Piano web de 88 teclas (La0 a Do8), pensado para tocar en el celular en horizontal.

- **Minimapa abajo**: muestra el teclado entero y un recuadro con la parte que estás viendo. Arrastrá el recuadro o tocá cualquier zona para saltar ahí.
- **Multitáctil** y glissando (deslizar el dedo sobre las teclas).
- **Zoom** de teclas (− / +), **pedal** de sustain, nombres de notas (Do, Re, Mi…), volumen.
- **Pantalla completa** con bloqueo en horizontal (Android/desktop). En iPhone: Compartir → "Agregar a inicio" y abrir desde el ícono.
- **Teclado de compu**: A S D F G H J K = blancas, W E T Y U O P = negras, Z/X cambian de octava, espacio = pedal.
- **🎮 Modo juego** con 11 canciones en 3 niveles (Fácil, Medio, Difícil):
  - **Aprender**: las notas te esperan hasta que tocás la tecla que brilla, y se evalúa cuánto la mantenés apretada (la duración de cada nota). Se puede ver con bloques que caen o en **pentagrama**.
  - **Desafío**: tocá cada nota justo cuando llega a la línea (Perfecto / Genial / Bien), con combos y multiplicador.
  - **Adivinar**: aparece una nota en el pentagrama y hay que tocar la tecla correcta (3 niveles, con sostenidos en el difícil).
  - Tempo ajustable (40% a 150%), 🎧 escuchar la canción antes, estrellas y récord por canción, rangos por estrellas totales.
- **Estilo princesa 👑 / normal 🌙**: cambia colores, tipografía, estrellitas y efectos.
- Funciona offline una vez cargado (service worker).

Sin build: es un sitio estático (`index.html`). Deploy en Vercel.

Sonido: muestras del *Salamander Grand Piano* de Alexander Holm (CC-BY 3.0), vía [Tone.js audio](https://github.com/Tonejs/audio).
