export function supportsDirectSave(scope){try{return scope.isSecureContext&&scope.top===scope&&typeof scope.showSaveFilePicker==='function';}catch{return false;}}
export function choosePngFile(scope,name){return scope.showSaveFilePicker({suggestedName:name,types:[{description:'PNG 图片',accept:{'image/png':['.png']}}],excludeAcceptAllOption:true});}
export async function writePngFile(handle,blob){const writable=await handle.createWritable();try{await writable.write(blob);await writable.close();}catch(error){try{await writable.abort();}catch{}throw error;}}
