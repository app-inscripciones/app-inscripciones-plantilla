# Guías rápidas de una hoja por rol (Etapa 9, punto 6)

`python3 armar_guias.py` arma en `guias/` una hoja A4 por rol (HTML, PDF e imagen): Cargador, Control de presentes,
Organizador, Tesorero, Consulta y Responsable general. Son para imprimir y tener a mano el día del evento.

- Genéricas: no nombran a ninguna institución. Abajo tienen un recuadro «Mis datos» para completar a mano
  (evento, horario, a quién llamar).
- Los textos de los botones son los de la app. Si cambia una pantalla, se corrige acá y se vuelven a armar.
- El script **falla si alguna guía no entra en una sola hoja**, así nunca se entrega una de dos hojas.
- Necesita Python con `playwright` (Chromium) y `pypdf`.
