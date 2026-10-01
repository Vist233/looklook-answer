async function main(){
  const rows=[];
  for(const [width,height]of [[1138,1205],[1920,1080],[2560,1440]]){
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#213b30';ctx.font='24px sans-serif';
    for(let index=0;index<24;index++)ctx.fillText(`第 ${index+1} 题：页面截图测试 A.选项甲 B.选项乙 C.选项丙 D.选项丁`,36,60+index*42);
    const image=canvas.toDataURL('image/png'),samples=[];
    for(let index=0;index<12;index++){
      const started=performance.now();
      const value=await new Promise(resolve=>window.imageHandler({target:'offscreen',type:'prepare-image',image,viewport:{width,height},rect:{x:width-370,y:96,width:350,height:390}},{},resolve));
      if(!value.ok)throw new Error('处理失败');
      if(index>1)samples.push(performance.now()-started);
    }
    samples.sort((a,b)=>a-b);
    rows.push({size:`${width}x${height}`,png_base64_characters:image.length,iterations:samples.length,median_ms:samples[5],max_ms:samples.at(-1)});
  }
  document.getElementById('output').textContent=JSON.stringify(rows,null,2);
}
main().catch(error=>{document.getElementById('output').textContent=error.message;});
