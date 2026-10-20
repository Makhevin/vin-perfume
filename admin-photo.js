function refreshPhotoPreview(){
 const image=document.getElementById('photo-preview');
 const value=editor.elements.img.value.trim();
 image.hidden=!value;
 if(value)image.src=new URL(value,'https://vperfume.sengmakhevin.workers.dev/').href;
}
editor.elements.img.addEventListener('input',refreshPhotoPreview);
$('photo-preview').onerror=()=>{$('photo-preview').hidden=true;};
$('upload-photo').onclick=()=>$('photo-file').click();
async function resizeProductPhoto(file){
 if(!file.type.startsWith('image/'))throw Error('Choose a photo file.');
 if(file.size>20*1024*1024)throw Error('Choose a photo smaller than 20 MB.');
 const objectUrl=URL.createObjectURL(file);
 try{
  const image=new Image();
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('This photo could not be opened. Try a JPG or PNG.'));image.src=objectUrl;});
  const canvas=document.createElement('canvas'),ratio=Math.min(1,1200/Math.max(image.naturalWidth,image.naturalHeight));
  canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [.86,.68,.45]){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=800000)return blob;}
  throw Error('This photo is still too large. Choose a smaller photo.');
 }finally{URL.revokeObjectURL(objectUrl);}
}
$('photo-file').onchange=async event=>{
 const file=event.target.files[0];if(!file||selected<0)return;
 const productId=products[selected].id,button=$('upload-photo'),status=$('photo-status');
 button.disabled=true;$('save').disabled=true;status.textContent='Preparing photo…';
 try{
  const blob=await resizeProductPhoto(file),form=new FormData();form.append('photo',blob,'product.jpg');status.textContent='Uploading…';
  const response=await fetch('/api/admin/photos',{method:'POST',body:form});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Upload failed.');
  const index=products.findIndex(p=>p.id===productId);if(index<0)throw Error('The product draft was removed. Upload again for your selected product.');
  products[index].img=data.url;
  if(products[selected]?.id===productId){editor.elements.img.value=data.url;refreshPhotoPreview();}
  mark();status.textContent='Photo uploaded. Click Publish changes to save.';
 }catch(e){status.textContent=e.message;}finally{button.disabled=false;$('save').disabled=false;event.target.value='';}
};
