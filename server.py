import http.server
import socketserver

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        pass  # silencia os logs

if __name__ == '__main__':
    import os
    os.chdir('frontend')
    with socketserver.TCPServer(('', 5500), NoCacheHandler) as httpd:
        print('Frontend rodando em http://127.0.0.1:5500')
        httpd.serve_forever()