"""Additional offline Chromium UX checks: focus, navigation, theme and accidental input.
Uses the same inlined modules as the distributed PLAY_OFFLINE.html; no HTTP claims.
"""
from playwright.sync_api import sync_playwright
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path
spec=spec_from_file_location('smoke',Path(__file__).with_name('browser-inline-smoke.py'))
module=module_from_spec(spec)
spec.loader.exec_module(module)
build_inline_page=module.build_inline_page

html=build_inline_page()
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width,height in ((1280,900),(768,1024),(390,844),(360,740),(320,568)):
        ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=width==360,has_touch=width==360)
        ctx.add_init_script('Math.random = () => 0;')
        page=ctx.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(html,wait_until='load')
        page.get_by_test_id('case-blue-gem').click()
        assert page.evaluate('document.activeElement.dataset.id')=='blue-gem','case chooser keyboard focus lost'
        page.locator('button[data-action="start"]').click()
        assert page.evaluate('document.body.dataset.caseTheme')=='blue-gem'
        assert page.evaluate('document.querySelector(".gameplay-panel").getBoundingClientRect().top') < 150, 'start did not scroll into the gameplay region'
        first=page.get_by_test_id('evidence-A01');first.click()
        assert first.get_attribute('aria-pressed')=='true'
        assert page.evaluate('document.activeElement.dataset.id')=='A01','card toggle keyboard focus lost'
        for id in ('A02','A03','A04'):
            page.get_by_test_id('evidence-'+id).click()
        page.get_by_test_id('evidence-A05').click()
        assert page.locator('.selection-counter').inner_text()=='選択 4 / 4','5th evidence was incorrectly accepted'
        page.locator('.tabs button[data-action="tab-board"]').click()
        assert page.evaluate('document.activeElement.dataset.action')=='tab-board','board tab focus lost'
        assert page.evaluate('document.querySelector(".tabs").getBoundingClientRect().top') < 150,'tab not scrolled into view'
        assert page.locator('.selected-item').count()==4
        page.locator('.tabs button[data-action="tab-investigate"]').click()
        assert page.evaluate('document.activeElement.dataset.action')=='tab-investigate','investigate tab focus lost'
        assert page.get_by_test_id('evidence-A01').get_attribute('aria-pressed')=='true','card lost after tab change'
        page.locator('button[data-action="abort"]').click()
        page.get_by_role('button',name='捜査を続ける').click()
        assert page.get_by_test_id('evidence-A01').get_attribute('aria-pressed')=='true','cancel abort changed evidence'
        page.locator('button[data-action="abort"]').click()
        page.get_by_role('button',name='事件一覧へ戻る',exact=True).last.click()
        assert page.evaluate('document.body.dataset.caseTheme')=='home'
        assert page.evaluate('document.querySelector(".home-panel").getBoundingClientRect().top')<150,'home transition did not reset scroll'
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'horizontal overflow at {width}'
        assert not errors,errors
        print(f'QA navigation PASS {width}x{height}: focus, scroll, clue limit, cancel, neutral theme')
        ctx.close()
    browser.close()
