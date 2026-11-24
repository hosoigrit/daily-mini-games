"""Offline Chromium UI check for display-only evidence shuffling.
Not a local HTTP or real-device test.
"""
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec
from playwright.sync_api import sync_playwright

spec=spec_from_file_location('smoke',Path(__file__).with_name('browser-inline-smoke.py'))
module=module_from_spec(spec); spec.loader.exec_module(module)
html=module.build_inline_page()

def order(page):
    return page.locator('button.evidence-card').evaluate_all('(nodes) => nodes.map(n => n.dataset.id)')

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for w,h in [(1280,900),(360,740)]:
        ctx=browser.new_context(viewport={'width':w,'height':h},is_mobile=(w==360),has_touch=(w==360))
        ctx.add_init_script('Math.random = () => 0')
        page=ctx.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(html,wait_until='load')
        page.get_by_test_id('case-blue-gem').click()
        page.locator('button[data-action="start"]').click()
        first=order(page)
        assert len(first)==5 and set(first)=={'A01','A02','A03','A04','A05'}
        assert first != ['A01','A02','A03','A04','A05']
        page.get_by_test_id('evidence-A01').click()
        page.locator('button[data-action="tab-board"]').first.click()
        assert page.locator('.selected-item').count()==1
        page.locator('button[data-action="tab-investigate"]').first.click()
        assert order(page)==first, 'order moved during investigation'
        assert page.get_by_test_id('evidence-A01').get_attribute('aria-pressed')=='true'
        page.get_by_test_id('evidence-A02').click()
        page.get_by_test_id('evidence-A03').click()
        page.locator('button[data-action="tab-board"]').first.click()
        page.get_by_test_id('suspect-ren').click()
        page.get_by_test_id('accuse').click()
        page.get_by_role('button',name='告発を確定').click()
        assert page.get_by_role('heading',name='事件解決！').count()==1
        page.locator('button[data-action="start"]').click()
        second=order(page)
        assert set(second)=={'B01','B02','B03','B04','B05'}, second
        assert second != ['B01','B02','B03','B04','B05'], second
        assert not errors,errors
        print(f'Evidence order UI PASS {w}x{h}: shuffle, persistence, clue selection, clear, next truth')
        ctx.close()
    browser.close()
