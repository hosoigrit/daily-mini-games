"""Real local-HTTP module-loading smoke. Run on user's PC after installing Playwright.

Requires Python Playwright and a Chromium installation. This does NOT contact GitHub.
The sandbox environment may block loopback navigation, so this test is shipped but
not claimed to have run there.
"""
import functools
import os
import shutil
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[3]
GAME='games/0008_three-minute-detective/'


def run():
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
    thread=Thread(target=server.serve_forever,daemon=True);thread.start()
    # The game is served from the repository root. Fail early on a 404,
    # rather than confusing a wrong path with an inaccessible browser.
    for path in (GAME, GAME+'engine.mjs', GAME+'approved-narratives.mjs'):
        with urlopen(f'http://127.0.0.1:{server.server_port}/{path}',timeout=5) as response:
            assert response.status==200,(path,response.status)
            assert response.read(256),(path,'empty response')
    print('Local HTTP asset preflight PASS (index + two ES modules: 200)',flush=True)
    with sync_playwright() as pw:
        binary=os.getenv('CHROME_BIN') or shutil.which('chromium') or shutil.which('google-chrome')
        launch={'headless':True}
        if binary:launch['executable_path']=binary
        browser=pw.chromium.launch(**launch)
        try:
            for width,height in ((1280,900),(360,740)):
                ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=width==360,has_touch=width==360,locale='ja-JP')
                ctx.add_init_script('Math.random=()=>0')
                page=ctx.new_page();errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{server.server_port}/{GAME}',wait_until='networkidle')
                assert page.get_by_test_id('case-manuscript').count()==1
                page.get_by_test_id('case-manuscript').click()
                page.locator('button[data-action="start"]').click()
                for id in ['M101','M102','M103']:page.get_by_test_id('evidence-'+id).click()
                page.locator('button[data-action="tab-board"]').first.click()
                page.get_by_test_id('suspect-mina').click()
                page.get_by_test_id('accuse').click()
                page.get_by_role('button',name='告発を確定').click()
                assert page.get_by_role('heading',name='事件解決！').count()==1
                page.get_by_role('button',name='事件一覧へ戻る').click()
                page.reload(wait_until='networkidle')
                page.get_by_test_id('case-manuscript').click()
                assert page.get_by_test_id('progress').inner_text().strip()=='1 / 3'
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                assert not errors,errors
                ctx.close()
                print(f'HTTP modules E2E PASS ({width}x{height}, manuscript first truth and persistent save)')
        finally:
            browser.close();server.shutdown()

if __name__=='__main__':run()
