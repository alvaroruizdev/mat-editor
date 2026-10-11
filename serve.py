#!/usr/bin/env python3
"""Servidor estático de desarrollo para mat-editor.

Igual que `python3 -m http.server` pero manda `Cache-Control: no-store`,
de modo que el navegador nunca ejecute una versión cacheada/vieja de los
módulos JS después de editarlos (esto causó confusión con export/import).

Uso:
    python3 serve.py            # http://localhost:8000/
    python3 serve.py 8080       # otro puerto

Escucha solo en 127.0.0.1 (no expone el proyecto en la red local).
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # silencio: log mínimo
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    directory = sys.argv[2] if len(sys.argv) > 2 else "."
    handler = partial(NoCacheHandler, directory=directory)
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Sirviendo {directory}/ en http://localhost:{port}/ (Cache-Control: no-store)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nParando…")


if __name__ == "__main__":
    main()
