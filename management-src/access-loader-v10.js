/* PAKKOM_MANAGEMENT_ACCESS_V10: persistent, non-extractable local key; never stores a password. */
'use strict';
(()=>{
 const $=id=>document.getElementById(id), enc=new TextEncoder(), dec=new TextDecoder('utf-8',{fatal:true});
 const initial=JSON.parse($('pakkom-sealed-release').textContent);
 let active=initial,privateKey=null,busy=false,epoch=0;
 const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const hex=a=>Array.from(new Uint8Array(a),x=>x.toString(16).padStart(2,'0')).join('');
 const fingerprint=r=>r.account.publicKey+':'+r.account.salt+':'+r.account.iv;
 $('date').textContent=initial.through;
 function validate(r){if(r.schema!=='pakkom-management-sealed-v1'||!r.payload||!r.account||r.account.kdf!=='PBKDF2-SHA256'||r.account.iterations!==600000)throw Error('Unsupported release');}
 // IndexedDB structured-clones CryptoKey without making it extractable. The password is not persisted.
 function savedAccess(action,key=null,r=active){
   return new Promise((resolve,reject)=>{
     let db=null,settled=false;
     const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(db)db.close();error?reject(error):resolve(value);};
     const timer=setTimeout(()=>finish(Error('Local storage timeout')),2500);
     try{
       const request=indexedDB.open('pakkom-management-access',1);
       request.onupgradeneeded=()=>{const d=request.result;if(!d.objectStoreNames.contains('access'))d.createObjectStore('access');};
       request.onerror=()=>finish(request.error||Error('Local storage unavailable'));
       request.onblocked=()=>finish(Error('Local storage blocked'));
       request.onsuccess=()=>{
         db=request.result;if(settled){db.close();return;}
         const tx=db.transaction('access',action==='get'?'readonly':'readwrite'),store=tx.objectStore('access');let result=null;
         tx.oncomplete=()=>finish(null,result);tx.onerror=()=>finish(tx.error||Error('Local storage failed'));tx.onabort=()=>finish(Error('Local storage aborted'));
         if(action==='get'){const q=store.get('current');q.onsuccess=()=>{const x=q.result;result=x&&x.fingerprint===fingerprint(r)?x.key:null;};}
         else if(action==='put')store.put({fingerprint:fingerprint(r),key,version:1},'current');
         else if(action==='delete')store.delete('current');
         else throw Error('Unknown local storage action');
       };
     }catch(error){finish(error);}
   });
 }
 async function unlockKey(password,r){
   const a=r.account;
   const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
   const wrapping=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:bytes(a.salt),iterations:a.iterations},material,{name:'AES-GCM',length:256},false,['decrypt']);
   const pkcs8=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(a.iv),additionalData:enc.encode('pakkom-management-key-v1')},wrapping,bytes(a.privateKeyCiphertext));
   try{return await crypto.subtle.importKey('pkcs8',pkcs8,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);}
   finally{new Uint8Array(pkcs8).fill(0);}
 }
 async function content(r,key){
   validate(r);const p=r.payload;
   const raw=await crypto.subtle.decrypt({name:'RSA-OAEP'},key,bytes(p.wrappedKey));let aes;
   try{aes=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);}finally{new Uint8Array(raw).fill(0);}
   const compressed=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(p.iv),additionalData:enc.encode('pakkom-management-dashboard-v1')},aes,bytes(p.ciphertext));
   const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
   const plain=await new Response(stream).arrayBuffer();
   if(hex(await crypto.subtle.digest('SHA-256',plain))!==p.sha256)throw Error('Release checksum mismatch');
   const html=dec.decode(plain);new Uint8Array(plain).fill(0);return applyPakkomManagementFiltersV9(html);
 }
 function display(html,r){
   $('board').removeAttribute('src');$('board').srcdoc=html;$('active-date').textContent='Данные по '+r.through;
   $('gate').hidden=true;$('working').hidden=false;active=r;
 }
 function clearScreen(){
   privateKey=null;$('board').removeAttribute('srcdoc');$('board').src='about:blank';
   $('working').hidden=true;$('gate').hidden=false;$('password').value='';$('password').type='password';
   $('show').textContent='Показать';$('show').setAttribute('aria-label','Показать пароль');$('status').textContent='';
 }
 $('show').onclick=()=>{const p=$('password');p.type=p.type==='password'?'text':'password';$('show').textContent=p.type==='password'?'Показать':'Скрыть';$('show').setAttribute('aria-label',p.type==='password'?'Показать пароль':'Скрыть пароль');};
 $('login').onsubmit=async e=>{
   e.preventDefault();if(busy)return;
   if(!globalThis.crypto?.subtle||!globalThis.DecompressionStream){$('message').textContent='Откройте страницу в актуальном Chrome, Edge или Safari по HTTPS.';return;}
   const token=++epoch;busy=true;$('open').disabled=true;$('message').textContent='Открываю дашборд…';
   let secret=$('password').value;
   try{
     validate(active);const key=await unlockKey(secret,active);secret='';
     const html=await content(active,key);if(token!==epoch)return;
     let note='';
     try{await savedAccess($('remember').checked?'put':'delete',key,active);}
     catch{note='Вход открыт, но браузер не разрешил сохранить доступ.';}
     if(token!==epoch)return;
     privateKey=key;display(html,active);$('password').value='';$('message').textContent='';$('status').textContent=note;
   }catch{if(token===epoch){privateKey=null;$('message').textContent='Не удалось открыть. Проверьте пароль и целостность файла.';}}
   finally{secret='';busy=false;$('open').disabled=false;}
 };
 $('lock').onclick=async()=>{
   ++epoch;clearScreen();busy=true;$('open').disabled=true;$('message').textContent='Удаляю сохранённый вход…';
   try{await savedAccess('delete');$('message').textContent='Вы вышли. Сохранённый вход удалён.';}
   catch{$('message').textContent='Страница закрыта. Чтобы удалить сохранённый вход, очистите данные этого сайта в браузере.';}
   finally{busy=false;$('open').disabled=false;$('password').focus();}
 };
 $('refresh').onclick=async()=>{
   if(busy||!privateKey)return;
   if(location.protocol==='file:'){$('status').textContent='Онлайн-обновление доступно после публикации.';return;}
   const token=epoch,key=privateKey;busy=true;$('refresh').disabled=true;$('status').className='';$('status').textContent='Проверяю…';
   try{
     const url=new URL(location.href);url.hash='';url.searchParams.set('_release',String(Date.now()));
     const response=await fetch(url,{cache:'no-store',credentials:'omit',redirect:'error'});
     if(!response.ok)throw Error('HTTP error');
     const text=await response.text();const match=text.match(/<script id="pakkom-sealed-release" type="application\/json">([\s\S]*?)<\/script>/);
     if(!match)throw Error('Missing sealed release');const next=JSON.parse(match[1]);validate(next);
     if(fingerprint(next)!==fingerprint(active)){$('status').textContent='Изменён доступ: откройте страницу заново.';return;}
     if(next.payload.sha256===active.payload.sha256){$('status').textContent='У вас актуальная версия';return;}
     const html=await content(next,key);if(epoch!==token)return;
     display(html,next);$('status').textContent='Обновлено';
   }catch{if(epoch===token){$('status').className='error';$('status').textContent='Обновление недоступно; прежние данные сохранены.';}}
   finally{busy=false;$('refresh').disabled=false;}
 };
 async function restoreAccess(){
   if(busy||!globalThis.crypto?.subtle||!globalThis.DecompressionStream)return;
   const token=++epoch;busy=true;$('open').disabled=true;$('message').textContent='Проверяю сохранённый вход…';
   try{
     validate(active);const key=await savedAccess('get');if(!key)return;
     const html=await content(active,key);if(token!==epoch)return;
     privateKey=key;display(html,active);$('status').textContent='';
   }catch{try{await savedAccess('delete');}catch{}}
   finally{if(token===epoch){busy=false;$('open').disabled=false;$('message').textContent='';}}
 }
 window.addEventListener('pagehide',()=>{++epoch;privateKey=null;});
 window.addEventListener('pageshow',event=>{if(event.persisted){busy=false;clearScreen();restoreAccess();}});
 restoreAccess();
})();
