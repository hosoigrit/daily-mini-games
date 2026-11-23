"""Real local-HTTP module-loading smoke. Run on user's PC after installing Playwright.

Requires Python Playwright and a Chromium installation. This does NOT contact GitHub.
The sandbox environment may block loopback navigation, so this test is shipped but
not claimed to have run there.
"""
import functools
import os
import shutil
from tempfile import TemporaryDirectory
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[3]
SUBPATH='daily-mini-games'
GAME=f'{SUBPATH}/games/0008_three-minute-detective/'


class RecordingHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        self.server.paths.append(self.path)
        super().do_GET()


def run():
    with TemporaryDirectory() as root:
        (Path(root) / SUBPATH).symlink_to(ROOT, target_is_directory=True)
        run_browser(root)


def assert_focused_heading(page, session, title):
    heading=page.get_by_role('heading',name=title,exact=True)
    assert heading.evaluate('element => element === document.activeElement')
    node=session.send('DOM.describeNode',{'objectId':session.send('Runtime.evaluate',{'expression':'document.activeElement'})['result']['objectId']})['node']
    ax=session.send('Accessibility.getPartialAXTree',{'backendNodeId':node['backendNodeId'],'fetchRelatives':False})['nodes'][0]
    assert ax['role']['value']=='heading' and ax['name']['value']==title
    assert any(prop['name']=='focused' and prop['value']['value'] for prop in ax['properties'])


def run_browser(root):
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(RecordingHandler,directory=root))
    server.paths=[]
    thread=Thread(target=server.serve_forever,daemon=True);thread.start()
    # Mirror the project subpath with the source game as the runtime candidate.
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
                page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
                page.on('response',lambda r:errors.append(r.url) if r.status>=400 else None)
                session=ctx.new_cdp_session(page)
                page.goto(f'http://127.0.0.1:{server.server_port}/{GAME}',wait_until='networkidle')
                assert page.get_by_test_id('case-manuscript').count()==1
                page.get_by_test_id('case-manuscript').click()
                page.locator('button[data-action="start"]').press('Enter')
                assert_focused_heading(page,session,'犯人を論理で追いつめろ')
                page.keyboard.press('Tab')
                assert page.evaluate('document.activeElement.tagName')=='BUTTON'
                for id in ['M101','M102','M103']:page.get_by_test_id('evidence-'+id).click()
                page.locator('button[data-action="tab-board"]').first.click()
                page.get_by_test_id('suspect-mina').click()
                page.get_by_test_id('accuse').click()
                page.get_by_role('button',name='告発を確定').click()
                assert_focused_heading(page,session,'事件解決！')
                page.keyboard.press('Tab')
                assert page.evaluate('document.activeElement.dataset.action')=='start'
                page.get_by_role('button',name='事件一覧へ戻る').press('Enter')
                assert_focused_heading(page,session,'捜査する事件を選ぶ')
                page.reload(wait_until='networkidle')
                page.get_by_test_id('case-manuscript').click()
                assert page.get_by_test_id('progress').inner_text().strip()=='1 / 3'
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                assert not errors,errors
                ctx.close()
                print(f'HTTP modules E2E PASS ({width}x{height}, manuscript first truth and persistent save)')
            assert not any(path.endswith('/favicon.ico') for path in server.paths),server.paths
        finally:
            browser.close();server.shutdown()
            server.server_close()

if __name__=='__main__':run()
