import os
import re
import glob
import json
import html
import base64
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

SITE_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = 8080

def build_nav_html(nav_items, active_file):
    lines = []
    for item in nav_items:
        label = item.get("label", "")
        href = item.get("href", "index.html")
        children = item.get("children", [])
        is_active = (href == active_file) or any(c.get("href") == active_file for c in children)
        active_cls = " active" if is_active else ""
        if children:
            sub_items = "\n".join(
                f'<li><a href="{html.escape(c["href"])}" class="{"active" if c["href"] == active_file else ""}">{html.escape(c["label"])}</a></li>'
                for c in children
            )
            lines.append(
                f'<li class="has-dropdown{active_cls}">'
                f'<a href="{html.escape(href)}">{html.escape(label)}</a>'
                f'<ul class="dropdown">{sub_items}</ul>'
                f'</li>'
            )
        else:
            lines.append(f'<li class="{active_cls.strip()}"><a href="{html.escape(href)}">{html.escape(label)}</a></li>')
    inner = "\n          ".join(lines)
    return f'<nav class="site-nav">\n        <ul>\n          {inner}\n        </ul>\n      </nav>'

def get_media_items():
    uploads_abs = os.path.join(SITE_DIR, "uploads")
    if not os.path.exists(uploads_abs):
        return []

    # 1. Custom uploaded images first (newest first)
    custom_items = []
    custom_dir = os.path.join(uploads_abs, "custom")
    if os.path.exists(custom_dir):
        for fn in sorted(os.listdir(custom_dir), key=lambda x: os.path.getmtime(os.path.join(custom_dir, x)), reverse=True):
            ext = os.path.splitext(fn)[1].lower()
            if ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"):
                rel = f"uploads/custom/{fn}"
                custom_items.append({"name": f"★ {fn}", "disp": rel, "full": rel, "custom": True})

    # 2. Original Weebly backup images
    base_abs = os.path.join(uploads_abs, "1", "3", "8", "5", "138512987")
    stems = {}
    if os.path.exists(base_abs):
        for root, _, files in os.walk(base_abs):
            for fn in files:
                ext = os.path.splitext(fn)[1].lower()
                if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
                    continue
                rel_path = os.path.relpath(os.path.join(root, fn), SITE_DIR).replace("\\", "/")
                name_no_ext = os.path.splitext(fn)[0]
                is_orig = name_no_ext.endswith("_orig")
                stem = name_no_ext[:-5] if is_orig else name_no_ext
                if stem not in stems:
                    stems[stem] = {"name": stem + ext, "disp": rel_path, "full": rel_path}
                if is_orig:
                    stems[stem]["full"] = rel_path
                elif "/published/" not in rel_path and "/editor/" not in rel_path:
                    stems[stem]["disp"] = rel_path

    return custom_items + sorted(stems.values(), key=lambda x: x["name"].lower())

class EditorHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SITE_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/media"):
            items = get_media_items()
            data = json.dumps(items, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8")
        try:
            body = json.loads(raw)
        except Exception as e:
            self._send_json({"ok": False, "error": str(e)}, 400)
            return

        if self.path == "/api/upload":
            files_list = body.get("files", [])
            custom_dir = os.path.join(SITE_DIR, "uploads", "custom")
            os.makedirs(custom_dir, exist_ok=True)
            uploaded = []
            for fobj in files_list:
                raw_name = os.path.basename(fobj.get("name", "image.jpg"))
                # Sanitize filename
                safe_name = re.sub(r'[^\w\.\-\u4e00-\u9fff]+', '_', raw_name)
                b64_data = fobj.get("data", "")
                if "," in b64_data:
                    b64_data = b64_data.split(",", 1)[1]
                file_bytes = base64.b64decode(b64_data)
                dest = os.path.join(custom_dir, safe_name)
                if os.path.exists(dest):
                    stem, ext = os.path.splitext(safe_name)
                    safe_name = f"{stem}_{int(time.time())}{ext}"
                    dest = os.path.join(custom_dir, safe_name)
                with open(dest, "wb") as out:
                    out.write(file_bytes)
                rel = f"uploads/custom/{safe_name}"
                uploaded.append({"name": f"★ {safe_name}", "disp": rel, "full": rel, "custom": True})
            self._send_json({"ok": True, "uploaded": uploaded})
            return

        if self.path == "/api/save":
            filename = os.path.basename(body.get("file", "index.html"))
            main_html = body.get("mainHtml", "")
            target_path = os.path.join(SITE_DIR, filename)
            if not os.path.exists(target_path):
                self._send_json({"ok": False, "error": f"File not found: {filename}"}, 404)
                return
            with open(target_path, "r", encoding="utf-8") as f:
                content = f.read()
            new_content = re.sub(
                r'(<main class="site-main">).*?(</main>)',
                lambda m: f'{m.group(1)}\n    {main_html}\n  {m.group(2)}',
                content,
                flags=re.S
            )
            with open(target_path, "w", encoding="utf-8") as f:
                f.write(new_content)
            self._send_json({"ok": True, "file": filename})
            return

        if self.path == "/api/nav":
            nav_items = body.get("nav", [])
            template_file = os.path.join(SITE_DIR, "about.html")
            template_html = open(template_file, "r", encoding="utf-8").read() if os.path.exists(template_file) else ""
            all_links = []
            for it in nav_items:
                all_links.append((it.get("label", "Page"), it.get("href", "")))
                for ch in it.get("children", []):
                    all_links.append((ch.get("label", "Page"), ch.get("href", "")))

            for label, href in all_links:
                fn = os.path.basename(href)
                if fn.endswith(".html"):
                    p = os.path.join(SITE_DIR, fn)
                    if not os.path.exists(p) and template_html:
                        blank = re.sub(
                            r'(<main class="site-main">).*?(</main>)',
                            f'\\1\n    <h1 class="page-title">{html.escape(label)}</h1>\n    <div class="section-block"><h2 class="section-heading">New Section</h2></div>\n  \\2',
                            template_html,
                            flags=re.S
                        )
                        with open(p, "w", encoding="utf-8") as f:
                            f.write(blank)

            for html_file in glob.glob(os.path.join(SITE_DIR, "*.html")):
                fn = os.path.basename(html_file)
                with open(html_file, "r", encoding="utf-8") as f:
                    c = f.read()
                new_nav = build_nav_html(nav_items, fn)
                c = re.sub(r'<nav class="site-nav">.*?</nav>', new_nav, c, flags=re.S)
                with open(html_file, "w", encoding="utf-8") as f:
                    f.write(c)

            self._send_json({"ok": True})
            return

        self._send_json({"ok": False, "error": "Unknown endpoint"}, 404)

    def _send_json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(data)

if __name__ == "__main__":
    print(f"====================================================")
    print(f" Weebly 互動式視覺化編輯伺服器已啟動！")
    print(f" 請在瀏覽器開啟: http://localhost:{PORT}")
    print(f"====================================================")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), EditorHandler)
    server.serve_forever()
