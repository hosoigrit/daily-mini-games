"""IR-01 browser regression: pre-seeded disclosed progress cannot become self-solved.

This intentionally starts from a saved, previously revealed variant. The
reveal transition itself is covered by Node state tests and browser-inline-smoke.
Using a fixed seed avoids fragile cross-document mocked storage in set_content.
"""
import importlib.util
import json
import os
from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('smoke',ROOT/'tests/browser-inline-smoke.py')
smoke=importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)
HTML=smoke.build_inline_page()
KEY='daily-mini-games:0008:progress:v1'


def run():
    saved={'solved':['gem-b','gem-c'],'revealed':['gem-a'],'firstClear':{},'best':{},'attempted':2}
    with sync_playwright() as pw:
        binary=os.getenv('CHROME_BIN') or shutil.which('chromium') or shutil.which('google-chrome')
        launch={'headless':True,'args':['--no-sandbox']}
        if binary:launch['executable_path']=binary
        browser=pw.chromium.launch(**launch)
        try:
            for width,height in ((1280,850),(360,740)):
                ctx=browser.new_context(viewport={'width':width,'height':height},locale='ja-JP')
                initial=json.dumps({KEY:json.dumps(saved,ensure_ascii=False)})
                ctx.add_init_script('''(function(){
                  const items=JSON.parse(%s);
                  Object.defineProperty(window,'localStorage',{configurable:true,value:{
                    getItem:k=>items[k]??null,
                    setItem:(k,v)=>items[k]=String(v),
                    removeItem:k=>delete items[k]
                  }});
                  Math.random=()=>0;
                })();'''%json.dumps(initial))
                page=ctx.new_page();page.set_default_timeout(8000)
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                page.set_content(HTML,wait_until='load')
                assert page.get_by_test_id('progress').inner_text().strip()=='2 / 3'
                page.locator('button[data-action="start"]').click()
                assert page.get_by_test_id('evidence-A01').count()==1
                for id in ('A01','A02','A03'):page.get_by_test_id('evidence-'+id).click()
                smoke.accuse(page,'ren')
                assert page.get_by_role('heading',name='再挑戦クリア！').count()==1
                assert page.get_by_test_id('progress').inner_text().strip()=='2 / 3'
                actual=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)
                assert actual['revealed']==['gem-a'] and actual['solved']==['gem-b','gem-c'] and 'gem-a' not in actual['best'],actual
                assert not errors,errors
                print(f'IR-01 Chromium regression PASS ({width}x{height}; spoiled gem-a not counted)')
                ctx.close()
        finally:
            browser.close()

if __name__=='__main__':run()
