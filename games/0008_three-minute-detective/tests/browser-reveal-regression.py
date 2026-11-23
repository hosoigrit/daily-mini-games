"""Reproduce IR-01 in Chromium and assert the fix survives reinitialization."""
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('smoke',ROOT/'tests/browser-inline-smoke.py')
smoke=importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)
HTML=smoke.build_inline_page()

def run():
    for width,height in ((1280,850),(360,740)):
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':width,'height':height},locale='ja-JP')
            context.add_init_script('''
               Math.random=()=>0;
               const cache=Object.assign({},JSON.parse(window.name||'{}'));
               Object.defineProperty(window,'localStorage',{configurable:true,value:{
                 getItem:k=>cache[k]??null,
                 setItem:(k,v)=>{cache[k]=String(v);window.name=JSON.stringify(cache);}
               }});
            ''')
            page=context.new_page()
            errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
            print("BEFORE set_content",flush=True);page.set_content(HTML,wait_until='load');print("AFTER set_content",flush=True)
            print("BEFORE start",flush=True);page.locator('button[data-action="start"]').click(timeout=6000);print("AFTER start",flush=True)
            assert page.get_by_test_id('evidence-A01').count()==1
            page.locator('button[data-action="tab-board"]').first.click()
            print("BEFORE hint",flush=True);page.locator('button[data-action="hint"]').click(timeout=6000);print("AFTER hint",flush=True)
            print("BEFORE hint",flush=True);page.locator('button[data-action="hint"]').click(timeout=6000);print("AFTER hint",flush=True)
            print("BEFORE reveal",flush=True);page.locator('button[data-action="reveal"]').click(timeout=6000);print("AFTER reveal",flush=True)
            print("BEFORE confirm reveal",flush=True);page.locator('button[data-action="confirm-reveal"]').click(timeout=6000);print("AFTER confirm",flush=True)
            assert page.get_by_test_id('progress').inner_text().strip()=='0 / 3'
            p=page.evaluate('JSON.parse(window.localStorage.getItem("daily-mini-games:0008:progress:v1"))')
            assert p['revealed']==['gem-a'] and p['solved']==[],p
            # The next attempt must favor gem-b, not the already revealed gem-a.
            print("BEFORE start",flush=True);page.locator('button[data-action="start"]').click(timeout=6000);print("AFTER start",flush=True)
            assert page.get_by_test_id('evidence-B01').count()==1
            # Simulate a previous unaided clear of gem-b and gem-c before reloading.
            # This leaves only previously revealed gem-a as a candidate for replay.
            page.evaluate('''() => {const key="daily-mini-games:0008:progress:v1";
                 const p=JSON.parse(localStorage.getItem(key));p.solved=["gem-b","gem-c"];
                 localStorage.setItem(key,JSON.stringify(p));}''')
            # Start a fresh browsing context's document with stored data; do not
            # evaluate a second top-level `const` bundle in the same document.
            snapshot=page.evaluate('window.localStorage.getItem("daily-mini-games:0008:progress:v1")')
            page.close()
            page=context.new_page()
            page.on('pageerror',lambda err:errors.append(str(err)))
            page.evaluate('(raw)=>localStorage.setItem("daily-mini-games:0008:progress:v1",raw)',snapshot)
            page.set_content(HTML,wait_until='load')
            assert page.get_by_test_id('progress').inner_text().strip()=='2 / 3'
            print("BEFORE start",flush=True);page.locator('button[data-action="start"]').click(timeout=6000);print("AFTER start",flush=True)
            assert page.get_by_test_id('evidence-A01').count()==1
            for card in ['A01','A02','A03']:
                page.get_by_test_id('evidence-'+card).click()
            smoke.accuse(page,'ren')
            assert page.get_by_role('heading',name='再挑戦クリア！').count()==1
            assert page.get_by_test_id('progress').inner_text().strip()=='2 / 3'
            p=page.evaluate('JSON.parse(window.localStorage.getItem("daily-mini-games:0008:progress:v1"))')
            assert p['solved']==['gem-b','gem-c'] and 'gem-a' not in p['best'] and p['revealed']==['gem-a']
            assert not errors,errors
            print(f'IR-01 Chromium browser replay regression PASS width={width}')
            browser.close()

if __name__=='__main__':run()
