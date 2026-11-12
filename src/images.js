import { MAX_BYTES, normalizeUrl, imageUrls, markdownWithImages, noteInput } from './extract.js';

const TYPES = { 'image/png':'png', 'image/jpeg':'jpg', 'image/gif':'gif', 'image/webp':'webp', 'image/avif':'avif' };
function isImage(bytes, type) {
  const head = String.fromCharCode(...bytes.slice(0,32));
  if(type==='image/png')return bytes[0]===137&&head.slice(1,4)==='PNG';
  if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(type==='image/gif')return /^GIF8[79]a/.test(head);
  if(type==='image/webp')return head.startsWith('RIFF')&&head.slice(8,12)==='WEBP';
  return type==='image/avif'&&head.slice(4,8)==='ftyp'&&/avif|avis/.test(head.slice(8));
}
async function fetchImage(context, address, parentSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parentSignal.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(abort,15000);
  const interrupted=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('下载超时或已停止')),{once:true}));
  try {
    parentSignal.throwIfAborted();
    const download=async()=>{
      let url=normalizeUrl(address);
      for(let redirect=0;redirect<4;redirect++){
        controller.signal.throwIfAborted();
        const response=await context.network.fetch(url,{transport:'public',method:'GET',signal:controller.signal});
        if([301,302,303,307,308].includes(response.status)){
          const location=response.headers.get('location');if(!location)throw Error('图片跳转缺少地址');
          url=normalizeUrl(new URL(location,url).href);continue;
        }
        if(!response.ok)throw Error(`HTTP ${response.status}`);
        const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
        if(!TYPES[type])throw Error('不支持的图片格式');
        const bytes=new Uint8Array(await response.arrayBuffer());controller.signal.throwIfAborted();
        if(!bytes.length||bytes.length>MAX_BYTES)throw Error('图片超过 2 MB 或内容为空');
        if(!isImage(bytes,type))throw Error('返回内容不是有效图片');
        return {bytes,type,extension:TYPES[type]};
      }
      throw Error('图片跳转次数过多');
    };
    return await Promise.race([download(),interrupted]);
  } finally { clearTimeout(timeout);parentSignal.removeEventListener('abort',abort); }
}

// The text note exists before any attachment operation. A failed image never discards it.
export async function saveImages(context, target, payload, signal, progress) {
  const urls=imageUrls(target.html), replacements=target.imageReplacements ||= new Map();
  const failed=[];let downloaded=0;
  for(const [index,url] of urls.slice(0,20).entries()){
    if(signal.aborted || downloaded >= 20_000_000)break;
    if(replacements.has(url))continue;
    progress(`正文已保存，正在保存图片 ${index+1}/${Math.min(urls.length,20)}…`);
    try {
      const image=await fetchImage(context,url,signal);
      if(signal.aborted)break;
      downloaded+=image.bytes.length;if(downloaded>20_000_000)throw Error('本次图片合计超过 20 MB');
      const resource=await context.resources.upload(target.savedId,new File([image.bytes],`clipper-${index+1}.${image.extension}`,{type:image.type}));
      if(!resource?.url || !/^(?:\/(?!\/)|https?:\/\/)/i.test(resource.url))throw Error('附件地址不可用');
      replacements.set(url,resource.url);
    } catch(error){failed.push({url,reason:error.message||String(error)});}
  }
  let linked=false;
  if(replacements.size){
    const current=await context.notes.get(target.savedId);
    const expected=target.imageMarkdown || payload.contentMarkdown;
    if(current.contentMarkdown!==expected)throw Error('笔记已被修改，未覆盖修改；已上传的图片可在笔记附件中找到');
    const markdown=noteInput({...target,markdown:markdownWithImages(target.html,replacements)},payload.title,payload.notebookId).contentMarkdown;
    if(markdown!==current.contentMarkdown){
      await context.notes.editMarkdown(target.savedId,{expectedRevision:current.revision,expectedContentHash:current.contentHash,edits:[{from:0,to:current.contentMarkdown.length,insert:markdown}]});
    }
    target.imageMarkdown=markdown;linked=true;
  }
  return {saved:linked?replacements.size:0,total:urls.length,failed,stopped:signal.aborted};
}

export async function findExisting(context,url) {
  const result=await context.notes.queryContent({text:url,tags:['收藏'],limit:50});
  const source=`> 来源：<${url}>`;
  return result.notes.find(note=>note.contentMarkdown?.split(/\r?\n/,1)[0]===source) || null;
}
