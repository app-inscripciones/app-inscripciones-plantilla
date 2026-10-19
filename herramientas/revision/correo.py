"""Manda (o prueba) un correo desde el Gmail de la institución, con su contraseña de aplicación.
Lo usa la revisión diaria (revisar.mjs). Recibe por la entrada estándar un JSON:
  {"accion": "probar", "de": "...@gmail.com", "clave": "..."}
  {"accion": "enviar", "de": "...", "clave": "...", "para": ["..."], "asunto": "...", "texto": "..."}
Sale con código 0 si salió bien; si no, escribe el motivo y sale con 1. Nunca muestra la clave."""
import json, smtplib, ssl, sys
from email.message import EmailMessage

d = json.load(sys.stdin)
clave = "".join(str(d["clave"]).split())  # Google la muestra en grupos de 4 con espacios
try:
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=30) as s:
        s.login(d["de"], clave)
        if d.get("accion") == "enviar":
            m = EmailMessage()
            m["From"] = f"Sistema de inscripciones <{d['de']}>"
            m["To"] = ", ".join(d["para"])
            m["Subject"] = d["asunto"]
            m.set_content(d["texto"])
            s.send_message(m)
except smtplib.SMTPAuthenticationError:
    print("Google no aceptó la contraseña de aplicación", file=sys.stderr)
    sys.exit(1)
except Exception as e:  # noqa: BLE001
    print(f"{type(e).__name__}: {str(e)[:150]}", file=sys.stderr)
    sys.exit(1)
