"""Run data-driven browser E2E against the identical JS modules inlined for restricted localhost environments."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright

GAME=Path(__file__).resolve().parents[1]
ROOT=GAME.parents[1]
SCREENSHOTS=ROOT/'screenshots'
SCREENSHOTS.mkdir(exist_ok=True)
CASES=[
 ('blue-gem', [('A01','A02','A03','ren'),('B01','B02','B04','aoi'),('C01','C02','C03','C05','sora')]),
 ('manuscript',[('M101','M102','M103','mina'),('M201','M202','M203','toma'),('M301','M302','M303','haru')]),
 ('clocktower',[('K101','K102','K103','yui'),('K201','K202','K203','akira'),('K301','K302','K303','K304','nao')]),
 ('harbor',[('H101','H102','H103','takumi'),('H201','H202','H203','risa'),('H301','H302','H303','H304','fumi')])
]

def build_inline_page():
    html=(GAME/'index.html').read_text(encoding='utf-8')
    css=(GAME/'styles.css').read_text(encoding='utf-8')
    js='\n'.join(re.sub(r'(?m)^export ', '', re.sub(r'(?m)^import .*?;\n', '', (GAME/name).read_text(encoding='utf-8'))) for name in ('additional-cases.mjs','case-data.mjs','proof-contracts.mjs','evidence-propositions.mjs','approved-narratives.mjs','engine.mjs','storage.mjs','app.mjs'))
    html=html.replace('<link rel="stylesheet" href="./styles.css">',f'<style>{css}</style>')
    html=html.replace('<script type="module" src="./app.mjs"></script>','')
    return html.replace('</body>',f'<script>{js}</script></body>')

def accuse(page,person):
    page.locator('button[data-action="tab-board"]').first.click()
    page.get_by_test_id(f'suspect-{person}').click()
    page.get_by_test_id('accuse').click()
    page.get_by_role('button',name='告発を確定').click()

def run():
    html=build_inline_page()
    (ROOT/'PLAY_OFFLINE.html').write_text(html,encoding='utf-8')
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        try:
            for width,height in ((1280,900),(360,740)):
                context=browser.new_context(viewport={'width':width,'height':height},is_mobile=width==360,has_touch=width==360,locale='ja-JP')
                context.add_init_script('''
                  Math.random = () => 0;
                  const dict = new Map();
                  Object.defineProperty(window, 'localStorage', {configurable:true,value:{getItem:k=>dict.get(k)??null,setItem:(k,v)=>dict.set(k,String(v))}});
                ''')
                page=context.new_page()
                page.set_default_timeout(7000)
                errors=[]
                page.on('pageerror',lambda exc:errors.append(str(exc)))
                page.set_content(html,wait_until='load')
                assert page.locator('body').get_attribute('data-case-theme')=='home'
                assert page.locator('meta[name="theme-color"]').get_attribute('content')=='#212a31'
                assert page.get_by_role('heading',name='3分探偵').count()==1
                assert page.get_by_text('全4事件 / 12真相').count()==1
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),f'homepage horizontal overflow {width}'
                page.screenshot(path=str(SCREENSHOTS/('v061-mobile-cases.png' if width==360 else 'v061-desktop-cases.png')),full_page=True)
                count=0
                for case_id,variants in CASES:
                    page.get_by_test_id(f'case-{case_id}').click()
                    # Browsing different cases never changes the neutral home palette.
                    assert page.locator('body').get_attribute('data-case-theme')=='home'
                    assert page.get_by_test_id('progress').inner_text().strip()=='0 / 3'
                    page.locator('button[data-action="start"]').click()
                    assert page.locator('body').get_attribute('data-case-theme')==case_id
                    theme_color={'blue-gem':'#102a50','manuscript':'#3a1e34','clocktower':'#3c3020','harbor':'#103b40'}[case_id]
                    assert page.locator('meta[name="theme-color"]').get_attribute('content')==theme_color
                    expected_background={'blue-gem':'rgb(16, 42, 80)','manuscript':'rgb(58, 30, 52)','clocktower':'rgb(60, 48, 32)','harbor':'rgb(16, 59, 64)'}[case_id]
                    page.wait_for_function('(expected) => getComputedStyle(document.body).backgroundColor === expected',arg=expected_background,timeout=3000)
                    page.screenshot(path=str(SCREENSHOTS/(f'v061-{case_id}-'+('mobile' if width==360 else 'desktop')+'.png')),full_page=True)
                    if case_id=='blue-gem':
                        if width==360:
                            mobile_ctx=page.locator('button[data-action="toggle-context"]')
                            assert mobile_ctx.get_attribute('aria-expanded')=='true'
                            mobile_ctx.click()
                            assert mobile_ctx.get_attribute('aria-expanded')=='false'
                            mobile_ctx.click()
                            assert mobile_ctx.get_attribute('aria-expanded')=='true'
                        page.locator('button[data-action="abort"]').click()
                        assert page.get_by_role('dialog').count()==1
                        page.get_by_role('button',name='捜査を続ける').click()
                        assert page.get_by_test_id('evidence-A01').count()==1
                        page.locator('button[data-action="abort"]').click()
                        page.get_by_role('button',name='事件一覧へ戻る',exact=True).last.click()
                        assert page.get_by_test_id('progress').inner_text().strip()=='0 / 3'
                        page.locator('button[data-action="start"]').click()
                    for index,item in enumerate(variants):
                        *ids,person=item
                        assert page.get_by_test_id(f'evidence-{ids[0]}').count()==1, f'{case_id}/{index}'
                        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),f'playing overflow {width}: {case_id}'
                        if case_id=='blue-gem' and index==0:
                            page.screenshot(path=str(SCREENSHOTS/('v061-mobile-investigation.png' if width==360 else 'v061-desktop-investigation.png')),full_page=True)
                        if case_id=='blue-gem' and index==1:
                            page.locator('button[data-action="tab-board"]').first.click()
                            page.get_by_role('button',name='ヒント1を見る').click()
                            page.get_by_role('button',name='ヒント2を見る').click()
                            # Reveal/replay regression is covered separately.
                            page.locator('button[data-action="tab-investigate"]').first.click()
                        for id in ids:page.get_by_test_id('evidence-'+id).click()
                        if case_id=='blue-gem' and index==0:
                            accuse(page,'aoi')
                            feedback=page.locator('.neutral-feedback').inner_text()
                            assert 'レン' not in feedback and 'アオイ' not in feedback
                            page.get_by_test_id('suspect-ren').click()
                            page.get_by_test_id('accuse').click()
                            page.get_by_role('button',name='告発を確定').click()
                        else:accuse(page,person)
                        assert page.get_by_role('heading',name='事件解決！').count()==1,f'{case_id}:{index}'
                        assert page.locator('body').get_attribute('data-case-theme')==case_id
                        count+=1
                        assert page.get_by_test_id('progress').inner_text().strip()==f'{index+1} / 3'
                        if case_id=='blue-gem' and index==0:
                            assert '820' in page.locator('.result-stats').inner_text()
                            page.screenshot(path=str(SCREENSHOTS/('v061-mobile-result.png' if width==360 else 'v061-desktop-result.png')),full_page=True)
                        if index!=2:page.locator('button[data-action="start"]').click()
                        else:
                            page.locator('button[data-action="home"]').click()
                            assert page.locator('body').get_attribute('data-case-theme')=='home'
                assert count==12
                for case_id,_ in CASES:
                    page.get_by_test_id(f'case-{case_id}').click()
                    assert page.get_by_test_id('progress').inner_text().strip()=='3 / 3'
                assert not errors,errors
                print(f'Browser-inline E2E PASS ({width}x{height}; 4 cases x 3 truths, feedback/hints/reveal, 12 self-solved, no overflow/errors)')
                context.close()
        finally:browser.close()

if __name__=='__main__':run()
