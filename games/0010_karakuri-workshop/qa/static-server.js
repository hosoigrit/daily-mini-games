'use strict';

const {createServer}=require('node:http');
const {readFile,realpath}=require('node:fs/promises');
const {extname,resolve,sep}=require('node:path');
const root=resolve(__dirname,'..');
const contentTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try{
    const {pathname}=new URL(req.url,'http://127.0.0.1');
    if(pathname==='/qa/away'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      res.end('<!doctype html><title>QA away</title><p>Other page</p>');return;
    }
    const name=pathname==='/'?'index.html':decodeURIComponent(pathname).slice(1);
    const path=await realpath(resolve(root,name));
    const type=contentTypes[extname(path)];
    if(!path.startsWith(root+sep)||!type){res.writeHead(404);res.end();return;}
    const body=await readFile(path);
    res.writeHead(200,{'Content-Type':type});
    res.end(body);
  }catch{
    res.writeHead(404);res.end();
  }
});
server.listen(Number(process.env.GAME0010_QA_PORT??0),'127.0.0.1',()=>{
  console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port}));
});
