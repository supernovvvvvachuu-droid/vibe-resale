const MAX_SOURCE_BYTES=12*1024*1024,MAX_OUTPUT_BYTES=400*1024;
async function jpegDataURL(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>MAX_SOURCE_BYTES)throw new Error('Выберите JPEG, PNG или WebP размером до 12 МБ.');
  if(typeof createImageBitmap!=='function')throw new Error('Для загрузки фотографий откройте сайт в современном браузере.');
  let image;try{image=await createImageBitmap(file);}catch{throw new Error('Фотография повреждена или имеет неподдерживаемый формат.');}
  const canvas=document.createElement('canvas');
  try{
    if(!image.width||!image.height||image.width*image.height>50000000)throw new Error('Фотография слишком большая.');
    const scale=Math.min(1,1600/Math.max(image.width,image.height));
    canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    const context=canvas.getContext('2d');if(!context)throw new Error('Браузер не смог обработать фотографию.');
    context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  }finally{image.close();}
  for(const quality of [0.88,0.78,0.65,0.5]){
    const dataUrl=canvas.toDataURL('image/jpeg',quality);
    if(dataUrl.startsWith('data:image/jpeg;base64,')&&(dataUrl.length-dataUrl.indexOf(',')-1)*0.75<=MAX_OUTPUT_BYTES)return dataUrl;
  }
  throw new Error('Фотография остаётся слишком большой. Выберите изображение меньшего размера.');
}
export async function uploadOwnerImages(files,{api}){
  const selected=Array.from(files||[]);
  if(selected.length<1||selected.length>12)throw new Error('За один раз можно добавить от 1 до 12 фотографий.');
  const images=[];
  for(const file of selected){const dataUrl=await jpegDataURL(file);const result=await api('/owner/media',{method:'POST',body:{dataUrl}});if(!result.image?.id)throw new Error('Сервер не сохранил фотографию.');images.push(result.image);}
  return {images};
}
